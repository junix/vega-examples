/* demo 41 入口：邻接矩阵全部由 spec.vg.json 声明式描述，这里只负责加载渲染。
 * 排序 / 配色 / 标签密度都是 spec 里的 signal，交互面板由 Vega 的 bind 自动生成。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
