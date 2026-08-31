/* demo 12 入口：交互全部在 spec 里声明式完成（signals + 事件流 + 编码测试），
 * main.js 只需要标准骨架的一行——加载 spec 并渲染。
 * renderDemo 内部会调用 view.hover() 以启用内置 hover 编码集，
 * 并把 spec 里声明的 hovered / clickedOrigin 两个 signal 实时展示到右侧面板。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
