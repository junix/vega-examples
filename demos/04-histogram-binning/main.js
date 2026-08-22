/* demo 04 入口：标准骨架只有一行——加载 spec 并渲染。
 * 交互（maxbins 下拉框）完全由 spec 里 signal 的 bind 声明驱动，无需手写 JS。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
