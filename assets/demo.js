/*
 * vega-examples 共享渲染助手。
 * 每个 demo 页面约定：
 *   1. <script>window.DEMO_META = { slug, title, group, concepts: [...] }</script>
 *   2. <script src="../../assets/vega.min.js"></script>
 *   3. <script src="../../assets/demo.js"></script>
 *   4. renderDemo({ spec: './spec.vg.json', element: '#view' }) 渲染图表。
 *
 * 提供：
 *   - renderHeader()        根据 DEMO_META 生成页头（面包屑 / 标题 / 概念标签 / 相关链接）
 *   - renderDemo()          加载 spec → vega.parse → View 渲染 → signal 实时检视面板
 *                           → 自动注册进导出工具栏
 *   - registerDemoView()    手工构造 View 的 demo（19 / 20）用它接入导出工具栏
 *   - exportDemoImage()     以 Promise 返回 SVG 文本 / PNG dataURL（PNG 默认透明背景）
 *   - showError()           以醒目浮层展示错误（方便 agent 截图/读 DOM 诊断）
 *
 * 给 agent 的钩子（无头驱动时用）：
 *   window.__sceneReady        首个 View 渲染完成后置 true
 *   window.__vegaDemo          { slug, ready, views: [{name, view}] }
 *   window.__vegaExport(opts)  = exportDemoImage，返回 Promise（供 CDP Runtime.evaluate 调用）
 */
