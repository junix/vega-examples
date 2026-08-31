/* demo 17 入口：标准骨架只有一行——加载 spec 并渲染。
 * wordPadding / maxFont 两个 signal 带 bind 控件，由 Vega 自动渲染成滑杆，
 * 无需手写 JS；右侧 Signals 面板会实时显示它们的值。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
