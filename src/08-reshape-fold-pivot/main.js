/* demo 08 入口：纯 spec demo，加载并渲染即可。
 * renderDemo 返回 Promise<View>，需要进一步操作 view 时链式 .then(view => ...)。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
