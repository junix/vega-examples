#!/usr/bin/env node
/*
 * vega-examples 无头校验器
 *
 * 用法:
 *   node tools/validate.cjs              校验 demos/ 下全部 demo
 *   node tools/validate.cjs 01 03        只校验 slug 含 "01" / "03" 的 demo
 *
 * 校验内容:
 *   1. 目录契约：index.html / spec.vg.json / README.md 齐全；index.html 引用了 vega.min.js 与 DEMO_META
 *   2. spec.vg.json 能被 vega.parse 解析
 *   3. 除"浏览器限定"demo 外，用 renderer:'none' 的 View 无头跑一遍数据流
 *      （data[].url 会被改写为绝对文件路径，经 vega.loader 的 file 模式读取）
 *
 * 退出码: 全部通过 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EXAMPLES_ROOT = path.resolve(__dirname, '..');
const DEMOS_DIR = path.join(EXAMPLES_ROOT, 'demos');

// 加载本地 assets/vega-bundle.cjs（UMD，CJS 下通过 module.exports 导出）
const vega = require(path.join(EXAMPLES_ROOT, 'assets', 'vega-bundle.cjs'));
if (!vega || typeof vega.parse !== 'function') {
  console.error('FAIL 无法加载 vega（require 返回无效）');
  process.exit(1);
}

// 需要浏览器 canvas 做文字测量，无头环境只校验 parse
const PARSE_ONLY = new Set(['17-wordcloud']);

function fail(msg) { return { ok: false, msg }; }
function pass(msg) { return { ok: true, msg }; }

function checkFiles(dir) {
  const slug = path.basename(dir);
  for (const f of ['index.html', 'spec.vg.json', 'README.md']) {
    if (!fs.existsSync(path.join(dir, f))) return fail(`缺少 ${f}`);
  }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  if (!html.includes('assets/vega.min.js')) return fail('index.html 未引用 ../../assets/vega.min.js');
  if (!html.includes('DEMO_META')) return fail('index.html 缺少 window.DEMO_META');
  return pass('文件齐全');
}

async function checkSpec(dir) {
  const slug = path.basename(dir);
  const specPath = path.join(dir, 'spec.vg.json');
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    return fail(`spec.vg.json JSON 解析失败: ${e.message}`);
  }

  let runtime;
  try {
    runtime = vega.parse(spec);
  } catch (e) {
    return fail(`vega.parse 失败: ${e.message}`);
  }
  if (PARSE_ONLY.has(slug)) return pass('parse 通过（浏览器限定，跳过无头运行）');

  // 把相对 data url 改写为绝对文件路径，loader 用 file 模式读盘
  for (const d of spec.data || []) {
    if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) {
      d.url = path.resolve(dir, d.url);
      if (!fs.existsSync(d.url)) return fail(`数据文件不存在: ${d.url}`);
    }
  }
  const loader = vega.loader({ mode: 'file' });
  try {
    const view = new vega.View(runtime, { renderer: 'none', loader, logLevel: vega.Warn });
    await view.runAsync();
    const n = (view.scenegraph().root.items || []).length;
    return pass(`无头运行通过（场景根分组 ${n} 项）`);
  } catch (e) {
    return fail(`View 无头运行失败: ${e.message}`);
  }
}

async function main() {
  const filters = process.argv.slice(2);
  const dirs = fs.readdirSync(DEMOS_DIR)
    .map(name => path.join(DEMOS_DIR, name))
    .filter(p => fs.statSync(p).isDirectory())
    .filter(p => !filters.length || filters.some(f => path.basename(p).includes(f)))
    .sort();
  if (!dirs.length) {
    console.error('demos/ 下没有匹配的 demo 目录');
    process.exit(1);
  }

  let bad = 0;
  for (const dir of dirs) {
    const slug = path.basename(dir);
    const results = [checkFiles(dir), await checkSpec(dir)];
    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      bad++;
      console.log(`FAIL ${slug}`);
      failed.forEach(r => console.log(`     ${r.msg}`));
    } else {
      console.log(`PASS ${slug} — ${results.map(r => r.msg).join('；')}`);
    }
  }
  console.log(`\n${dirs.length - bad}/${dirs.length} 个 demo 校验通过`);
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
