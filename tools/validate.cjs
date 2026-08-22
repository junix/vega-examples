#!/usr/bin/env node
/*
 * vega-examples 无头校验器（Node，零依赖）
 *
 * 用法:
 *   node tools/validate.cjs              校验 demos/ 下全部 demo
 *   node tools/validate.cjs 01 03        只校验 slug 含 "01" / "03" 的 demo
 *   node tools/validate.cjs --verbose    额外打印每个数据集的行数
 *
 * 校验内容（任一项失败即 FAIL）:
 *   1. 目录契约：index.html / spec.vg.json / main.js / README.md 齐全；
 *      index.html 引用了 assets/vega.min.js + assets/demo.js 且声明 DEMO_META；
 *      README.md 含固定四节标题。
 *   2. spec.vg.json 是合法 JSON、$schema 指向 vega v6、能被 vega.parse 解析。
 *   3. 数据文件真的存在，并且**真的读进来了**：用带 fs 访问能力的 loader
 *      跑一遍数据流，逐个数据集断言行数 > 0（运行时才填充的数据集在
 *      RUNTIME_FILLED 里登记豁免）。
 *   4. Vega 运行期不得产生 ERROR，也不得产生"数据/比例尺坏掉"类 WARN
 *      （加载失败、摄取失败、Infinite extent、未识别属性……）。
 *   5. 渲染闭环：await view.toSVG() 必须产出非空 SVG，且含有 <path>/<text> 等
 *      真实图元——这一步会把 mark/scale/encode 全部跑一遍。
 *
 * 为什么要第 3/4/5 条：旧版校验器用 vega.loader({mode:'file'}) 读盘，而
 * assets/vega-bundle.cjs 是浏览器构建，其 file loader 直接 reject（"No file
 * system access"）。于是所有带 url 的 demo 数据全是空的，校验却照样报 PASS。
 * 现在改为注入 Node fs 的 loader，并把 Vega 的 WARN 当成失败。
 *
 * 需要真实 canvas 位图（label 变换的碰撞检测）的 demo 无法在纯 Node 下渲染，
 * 登记在 BROWSER_ONLY 里，只做到 parse + 数据流；它们的渲染由
 * tools/validate-browser.cjs 在真实 Chromium 里校验。
 *
 * 退出码: 全部通过 0，否则 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const EXAMPLES_ROOT = path.resolve(__dirname, '..');
const DEMOS_DIR = path.join(EXAMPLES_ROOT, 'demos');

const vega = require(path.join(EXAMPLES_ROOT, 'assets', 'vega-bundle.cjs'));
if (!vega || typeof vega.parse !== 'function') {
  console.error('FAIL 无法加载 vega（require 返回无效）');
  process.exit(1);
}

/*
 * Node 里没有 DOM canvas，文字宽度测量退化为估算（0.8 * 字数 * 字号）。
 * 不切换的话 overlap/wordcloud 之类依赖 textMetrics 的变换会拿到 0 宽度。
 */
vega.textMetrics.canvas(false);

/*
 * 需要真实 canvas 位图的 demo：wordcloud 变换要把字形栅格化成 sprite，
 * label 变换要把已有 mark 画进位图做碰撞检测。二者在纯 Node（无 node-canvas）
 * 下都拿不到 2D context，连数据流都跑不完。它们只在这里做 parse + 文件契约，
 * 完整渲染/导出校验由 tools/validate-browser.cjs 在真实 Chromium 里完成。
 */
const NEEDS_CANVAS = new Set(['17-wordcloud', '18-voronoi-labels']);

/* 允许为空的数据集：由 main.js 在运行时 insert/change 填充 */
const RUNTIME_FILLED = {
  '13-dynamic-data-runtime': ['live', 'stats']
};

/*
 * 允许场景探出声明尺寸的像素数。轴标签 + 轴标题 ≈ 70px，右侧图例 ≈ 180px，
 * 所以 300 能容下正常的装饰，又能抓住"子图按整幅画布尺寸画"这种量级的错。
 */
const OVERFLOW_SLACK = 300;

const README_SECTIONS = ['## 学习目标', '## spec 逐段讲解', '## 试一试', '## 参考'];

/*
 * F 组（22 起）是"稀有/复杂图形"专题，除四节固定结构外还必须写一节
 * "## 与 matplotlib 的对照"：说明这张图在 Vega 里为什么做得出来、
 * 换成命令式绘图库要付什么代价。这是该组的立意，缺了就不算写完。
 */
const GROUP_F_SECTIONS = ['## 与 matplotlib 的对照'];
function isGroupF(slug) {
  const n = parseInt(slug, 10);
  return Number.isFinite(n) && n >= 22;
}

