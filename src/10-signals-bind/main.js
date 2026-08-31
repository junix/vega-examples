/* demo 10 入口：标准骨架只有一行——加载 spec 并渲染。
 * bind 控件由 Vega 按 signal 声明自动生成；signal 实时值由 renderDemo 的检视面板展示。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
