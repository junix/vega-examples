#!/usr/bin/env node
/*
 * assets/demo.js 导出助手的并发回归测试（纯 Node，零依赖）
 *
 * 回归对象：withBackground 曾把共享的 view.background 跨异步导出临时改写，
 * 同一 View 上并发的透明/不透明导出会互相看到对方的临时背景（透明 SVG 里
 * 混进白底 rect），还会把对方的临时值当成"原值"复原（交互 View 的背景
 * 被改丢）。本测试用真实 vega View（renderer 'none'）+ 01-bar-chart 的
 * spec 复现，断言：
 *
 *   1. Promise.all 并发透明×2 + 白底 + 蓝底 SVG 导出，各自拿到请求的背景
 *      （透明 SVG 无底板 rect；白底/蓝底 rect 的 fill 正确）；
 *   2. 全部 settle 后交互 View 毫发无损：background 复原为初始哨兵色，
 *      toSVG 输出与导出前逐字节一致；
 *   3. 并发里混一个注定失败的导出（不支持的格式）：失败也复原背景，
 *      不拖垮同批的兄弟导出，也不卡死后续导出。
 *
 * PNG 导出走 toCanvas，需要真实浏览器 canvas，由 tools/validate-browser.cjs
 * 覆盖；串行化发生在 withBackground 里、与格式无关（fn 只是链上的一段），
 * 这里用 SVG 验证同一链条。
 *
 * 用法: node tools/test-export.cjs     退出码: 全部通过 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* ---- 最小 DOM 桩：demo.js 是浏览器脚本，加载时要 document，注册 View 时要建工具栏 ---- */
function fakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    appendChild(c) { return c; },
    insertBefore(n) { return n; },
    removeChild(c) { return c; },
    addEventListener() {},
    click() {},
    remove() {},
    getBoundingClientRect() { return { width: 0, height: 0 }; }
  };
  return el;
}
global.document = {
  body: fakeEl('body'),
  createElement: fakeEl,
  createTextNode: t => ({ text: t }),
  querySelector: () => null,
  addEventListener: () => {}
};

const vega = require(path.join(ROOT, 'assets', 'vega-bundle.cjs'));
vega.textMetrics.canvas(false);
const demo = require(path.join(ROOT, 'assets', 'demo.js'));
demo.DEMO_META = { slug: 'test-export' };

/* 导出前钉一个哨兵背景色：既不同于透明(null)也不同于两个导出底色，
   "复原错了"一眼就能看出来（旧 bug 会把它复原成 null 或导出底色）。 */
const SENTINEL = '#abcdef';

/* 与 tools/export.cjs 同判据：SVG 开头的满幅 rect 就是底板 */
const bgRect = t => /^<svg[^>]*>\s*<rect[^>]*fill="([^"]+)"/.exec(t);

/* 带 Node fs 访问的 loader：assets 里的 vega 是浏览器构建（同 validate.cjs） */
function nodeLoader() {
  const loader = vega.loader({ mode: 'file' });
  loader.fileAccess = true;
  loader.file = filename => fs.promises.readFile(filename, 'utf8');
  return loader;
}

async function buildBarChartView() {
  const dir = path.join(ROOT, 'src', '01-bar-chart');
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.vg.json'), 'utf8'));
  for (const d of spec.data || []) {
    if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) d.url = path.resolve(dir, d.url);
  }
  const view = new vega.View(vega.parse(spec), { renderer: 'none', loader: nodeLoader() });
  await view.runAsync();
  return view;
}

let bad = 0;
function ok(cond, msg, evidence) {
  if (cond) {
    console.log(`PASS ${msg}`);
  } else {
    bad++;
    console.log(`FAIL ${msg}${evidence ? `\n     ${evidence}` : ''}`);
  }
}

async function main() {
  const view = await buildBarChartView();
  demo.registerDemoView(view, 'bar');

  view.background(SENTINEL);
  await view.runAsync();
  const before = await view.toSVG();
  ok(bgRect(before) && bgRect(before)[1] === SENTINEL, `初始哨兵背景已画进 SVG（fill=${SENTINEL}）`,
    '场景本身没画哨兵底板，后面"复原"断言会失去意义；检查 vega SVG 序列化行为');

  /* 1. 并发透明/不透明导出：各自拿到请求的背景 */
  const r = await Promise.all([
    demo.exportDemoImage({ format: 'svg', transparent: true }),
    demo.exportDemoImage({ format: 'svg', transparent: false, background: '#ffffff' }),
    demo.exportDemoImage({ format: 'svg', transparent: true }),
    demo.exportDemoImage({ format: 'svg', transparent: false, background: '#0000ff' })
  ]);
  ok(!bgRect(r[0].text) && r[0].transparent === true, '并发导出[0] 透明 SVG 无底板 rect',
    `SVG 开头: ${r[0].text.slice(0, 120)}`);
  ok(bgRect(r[1].text) && bgRect(r[1].text)[1] === '#ffffff', '并发导出[1] 白底 SVG fill=#ffffff',
    `SVG 开头: ${r[1].text.slice(0, 120)}`);
  ok(!bgRect(r[2].text) && r[2].transparent === true, '并发导出[2] 透明 SVG 无底板 rect',
    `SVG 开头: ${r[2].text.slice(0, 120)}`);
  ok(bgRect(r[3].text) && bgRect(r[3].text)[1] === '#0000ff', '并发导出[3] 蓝底 SVG fill=#0000ff',
    `SVG 开头: ${r[3].text.slice(0, 120)}`);

  /* 2. 都 settle 后交互 View 毫发无损 */
  ok(view.background() === SENTINEL,
    `全部导出 settle 后 background 复原为 ${SENTINEL}`, `实际: ${view.background()}`);
  const after = await view.toSVG();
  ok(after === before, '交互 View 的 toSVG 输出与导出前逐字节一致');

  /* 3. 并发里混一个注定失败的导出（不支持的格式） */
  const settled = await Promise.allSettled([
    demo.exportDemoImage({ format: 'svg', transparent: true }),
    demo.exportDemoImage({ format: 'bmp', transparent: false, background: '#123456' })
  ]);
  ok(settled[0].status === 'fulfilled' && !bgRect(settled[0].value.text),
    '与失败导出并发的透明 SVG 仍成功且无底板 rect',
    `status=${settled[0].status}${settled[0].value ? ' SVG 开头: ' + settled[0].value.text.slice(0, 120) : ''}`);
  ok(settled[1].status === 'rejected' && /不支持的导出格式/.test(String(settled[1].reason && settled[1].reason.message)),
    '不支持格式的导出按约定 reject');
  ok(view.background() === SENTINEL,
    `失败导出也复原背景（${SENTINEL}）`, `实际: ${view.background()}`);

  /* 4. 失败不卡死后续导出（导出链吞掉 rejection） */
  const solo = await demo.exportDemoImage({ format: 'svg', transparent: true });
  ok(!bgRect(solo.text) && view.background() === SENTINEL, '失败之后的单独导出照常工作并复原背景');

  view.finalize();
  console.log(`\n${bad ? `${bad} 项断言失败` : '并发导出串行化：全部断言通过'}`);
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