/* Vega 的这些 WARN 说明数据或比例尺已经坏了，必须当成失败 */
const FATAL_WARN_RE = [
  /Loading failed/i,
  /Data ingestion failed/i,
  /Infinite extent/i,
  /Unsupported scale property/i,
  /Unrecognized/i,
  /Missing/i,
  /Unknown data format/i,
  /Invalid/i
];

function fail(msg) { return { ok: false, msg }; }
function pass(msg) { return { ok: true, msg }; }

/* 带 Node fs 访问的 loader：assets 里的 vega 是浏览器构建，file loader 默认 reject */
function nodeLoader() {
  const loader = vega.loader({ mode: 'file' });
  loader.fileAccess = true;
  loader.file = filename => fs.promises.readFile(filename, 'utf8');
  return loader;
}

/* 收集 Vega 运行期日志，便于把 WARN 提升为失败 */
function collectingLogger(sink) {
  const logger = {
    level() { return arguments.length ? logger : vega.Warn; },
    error(...args) { sink.push({ kind: 'ERROR', text: args.map(String).join(' ') }); return logger; },
    warn(...args) { sink.push({ kind: 'WARN', text: args.map(String).join(' ') }); return logger; },
    info() { return logger; },
    debug() { return logger; }
  };
  return logger;
}

function checkFiles(dir) {
  const missing = ['index.html', 'spec.vg.json', 'main.js', 'README.md']
    .filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) return fail(`缺少文件: ${missing.join(', ')}`);

  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  if (!html.includes('assets/vega.min.js')) return fail('index.html 未引用 ../../assets/vega.min.js');
  if (!html.includes('assets/demo.js')) return fail('index.html 未引用 ../../assets/demo.js');
  if (!html.includes('DEMO_META')) return fail('index.html 缺少 window.DEMO_META');

  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const want = README_SECTIONS.concat(isGroupF(path.basename(dir)) ? GROUP_F_SECTIONS : []);
  const lackSection = want.filter(s => !readme.includes(s));
  if (lackSection.length) return fail(`README.md 缺少小节: ${lackSection.join(' / ')}`);

  return pass('文件契约齐全');
}

