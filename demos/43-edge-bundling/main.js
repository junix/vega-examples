/* demo 43 入口：纯 spec demo —— 布局、极坐标换算、边捆绑、交互高亮全在 spec.vg.json 里，
 * 这里只负责加载渲染（renderDemo 会自动把 View 接进页面顶部的导出工具栏）。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
