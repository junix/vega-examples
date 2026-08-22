/* demo 45 入口：雷达图全部由 spec.vg.json 声明式描述，这里只负责加载渲染。
 * 半径映射（pow 指数）、系列筛选、刻度环间隔、顶点数值都是 spec 里的 signal，
 * 右侧交互面板由 Vega 的 bind 自动生成。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
