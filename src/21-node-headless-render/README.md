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
5. **导出后读一遍 SVG 里的 `<text>`**，缺了该有的文字就 `exit 1`

### 为什么图本身也得是真的

"在 CI 里出图"这个论点只有配上**一份会变的真数据**才立得住。本 demo 画的是
`../../assets/data/global-temp.csv`：**NASA GISTEMP 全球年均气温距平**（相对
1951–1980 年均值），1880–2023 年共 144 行，`year` 和 `temp` 两列。

图上没有一个数字是写死的：

- 副标题里的 `1880–2023 年，共 144 个年份` 来自 `extent(pluck(data('temps'),'year'))` 与 `length(...)`；
- 标注里的 `最暖 2023 年 +1.17 °C` 来自 `aggregate` 的 `argmax`；
- 底轴的 8 个刻度来自 `sequence(起, 止 + 1, 20)`。

换句话说，把 CSV 换成明年的版本、重跑一次 `render.cjs`，标题、标注、刻度会**一起**跟着走。
这才是"把出图放进构建"的价值所在——而不是把一张手绘的图片提交进仓库。

> 数据取自 NASA Goddard Institute for Space Studies 的 GISTEMP v4 年度序列
>（与 Vega 官方示例库同源），单位 °C，正值表示比 1951–1980 基准更暖。

## 运行

```sh
# 先启动静态服务器（浏览器预览用）
../../serve.sh
# 浏览器打开 http://localhost:8000/src/21-node-headless-render/

# Node 无头渲染（主角）
node src/21-node-headless-render/render.cjs
# 输出 → src/21-node-headless-render/output.svg

# 也能渲染本集里任意一份 spec（含用 url 读外部数据的）
node src/21-node-headless-render/render.cjs src/02-line-area-timeseries/spec.vg.json
node src/21-node-headless-render/render.cjs src/16-geo-choropleth/spec.vg.json

# 给任意 spec 加内容断言（可重复；命中不了就 exit 1）
node src/21-node-headless-render/render.cjs src/16-geo-choropleth/spec.vg.json \
  --expect '失业率' --expect '2009'
```

spec 里的相对 `url` 会按**该 spec 文件所在目录**改写成绝对路径，所以从仓库任何位置调都能读到
`assets/data/`。数据读不到时脚本**不写文件、退出码 1**——不会像早先那样安静地吐出一张空图。

> **`output.svg` 不进版本库。** `.gitignore` 第 2 行显式忽略了
> `src/21-node-headless-render/output.svg`：它是脚本的产物，不是仓库的契约，
> 每次跑 `render.cjs` 都会被覆盖。想要能提交的图请走
> `node tools/export.cjs 21`（写到同样被忽略的 `out/`）或首页缩略图
> `node tools/thumbs.cjs 21`（`thumbs/21-node-headless-render.png`，**这个才随仓库提交**）。

## spec 逐段讲解

本 spec 从 **CSV 外部文件**读数据，正好把无头环境下最容易踩的两件事（显式 `format`、
band 轴的刻度稀释）一次演完。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `title.subtitle` | 副标题 | 写成 `{"signal": ...}`，年份区间与行数都从数据现算 |
| `signals[0]` | `tickYears` | `sequence(min, max + 1, 20)`；`sequence` **右开**，不 +1 就取不到末点 |
| `data[0]` | `temps` | `"format": {"type": "csv", "parse": {...}}` —— **不写就整表报废**（见坑三） |
| `data[1]` | `smooth` | `window` 的 `frame: [-4, 0]` 做 5 年滑动均值；前 4 行窗口不完整，用 `row_number` 判掉 |
| `data[2]` | `warmest` | `aggregate` 的 `argmax` 返回**整行对象**，两个 `formula` 摊平成标量 |
| `scales[0]` | band（x 轴） | 144 个年份一根一带；`padding: 0.1` |
| `scales[1]` | linear（y 轴） | `zero: true` 让 0 线（1951–1980 基准）落在轴上；`nice: true` → domain `[-0.6, 1.2]` |
| `axes[0]` | 底部 x 轴 | **`values: {"signal": "tickYears"}`** 显式给刻度；`labelAngle: -30` 必须配 `labelAlign`/`labelBaseline`（坑二） |
| `axes[1]` | 左侧 y 轴 | `"format": ".1f"`，否则默认格式会吐 `-0.6000000000000001` 一类 |
| `marks[0]` | rect 柱子 | `update.fill` 按 `datum.temp >= 0` 分正负异色；`hover` 旁边配了非空 `update`（坑四） |
| `marks[1]` | rule 基线 | 无 `from`，只画一条；`x2: {"signal": "width"}` 横贯全宽 |
| `marks[2]` | line 滑动均值 | `defined` 通道跳过前 4 个 `null`，而不是把它们当 0 拉到基线 |
| `marks[3]` | text 标注 | `from` 指向只有 1 行的 `warmest`，所以只画一段文字 |

