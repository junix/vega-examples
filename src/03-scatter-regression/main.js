/* demo 03 入口：纯 spec demo，一行加载渲染即可。
 * 回归曲线完全由 spec 里的 regression 变换在数据流中算好，main.js 无需任何手写计算。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
