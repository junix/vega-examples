/* demo 21 入口（浏览器版）：渲染季度销售额柱状图。
 *
 * 本 demo 的主角其实是 render.cjs —— 同一份 spec 在 Node.js 里
 * 用 renderer:'none' 无头跑数据流，再 toSVG() 导出矢量文件。
 * 浏览器这边只做最简单的渲染，让你直观看到图表长什么样。 */
(function () {
  'use strict';
  renderDemo({ spec: './spec.vg.json', renderer: 'canvas', hover: true })
    .catch(function (err) { showDemoError(err); });
})();