### render.cjs 核心流程

| 步骤 | 代码 | 说明 |
| --- | --- | --- |
| 加载 Vega | `require('../../assets/vega-bundle.cjs')` | 取 `module.exports`；**不要**去找 `globalThis.vega`（那是 `undefined`） |
| 关掉 canvas 测字 | `vega.textMetrics.canvas(false)` | 固定用估算公式量字宽，输出可复现 |
| 读 spec | `JSON.parse(fs.readFileSync(...))` | 同步读文件、同步解析 |
| 相对 url 绝对化 | `d.url = path.resolve(path.dirname(specPath), d.url)` | 让 `../../assets/data/...` 相对 spec 而不是相对 cwd |
| 编译 | `vega.parse(spec)` | JSON → 运行时描述，与浏览器完全相同 |
| 造 loader | `loader.fileAccess = true; loader.file = fs.promises.readFile` | **必需**，否则读不到任何文件（见坑一） |
| 创建 View | `new vega.View(runtime, {renderer:'none', loader})` | `renderer: 'none'` 不创建任何画布 |
| 收日志 | `view.logger(collectingLogger)` | 把 Vega 的 WARN/ERROR 收进数组待检 |
| 跑数据流 | `await view.runAsync()` | 跑完后检查日志；有致命项就 `exit 1`，不写文件 |
| 导出 SVG | `await view.toSVG()` | 从场景图重新生成矢量 SVG，与当前渲染器无关 |
| **内容断言** | 正则抠出全部 `<text>` 再逐条比对 | 缺一条就打印全部文字并 `exit 1`，**不写文件**（见下） |
| 写文件 | `fs.writeFileSync(outPath, svg)` | 纯文本写入，UTF-8 |

### 内容闸门：把"读一遍 SVG 里的文字"变成机器检查

`AGENTS.md` 里有一条人肉纪律：「改完用 `node tools/inspect.cjs <slug>` 逐条读一遍
SVG 里的文字再说自己做完了」。人肉纪律迟早会被跳过，所以 `render.cjs` 把它写死了：

```js
const EXPECT_TEXTS = [
  { label: '最暖年标注', text: '最暖 2023 年 +1.17 °C' },
  { label: 'x 轴标题',   text: '年份' },
  { label: 'y 轴标题',   text: '距平（°C）' }
];
```

导出的 SVG 里抠不出这三段文字，脚本就**不写文件、退出码 1**，并把实际拿到的全部文字
逐行打出来供比对。这三条各自封住一类**日志一片安静的失败**：

| 断言 | 它挡住的失败 | 为什么日志里看不见 |
| --- | --- | --- |
| 最暖年标注 | `warmest` 数据集算空了（`argmax` 的 `as` 写错、`formula` 引错字段） | `from.data` 指向空数据集只是画 0 个图元，不是错误 |
| 两个轴标题 | 轴引用的 scale 名拼错、`values` 落在 domain 之外导致标签全灭 | Vega 对拼错的 scale 名**不报错也不 WARN**，只返回 `undefined` |

默认的三条只在渲染**本 demo 自己的 spec** 时生效；渲染别的 spec 时用
`--expect '某段文字'` 自带断言（可重复）。两条路径都验证过会真的 `exit 1`：

```sh
# 断言命中不了 → exit 1，且不写 output.svg
node src/21-node-headless-render/render.cjs src/16-geo-choropleth/spec.vg.json \
  --expect '最暖 2023 年 +1.17 °C'
```

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

本 demo 的 spec 用 `url` 读 CSV 正是为了**真的把这条路走一遍**：换成 inline `values`
的话，注入式 loader 写不写都一样，坑一就退化成一段没人验证的说明文字。

#### 坑二：`labelAngle` 不会自动带上对齐方式

这是 Vega 与 Vega-Lite 的一个真实差异：**Vega-Lite 会替你从 `labelAngle` 推导
`labelAlign` / `labelBaseline`，Vega 不会。** 只写 `labelAngle: -30` 的话标签仍是
`align: "center"` / `baseline: "top"`，也就是绕自己的**中心**旋转——包围盒相对刻度左右不对称，
旋转后抬起来的那一头会伸进绘图区。本 demo 实测（取首个标签 `1880`，坐标相对底轴分组）：

