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
 *   1. require('assets/vega-bundle.cjs') 加载 Vega CommonJS 构建（返回 module.exports）
 *   2. 读取 spec JSON
 *   3. vega.parse(spec) 编译为运行时
 *   4. new vega.View(runtime, {renderer:'none', loader}) 创建无头视图
 *   5. await view.runAsync() 跑完数据流，检查日志里有没有致命 WARN/ERROR
 *   6. await view.toSVG() 从场景图导出 SVG 字符串
 *   7. 写入文件
 *
 * 关键点:
 *   - renderer:'none' 不创建任何 DOM/Canvas，纯内存跑数据流
 *   - vega.textMetrics.canvas(false) 固定用估算公式测字宽，输出可复现
 *   - assets 里的 Vega 是浏览器构建，它的 file loader 默认直接 reject，
 *     必须手工注入 Node 的 fs（见下面 nodeLoader）
 *   - 数据加载失败在 Vega 里只是一条 WARN，脚本必须自己升级为非零退出，
 *     否则会安静地写出一张空图
 *   - .cjs 后缀确保 Node 始终按 CommonJS 加载 UMD 的 module.exports 分支
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

/*
 * 显式声明"用估算公式测字宽"（0.8 * 字数 * 字号）。
 * 纯 Node 下 Vega 初始化时拿不到 2D context，本来就已经退回这条公式，所以这行是幂等的；
 * 写出来是为了在装了 node-canvas 的环境里也走同一条公式，让 SVG 输出可复现。
 */
vega.textMetrics.canvas(false);

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

/*
 * 带 Node fs 访问的 loader。
 * assets/vega-bundle.cjs 是**浏览器**构建：它的 loader 里 fileAccess 恒为 false、
 * file() 直接 reject('No file system access.')，所以光写 {mode:'file'} 是读不到文件的。
 * 必须把 fileAccess 打开、把 file 换成 fs.promises.readFile。
 */
function nodeLoader() {
  const loader = vega.loader({ mode: 'file' });
  loader.fileAccess = true;
  loader.file = filename => fs.promises.readFile(filename, 'utf8');
  return loader;
}

/*
 * 收集 Vega 运行期日志。加载失败、domain 为空这类问题在 Vega 里只是 WARN，
 * 不接住的话脚本会写出一张空图还打印"成功"。
 */
const logs = [];
const collectingLogger = {
  level() { return arguments.length ? collectingLogger : vega.Warn; },
  error(...a) { logs.push({ kind: 'ERROR', text: a.map(String).join(' ') }); return collectingLogger; },
  warn(...a)  { logs.push({ kind: 'WARN',  text: a.map(String).join(' ') }); return collectingLogger; },
  info() { return collectingLogger; },
  debug() { return collectingLogger; }
};

/* 说明"数据或比例尺已经坏了"的 WARN，一律当失败（与 tools/validate.cjs 同一套判据） */
const FATAL_WARN_RE = [
  /Loading failed/i,
  /Data ingestion failed/i,
  /Infinite extent/i,
  /Unknown data format/i,
  /Unsupported scale property/i
];

const view = new vega.View(runtime, {
  renderer: 'none',    // 不创建 DOM/Canvas
  loader: nodeLoader() // data[].url 从文件系统读
});
view.logger(collectingLogger);

// ── 4. 跑数据流 → 检查日志 → 导出 SVG ────────────────────────────
view.runAsync()
  .then(function () {
    for (const l of logs) console.error(l.kind + ' ' + l.text);
    const fatal = logs.filter(
      l => l.kind === 'ERROR' || FATAL_WARN_RE.some(re => re.test(l.text))
    );
    if (fatal.length) {
      console.error('错误: 数据流跑出 ' + fatal.length + ' 条致命日志，拒绝写出空图');
      process.exit(1);
    }
    console.log('✓ 数据流跑通（无致命 WARN/ERROR）');
    return view.toSVG();
  })
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
    console.error('错误: 无头渲染失败 — ' + e.message);
    process.exit(1);
  });
