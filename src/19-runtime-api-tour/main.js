/* demo 19 入口：本 demo 的主角不是 spec，而是这里的 View 运行时 API。
 *
 * View 生命周期总览（README.md 有逐段表格）：
 *   vega.parse(spec)          JSON spec → 运行时描述（数据流图，不含任何像素）
 *   new vega.View(runtime, …) 运行时描述 → 一个具体视图（持有自己的场景图/渲染器）
 *   .initialize(el)           挂到 DOM 容器，创建渲染器与事件处理器
 *   .hover()                  启用内置悬停处理（驱动 encode 的 hover 集）
 *   .runAsync()               跑数据流并渲染首帧
 *   .finalize()               拆除监听器、释放资源（本页面不演示，见 README）
 */
(function () {
  'use strict';

  var logBox = document.getElementById('log');

  /* 往页面日志区追加一行（同时镜像到 console 方便调试） */
  function log() {
    var line = Array.prototype.map.call(arguments, function (a) {
      return typeof a === 'string' ? a : JSON.stringify(a);
    }).join(' ');
    logBox.textContent += line + '\n';
    logBox.scrollTop = logBox.scrollHeight;
    console.log.apply(console, arguments);
  }

  /* 触发浏览器下载 */
  function download(href, filename) {
    var a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  fetch('./spec.vg.json')
    .then(function (res) {
      if (!res.ok) throw new Error('加载 spec 失败: HTTP ' + res.status);
      return res.json();
    })
    .then(function (spec) {
      /* 第 1 步：parse —— 声明式 JSON 编译成运行时描述。
       * 产物本身不画图，可以喂给任意多个 View（这里一次喂两个）。 */
      var runtime = vega.parse(spec);

      /* 第 2 步：同一 runtime 构造两个独立 View，渲染器分别为 canvas / svg。
       * renderer 只决定“画到哪”，数据流与场景图结构完全一致。 */
      var viewCanvas = new vega.View(runtime, { renderer: 'canvas', logLevel: vega.Warn });
      var viewSvg    = new vega.View(runtime, { renderer: 'svg',    logLevel: vega.Warn });

      /* 第 3 步：initialize 挂到 DOM；hover 启用悬停（两个 View 各自独立） */
      viewCanvas.initialize(document.querySelector('#view-canvas')).hover();
      viewSvg.initialize(document.querySelector('#view-svg')).hover();

      /* 第 4 步：事件监听。addEventListener(type, handler(event, item))，
       * item 是被拾取的场景图元素，item.datum 是它背后的数据行。 */
      function onClick(rendererName) {
        return function (event, item) {
          if (item && item.mark && item.mark.marktype === 'symbol') {
            var d = item.datum;
            log('[click@' + rendererName + ']', d.Name,
                '| Horsepower =', d.Horsepower,
                '| MPG =', d.Miles_per_Gallon,
                '| Origin =', d.Origin);
          } else {
            log('[click@' + rendererName + '] 点到了空白/坐标轴/图例（无 symbol datum）');
          }
        };
      }
      viewCanvas.addEventListener('click', onClick('canvas'));
      viewSvg.addEventListener('click', onClick('svg'));

      /* 第 5 步：signal 监听。监听器挂在单个 View 上：
       * 拖 canvas 视图的滑块只会触发 viewCanvas 上的回调（右侧实时值面板同源）。 */
      var sizeCell = document.querySelector('#signals .v');
      function addSizeListener(view, tag) {
        view.addSignalListener('pointSize', function (name, value) {
          if (tag === 'canvas') sizeCell.textContent = JSON.stringify(value);
          log('[signal@' + tag + ']', name, '=', value);
        });
      }
      addSizeListener(viewCanvas, 'canvas');
      addSizeListener(viewSvg, 'svg');
      sizeCell.textContent = JSON.stringify(spec.signals[0].value);

      /* 第 6 步：runAsync 跑数据流并渲染首帧，两个 View 并行 */
      return Promise.all([viewCanvas.runAsync(), viewSvg.runAsync()]).then(function () {
        log('两个 View 首帧渲染完成（runAsync resolve）');
        /* 手工构造的 View 自己接入页面顶部的共享导出工具栏（renderDemo 会自动做这一步）。
         * 注册两个 → 工具栏上会多出一个 View 选择框。 */
        registerDemoView(viewCanvas, 'canvas');
        registerDemoView(viewSvg, 'svg');
        wireButtons(viewCanvas, viewSvg);
      });
    })
    .catch(function (err) { showDemoError(err); });

  /* 底部按钮：导出 SVG / 导出 PNG / 切换尺寸 */
  function wireButtons(viewCanvas, viewSvg) {

    /* toSVG() 与当前渲染器无关：它从场景图重新生成矢量字符串，
     * 所以 canvas 渲染的视图同样能导出 SVG。 */
    document.getElementById('btn-svg').addEventListener('click', function () {
      viewCanvas.toSVG().then(function (svgText) {
        var blob = new Blob([svgText], { type: 'image/svg+xml' });
        var url = URL.createObjectURL(blob);
        download(url, 'demo19.svg');
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        log('[export] toSVG() →', svgText.length, '字节，已触发 demo19.svg 下载');
      }).catch(function (e) { log('[export] toSVG 失败：', e.message); });
    });

    /* toCanvas(scaleFactor) 把场景图重画到一张离屏 canvas（2 = 两倍清晰度），
     * 再走 canvas.toDataURL 拿 PNG。Node 里做同样的事需要 node-canvas（见 demo 21）。 */
    document.getElementById('btn-png').addEventListener('click', function () {
      viewCanvas.toCanvas(2).then(function (canvas) {
        download(canvas.toDataURL('image/png'), 'demo19.png');
        log('[export] toCanvas(2) →', canvas.width + '×' + canvas.height,
            '像素，已触发 demo19.png 下载');
      }).catch(function (e) { log('[export] toCanvas 失败：', e.message); });
    });

    /* width()/height() 本质是写同名 signal，再 runAsync() 重跑数据流。
     * spec 里 scale 的 range 写成 "width"/"height"，图表才会随信号伸缩。 */
    var small = false;
    document.getElementById('btn-resize').addEventListener('click', function () {
      small = !small;
      var w = small ? 480 : 520, h = small ? 300 : 340;
      [viewCanvas, viewSvg].forEach(function (v) { v.width(w).height(h); });
      Promise.all([viewCanvas.runAsync(), viewSvg.runAsync()]).then(function () {
        log('[resize] width(' + w + ').height(' + h + ') + runAsync() 完成');
      });
    });
  }
})();
