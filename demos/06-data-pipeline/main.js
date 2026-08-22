/* demo 06 入口：纯 spec demo，标准骨架只有一行——加载 spec 并渲染。
 * 变换管线全部在 spec.vg.json 的 data 段里声明，无需手写 JS。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
