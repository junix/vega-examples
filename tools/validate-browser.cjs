#!/usr/bin/env node
/*
 * vega-examples 浏览器端校验器（零依赖，需要系统里有 Chromium/Chrome）
 *
 * tools/validate.cjs 在纯 Node 里跑数据流 + toSVG，抓的是"数据/比例尺/编码坏没坏"。
 * 但有两件事 Node 里根本做不到：
 *   1. wordcloud / label 变换要真实 canvas 位图；
 *   2. PNG 导出走 canvas.toDataURL。
 * 本脚本把每个 demo 真的在 headless Chromium 里打开，逐项断言：
 *
 *   a. 页面无 console error、无未捕获异常（favicon 之类噪声已在静态服务器里消掉）
 *   b. #view 里真的出现了 <canvas>/<svg>，且尺寸非 0
 *   c. window.__sceneReady === true，且场景图根节点有子项
 *   d. SVG 导出非空且含真实图元
 *   e. PNG 导出可解码、**带 alpha 通道**、透明模式下真的有全透明像素
 *   f. 同一张图的白底模式下**一个全透明像素都不剩** —— 这一对断言合起来才算
 *      证明了"透明背景"这个开关真的生效，而不是碰巧 spec 没写 background
 *
 * 用法:
 *   node tools/validate-browser.cjs                 全部 demo
 *   node tools/validate-browser.cjs 17 18           只跑 slug 含 17/18 的
 *   node tools/validate-browser.cjs --shots out/    顺便把每页截图存下来
 *   node tools/validate-browser.cjs --head          有头模式（本地肉眼看）
 *   CDP_ENDPOINT=http://127.0.0.1:9222 node tools/validate-browser.cjs   复用已有浏览器
 *
 * 退出码: 全部通过 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { serve, launch, decodePng, findChrome } = require('./cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

/* 采样网格上"全透明像素"的最低占比（透明模式下至少要有这么多） */
const MIN_TRANSPARENT_RATIO = 0.001;

/*
 * Vega 的这些 WARN 说明数据或比例尺已经坏了 —— 与 tools/validate.cjs 里的 FATAL_WARN_RE 同源。
 * Vega 默认 logger 走 console.warn，所以浏览器端也能拦到。
 * 对 17-wordcloud / 18-voronoi-labels 这两个纯 Node 只做 parse 的 demo，
 * 这里是**唯一**能抓住它们 WARN 级问题的地方。
 */
const FATAL_WARN_RE = [
  /Loading failed/i, /Data ingestion failed/i, /Infinite extent/i,
  /Unsupported scale property/i, /Unrecognized/i, /Unknown data format/i
];

/* 在图上均匀采样，统计完全透明（alpha === 0）的像素比例 */
function transparentRatio(img, samples = 4000) {
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / samples)));
  let total = 0, clear = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      total++;
      if (img.pixel(x, y)[3] === 0) clear++;
    }
  }
  return { ratio: total ? clear / total : 0, total, clear };
}

function pngFromDataUrl(dataUrl) {
  const i = dataUrl.indexOf(',');
  if (i < 0 || !/^data:image\/png/.test(dataUrl)) throw new Error('不是 PNG dataURL');
  return Buffer.from(dataUrl.slice(i + 1), 'base64');
}

