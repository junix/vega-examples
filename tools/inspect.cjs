#!/usr/bin/env node
/*
 * vega-examples 数据流 / 渲染检视器（Node，零依赖）
 *
 * 校验器（tools/validate.cjs）只回答"有没有坏"，本工具回答"渲染出来到底长什么样"：
 * 把 demo 在 Node 里真跑一遍，然后把数据、比例尺、以及**最终 SVG 里的每一段文字**
 * 打印出来。轴刻度标签、图例标签、数字格式化结果全在里面 —— 于是
 * "0.097 应该显示成 9.7% 却显示成 0.1" 这类格式化 bug 不用开浏览器就能抓到。
 *
 * 用法:
 *   node tools/inspect.cjs 07                 检视 slug 含 07 的 demo
 *   node tools/inspect.cjs 07 --rows 5        每个数据集打印 5 行样本
 *   node tools/inspect.cjs 07 --texts         只打印 SVG 里的文字
 *   node tools/inspect.cjs 07 --data roster   只打印某个数据集的全部行
 *   node tools/inspect.cjs 07 --svg out.svg   把渲染结果写到文件
 *   node tools/inspect.cjs --all --texts      所有 demo 的文字总览
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EXAMPLES_ROOT = path.resolve(__dirname, '..');
const DEMOS_DIR = path.join(EXAMPLES_ROOT, 'demos');
const vega = require(path.join(EXAMPLES_ROOT, 'assets', 'vega-bundle.cjs'));

vega.textMetrics.canvas(false);

const NEEDS_CANVAS = new Set(['17-wordcloud', '18-voronoi-labels']);

function nodeLoader() {
  const loader = vega.loader({ mode: 'file' });
  loader.fileAccess = true;
  loader.file = filename => fs.promises.readFile(filename, 'utf8');
  return loader;
}

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

/* 从 SVG 字符串里按出现顺序抽出所有 <text> 内容（含 aria-label 里的分组标题） */
function svgTexts(svg) {
  const out = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const t = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .trim();
    if (t) out.push(t);
  }
  return out;
}

/* 统计 SVG 里各类图元数量，用来判断"图到底画出来了没有" */
function svgMarks(svg) {
  const counts = {};
  const re = /<(path|rect|circle|line|text|image|polygon|ellipse)\b/g;
  let m;
  while ((m = re.exec(svg))) counts[m[1]] = (counts[m[1]] || 0) + 1;
  return counts;
}

/*
 * 值的显示刻意把类型标出来：str"0.097" 和 num 0.097 一眼可分。
 * "该 parse 成 number 却留成字符串" 是本项目里最常见的数据格式化 bug。
 */
function fmtVal(v) {
  if (v instanceof Date) return `date ${v.toISOString()}`;
  if (typeof v === 'number') return Number.isFinite(v) ? `num ${v}` : `num !!${v}`;
  if (typeof v === 'boolean') return `bool ${v}`;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'object') return Array.isArray(v) ? `arr[${v.length}]` : `obj{${Object.keys(v).slice(0, 4).join(',')}}`;
  return `str${JSON.stringify(v)}`;
}

/* 只挑用户字段，跳过 vega 内部的 _* 字段 */
function sampleRow(row) {
  return '{ ' + Object.keys(row)
    .filter(k => !k.startsWith('_'))
    .map(k => `${k}: ${fmtVal(row[k])}`)
    .join(', ') + ' }';
}

/*
 * NEEDS_CANVAS 的 demo（wordcloud / label 变换）在纯 Node 下连数据流都跑不完，
 * 所以这里起一个 headless Chromium 把页面真打开，再从页面里把同样的三件事取回来：
 * 数据集样本、比例尺 domain/range、SVG 里的每段文字。
 * 需要系统里有 Chromium/Chrome（或 CDP_ENDPOINT）；没有就退回提示。
 */
