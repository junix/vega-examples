#!/usr/bin/env node
/*
 * vega-examples 批量导出器（零依赖）
 *
 * 把每个 demo 导成 SVG 与 PNG。PNG **默认透明背景**，并且导完就地校验
 * （解 PNG 头、数颜色通道、采样统计全透明像素占比），所以"背景是透明的"
 * 这句话是量出来的而不是声称的。
 *
 * 两条导出路径：
 *   浏览器路径（默认）—— headless Chromium 打开 demo 页面，调页面里的
 *     window.__vegaExport()。SVG 与 PNG 都能出，覆盖全部 demo。
 *   纯 Node 路径（--no-browser）—— 只出 SVG，且跳过依赖真实 canvas 的 demo
 *     （wordcloud / label 变换）。没装浏览器时的降级方案。
 *
 * 用法:
 *   node tools/export.cjs                       全部 demo → exports/，SVG + 透明 PNG(2×)
 *   node tools/export.cjs 22 33                 只导 slug 含 22 / 33 的
 *   node tools/export.cjs --out dist/img        换输出目录
 *   node tools/export.cjs --png --scale 3       只导 PNG，3 倍分辨率
 *   node tools/export.cjs --svg --no-browser    只导 SVG，不用浏览器
 *   node tools/export.cjs --opaque              PNG 用白底（对照用）
 *   CDP_ENDPOINT=http://127.0.0.1:9222 node tools/export.cjs   复用已有浏览器
 *
 * 产物：<out>/<slug>.svg、<out>/<slug>.png、<out>/manifest.json
 * 退出码：全部成功 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { serve, launch, decodePng, findChrome } = require('./cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEMOS_DIR = path.join(ROOT, 'demos');

/* 输出目录在项目内就显示相对路径，在外面就显示绝对路径 */
function show(p) {
  const rel = path.relative(ROOT, p);
  return !rel || rel.startsWith('..') ? p : rel;
}

/* 纯 Node 路径下跑不了的 demo（要真实 canvas 位图） */
const NEEDS_CANVAS = new Set(['17-wordcloud', '18-voronoi-labels']);

function transparentStats(img, samples = 4000) {
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / samples)));
  let total = 0, clear = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      total++;
      if (img.pixel(x, y)[3] === 0) clear++;
    }
  }
  return { total, clear, ratio: total ? clear / total : 0 };
}

function fmtBytes(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB'
    : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

/* -------------------------------------------------- 纯 Node 的 SVG 导出路径 */

async function exportSvgWithNode(slug, outDir) {
  const vega = require(path.join(ROOT, 'assets', 'vega-bundle.cjs'));
  vega.textMetrics.canvas(false);

  const dir = path.join(DEMOS_DIR, slug);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.vg.json'), 'utf8'));
  for (const d of spec.data || []) {
    if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) d.url = path.resolve(dir, d.url);
  }
  const loader = vega.loader({ mode: 'file' });
  loader.fileAccess = true;
  loader.file = f => fs.promises.readFile(f, 'utf8');

  const view = new vega.View(vega.parse(spec), { renderer: 'none', loader });
  view.logger({ level() { return arguments.length ? this : vega.Error; }, error() { return this; }, warn() { return this; }, info() { return this; }, debug() { return this; } });
  await view.runAsync();
  const svg = await view.toSVG();
  const file = path.join(outDir, slug + '.svg');
  fs.writeFileSync(file, svg);
  const m = /width="(\d+(?:\.\d+)?)"\s+height="(\d+(?:\.\d+)?)"/.exec(svg) || [];
  return { svg: { file: show(file), bytes: svg.length, width: Number(m[1]) || null, height: Number(m[2]) || null } };
}

/* ---------------------------------------------------- 浏览器导出路径（默认） */

async function exportWithBrowser(browser, baseUrl, slug, outDir, opts) {
  const page = await browser.newPage(1500, 1100);
  const out = {};
  try {
    await page.goto(`${baseUrl}/demos/${slug}/index.html`);
    await page.waitForFunction('window.__sceneReady === true', 25000);
    await page.eval('new Promise(r => setTimeout(r, 400))');

    if (opts.svg) {
      const text = await page.eval(
        `window.__vegaExport({ format: "svg", transparent: ${opts.transparent} }).then(function (r) { return r.text; })`
      );
      const file = path.join(outDir, slug + '.svg');
      fs.writeFileSync(file, text);
      const m = /width="(\d+(?:\.\d+)?)"\s+height="(\d+(?:\.\d+)?)"/.exec(text) || [];
      out.svg = {
        file: show(file), bytes: text.length,
        width: Number(m[1]) || null, height: Number(m[2]) || null,
        // 无底板 rect = 透明；有则是显式底色
        transparent: !/^<svg[^>]*>\s*<rect[^>]*fill="[^"]+"/.test(text)
      };
    }

    if (opts.png) {
      const dataUrl = await page.eval(
        `window.__vegaExport({ format: "png", scale: ${opts.scale}, transparent: ${opts.transparent} }).then(function (r) { return r.dataUrl; })`
      );
      const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      const file = path.join(outDir, slug + '.png');
      fs.writeFileSync(file, buf);
      const img = decodePng(buf);
      const st = transparentStats(img);
      out.png = {
        file: show(file), bytes: buf.length,
        width: img.width, height: img.height, scale: opts.scale,
        colorType: img.colorType, hasAlpha: img.hasAlpha,
        transparentPixelRatio: Number(st.ratio.toFixed(4)),
        cornerAlpha: img.pixel(0, 0)[3]
      };
      // 透明模式下必须真的有全透明像素，白底模式下必须一个都没有
      if (opts.transparent && (!img.hasAlpha || st.clear === 0)) {
        out.png.warning = `声称透明但 alpha 通道=${img.hasAlpha}、全透明采样点=${st.clear}/${st.total}`;
      }
      if (!opts.transparent && st.clear > 0) {
        out.png.warning = `白底模式仍有 ${st.clear}/${st.total} 个全透明采样点`;
      }
    }
    const errs = page.console.filter(c => c.level === 'error');
    if (errs.length) out.consoleErrors = errs.map(e => e.text);
  } finally {
    await page.close();
  }
  return out;
}