async function checkDemo(browser, baseUrl, slug, opts) {
  const problems = [];
  const notes = [];
  const page = await browser.newPage(1500, 1100);
  try {
    await page.goto(`${baseUrl}/src/${slug}/index.html`);
    try {
      await page.waitForFunction('window.__sceneReady === true', 25000);
    } catch (e) {
      const shown = await page.eval('(document.querySelector(".demo-error")||{}).textContent || ""');
      problems.push(`__sceneReady 一直没变 true（页面没渲染成功）${shown ? '：' + shown.split('\n')[0] : ''}`);
      return { slug, problems, notes };
    }
    // 力导向图之类还在跑动画，多等一拍让首帧稳定
    await page.eval('new Promise(r => setTimeout(r, 400))');

    // b. DOM 里真的有画布
    const canvasInfo = await page.eval(`(function () {
      var els = document.querySelectorAll('canvas, svg.marks');
      var out = [];
      for (var i = 0; i < els.length; i++) {
        var e = els[i], tag = e.tagName.toLowerCase(), box = e.getBoundingClientRect();
        // <canvas>.width 是数字（设备像素），<svg>.width 是 SVGAnimatedLength，只能量盒子
        out.push({
          tag: tag,
          w: tag === 'canvas' ? e.width : Math.round(box.width),
          h: tag === 'canvas' ? e.height : Math.round(box.height)
        });
      }
      return JSON.stringify(out);
    })()`);
    const canvases = JSON.parse(canvasInfo);
    if (!canvases.length) problems.push('页面里没有任何 <canvas>/<svg class="marks">');
    else if (canvases.every(c => !c.w || !c.h)) problems.push(`画布尺寸为 0: ${canvasInfo}`);
    else notes.push(canvases.map(c => `${c.tag} ${c.w}×${c.h}`).join(' + '));

    // c. 场景图有内容
    const sceneItems = await page.eval(
      'window.__vegaDemo.views.map(function (v) { return (v.view.scenegraph().root.items || []).length; }).join(",")'
    );
    if (!sceneItems || /(^|,)0(,|$)/.test(sceneItems)) problems.push(`场景图根节点为空（各 View: ${sceneItems}）`);
    const nViews = await page.eval('window.__vegaDemo.views.length');
    notes.push(`${nViews} 个 View`);

    // d. SVG 导出
    try {
      const svg = await page.eval('window.__vegaExport({ format: "svg" }).then(function (r) { return JSON.stringify({ bytes: r.bytes, w: r.width, h: r.height, head: r.text.slice(0, 400), hasMark: /<(path|text|rect|circle|line|image)\\b/.test(r.text) }); })');
      const s = JSON.parse(svg);
      if (s.bytes < 200) problems.push(`SVG 导出过短（${s.bytes} 字节）`);
      else if (!s.hasMark) problems.push('SVG 导出里没有任何图元');
      else if (!/^<svg[^>]*xmlns=/.test(s.head)) problems.push('SVG 导出缺少 xmlns（单独打开会失败）');
      else notes.push(`svg ${s.w}×${s.h} ${(s.bytes / 1024).toFixed(1)}KB`);
    } catch (e) {
      problems.push('SVG 导出抛错: ' + e.message);
    }

    // e/f. PNG 导出 —— 透明 与 白底 成对断言
    try {
      const transparentUrl = await page.eval('window.__vegaExport({ format: "png", scale: 1, transparent: true }).then(function (r) { return r.dataUrl; })');
      const img = decodePng(pngFromDataUrl(transparentUrl));
      if (!img.hasAlpha) {
        problems.push(`PNG 没有 alpha 通道（colorType=${img.colorType}）`);
      } else {
        const t = transparentRatio(img);
        if (t.ratio < MIN_TRANSPARENT_RATIO) {
          problems.push(`PNG 声称透明但采样到的全透明像素只有 ${t.clear}/${t.total}（${(t.ratio * 100).toFixed(3)}%）`);
        } else {
          notes.push(`png ${img.width}×${img.height} 透明像素 ${(t.ratio * 100).toFixed(1)}%`);
        }
      }

      const opaqueUrl = await page.eval('window.__vegaExport({ format: "png", scale: 1, transparent: false }).then(function (r) { return r.dataUrl; })');
      const img2 = decodePng(pngFromDataUrl(opaqueUrl));
      const t2 = transparentRatio(img2);
      if (t2.clear > 0) {
        problems.push(`白底模式仍有 ${t2.clear}/${t2.total} 个全透明像素（透明开关没生效？）`);
      }
      const corner = img2.pixel(0, 0);
      if (corner[3] !== 255) problems.push(`白底模式左上角像素 alpha=${corner[3]}，应为 255`);
    } catch (e) {
      problems.push('PNG 导出/解码抛错: ' + e.message);
    }

    // a. console 错误与致命 WARN（最后统一检查，覆盖导出过程中新产生的报错）
    const errs = page.console.filter(c => c.level === 'error');
    if (errs.length) problems.push('console error: ' + errs.map(e => e.text).join(' | ').slice(0, 400));
    const warns = page.console.filter(c => c.level === 'warning' && FATAL_WARN_RE.some(re => re.test(c.text)));
    if (warns.length) problems.push('Vega 致命 WARN: ' + warns.map(w => w.text).join(' | ').slice(0, 400));
    if (page.exceptions.length) problems.push('未捕获异常: ' + page.exceptions.join(' | ').slice(0, 400));

    if (opts.shots) {
      fs.mkdirSync(opts.shots, { recursive: true });
      fs.writeFileSync(path.join(opts.shots, slug + '.png'), await page.screenshot({ fullPage: true }));
    }
  } finally {
    await page.close();
  }
  return { slug, problems, notes };
}

async function main() {
  const argv = process.argv.slice(2);
  const shotsIdx = argv.indexOf('--shots');
  const opts = {
    shots: shotsIdx >= 0 ? path.resolve(argv[shotsIdx + 1] || 'shots') : null,
    head: argv.includes('--head')
  };
  const filters = argv.filter((a, i) => !a.startsWith('--') && !(shotsIdx >= 0 && i === shotsIdx + 1));

  const slugs = fs.readdirSync(SRC_DIR)
    .filter(n => fs.statSync(path.join(SRC_DIR, n)).isDirectory())
    .filter(n => !filters.length || filters.some(f => n.includes(f)))
    .sort();
  if (!slugs.length) { console.error('src/ 下没有匹配的 demo'); process.exit(1); }

  if (!process.env.CDP_ENDPOINT && !findChrome()) {
    console.error('找不到 Chromium/Chrome —— 浏览器端校验跳过。');
    console.error('Debian/Ubuntu: sudo apt install chromium；或设 CHROME=/path/to/chrome；'
      + '或 CDP_ENDPOINT=http://127.0.0.1:9222 复用已有浏览器。');
    process.exit(2);
  }

  const server = await serve(ROOT, 0);
  const browser = await launch({ headless: !opts.head });
  let bad = 0;
  try {
    for (const slug of slugs) {
      let r;
      try {
        r = await checkDemo(browser, server.url, slug, opts);
      } catch (e) {
        r = { slug, problems: ['校验器自身抛错: ' + e.message], notes: [] };
      }
      if (r.problems.length) {
        bad++;
        console.log(`FAIL ${slug}`);
        r.problems.forEach(p => console.log(`     ${p}`));
      } else {
        console.log(`PASS ${slug} — ${r.notes.join('；')}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`\n${slugs.length - bad}/${slugs.length} 个 demo 通过浏览器端校验`);
  if (opts.shots) console.log(`截图已写入 ${opts.shots}`);
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
