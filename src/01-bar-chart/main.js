/* demo 01 入口：标准骨架只有一行——加载 spec 并渲染。
 * renderDemo 返回 Promise<View>，需要进一步操作 view 时链式 .then(view => ...)。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
