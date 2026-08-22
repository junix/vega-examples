# 21 · Node 无头渲染导出 SVG：脱离浏览器跑 Vega

## 学习目标

前面 20 个 demo 全部在浏览器里运行——Vega 需要 DOM 吗？**不需要**。
Vega 的数据流引擎和场景图都是纯 JavaScript，渲染器只是最后一步"画到哪"。
设置 `renderer: 'none'` 后，Vega 在 Node.js 里也能完整跑通数据流，
并从场景图导出矢量 SVG——不需要 Canvas、不需要浏览器。

本 demo 展示：

1. 在 Node.js 里加载 Vega 的 CommonJS 构建（`assets/vega-bundle.cjs`）
2. 用 `renderer: 'none'` 创建无头 View，并给它一个**能真的读文件的** loader
3. `await view.runAsync()` 跑完数据流，把致命 WARN 升级成非零退出
4. `await view.toSVG()` 导出矢量图到文件

## 运行

```sh
# 先启动静态服务器（浏览器预览用）
../../serve.sh
# 浏览器打开 http://localhost:8000/demos/21-node-headless-render/

# Node 无头渲染（主角）
node demos/21-node-headless-render/render.cjs
# 输出 → demos/21-node-headless-render/output.svg

# 也能渲染本集里任意一份 spec（含用 url 读外部数据的）
node demos/21-node-headless-render/render.cjs demos/02-line-area-timeseries/spec.vg.json
node demos/21-node-headless-render/render.cjs demos/16-geo-choropleth/spec.vg.json
```

spec 里的相对 `url` 会按**该 spec 文件所在目录**改写成绝对路径，所以从仓库任何位置调都能读到
`assets/data/`。数据读不到时脚本**不写文件、退出码 1**——不会像早先那样安静地吐出一张空图。

## spec 逐段讲解

本 spec 用 **inline 数据**（`values` 而非 `url`）绘制季度销售额柱状图，
这样 Node 脚本不需要处理文件加载就能跑通。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0].values` | 内联数据数组 | 8 个季度的营收数据；Node 环境无需文件 I/O |
| `scales[0]` | band 比例尺（x 轴） | 离散的季度标签；`padding: 0.2` 控制柱间距 |
| `scales[1]` | linear 比例尺（y 轴） | `zero: true` 确保从 0 开始，避免柱子悬浮 |
| `axes[0]` | 底部 x 轴 | `labelAngle: -30` 斜排标签，**必须同时写 `labelAlign` / `labelBaseline`**（见下） |
| `marks[0]` | rect 柱子 | `y2: {"scale":"y","value":0}` 让柱子从底部生长 |
| `marks[1]` | text 数值标签 | 每根柱子上方显示具体营收数字 |

### render.cjs 核心流程

| 步骤 | 代码 | 说明 |
| --- | --- | --- |
| 加载 Vega | `require('../../assets/vega-bundle.cjs')` | 取 `module.exports`；**不要**去找 `globalThis.vega`（那是 `undefined`） |
| 关掉 canvas 测字 | `vega.textMetrics.canvas(false)` | 固定用估算公式量字宽，输出可复现 |
| 读 spec | `JSON.parse(fs.readFileSync(...))` | 同步读文件、同步解析 |
| 相对 url 绝对化 | `d.url = path.resolve(path.dirname(specPath), d.url)` | 让 `../../assets/data/...` 相对 spec 而不是相对 cwd |
| 编译 | `vega.parse(spec)` | JSON → 运行时描述，与浏览器完全相同 |
| 造 loader | `loader.fileAccess = true; loader.file = fs.promises.readFile` | **必需**，否则读不到任何文件（见下） |
| 创建 View | `new vega.View(runtime, {renderer:'none', loader})` | `renderer: 'none'` 不创建任何画布 |
| 收日志 | `view.logger(collectingLogger)` | 把 Vega 的 WARN/ERROR 收进数组待检 |
| 跑数据流 | `await view.runAsync()` | 跑完后检查日志；有致命项就 `exit 1`，不写文件 |
| 导出 SVG | `await view.toSVG()` | 从场景图重新生成矢量 SVG，与当前渲染器无关 |
| 写文件 | `fs.writeFileSync(outPath, svg)` | 纯文本写入，UTF-8 |

### 关键点

| 概念 | 说明 |
| --- | --- |
| `renderer: 'none'` | 不创建 DOM/Canvas/WebGL，纯内存跑数据流 |
| `require` 的返回值 | `assets/vega-bundle.cjs` 走 UMD 的 CommonJS 分支，导出对象**就是** `module.exports`；`globalThis.vega` 保持 `undefined` |
| `.cjs` 后缀 | 强制 Node 用 CommonJS 语义，避免被当成 ESM |
| `view.logger(...)` | 换掉默认 logger，才能拿到 WARN 文本自己判成败 |
| `view.toSVG()` | 无论渲染器是什么，都从场景图重新生成 SVG |

#### 坑一：`vega.loader({mode: 'file'})` 光写 `mode` 是读不到文件的

`assets/` 里那三份 Vega 都是**浏览器构建**。浏览器构建的 loader 里 `fileAccess` 恒为 `false`、
`file()` 直接 reject：

```js
const l = vega.loader({ mode: 'file' });
l.fileAccess                      // → false
await l.file('assets/data/points.json')   // → reject: Error: No file system access.
```

Vega 把加载失败只记成一条 `WARN Loading failed …`，数据流照样跑完、`toSVG()` 照样返回一张
只有空坐标轴的图。所以 Node 端必须手工注入 fs：

```js
const loader = vega.loader({ mode: 'file' });
loader.fileAccess = true;
loader.file = f => require('fs').promises.readFile(f, 'utf8');
```

并且**自己把 WARN 升级成失败**——`render.cjs` 收集日志后按
`Loading failed` / `Data ingestion failed` / `Infinite extent` / `Unknown data format` /
`Unsupported scale property` 判定致命，命中就 `exit 1`（和 `tools/validate.cjs` 同一套判据）。

#### 坑二：`labelAngle` 不会自动带上对齐方式

这是 Vega 与 Vega-Lite 的一个真实差异：**Vega-Lite 会替你从 `labelAngle` 推导
`labelAlign` / `labelBaseline`，Vega 不会。** 只写 `labelAngle: -30` 的话标签仍是
`align: "center"` / `baseline: "top"`，也就是绕自己的**中心**旋转——包围盒相对刻度左右不对称，
旋转后抬起来的那一头会伸进绘图区。本 demo 实测（`node tools/inspect.cjs 21`，或直接读场景图）：

| x 轴写法 | 首个标签锚点 | 包围盒 | 结论 |
| --- | --- | --- | --- |
| 只有 `labelAngle: -30` | 刻度 x=32.72 | `x 8.47…61.97`，`y -7…29.66` | 包围盒中心 35.22 比刻度右偏 2.5px；`y1 = -7` 说明尾端抬到**轴线上方 7px**，扎进柱子之间 |
| 加 `labelAlign: "right"` + `labelBaseline: "top"` | 同上 | `x -15.78…37.72`，`y 7…43.66` | 文字右上角钉在刻度上、整串向左下方垂下；`y1 = 7` 全在轴线下方 |

所以斜排标签的正确写法是：

```json
{"orient": "bottom", "scale": "x", "labelAngle": -30,
 "labelAlign": "right", "labelBaseline": "top"}
