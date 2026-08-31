#!/usr/bin/env node
/*
 * vega-examples 画廊缩略图生成器（零依赖）
 *
 * 首页 index.html 的每张卡片都配一张缩略图 thumbs/<slug>.png。缩略图不是截屏，
 * 而是走和导出工具栏同一条路：headless Chromium 打开 demo 页 → 等 __sceneReady →
 * 拿页面里注册的 View → view.toCanvas(scale)。因为是**从场景图按比例重画**
 * （不是把大图重采样），文字与曲线在缩小后依然是干净的矢量描边。
 *
 * 与 tools/export.cjs 的分工：
 *   export.cjs  出「原尺寸、可再利用」的成品图（out/，已 gitignore）
 *   thumbs.cjs  出「适配卡片、要进版本库」的小图（thumbs/，随仓库提交，
 *               这样 clone 下来直接 ./serve.sh 就有图，不必先装浏览器跑一遍）
 *
 * 用法:
 *   node tools/thumbs.cjs                只重生成过期/缺失的（推荐日常用）
 *   node tools/thumbs.cjs --force        全部重生成
 *   node tools/thumbs.cjs 22 33          只处理 slug 含 22 / 33 的
 *   node tools/thumbs.cjs --check        不启浏览器，只报告缺失/过期，供校验用
 *   node tools/thumbs.cjs --box 800x500  换缩略图外接框（默认 600x380）
 *   node tools/thumbs.cjs --opaque       白底（默认透明，卡片是白的所以透明更贴）
 *   node tools/thumbs.cjs --out dist/th  换输出目录
 *   CDP_ENDPOINT=http://127.0.0.1:9222 node tools/thumbs.cjs   复用已有浏览器
 *
 * 「过期」的判定：thumbs/<slug>.png 的 mtime 早于该 demo 目录里
 * index.html / spec.vg.json / main.js 任意一个的 mtime。改了 spec 忘了刷图，
 * --check 会把它点出来（tools/validate.cjs 的首页检查也会查缺失）。
 *
 * 产物：<out>/<slug>.png、<out>/manifest.json
 * 退出码：全部成功 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { serve, launch, decodePng, findChrome } = require('./cdp.cjs');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

/* 决定缩略图是否过期时要看的源文件 */
const SOURCE_FILES = ['index.html', 'spec.vg.json', 'main.js'];

function show(p) {
  const rel = path.relative(ROOT, p);
  return !rel || rel.startsWith('..') ? p : rel;
}

function fmtBytes(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB'
    : n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

/* demo 源文件里最新的 mtime；用于判断缩略图是否过期 */
function sourceMtime(slug) {
  let newest = 0;
  for (const name of SOURCE_FILES) {
    const f = path.join(SRC_DIR, slug, name);
    if (fs.existsSync(f)) newest = Math.max(newest, fs.statSync(f).mtimeMs);
  }
  return newest;
}

/* 'missing' | 'stale' | 'fresh' */
function thumbState(slug, outDir) {
  const f = path.join(outDir, slug + '.png');
  if (!fs.existsSync(f)) return 'missing';
  return fs.statSync(f).mtimeMs < sourceMtime(slug) ? 'stale' : 'fresh';
}

/* 采样统计「画面上有多少墨」：透明底看 alpha，白底看偏离白色的像素 */
function inkStats(img, transparent, samples = 4000) {
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / samples)));
  let total = 0, ink = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      total++;
      const [r, g, b, a] = img.pixel(x, y);
      if (transparent ? a > 8 : (a > 8 && (r < 247 || g < 247 || b < 247))) ink++;
    }
  }
  return { total, ink, ratio: total ? ink / total : 0 };
}

/*
 * 在页面里跑的那段脚本：先按 1× 画一遍量出图表的自然尺寸，
 * 再按 min(框宽/宽, 框高/高) 的比例重画一遍 —— 缩放发生在绘制阶段，
 * 所以是重新描边而不是位图重采样。背景改写前后成对复原。
 */