(function (global) {
  'use strict';

  var HOME = '../../index.html';
  var DOCS = 'https://vega.github.io/vega/docs/';

  function h(tag, attrs, text) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }

  function showError(err) {
    var box = h('pre', { class: 'demo-error' });
    box.textContent = 'Demo 运行出错：\n' + (err && err.stack ? err.stack : String(err));
    document.body.appendChild(box);
    console.error(err);
  }

  /* 根据 window.DEMO_META 在 <body> 开头插入统一页头 */
  function renderHeader() {
    var meta = global.DEMO_META || {};
    var header = h('header', { class: 'demo-header' });

    var crumb = h('div', { class: 'crumb' });
    var home = h('a', { href: HOME }, 'vega-examples');
    crumb.appendChild(home);
    crumb.appendChild(document.createTextNode(' / ' + (meta.group || '') + ' / ' + (meta.slug || '')));
    header.appendChild(crumb);

    header.appendChild(Object.assign(h('h1'), { textContent: meta.title || document.title }));

    if (meta.concepts && meta.concepts.length) {
      var tags = h('div', { class: 'tags' });
      meta.concepts.forEach(function (c) { tags.appendChild(h('span', { class: 'tag' }, c)); });
      header.appendChild(tags);
    }

    var links = h('div', { class: 'links' });
    links.appendChild(h('a', { href: './spec.vg.json', target: '_blank' }, '查看 spec 源码'));
    if (meta.readme !== false) links.appendChild(h('a', { href: './README.md', target: '_blank' }, '本 demo 讲解 README'));
    links.appendChild(h('a', { href: DOCS, target: '_blank' }, 'Vega 官方文档'));
    header.appendChild(links);

    document.body.insertBefore(header, document.body.firstChild);
  }

  /* 将 spec 中声明的 signals 实时渲染到检视面板 */
  function inspectSignals(view, spec, panel) {
    if (!panel || !spec.signals || !spec.signals.length) return;
    var box = document.querySelector(panel);
    if (!box) return;
    box.classList.add('demo-signals');
    box.appendChild(h('h2', null, 'Signals 实时值'));

    var table = h('table');
    var cells = {};
    spec.signals.forEach(function (s) {
      var row = h('tr');
      var k = h('td', { class: 'k' }, s.name);
      var v = h('td', { class: 'v' });
      row.appendChild(k); row.appendChild(v);
      table.appendChild(row);
      cells[s.name] = v;
    });
    box.appendChild(table);

    /*
     * 抹掉浮点噪声再显示。signal 面板是这套 demo 的主要教学界面（README 让读者盯着它看），
     * 而 scale.invert()、算出来的 extent 之类天生带二进制浮点尾巴：
     * 2.4000000000000004、0.6999999999999997、6.428571428571429 这种。
     * toPrecision(12) 足以在 double 的有效位内还原本意，又不会改变真正需要精度的值。
     * 只动显示，不动 signal 本身的值。
     */
    function tidy(value) {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
      }
      if (Array.isArray(value)) return value.map(tidy);
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        var o = {};
        Object.keys(value).forEach(function (k) { o[k] = tidy(value[k]); });
        return o;
      }
      return value;
    }

    function fmt(value) {
      var s;
      try { s = JSON.stringify(tidy(value)); } catch (e) { s = String(value); }
      if (s == null) s = String(value);
      return s.length > 140 ? s.slice(0, 140) + '…' : s;
    }
    function refresh(name) {
      try { cells[name].textContent = fmt(view.signal(name)); }
      catch (e) { cells[name].textContent = '<不可用: ' + e.message + '>'; }
    }
    Object.keys(cells).forEach(function (name) {
      refresh(name);
      view.addSignalListener(name, function () { refresh(name); });
    });
  }

  /* ==================================================================
   * 导出：SVG / PNG，PNG 默认透明背景
   *
   * 两个 API 都与当前渲染器无关 —— 它们从**场景图**重新画一遍：
   *   view.toSVG(scale)     → SVG 字符串（矢量，无损缩放）
   *   view.toCanvas(scale)  → 离屏 HTMLCanvasElement，再 toDataURL('image/png')
   *
   * 背景色由 view.background() 决定（本质是名为 background 的内建 signal）：
   *   - null       → SVG 不画底板 rect、PNG 的 alpha 通道为 0（真透明）
   *   - '#ffffff'  → SVG 多一个满幅 rect、PNG 底色为白
   * Vega 默认 background 就是 null，但 spec 里写了 "background" 的话会被继承到导出图里，
   * 所以这里在导出前后显式改写并复原，保证"透明"这件事不依赖 spec 怎么写。
   * ================================================================== */

  var views = [];                        // [{ name, view }]
  var toolbarBuilt = false;

  global.__vegaDemo = { slug: (global.DEMO_META || {}).slug || null, ready: false, views: views };

  function slugName() {
    return ((global.DEMO_META || {}).slug || 'vega-demo');
  }

  /* 临时把 background 换成 bg，跑完 fn 再复原（无论成功失败） */
  function withBackground(view, bg, fn) {
    var prev = view.background();
    var same = (prev == null && bg == null) || prev === bg;
    if (same) return Promise.resolve().then(fn);

    function restore() {
      view.background(prev);
      return view.runAsync();
    }
    return Promise.resolve()
      .then(function () { view.background(bg); return view.runAsync(); })
      .then(fn)
      .then(function (r) { return restore().then(function () { return r; }); },
            function (e) { return restore().then(function () { throw e; }); });
  }

  /*
   * exportDemoImage({ format, scale, transparent, index, background })
   *   format       'svg' | 'png'（默认 'svg'）
   *   scale        像素倍数，只对 png 有意义（默认 2）
   *   transparent  true（默认）→ 背景 null；false → 用 background 指定的底色
   *   background   transparent:false 时的底色，默认 '#ffffff'
   *   index        多 View 页面选第几个（默认 0）
   * 返回 Promise<{ format, scale, transparent, filename, width, height, bytes, text?, dataUrl? }>
   */
  function exportDemoImage(opts) {
    opts = opts || {};
    var format = (opts.format || 'svg').toLowerCase();
    var scale = opts.scale == null ? (format === 'png' ? 2 : 1) : Number(opts.scale);
    var transparent = opts.transparent !== false;
    var bg = transparent ? null : (opts.background || '#ffffff');
    var idx = opts.index == null ? 0 : Number(opts.index);

    var entry = views[idx];
    if (!entry) return Promise.reject(new Error('没有已注册的 View（index=' + idx + '，共 ' + views.length + ' 个）'));
    var view = entry.view;

    var base = slugName() + (views.length > 1 ? '-' + entry.name : '')
      + (format === 'png' && scale !== 1 ? '@' + scale + 'x' : '')
      + (transparent ? '' : '-opaque');

    return withBackground(view, bg, function () {
      if (format === 'svg') {
        return view.toSVG(scale).then(function (text) {
          var m = /width="(\d+(?:\.\d+)?)"\s+height="(\d+(?:\.\d+)?)"/.exec(text) || [];
          return {
            format: 'svg', scale: scale, transparent: transparent,
            filename: base + '.svg',
            width: Number(m[1]) || null, height: Number(m[2]) || null,
            bytes: text.length, text: text
          };
        });
      }
      if (format === 'png') {
        return view.toCanvas(scale).then(function (canvas) {
          var dataUrl = canvas.toDataURL('image/png');
          return {
            format: 'png', scale: scale, transparent: transparent,
            filename: base + '.png',
            width: canvas.width, height: canvas.height,
            bytes: Math.round((dataUrl.length - 22) * 3 / 4), dataUrl: dataUrl
          };
        });
      }
      return Promise.reject(new Error('不支持的导出格式: ' + format + '（只支持 svg / png）'));
    });
  }

  function triggerDownload(href, filename, revoke) {
    var a = h('a', { href: href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 2000);
  }

  /* 导出并触发浏览器下载 */
  function downloadDemoImage(opts) {
    return exportDemoImage(opts).then(function (r) {
      if (r.format === 'svg') {
        var url = URL.createObjectURL(new Blob([r.text], { type: 'image/svg+xml;charset=utf-8' }));
        triggerDownload(url, r.filename, true);
      } else {
        triggerDownload(r.dataUrl, r.filename, false);
      }
      return r;
    });
  }

  /* 工具栏：每个页面一条，放在 .demo-view 顶部 */
  function buildToolbar() {
    if (toolbarBuilt) return;
    var host = document.querySelector('.demo-view') || document.querySelector('.demo-main') || document.body;
    toolbarBuilt = true;

    var bar = h('div', { class: 'demo-export' });
    bar.appendChild(h('span', { class: 'demo-export-label' }, '导出当前图表：'));

    var viewSel = h('select', { class: 'demo-export-view', title: '本页有多个 View，选择导出哪一个' });
    viewSel.style.display = 'none';
    bar.appendChild(viewSel);

    var btnSvg = h('button', { type: 'button' }, 'SVG');
    var btnPng = h('button', { type: 'button' }, 'PNG');
    bar.appendChild(btnSvg);
    bar.appendChild(btnPng);

    var scaleWrap = h('label', { class: 'demo-export-opt' });
    scaleWrap.appendChild(document.createTextNode('PNG 倍数 '));
    var scaleSel = h('select');
    [1, 2, 3, 4].forEach(function (n) {
      var o = h('option', { value: String(n) }, n + '×');
      if (n === 2) o.selected = true;
      scaleSel.appendChild(o);
    });
    scaleWrap.appendChild(scaleSel);
    bar.appendChild(scaleWrap);

    var transWrap = h('label', { class: 'demo-export-opt', title: '勾选时把 background signal 临时置为 null，PNG 的 alpha 通道为 0' });
    var transBox = h('input', { type: 'checkbox' });
    transBox.checked = true;
    transWrap.appendChild(transBox);
    transWrap.appendChild(document.createTextNode(' 透明背景'));
    bar.appendChild(transWrap);

    var status = h('span', { class: 'demo-export-status' });
    bar.appendChild(status);

    function run(format) {
      status.textContent = '导出中…';
      status.className = 'demo-export-status';
      downloadDemoImage({
        format: format,
        scale: Number(scaleSel.value),
        transparent: transBox.checked,
        index: Number(viewSel.value || 0)
      }).then(function (r) {
        status.textContent = r.filename + ' · ' + r.width + '×' + r.height + ' · '
          + (r.bytes > 1024 ? (r.bytes / 1024).toFixed(1) + ' KB' : r.bytes + ' B')
          + (r.transparent ? ' · 透明背景' : ' · 白底');
      }).catch(function (e) {
        status.textContent = '导出失败：' + e.message;
        status.className = 'demo-export-status is-error';
        console.error(e);
      });
    }
    btnSvg.addEventListener('click', function () { run('svg'); });
    btnPng.addEventListener('click', function () { run('png'); });

    host.insertBefore(bar, host.firstChild);
    global.__vegaDemo.toolbar = { bar: bar, viewSel: viewSel, status: status };
  }

  function refreshToolbarViews() {
    var t = global.__vegaDemo.toolbar;
    if (!t) return;
    t.viewSel.innerHTML = '';
    views.forEach(function (v, i) {
      t.viewSel.appendChild(h('option', { value: String(i) }, v.name));
    });
    t.viewSel.style.display = views.length > 1 ? '' : 'none';
  }

  /*
   * 把一个 View 接入导出工具栏 / agent 钩子。
   * renderDemo 会自动调用；手工构造 View 的 demo（19、20）在 runAsync 之后自己调一次。
   */
  function registerDemoView(view, name) {
    views.push({ name: name || ('view' + (views.length + 1)), view: view });
    buildToolbar();
    refreshToolbarViews();
    global.__vegaDemo.ready = true;
    global.__sceneReady = true;
    return view;
  }

  /*
   * 加载并渲染一个 demo。
   * options:
   *   spec       spec 的 URL（字符串）或已解析的 spec 对象
   *   element    图表容器选择器，默认 '#view'
   *   renderer   'canvas'（默认）或 'svg'
   *   signals    signal 检视面板选择器，默认 '#signals'；传 null 关闭
   *   hover      是否启用内置 hover 事件处理，默认 true
   *   name       多 View 页面里本 View 在导出工具栏中的名字
   *   export     传 false 可不接入导出工具栏
   *   返回 Promise<View>，方便 main.js 继续做运行时操作。
   */
  function renderDemo(options) {
    var opts = Object.assign(
      { element: '#view', renderer: 'canvas', signals: '#signals', hover: true },
      options || {}
    );
    return Promise.resolve()
      .then(function () {
        if (typeof opts.spec !== 'string') return opts.spec;
        return fetch(opts.spec).then(function (res) {
          if (!res.ok) throw new Error('加载 spec 失败: HTTP ' + res.status + ' (' + opts.spec + ')');
          return res.json();
        });
      })
      .then(function (spec) {
        var view = new vega.View(vega.parse(spec), {
          renderer: opts.renderer,
          logLevel: vega.Warn
        }).initialize(document.querySelector(opts.element));
        if (opts.hover) view = view.hover();
        return view.runAsync().then(function () {
          inspectSignals(view, spec, opts.signals);
          if (opts.export !== false) registerDemoView(view, opts.name);
          return view;
        });
      })
      .catch(function (err) {
        showError(err);
        throw err;
      });
  }

  global.renderDemo = renderDemo;
  global.renderDemoHeader = renderHeader;
  global.showDemoError = showError;
  global.registerDemoView = registerDemoView;
  global.exportDemoImage = exportDemoImage;
  global.downloadDemoImage = downloadDemoImage;
  global.__vegaExport = exportDemoImage;

  document.addEventListener('DOMContentLoaded', renderHeader);
})(this);