async function checkSpec(dir, opts) {
  const slug = path.basename(dir);
  const specPath = path.join(dir, 'spec.vg.json');

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    return [fail(`spec.vg.json JSON 解析失败: ${e.message}`)];
  }
  if (!/schema\/vega\/v6\.json$/.test(spec.$schema || '')) {
    return [fail(`spec.$schema 应为 https://vega.github.io/schema/vega/v6.json（当前: ${spec.$schema}）`)];
  }

  let runtime;
  try {
    runtime = vega.parse(spec);
  } catch (e) {
    return [fail(`vega.parse 失败: ${e.message}`)];
  }

  // 数据 url 改写为绝对路径，走 fs loader
  for (const d of spec.data || []) {
    if (typeof d.url === 'string' && !/^[a-z]+:/i.test(d.url)) {
      const abs = path.resolve(dir, d.url);
      if (!fs.existsSync(abs)) return [fail(`数据文件不存在: ${d.url}`)];
      d.url = abs;
    }
  }
  // url 被改写过，必须重新 parse，否则运行的还是相对路径
  runtime = vega.parse(spec);

  if (NEEDS_CANVAS.has(slug)) {
    return [pass('parse + 数据文件就位（需真实 canvas，渲染校验见 tools/validate-browser.cjs）')];
  }

  const logs = [];
  const results = [];
  let view;
  try {
    view = new vega.View(runtime, { renderer: 'none', loader: nodeLoader() });
    view.logger(collectingLogger(logs));
    await view.runAsync();
  } catch (e) {
    return [fail(`View 无头运行失败: ${e.message}`)];
  }

  // 数据集行数
  const exempt = new Set(RUNTIME_FILLED[slug] || []);
  const counts = {};
  const empty = [];
  for (const d of spec.data || []) {
    let n;
    try { n = view.data(d.name).length; } catch (e) { n = -1; }
    counts[d.name] = n;
    if (n <= 0 && !exempt.has(d.name)) empty.push(`${d.name}=${n}`);
  }
  if (empty.length) {
    results.push(fail(`数据集为空（数据没真的读进来？）: ${empty.join(', ')}`));
  } else {
    results.push(pass(`数据流通过（${Object.keys(counts).length} 个数据集，共 ${Object.values(counts).reduce((a, b) => a + Math.max(b, 0), 0)} 行）`));
  }
  if (opts.verbose) {
    console.log(`     rows: ${JSON.stringify(counts)}`);
  }

  // Vega 日志
  const fatal = logs.filter(l => l.kind === 'ERROR' || FATAL_WARN_RE.some(re => re.test(l.text)));
  if (fatal.length) {
    results.push(fail(`Vega 运行期告警/错误:\n       ${fatal.map(l => l.kind + ' ' + l.text.split('\n')[0]).join('\n       ')}`));
  } else {
    results.push(pass('无 ERROR / 致命 WARN'));
  }

  /*
   * 比例尺 domain 退化检查。
   *
   * data 驱动的 domain 在交互过滤下有两种退化：空集（domain 变 [NaN, NaN]，
   * 刻度全消失，至少还有 Infinite extent WARN 兜着）与**零跨度**
   * （extent 只剩一个值，比如某个筛选下所有降水量都是 0）。
   * 后者一条 WARN 都不报、图照样出，但轴上只剩一个刻度、标签退化成 d3 默认的
   * `0.000000`，还会把包围盒撑歪。这里对连续型比例尺直接断言端点有限且不相等。
   *
   * 只查连续型：band/point/ordinal 的 domain 是类目数组，只有一个类目是合法的。
   */
  {
    const CONTINUOUS = new Set(['linear', 'log', 'pow', 'sqrt', 'symlog', 'time', 'utc', 'sequential', 'quantize', 'quantile', 'threshold', 'bin-ordinal']);
    const degenerate = [];
    for (const sc of spec.scales || []) {
      if (!CONTINUOUS.has(sc.type || 'linear')) continue;
      let dom;
      try { dom = view.scale(sc.name).domain(); } catch (e) { continue; }
      if (!Array.isArray(dom) || dom.length < 2) continue;
      const a = +dom[0], b = +dom[dom.length - 1];
      if (!Number.isFinite(a) || !Number.isFinite(b)) degenerate.push(`${sc.name} domain 非有限 [${dom[0]}, ${dom[dom.length - 1]}]`);
      else if (a === b) degenerate.push(`${sc.name} domain 零跨度 [${a}, ${b}]`);
    }
    if (degenerate.length) {
      results.push(fail(`比例尺 domain 退化：${degenerate.join('；')}\n`
        + '       data 驱动的 domain 要兜底，例如 '
        + '"domain": {"signal": "span(extent(pluck(data(\'d\'), \'v\'))) > 0 ? extent(...) : [0, 1]"}'));
    } else {
      results.push(pass('比例尺 domain 无退化'));
    }
  }

  /*
   * 未格式化浮点泄漏检查。
   *
   * 轴刻度或标签上出现 `0.000000` / `0.30000000000000004` / `6.428571428571429`
   * 这种小数位一大串的数字，一律是"没写 format" 或"domain 退化后 d3 用了默认格式"。
   * 阈值取 6 位小数：教学 demo 里确实有需要 3~4 位的（比如功率重量比 0.0506），
   * 但没人会故意在轴上标 6 位以上。
   */
  {
    const svgForText = await view.toSVG();
    const bad = [];
    const re = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = re.exec(svgForText))) {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      const num = /^[−-]?\d+\.(\d+)$/.exec(t.replace(/,/g, ''));
      if (num && num[1].length >= 6) bad.push(t);
    }
    if (bad.length) {
      results.push(fail(`有未格式化的浮点直出（${bad.length} 处，前几个: ${[...new Set(bad)].slice(0, 5).join(', ')}）\n`
        + '       轴上写 "format"，标签文字里用 format(datum.x, \'...\')；'
        + '若是 domain 退化导致的，先修 domain。'));
    } else {
      results.push(pass('无未格式化浮点'));
    }
  }

  /*
   * 布局溢出检查。
   *
   * 这是本项目最阴的一类 bug：group mark 内部声明的 scale 写 `"range": "width"`
   * 或 `"height"` 时，解析的是**顶层**的 width/height 信号，而不是这个 group 自己的尺寸 ——
   * 除非该 group 自己声明了同名的局部 signal（官方 Grouped Bar Chart 例子里那句
   * `"signals": [{"name": "height", "update": "bandwidth('yscale')"}]` 就是干这个的）。
   * 漏了它，子图会按整幅画布的尺寸去画，糊成一团并溢出画布 ——
   * 但 parse 不报错、数据流不报错、toSVG 也照样产出，只有肉眼能看出来。
   *
   * 所以这里量一下场景图的实际包围盒：轴标签、标题、图例本来就会探出
   * width/height 之外（autosize:pad 会把画布撑大容纳它们），但探出几百像素
   * 就不是图例，是布局算错了。
   */
  {
    const b = view.scenegraph().root.bounds;
    const W = view.signal('width'), H = view.signal('height');
    if (!b || !Number.isFinite(b.x1) || !Number.isFinite(b.x2) || b.x2 <= b.x1 || b.y2 <= b.y1) {
      results.push(fail('场景包围盒为空 —— 什么都没画出来（mark 的 from/encode 对不上？）'));
    } else {
      const over = {
        左: Math.round(-b.x1), 上: Math.round(-b.y1),
        右: Math.round(b.x2 - W), 下: Math.round(b.y2 - H)
      };
      const bad = Object.entries(over).filter(([, v]) => v > OVERFLOW_SLACK);
      if (bad.length) {
        results.push(fail(
          `布局溢出：场景比声明的 ${W}×${H} 多探出 `
          + bad.map(([k, v]) => `${k} ${v}px`).join('、')
          + `（阈值 ${OVERFLOW_SLACK}px）。\n`
          + '       常见原因：group mark 里的 scale 写了 "range": "width"/"height"，'
          + '但该 group 没声明同名局部 signal，\n'
          + '       于是用了顶层画布尺寸。修法是在 group mark 上加\n'
          + '       "signals": [{ "name": "height", "update": "<该 group 的实际高度>" }]。\n'
          + '       若布局确实就该这么大，请把顶层 width/height 改成真实尺寸。'
        ));
      } else {
        results.push(pass(`布局无溢出（探出 左${over.左}/上${over.上}/右${over.右}/下${over.下}px）`));
      }
    }
  }

  // 渲染闭环：toSVG
  {
    try {
      const svg = await view.toSVG();
      if (!svg || svg.length < 200) throw new Error(`SVG 过短（${svg ? svg.length : 0} 字节）`);
      if (!/<(path|text|rect|circle|line|image|symbol|g)\b/.test(svg)) throw new Error('SVG 里没有任何图元');
      results.push(pass(`toSVG 通过（${svg.length} 字节）`));
    } catch (e) {
      results.push(fail(`toSVG 失败: ${e.message}`));
    }
  }

  return results;
}