/* ------------------------------------------------------------------- 主流程 */

async function main() {
  const argv = process.argv.slice(2);
  const flag = n => argv.includes('--' + n);
  const val = (n, d) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const wantSvg = flag('svg') || !flag('png');
  const wantPng = flag('png') || !flag('svg');
  const opts = {
    svg: wantSvg,
    png: wantPng,
    scale: Number(val('scale', 2)),
    transparent: !flag('opaque'),
    browser: !flag('no-browser')
  };
  const outDir = path.resolve(ROOT, val('out', 'exports'));

  const consumed = new Set(['--out', '--scale'].flatMap(f => {
    const i = argv.indexOf(f);
    return i >= 0 ? [argv[i + 1]] : [];
  }));
  const filters = argv.filter(a => !a.startsWith('--') && !consumed.has(a));

  const slugs = fs.readdirSync(DEMOS_DIR)
    .filter(n => fs.statSync(path.join(DEMOS_DIR, n)).isDirectory())
    .filter(n => !filters.length || filters.some(f => n.includes(f)))
    .sort();
  if (!slugs.length) { console.error('demos/ 下没有匹配的 demo'); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });

  if (opts.browser && !process.env.CDP_ENDPOINT && !findChrome()) {
    console.error('找不到 Chromium/Chrome。要么装一个（apt install chromium）/设 CHROME=…/'
      + '设 CDP_ENDPOINT=…，要么用 --no-browser --svg 只导 SVG。');
    process.exit(2);
  }
  if (!opts.browser && opts.png) {
    console.error('--no-browser 下无法导出 PNG（canvas.toDataURL 需要真实浏览器）。'
      + '请加 --svg 只导 SVG，或去掉 --no-browser。');
    process.exit(2);
  }

  console.log(`导出 ${slugs.length} 个 demo → ${show(outDir)}／`
    + `格式 ${[opts.svg && 'svg', opts.png && `png@${opts.scale}x`].filter(Boolean).join(' + ')}`
    + `／PNG 背景 ${opts.transparent ? '透明' : '白底'}`
    + `／路径 ${opts.browser ? 'headless Chromium' : '纯 Node'}`);

  const manifest = { generatedBy: 'tools/export.cjs', options: opts, demos: {} };
  let server = null, browser = null, bad = 0;
  try {
    if (opts.browser) {
      server = await serve(ROOT, 0);
      browser = await launch();
    }
    for (const slug of slugs) {
      try {
        let r;
        if (opts.browser) {
          r = await exportWithBrowser(browser, server.url, slug, outDir, opts);
        } else if (NEEDS_CANVAS.has(slug)) {
          console.log(`SKIP ${slug} — 依赖真实 canvas，纯 Node 路径导不了（去掉 --no-browser）`);
          manifest.demos[slug] = { skipped: 'needs-canvas' };
          continue;
        } else {
          r = await exportSvgWithNode(slug, outDir);
        }
        manifest.demos[slug] = r;
        const parts = [];
        if (r.svg) parts.push(`svg ${r.svg.width}×${r.svg.height} ${fmtBytes(r.svg.bytes)}${r.svg.transparent === false ? ' (有底色)' : ''}`);
        if (r.png) parts.push(`png ${r.png.width}×${r.png.height} ${fmtBytes(r.png.bytes)} `
          + `alpha=${r.png.hasAlpha ? 'yes' : 'NO'} 透明像素 ${(r.png.transparentPixelRatio * 100).toFixed(1)}%`);
        const warn = [r.png && r.png.warning, r.consoleErrors && ('console: ' + r.consoleErrors.join(' | '))].filter(Boolean);
        if (warn.length) { bad++; console.log(`WARN ${slug} — ${parts.join('；')}\n     ${warn.join('\n     ')}`); }
        else console.log(`OK   ${slug} — ${parts.join('；')}`);
      } catch (e) {
        bad++;
        manifest.demos[slug] = { error: e.message };
        console.log(`FAIL ${slug} — ${e.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) await server.close();
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n清单已写入 ${show(path.join(outDir, 'manifest.json'))}`);
  console.log(bad ? `${bad} 个 demo 有问题` : '全部导出成功');
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
