/* demo 46 入口：官方 connected-scatter-plot 精读，纯 spec 驱动，一行渲染即可。
 * 所有交互（年份窗口、标签密度、插值方式）都在 spec 的 signals 里用 bind 声明，
 * 不需要任何运行时 API。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