/*
 * 首页画廊（index.html 里的 GROUPS 数组）必须与 demos/ 目录一一对应。
 * 新增 demo 忘了登记、或删了目录忘了摘条目，都会让首页出现死链或漏项。
 */
function checkGallery() {
  const html = fs.readFileSync(path.join(EXAMPLES_ROOT, 'index.html'), 'utf8');
  const m = html.match(/var GROUPS = \[([\s\S]*?)\n\];/);
  if (!m) return fail('index.html 里找不到 GROUPS 数组');
  let groups;
  try {
    // GROUPS 是纯字面量数组，直接求值即可
    groups = new Function('return [' + m[1] + ']')();
  } catch (e) {
    return fail(`index.html 的 GROUPS 无法求值: ${e.message}`);
  }
  const listed = new Set(groups.flatMap(g => (g.demos || []).map(d => d[0])));
  const onDisk = fs.readdirSync(DEMOS_DIR).filter(n => fs.statSync(path.join(DEMOS_DIR, n)).isDirectory());
  const missing = onDisk.filter(d => !listed.has(d));
  const dangling = [...listed].filter(d => !onDisk.includes(d));
  if (missing.length || dangling.length) {
    return fail('首页画廊与 demos/ 不同步'
      + (missing.length ? `；目录存在但未登记: ${missing.join(', ')}` : '')
      + (dangling.length ? `；已登记但目录不存在: ${dangling.join(', ')}` : ''));
  }
  return pass(`首页画廊与 demos/ 同步（${listed.size} 项）`);
}

async function main() {
  const argv = process.argv.slice(2);
  const opts = { verbose: argv.includes('--verbose') };
  const filters = argv.filter(a => !a.startsWith('--'));

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
    const fileResult = checkFiles(dir);
    const results = fileResult.ok
      ? [fileResult, ...(await checkSpec(dir, opts))]
      : [fileResult];
    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      bad++;
      console.log(`FAIL ${slug}`);
      failed.forEach(r => console.log(`     ${r.msg}`));
    } else {
      console.log(`PASS ${slug} — ${results.map(r => r.msg).join('；')}`);
    }
  }
  // 全量跑时才检首页画廊（按 slug 过滤时对不上是正常的）
  if (!filters.length) {
    const g = checkGallery();
    if (!g.ok) { bad++; console.log(`FAIL index.html\n     ${g.msg}`); }
    else console.log(`PASS index.html — ${g.msg}`);
  }

  console.log(`\n${dirs.length - bad}/${dirs.length} 个 demo 校验通过`);
  const skipped = dirs.map(d => path.basename(d)).filter(s => NEEDS_CANVAS.has(s));
  if (skipped.length) {
    console.log(`提示：${skipped.join(' / ')} 只做了 parse（需真实 canvas）；`
      + `跑 node tools/validate-browser.cjs 才算完整校验。`);
  }
  process.exit(bad ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
