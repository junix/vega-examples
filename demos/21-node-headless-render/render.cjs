#!/usr/bin/env node
/*
 * render.cjs — Node 无头渲染 Vega spec → SVG 文件
 *
 * 用法:
 *   node demos/21-node-headless-render/render.cjs
 *   node demos/21-node-headless-render/render.cjs path/to/other-spec.vg.json
 *
 * 输出:
 *   demos/21-node-headless-render/output.svg
 *
 * 原理:
 *   1. require('assets/vega-bundle.cjs') 加载 Vega UMD（返回 module.exports）
 *   2. 读取 spec JSON
 *   3. vega.parse(spec) 编译为运行时
 *   4. new vega.View(runtime, {renderer:'none', loader}) 创建无头视图
 *   5. await view.toSVG() 从场景图导出 SVG 字符串
 *   6. 写入文件
 *
 * 关键点:
 *   - renderer:'none' 不创建任何 DOM/Canvas，纯内存跑数据流
 *   - vega.loader({mode:'file'}) 让 data[].url 从文件系统读取
 *   - .cjs 后缀确保 Node 始终按 CommonJS 加载，UMD 通过 module.exports 导出
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ── 1. 加载 Vega ──────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const vega = require(path.join(PROJECT_ROOT, 'assets', 'vega-bundle.cjs'));

if (!vega || typeof vega.parse !== 'function') {
  console.error('错误: 无法加载 vega（require 返回无效）');
  process.exit(1);
}
console.log('✓ Vega v' + vega.version + ' 已加载');

// ── 2. 读取 spec ──────────────────────────────────────────────────
const specPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'spec.vg.json');

console.log('  spec: ' + specPath);
let spec;
try {
  spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
} catch (e) {
  console.error('错误: 读取 spec 失败 — ' + e.message);
  process.exit(1);
}

// 对于有外部 url 的 spec，把相对路径改写为绝对路径
for (const d of spec.data || []) {
  if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) {
    d.url = path.resolve(path.dirname(specPath), d.url);
  }
}

// ── 3. 解析 + 无头运行 ──────────────────────────────────────────
let runtime;
try {
  runtime = vega.parse(spec);
  console.log('✓ vega.parse 成功');
} catch (e) {
  console.error('错误: vega.parse 失败 — ' + e.message);
  process.exit(1);
}

const loader = vega.loader({ mode: 'file' });
const view = new vega.View(runtime, {
  renderer: 'none',    // 不创建 DOM/Canvas
  loader: loader,      // data[].url 从文件系统读
  logLevel: vega.Warn  // 只输出警告以上
});

// ── 4. 导出 SVG ──────────────────────────────────────────────────
view.toSVG()
  .then(function (svg) {
    const outPath = path.join(__dirname, 'output.svg');
    fs.writeFileSync(outPath, svg, 'utf8');
    console.log('✓ SVG 已导出 → ' + outPath);
    console.log('  尺寸: ' + svg.length + ' 字节');
    // 统计场景图节点数
    const n = (view.scenegraph().root.items || []).length;
    console.log('  场景根分组: ' + n + ' 项');
    console.log('完成。');
  })
  .catch(function (e) {
    console.error('错误: toSVG 失败 — ' + e.message);
    process.exit(1);
  });
