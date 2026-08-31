/* demo 18 入口：标准骨架只有一行——加载 spec 并渲染。
 * 全部交互（Voronoi 拾取 → hovered 信号 → 高亮/车名显示）都在 spec 里声明式完成。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
