# 21 · Node 无头渲染导出 SVG：脱离浏览器跑 Vega

## 学习目标

前面 20 个 demo 全部在浏览器里运行——Vega 需要 DOM 吗？**不需要**。
Vega 的数据流引擎和场景图都是纯 JavaScript，渲染器只是最后一步"画到哪"。
设置 `renderer: 'none'` 后，Vega 在 Node.js 里也能完整跑通数据流，
并从场景图导出矢量 SVG——不需要 Canvas、不需要浏览器。

本 demo 展示：

1. 在 Node.js 里加载 Vega UMD 文件
2. 用 `renderer: 'none'` + `loader: {mode: 'file'}` 创建无头 View
3. `await view.toSVG()` 导出矢量图到文件

## 运行

```sh
# 先启动静态服务器（浏览器预览用）
../../serve.sh
# 浏览器打开 http://localhost:8000/vega-examples/demos/21-node-headless-render/

# Node 无头渲染（主角）
node demos/21-node-headless-render/render.cjs
# 输出 → demos/21-node-headless-render/output.svg
```

## spec 逐段讲解

本 spec 用 **inline 数据**（`values` 而非 `url`）绘制季度销售额柱状图，
这样 Node 脚本不需要处理文件加载就能跑通。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0].values` | 内联数据数组 | 8 个季度的营收数据；Node 环境无需文件 I/O |
| `scales[0]` | band 比例尺（x 轴） | 离散的季度标签；`padding: 0.2` 控制柱间距 |
| `scales[1]` | linear 比例尺（y 轴） | `zero: true` 确保从 0 开始，避免柱子悬浮 |
| `marks[0]` | rect 柱子 | `y2: {"scale":"y","value":0}` 让柱子从底部生长 |
| `marks[1]` | text 数值标签 | 每根柱子上方显示具体营收数字 |

### render.cjs 核心流程

| 步骤 | 代码 | 说明 |
| --- | --- | --- |
| 加载 Vega | `require('../../docs/vega.js')` | UMD 挂到 `globalThis.vega`，不是 `module.exports` |
| 读 spec | `JSON.parse(fs.readFileSync(...))` | 同步读文件、同步解析 |
| 编译 | `vega.parse(spec)` | JSON → 运行时描述，与浏览器完全相同 |
| 创建 View | `new vega.View(runtime, {renderer:'none', loader})` | `renderer: 'none'` 不创建任何画布 |
| 导出 SVG | `await view.toSVG()` | 从场景图重新生成矢量 SVG，与当前渲染器无关 |
| 写文件 | `fs.writeFileSync(outPath, svg)` | 纯文本写入，UTF-8 |

### 关键点

| 概念 | 说明 |
| --- | --- |
| `renderer: 'none'` | 不创建 DOM/Canvas/WebGL，纯内存跑数据流 |
| `vega.loader({mode: 'file'})` | 让 `data[].url` 从文件系统读取（默认是浏览器 fetch） |
| `globalThis.vega` | 仓库根 `package.json` 是 `"type": "module"`，require UMD 走全局挂载 |
| `.cjs` 后缀 | 强制 Node 用 CommonJS 语义，避免 ESM 差异 |
| `view.toSVG()` | 无论渲染器是什么，都从场景图重新生成 SVG |

## 试一试（改练）

1. 把 `renderer: 'none'` 改成 `renderer: 'svg'`，Node 里会怎样？（提示：报错——没有 DOM）
2. 在 `render.cjs` 里把 `spec.data[0].values` 改成从外部 JSON 文件读取（`url` + `loader`）。
3. 给 `render.cjs` 加一个 `--width` 参数，运行时修改 spec 的 width 再 parse。
4. 用 `view.toCanvas()` 尝试导出 PNG（需要 `npm install canvas`，本集不依赖）。
5. 对比 `view.toSVG()` 和直接拼 SVG 字符串：Vega 导出的 SVG 包含哪些额外信息？
6. 把 `render.cjs` 改造成一个接受任意 spec 路径的 CLI 工具（`./render.cjs spec.vg.json -o out.svg`）。

## 参考

- 官方文档：[View API · toSVG](https://vega.github.io/vega/docs/api/view/#view_toSVG) ·
  [Renderers](https://vega.github.io/vega/docs/api/renderers/)
- 本 demo 的 Node 脚本：[render.cjs](./render.cjs)
- AGENTS.md 中的 "Node 脚本注意事项"
