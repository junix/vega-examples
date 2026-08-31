/* demo 37 入口：三块地图（投影画廊 / 大圆航线 / 地震比例符号）全部由 spec.vg.json 声明，
 * 面板布局靠 projection 的 fit + extent 完成，所以这里只需要一行渲染。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