```

（负角度 = 逆时针，文字向右上翘，锚点要落在文字**右端**；正角度反过来用 `labelAlign: "left"`。）

## 试一试（改练）

1. 把 `renderer: 'none'` 改成 `renderer: 'svg'`，Node 里会怎样？**实测不报错**——
   没调 `view.initialize(el)` 就没有容器，Vega 根本不会去实例化渲染器，`renderer` 选项形同空转，
   `toSVG()` 照样出图。真正需要 DOM 的是 `view.initialize(el)`：在 Node 里传个普通对象会抛
   `el.setAttribute is not a function`。所以"无头"的关键不是 `renderer: 'none'`，而是**不 initialize**；
   写 `'none'` 只是把意图说清楚。
2. 把 `render.cjs` 里 `loader.fileAccess = true` 那两行注释掉，再跑
   `node render.cjs ../02-line-area-timeseries/spec.vg.json`——看它怎么"成功"地画出一张空图，
   再看修好后的版本怎么 `exit 1`。这是本 demo 最值钱的一课。
3. 把 `spec.vg.json` 的 inline `values` 换成 `{"url": "../../assets/data/barley.json"}`
   （别忘了 JSON 之外的格式要显式写 `"format": {"type": "csv"}`），确认照样跑通。
4. 给 `render.cjs` 加一个 `--width` 参数，运行时修改 spec 的 width 再 parse。
5. 用 `view.toCanvas()` 尝试导出 PNG：纯 Node 会 reject
   `CanvasRenderer is missing a valid canvas or context`（本集不引 `npm install canvas`，
   要 PNG 走 `tools/export.cjs` + 真实 Chromium）。
6. 把 x 轴的 `labelAngle` 改成 `+30`，看 `labelAlign: "right"` 为什么这时反而不对，
   再用 `node tools/inspect.cjs 21` 读包围盒验证你的修法。
7. 对比 `view.toSVG()` 和直接拼 SVG 字符串：Vega 导出的 SVG 包含哪些额外信息？
8. 把 `render.cjs` 改造成一个接受 `-o out.svg` 的完整 CLI 工具。

## 参考

- 官方文档：[View API · toSVG](https://vega.github.io/vega/docs/api/view/#view_toSVG) ·
  [Renderers](https://vega.github.io/vega/docs/api/renderers/) ·
  [Axes · labelAlign / labelBaseline](https://vega.github.io/vega/docs/axes/)
- 本 demo 的 Node 脚本：[render.cjs](./render.cjs)
- 同样用注入式 loader 的现成实现：`tools/validate.cjs` 的 `nodeLoader()` / `collectingLogger()`
- AGENTS.md 中的 "Node 脚本注意事项"