| x 轴写法 | 锚点 | 包围盒 | 结论 |
| --- | --- | --- | --- |
| 只有 `labelAngle: -30` | x=2.18，align=center | `x −12.98…22.83`，`y −1.75…25.28` | 包围盒中心 4.93 比刻度右偏 2.75px；`y1 = −1.75` 说明尾端抬到**轴线上方**，扎进柱子里 |
| 加 `labelAlign: "right"` + `labelBaseline: "top"` | x=2.18，align=right | `x −28.14…7.68`，`y 7.00…34.03` | 文字右上角钉在刻度上、整串向左下方垂下；`y1 = 7` 全在轴线下方 |

复现命令：把 `spec.vg.json` 里 `axes[0]` 的两行对齐删掉，再跑 `node tools/inspect.cjs 21`。
正确写法是：

```json
{"orient": "bottom", "scale": "x", "labelAngle": -30,
 "labelAlign": "right", "labelBaseline": "top"}
```

（负角度 = 逆时针，文字向右上翘，锚点要落在文字**右端**；正角度反过来用 `labelAlign: "left"`。）

#### 坑三：CSV 必须显式写 `format.type`，且 `labelOverlap` 在 Node 下指望不上

两件事都只有在无头环境里才咬人：

1. **Vega 不按扩展名推断格式。** `global-temp.csv` 少写 `"format": {"type": "csv"}`
   就会被当成 JSON 解析。实测（`node tools/validate.cjs 21`）：144 行塌成 **1 行**、
   `WARN Data ingestion failed … is not valid JSON` + `WARN Infinite extent for field "temp"`、
   y 轴 domain 变成 `[null, null]`，整张图只剩 5 段文字。这条至少还有 WARN 兜着。
   **`parse` 漏了才是真正安静的那种**：只删 `"parse"` 保留 `"type": "csv"`，
   144 行照样读进来、y 轴 domain 照样是 `[-0.6, 1.2]`、**一条 WARN 都没有**，
   但 `year` 是字符串，`extent(...)[1] + 1` 于是变成字符串拼接，
   `tickYears` 落在 domain 之外——**底轴 8 个年份标签全部消失**（文字段数 23 → 15）。
   校验器抓不到它，`render.cjs` 的内容闸门也只盯着轴标题和标注，这类只能靠
   `node tools/inspect.cjs 21 --texts` 数出来。
2. **`labelOverlap` 在 Node 下不会帮你稀释标签。** 144 个年份挤在 760px 上，
   浏览器里 `labelOverlap: "parity"` 能靠真实字宽逐个抽掉重叠的；纯 Node 下字宽是
   **估算**的（下一节），实测 144 个标签**一个都没被抽掉**。
   所以无头要出的图，**密集 band 轴必须显式给 `values`**：

   ```json
   {"name": "tickYears",
    "update": "sequence(extent(pluck(data('temps'),'year'))[0], extent(pluck(data('temps'),'year'))[1] + 1, 20)"}
   ```

#### 坑四：数据派生出来的标量必须走数据集

副标题想写"最暖的一年是 ××××"，最顺手的写法是
`max(pluck(data('temps'), 'temp'))`——**它求值为 `NaN`**，副标题渲染成"最暖 NaN 年"，
Vega **一条日志都不打**，`tools/validate.cjs` 也照样 PASS（它的浮点检查只匹配
`/^-?\d+\.\d{6,}$/`）。可用的只有两条路：

- `aggregate` + `argmax` 落成一个数据集再读（本例的 `warmest`）；
- 或者 `extent(pluck(data('temps'), 'year'))[1]`（本例副标题用的就是它）。

`render.cjs` 的内容闸门正是为这类"安静地写出错字"设的第二道防线。

#### 坑五：Node 下的字宽是估算的，CJK 被显著低估

`vega.textMetrics.canvas(false)` 之后，Vega 量字宽用的是
**`~~(0.8 × 字符数 × 字号)`** 这条估算公式
（`assets/vega.js` 第 17296 行的 `_estimateWidth`，一行到底，不区分字符）。
它是按拉丁字母标定的：一个汉字实际占**约 1.0 个字号**的宽度，公式只给 0.8，
低估约 20%。于是：

- `距平（°C）` 这样的轴标题、`最暖 2023 年 +1.17 °C` 这样的标注，
  在无头导出的 SVG 里实际比 Vega 以为的更宽；
