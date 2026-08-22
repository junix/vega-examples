/*
 * vega-examples 共享渲染助手。
 * 每个 demo 页面约定：
 *   1. <script>window.DEMO_META = { slug, title, group, concepts: [...] }</script>
 *   2. <script src="../../../docs/vega.min.js"></script>
 *   3. <script src="../../assets/demo.js"></script>
 *   4. renderDemo({ spec: './spec.vg.json', element: '#view' }) 渲染图表。
 *
 * 提供：
 *   - renderHeader()  根据 DEMO_META 生成页头（面包屑 / 标题 / 概念标签 / 相关链接）
 *   - renderDemo()    加载 spec → vega.parse → View 渲染 → signal 实时检视面板
 *   - showError()     以醒目浮层展示错误（方便 agent 截图/读 DOM 诊断）
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

    function fmt(value) {
      var s;
      try { s = JSON.stringify(value); } catch (e) { s = String(value); }
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

  /*
   * 加载并渲染一个 demo。
   * options:
   *   spec       spec 的 URL（字符串）或已解析的 spec 对象
   *   element    图表容器选择器，默认 '#view'
   *   renderer   'canvas'（默认）或 'svg'
   *   signals    signal 检视面板选择器，默认 '#signals'；传 null 关闭
   *   hover      是否启用内置 hover 事件处理，默认 true
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

  document.addEventListener('DOMContentLoaded', renderHeader);
})(this);
