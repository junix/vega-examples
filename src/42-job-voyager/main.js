/* demo 42 入口：官方 Job Voyager 精读，纯 spec 驱动，一行渲染即可。
 * 交互（点面积填搜索框、双击清空）都写在 spec 的 signal.on 里，不需要运行时 API。 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' });