function thumbScript(opts) {
  const bg = opts.transparent ? 'null' : JSON.stringify(opts.background);
  return `(function () {
  var entry = ((window.__vegaDemo || {}).views || [])[0];
  if (!entry) throw new Error('页面里没有已注册的 View（renderDemo / registerDemoView 都没跑到？）');
  var view = entry.view;
  var prev = view.background();
  function bg(v) { view.background(v); return view.runAsync(); }
  return bg(${bg})
    .then(function () { return view.toCanvas(1); })
    .then(function (nat) {
      var scale = Math.min(${opts.box.w} / nat.width, ${opts.box.h} / nat.height, ${opts.maxScale});
      return view.toCanvas(scale).then(function (out) {
        return {
          natural: [nat.width, nat.height], scale: scale,
          width: out.width, height: out.height,
          dataUrl: out.toDataURL('image/png')
        };
      });
    })
    .then(
      function (r) { return bg(prev).then(function () { return r; }); },
      function (e) { return bg(prev).then(function () { throw e; }); }
    );
})()`;
}

async function makeThumb(browser, baseUrl, slug, outDir, opts) {
  const page = await browser.newPage(1500, 1100);
  try {
    await page.goto(`${baseUrl}/src/${slug}/index.html`);
    await page.waitForFunction('window.__sceneReady === true', 25000);
    // 13 之类的 demo 在 __sceneReady 之后还会由 main.js 灌数据 / 起动画，留一点安置时间
    await page.eval(`new Promise(function (r) { setTimeout(r, ${opts.settle}); })`);

    const r = await page.eval(thumbScript(opts), { timeout: 60000 });
    const buf = Buffer.from(r.dataUrl.slice(r.dataUrl.indexOf(',') + 1), 'base64');
    const file = path.join(outDir, slug + '.png');
    fs.writeFileSync(file, buf);

    const img = decodePng(buf);
    const st = inkStats(img, opts.transparent);
    const out = {
      file: show(file), bytes: buf.length,
      width: img.width, height: img.height,
      natural: r.natural, scale: Number(r.scale.toFixed(4)),
      transparent: opts.transparent, hasAlpha: img.hasAlpha,
      inkRatio: Number(st.ratio.toFixed(4)),
      sourceMtime: new Date(sourceMtime(slug)).toISOString()
    };
    // 空白缩略图（等到了 __sceneReady 但图其实没画出来）必须报出来，不能静默写一张白板
    if (st.ratio < 0.01) out.warning = `几乎空白：采样 ${st.total} 点只有 ${st.ink} 点有内容`;
    if (opts.transparent && !img.hasAlpha) out.warning = '声称透明但 PNG 没有 alpha 通道';
    const errs = page.console.filter(c => c.level === 'error');
    if (errs.length) out.consoleErrors = errs.map(e => e.text);
    return out;
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------------- 主流程 */

async function main() {
  const argv = process.argv.slice(2);
  const flag = n => argv.includes('--' + n);
  const val = (n, d) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };

  const boxRaw = val('box', '600x380');
  const bm = /^(\d+)x(\d+)$/.exec(boxRaw);
  if (!bm) { console.error(`--box 要写成 宽x高，比如 600x380（收到 ${boxRaw}）`); process.exit(2); }

  const opts = {
    box: { w: Number(bm[1]), h: Number(bm[2]) },
    maxScale: Number(val('max-scale', 2)),   // 小图不必放大太多，控制体积
    transparent: !flag('opaque'),
    background: '#ffffff',
    settle: Number(val('settle', 600)),
    force: flag('force'),
    check: flag('check')
  };
  const outDir = path.resolve(ROOT, val('out', 'thumbs'));

  const consumed = new Set(['--out', '--box', '--max-scale', '--settle'].flatMap(f => {
    const i = argv.indexOf(f);
    return i >= 0 ? [argv[i + 1]] : [];
  }));
  const filters = argv.filter(a => !a.startsWith('--') && !consumed.has(a));

  const slugs = fs.readdirSync(SRC_DIR)
    .filter(n => fs.statSync(path.join(SRC_DIR, n)).isDirectory())
    .filter(n => !filters.length || filters.some(f => n.includes(f)))
    .sort();
  if (!slugs.length) { console.error('src/ 下没有匹配的 demo'); process.exit(1); }

  /* --check：纯 fs，不启浏览器。给 CI / 提交前用 */
  if (opts.check) {
    let bad = 0;
    for (const slug of slugs) {
      const state = thumbState(slug, outDir);
      if (state === 'fresh') { console.log(`OK      ${slug}`); continue; }
      bad++;
      console.log(state === 'missing'
        ? `MISSING ${slug} — ${show(path.join(outDir, slug + '.png'))} 不存在`
        : `STALE   ${slug} — 缩略图比 ${SOURCE_FILES.join('/')} 旧`);
    }
    console.log(bad
      ? `\n${bad}/${slugs.length} 个缩略图需要重生成：node tools/thumbs.cjs`
      : `\n${slugs.length} 个缩略图齐全且最新`);
    process.exit(bad ? 1 : 0);
  }

  if (!process.env.CDP_ENDPOINT && !findChrome()) {
    console.error('找不到 Chromium/Chrome。装一个（apt install chromium）、设 CHROME=…，'
      + '或设 CDP_ENDPOINT=http://127.0.0.1:9222 复用已有浏览器。');
    process.exit(2);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const todo = opts.force ? slugs : slugs.filter(s => thumbState(s, outDir) !== 'fresh');
  const skipped = slugs.length - todo.length;
  console.log(`缩略图 → ${show(outDir)}／外接框 ${opts.box.w}×${opts.box.h}`
    + `／背景 ${opts.transparent ? '透明' : '白底'}`
    + `／本次处理 ${todo.length} 个${skipped ? `（${skipped} 个已是最新，跳过；--force 可强制重生成）` : ''}`);

  /* 清单要覆盖全部 demo，所以先读回上一次的结果，再用本次的覆盖 */
  const manifestFile = path.join(outDir, 'manifest.json');
  let prev = {};
  try { prev = (JSON.parse(fs.readFileSync(manifestFile, 'utf8')) || {}).demos || {}; } catch (e) { /* 头一次跑 */ }

  const manifest = {
    generatedBy: 'tools/thumbs.cjs',
    options: { box: opts.box, maxScale: opts.maxScale, transparent: opts.transparent },
    demos: {}
  };
  for (const slug of slugs) if (prev[slug]) manifest.demos[slug] = prev[slug];

  let server = null, browser = null, bad = 0;
  try {
    if (todo.length) {
      server = await serve(ROOT, 0);
      browser = await launch();
    }
    for (const slug of todo) {
      try {
        const r = await makeThumb(browser, server.url, slug, outDir, opts);
        manifest.demos[slug] = r;
        const line = `${r.width}×${r.height} ${fmtBytes(r.bytes)}`
          + ` ← ${r.natural[0]}×${r.natural[1]} @${r.scale}×，内容占比 ${(r.inkRatio * 100).toFixed(1)}%`;
        const warn = [r.warning, r.consoleErrors && ('console: ' + r.consoleErrors.join(' | '))].filter(Boolean);
        if (warn.length) { bad++; console.log(`WARN ${slug} — ${line}\n     ${warn.join('\n     ')}`); }
        else console.log(`OK   ${slug} — ${line}`);
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

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  const total = slugs.reduce((n, s) => n + ((manifest.demos[s] || {}).bytes || 0), 0);
  const missing = slugs.filter(s => thumbState(s, outDir) === 'missing');
  console.log(`\n清单已写入 ${show(manifestFile)}；${slugs.length} 张共 ${fmtBytes(total)}`);
  if (missing.length) console.log(`仍然缺图：${missing.join(', ')}`);
  console.log(bad ? `${bad} 个 demo 有问题` : '全部生成成功');
  process.exit(bad || missing.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
