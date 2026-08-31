/* demo 09 入口：交互逻辑全部在 spec 的 signals/事件流里声明，入口只需渲染。
 * 刷选时可打开右侧 Signals 面板观察 *Range 信号的实时值。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
