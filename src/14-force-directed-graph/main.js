/* demo 14 入口：拖拽逻辑全部在 spec 的 signals + mark on/trigger 里声明，
 * main.js 只需标准渲染。renderDemo 返回 Promise<View>，可链式做运行时操作。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
