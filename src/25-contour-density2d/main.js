/* demo 25 入口：纯 spec 驱动——isocontour / kde2d / geopath 全部在 spec.vg.json 里声明，
 * 这里只负责加载与渲染（renderDemo 会自动把 signal 面板和导出工具栏接好）。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
