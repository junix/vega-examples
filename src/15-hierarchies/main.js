/* demo 15 入口：布局全部由 spec 声明，main.js 只需标准渲染。
 * renderDemo 返回 Promise<View>，可链式做运行时操作。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
