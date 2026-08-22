/* demo 11 入口：标准骨架只有一行——加载 spec 并渲染。
 * 刷选/缩放/平移全部在 spec 的 signal 事件流里声明，main.js 不需要任何事件代码。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