- `autosize: "fit"` 按低估的宽度留白，中文标注就可能贴边甚至越界。

本 demo 的对策有两处：标注用 `align: "right"` 让它向**图内**方向展开（最暖年是 2023，
在最右侧，向左展开才不会出界），以及给右侧留出富余。
校验器的布局溢出阈值是 300px，遮不住这种十几像素的越界——**要靠
`node tools/validate-browser.cjs 21` 在真实 Chromium 里用真实字宽再看一遍。**

## 试一试（改练）

1. 把 `renderer: 'none'` 改成 `renderer: 'svg'`，Node 里会怎样？**实测不报错**——
   没调 `view.initialize(el)` 就没有容器，Vega 根本不会去实例化渲染器，`renderer` 选项形同空转，
   `toSVG()` 照样出图。真正需要 DOM 的是 `view.initialize(el)`：在 Node 里传个普通对象会抛
   `el.setAttribute is not a function`。所以"无头"的关键不是 `renderer: 'none'`，而是**不 initialize**；
   写 `'none'` 只是把意图说清楚。
2. 把 `render.cjs` 里 `loader.fileAccess = true` 那两行注释掉再跑一次——
   看它怎么"成功"地画出一张只剩空轴的图（这次连内容闸门也会跟着报警，
   因为标注文字随数据一起消失了），再看修好后的版本。这是本 demo 最值钱的一课。
3. 把 `data[0].format` 整段删掉，跑 `node tools/validate.cjs 21`：
   144 行塌成 1 行、`Data ingestion failed` + `Infinite extent` 两条 WARN 冒出来、校验器 FAIL。
   再只删 `parse` 保留 `type`，跑 `node tools/inspect.cjs 21 --texts`：
   这次**一条 WARN 都没有、校验器照样 PASS**，但文字从 23 段掉到 15 段——
   底轴的 8 个年份标签悄悄没了。数一数，这是坑三下半段的实证。
4. 把 `tickYears` 的步长 20 改成 5（29 个刻度）、再改成 1（144 个刻度），
   每次跑 `node tools/inspect.cjs 21 --texts` 数一数文字段数。
   然后把 `values` 整条删掉、换成 `"labelOverlap": "parity"`——数出来仍是 144 段，
   这就是坑三的实证。
5. 把 `smooth` 的 `frame` 从 `[-4, 0]` 改成 `[-4, 4]`（居中窗口），
   再把 `formula` 里的 `datum.idx >= 5` 相应改成掐掉首尾各 4 行，
   观察曲线两端的变化；把 `defined` 通道删掉，看 `null` 是怎样被当成 0 拉到基线上的。
6. 把 `EXPECT_TEXTS` 里的 `'最暖 2023 年 +1.17 °C'` 改成 `'最暖 2016 年'`（旧数据的答案），
   跑 `node render.cjs` 看闸门怎么报错并打印实际文字。**这一步一定要做一遍**，
   否则你无法确认这道闸门真的在工作。
7. 给 `render.cjs` 加一个 `--width` 参数，运行时修改 spec 的 width 再 parse；
   看 760 → 1600 时底轴刻度会不会变（不会——`values` 是显式给的，这既是优点也是代价）。
8. 用 `view.toCanvas()` 尝试导出 PNG：纯 Node 会 reject
   `CanvasRenderer is missing a valid canvas or context`（本集不引 `npm install canvas`，
   要 PNG 走 `tools/export.cjs` + 真实 Chromium）。
9. 把 `render.cjs` 改造成一个接受 `-o out.svg` 的完整 CLI 工具，
   再把内容闸门做成可以从 JSON 配置里读期望文字——这样它就能当整个仓库的出图冒烟测试用。

## 参考

- 官方文档：[View API · toSVG](https://vega.github.io/vega/docs/api/view/#view_toSVG) ·
  [Renderers](https://vega.github.io/vega/docs/api/renderers/) ·
  [Axes · labelAlign / labelBaseline](https://vega.github.io/vega/docs/axes/) ·
  [Data · format](https://vega.github.io/vega/docs/data/) ·
  [window 变换](https://vega.github.io/vega/docs/transforms/window/)
- 本 demo 的 Node 脚本：[render.cjs](./render.cjs)
- 同样用注入式 loader 的现成实现：`tools/validate.cjs` 的 `nodeLoader()` / `collectingLogger()`
- 数据出处：NASA GISS *GISTEMP v4* 全球年均气温距平（`assets/data/global-temp.csv`）
- AGENTS.md 中的 "Node 脚本注意事项" 与 "数据格式化的几个真实坑"