async function inspectViaBrowser(slug, opts) {
  let cdp;
  try { cdp = require('./cdp.cjs'); } catch (e) { cdp = null; }
  if (!cdp || (!process.env.CDP_ENDPOINT && !cdp.findChrome())) {
    console.log('（该 demo 依赖真实 canvas，纯 Node 跑不了；本机也没找到 Chromium/Chrome。'
      + '装一个或设 CHROME= / CDP_ENDPOINT= 后重试。）');
    return;
  }
  console.log('（该 demo 依赖真实 canvas，已改用 headless Chromium 检视）');

  const server = await cdp.serve(EXAMPLES_ROOT, 0);
  const browser = await cdp.launch();
  try {
    const page = await browser.newPage(1500, 1100);
    await page.goto(`${server.url}/demos/${slug}/index.html`);
    await page.waitForFunction('window.__sceneReady === true', 25000);
    await page.eval('new Promise(r => setTimeout(r, 400))');

    const warns = page.console.filter(c => c.level === 'warning' || c.level === 'error');
    if (warns.length) {
      console.log('\n-- 浏览器 console --');
      warns.forEach(w => console.log(`  ${w.level.toUpperCase()} ${w.text.split('\n')[0]}`));
    }

    const nRows = Number(opts.rows || 3);
    const payload = await page.eval(`(function () {
      var v = window.__vegaDemo.views[0].view;
      var spec = null;
      // spec 里声明的数据集名字从 runtime 上拿
      // root 是 Vega 内部的场景图数据集，不是 spec 声明的，过滤掉
      var names = Object.keys(v._runtime.data || {}).filter(function (n) { return n !== 'root'; });
      var out = { data: [], scales: [] };
      names.forEach(function (n) {
        var rows;
        try { rows = v.data(n); } catch (e) { return; }
        // 有些内部数据集（label/voronoi 的中间产物）取不到数组，跳过
        if (!rows || typeof rows.length !== 'number') return;
        out.data.push({
          name: n, n: rows.length,
          sample: rows.slice(0, ${nRows}).map(function (r) {
            var o = {};
            Object.keys(r).forEach(function (k) {
              if (k.charAt(0) === '_') return;
              var val = r[k];
              o[k] = val instanceof Date ? 'date ' + val.toISOString()
                : typeof val === 'number' ? (isFinite(val) ? 'num ' + val : 'num !!' + val)
                : typeof val === 'boolean' ? 'bool ' + val
                : val === null ? 'null' : val === undefined ? 'undefined'
                : typeof val === 'object' ? (Array.isArray(val) ? 'arr[' + val.length + ']' : 'obj{' + Object.keys(val).slice(0, 4).join(',') + '}')
                : 'str' + JSON.stringify(val);
            });
            return o;
          })
        });
      });
      Object.keys(v._runtime.scales || {}).forEach(function (n) {
        try {
          var sc = v.scale(n);
          out.scales.push({ name: n, domain: sc.domain ? sc.domain() : null, range: sc.range ? sc.range() : null });
        } catch (e) { /* 投影等取不到就跳过 */ }
      });
      return JSON.stringify(out);
    })()`);
    const info = JSON.parse(payload);

    if (!opts.textsOnly) {
      console.log('\n-- 数据集（浏览器内实测）--');
      info.data.forEach(d => {
        console.log(`  ${d.name}: ${d.n} 行`);
        d.sample.forEach((r, i) => console.log(`    [${i}] { ${Object.keys(r).map(k => k + ': ' + r[k]).join(', ')} }`));
        if (d.n > d.sample.length) console.log(`    … 还有 ${d.n - d.sample.length} 行`);
      });
      console.log('\n-- 比例尺 domain / range --');
      const brief = a => Array.isArray(a)
        ? (a.length > 6 ? `[${a.slice(0, 6).map(fmtVal).join(', ')}, …+${a.length - 6}]` : `[${a.map(fmtVal).join(', ')}]`)
        : fmtVal(a);
      info.scales.forEach(sc => console.log(`  ${sc.name}: domain=${brief(sc.domain)} range=${brief(sc.range)}`));
    }

    const svg = await page.eval('window.__vegaExport({ format: "svg" }).then(function (r) { return r.text; })');
    const texts = svgTexts(svg);
    console.log(`\n-- SVG 图元统计 -- ${JSON.stringify(svgMarks(svg))}  (${svg.length} 字节)`);
    console.log(`\n-- SVG 文字（${texts.length} 段，按渲染顺序）--`);
    texts.forEach((t, i) => console.log(`  ${String(i).padStart(3)} ${JSON.stringify(t)}`));

    if (typeof opts.svg === 'string') {
      fs.writeFileSync(opts.svg, svg);
      console.log(`\nSVG 已写入 ${opts.svg}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

async function inspectOne(dir, opts) {
  const slug = path.basename(dir);
  console.log(`\n${'='.repeat(72)}\n${slug}\n${'='.repeat(72)}`);

  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'spec.vg.json'), 'utf8'));
  for (const d of spec.data || []) {
    if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) d.url = path.resolve(dir, d.url);
  }

  const logs = [];
  const logger = {
    level() { return arguments.length ? logger : vega.Warn; },
    error(...a) { logs.push('ERROR ' + a.map(String).join(' ')); return logger; },
    warn(...a) { logs.push('WARN  ' + a.map(String).join(' ')); return logger; },
    info() { return logger; }, debug() { return logger; }
  };

  if (NEEDS_CANVAS.has(slug)) {
    // wordcloud / label 变换要真实 canvas 位图，Node 跑不了 —— 改用 headless Chromium 检视
    await inspectViaBrowser(slug, opts);
    return;
  }

  const view = new vega.View(vega.parse(spec), { renderer: 'none', loader: nodeLoader() });
  view.logger(logger);
  await view.runAsync();

  if (logs.length) {
    console.log('\n-- Vega 日志 --');
    logs.forEach(l => console.log('  ' + l.split('\n')[0]));
  }

  const only = typeof opts.data === 'string' ? opts.data : null;
  const nRows = only ? Infinity : Number(opts.rows || 3);
  if (!opts.textsOnly) {
    console.log('\n-- 数据集 --');
    for (const d of spec.data || []) {
      if (only && d.name !== only) continue;
      let rows;
      try { rows = view.data(d.name); } catch (e) { console.log(`  ${d.name}: <取不到: ${e.message}>`); continue; }
      console.log(`  ${d.name}: ${rows.length} 行`);
      rows.slice(0, nRows).forEach((r, i) => console.log(`    [${i}] ${sampleRow(r)}`));
      if (rows.length > nRows) console.log(`    … 还有 ${rows.length - nRows} 行`);
    }

    console.log('\n-- 比例尺 domain / range --');
    for (const sc of spec.scales || []) {
      try {
        const s = view.scale(sc.name);
        const dom = s.domain ? s.domain() : null;
        const rng = s.range ? s.range() : null;
        const brief = a => Array.isArray(a)
          ? (a.length > 6 ? `[${a.slice(0, 6).map(fmtVal).join(', ')}, …+${a.length - 6}]` : `[${a.map(fmtVal).join(', ')}]`)
          : fmtVal(a);
        console.log(`  ${sc.name} (${sc.type || 'linear'}): domain=${brief(dom)} range=${brief(rng)}`);
      } catch (e) {
        console.log(`  ${sc.name}: <取不到: ${e.message}>`);
      }
    }
    // 嵌套 group mark 里的 scales 也一并列出
    const nested = [];
    (function walk(marks, trail) {
      (marks || []).forEach((m, i) => {
        const at = trail + '/' + (m.name || m.type + i);
        (m.scales || []).forEach(sc => nested.push(at + ':' + sc.name));
        if (m.marks) walk(m.marks, at);
      });
    })(spec.marks, '');
    if (nested.length) console.log(`  （另有 group mark 内部比例尺，不在顶层可查：${nested.join(', ')}）`);
  }

  const svg = await view.toSVG();
  const texts = svgTexts(svg);
  console.log(`\n-- SVG 图元统计 -- ${JSON.stringify(svgMarks(svg))}  (${svg.length} 字节)`);
  console.log(`\n-- SVG 文字（${texts.length} 段，按渲染顺序）--`);
  texts.forEach((t, i) => console.log(`  ${String(i).padStart(3)} ${JSON.stringify(t)}`));

  if (typeof opts.svg === 'string') {
    fs.writeFileSync(opts.svg, svg);
    console.log(`\nSVG 已写入 ${opts.svg}`);
  }
}

async function main() {
  const opts = {
    rows: arg('rows', 3),
    textsOnly: !!arg('texts', false),
    data: arg('data', null),
    svg: arg('svg', null)
  };
  const filters = process.argv.slice(2).filter(a => !a.startsWith('--'))
    .filter((a, i, arr) => {
      // 去掉紧跟在带值 flag 后面的实参
      const prev = process.argv[process.argv.indexOf(a) - 1];
      return !(prev === '--rows' || prev === '--data' || prev === '--svg');
    });
  const all = process.argv.includes('--all');

  const dirs = fs.readdirSync(DEMOS_DIR)
    .map(n => path.join(DEMOS_DIR, n))
    .filter(p => fs.statSync(p).isDirectory())
    .filter(p => all || !filters.length || filters.some(f => path.basename(p).includes(f)))
    .sort();

  if (!dirs.length) {
    console.error('没有匹配的 demo；用法见文件头注释');
    process.exit(1);
  }
  for (const d of dirs) {
    try { await inspectOne(d, opts); }
    catch (e) { console.log(`\n${path.basename(d)}: 检视失败 — ${e.message}`); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
