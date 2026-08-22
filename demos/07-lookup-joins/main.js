/* demo 07 入口：纯 spec demo，标准骨架只有一行——加载 spec 并渲染。
 * 两个方向的 lookup、nest/aggregate 全部在 spec.vg.json 的 data 段里声明。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
