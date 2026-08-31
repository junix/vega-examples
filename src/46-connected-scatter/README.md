# 46 · 连接散点图：油价 vs 人均驾驶里程（官方示例精读）

对应官方示例：<https://vega.github.io/vega/examples/connected-scatter-plot/>
（原型是 NYT 2010 年那张 *Driving Shifts Into Lower Gear*：横轴人均年驾驶里程、纵轴通胀调整后的油价，
55 个年份按时间顺序连成一条在平面上游走的轨迹。）

数据 `../../assets/data/driving.json`，55 行，四个字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `year` | number | 年份 1956–2010，**只用来决定连线顺序和标签文字**，不占任何位置通道 |
| `miles` | number | 人均年驾驶里程（英里），3675 → 10067 |
| `gas` | number | 每加仑汽油价格（已按通胀调整），1.39 → 3.31 |
| `side` | string | `left` / `right` / `top` / `bottom` —— **人工标注**：这个点的年份标签该摆在哪一侧 |

## 学习目标

1. 连接散点图怎么搭：**两个数值维度吃掉 x/y，时间维度只体现在「连线顺序」+「点上的年份标签」**。
   这类图的信息量在于轨迹的形状（哪年折返、哪段并行、哪段突然拐弯），而不是单个点的位置。
2. 本例真正的核心技巧：**用 4 个 `ordinal` 比例尺把 `side` 字段当查找表**，
   一个字段一次翻译出年份标签的 `align` / `baseline` / `dx` / `dy`，替掉一堆 `if/else` 表达式。
3. 手工方位标注（`side`）和自动避让（demo 18 的 `label` 变换 / voronoi）是两条不同的路，各自的代价。
4. `line` mark 的连点顺序 = **上游数据顺序**，所以 `collect` 排序是正确性问题，不是美观问题。
5. 线性比例尺默认把 0 并入 domain，画「年份/价格/里程」这种不从 0 起的量必须 `"zero": false`。
6. `enter` 与 `update` 编码集的**求值时机**差别：加了交互以后，位置属性写在 `enter` 里会钉死不动。
7. data 驱动的 domain 在「过滤到 0 行 / 只剩 1 行」时会退化，怎么用一个 `span(...) > 0` 判据兜住。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width` / `height` / `padding` | 画布 800×500，`padding: 5` | 与官方一致。`autosize` 默认 `pad`，标题与四条轴的装饰会自动把画布撑大，不必手算 padding |
| `config.axis` | 全局轴样式：`domain: false`、`tickSize: 0`、标签 12px 加粗 | 官方原样保留。去掉轴线和刻度线、只留网格 —— NYT 风格的「无框」坐标系 |
| `title` | 主标题 + `subtitle` 用 signal 拼当前窗口与标注数 | `title.subtitle` 支持 `{"signal": ...}`，是把「从数据算出来的统计量」放进图里的最省事位置 |
| `signals`（前 4 个） | `yearFrom` / `yearTo`（range）、`labelEvery`（select）、`curve`（select） | 四个带 `bind` 的输入控件。官方 spec **一个 signal 都没有**，这四个是本仓库加的教学旋钮 |
| `signals`（后 4 个） | `milesExt` / `gasExt` / `xDomain` / `yDomain` | 只有 `update`、没有 `bind` 的**派生 signal**，专门给 domain 兜底（见下「空态兜底」） |
| `data.drive` | 读 json，`collect` 按 `year` 升序 | 排序是**正确性**：`line` mark 照数据顺序连点，顺序错了就是一团乱麻 |
| `data.trail` | `filter` 出年份窗口内的点 | 轨迹和圆点都从它来；两根轴的 domain 也跟着它，所以窗口一收紧，轴自动重新标定 |
| `data.labels` | 再 `filter` 一层，控制标签密度 | `(datum.year - yearFrom) % labelEvery === 0 || datum.year === yearTo`：取模基准是窗口起点，末点单独放行 |
| `scales.x` / `scales.y` | 两个 `linear`，`zero: false`、`nice: true`、`round: true` | domain 取 `{"signal": "xDomain"}`。`nice` 把 [3675, 10067] 收成 [3500, 10500]、[1.39, 3.31] 收成 [1.2, 3.4] |
| `scales.align` / `base` / `dx` / `dy` | 4 个 `ordinal`，domain 全是 `["left","right","top","bottom"]` | **本例的核心**：把 `side` 当查找键，range 数组就是查找表的值列 |
| `axes`（4 条） | 上：x 刻度 + 网格；下：只放 x 轴标题；左：y 刻度 + 网格；右：只放 y 轴标题 | 「一条轴出刻度、对面那条轴只出标题」是官方这张图的排版手法（`ticks: false, labels: false`） |
| `marks.trajectory` | `line`，`interpolate` 由 `curve` signal 驱动 | 一个 `line` mark 永远只产生**一条** path。`stroke` 3px 黑线 |
| `marks.dots` | `symbol`，白心黑边，`size: 49` | `size` 是**外接正方形的面积**：视觉半径 = `sqrt(49) / 2 = 3.5px` |
| `marks.yearLabels` | `text`，从 `labels` 数据集来 | `align`/`baseline`/`dx`/`dy` 四个通道全部走 `{"scale": ..., "field": "side"}` |
| `marks.emptyHint` | 纯 signal 驱动的一行提示文字 | 窗口为空时才有文字；非空时 `text` 求值为 `''`，留一个不含文字的 `<text>`，画面上看不见 |

### 关键概念

**1. `side` 不是数据，是排版指令；`ordinal` 比例尺是查找表**

`driving.json` 里的 `side` 记的是「这个点周围哪一侧是空的」——数据集作者一个点一个点看过图之后手写的。
把它变成排版，官方的做法是四张单列查找表：

| 比例尺 | `left` | `right` | `top` | `bottom` |
| --- | --- | --- | --- | --- |
| `align`（水平锚点） | `right` | `left` | `center` | `center` |
| `base`（垂直锚点） | `middle` | `middle` | `bottom` | `top` |
| `dx`（像素微调） | `-7` | `6` | `0` | `0` |
| `dy`（像素微调） | `1` | `1` | `-5` | `6` |

读法：`side: "left"` = 标签放在点的左边 → 文字要**右对齐**（`align: right`）才会朝点靠拢，
再向左推 7px 让开圆点（`dx: -7`），垂直居中（`baseline: middle`，`dy: 1` 补偿字体基线的视觉偏移）。
`top` 反过来：水平居中、基线贴底（`baseline: bottom`）、向上抬 5px。

**为什么用 scale 而不是表达式？** `{"signal": "datum.side === 'left' ? 'right' : datum.side === 'right' ? 'left' : 'center'"}`
也能跑，但四个通道就要写四串三元表达式；改一个偏移量得在字符串里找。
换成 `ordinal` scale 之后，「查找表」变成了 spec 里可以单独读、单独改的数据结构，
而且 `domain`/`range` 的错位（少一项、拼错一个方位）在一眼之内能看出来。
这是 Vega 的一个通用套路：**只要是「离散取值 → 某个视觉属性」的映射，就交给 `ordinal` scale**，
哪怕这个属性不是颜色、不是尺寸，而是 `align` 这种排版枚举，甚至是像素偏移量。

**和 demo 18 的对比**：demo 18（voronoi-labels）用的是 `label` 变换 —— 引擎把已有 mark 栅格化成位图，
自动挑不重叠的位置。那条路的代价是：需要真实 canvas（本仓库的纯 Node 校验器跑不了，
所以新 demo 禁用 `label`/`wordcloud`），结果不可解释，而且它不懂语义（不知道「1974 这个点很重要，
标签一定要看得见」）。`side` 这条路正相反：完全可控、零依赖、可复现，但**数据一变就得重新人工标注**，
55 行还行，5500 行就不可能。选哪条路取决于点数和「标签重不重要」。

顺带一个诚实的观察：**手工标注也没有真的解决重叠**。按官方的 800×500 渲染出来，
1958–1967 那段轨迹几乎是横着走的，十来个年份标签挤在同一条水平带上。
拿真实浏览器的文字度量把 55 个标签的包围盒两两求交，默认视图下有三对相撞：

| 相撞的两个标签 | 重叠 (px) | 肉眼可见程度 |
| --- | --- | --- |
| `1963` / `1964` | 7.5 × 9.0 | 明显压字，`3` 和 `1` 叠在一起 |
| `1964` / `1965` | 4.5 × 4.0 | 擦边，字形几乎贴住 |
| `1957` / `1959` | 20.7 × 1.0 | 只差一行，视觉上还能读 |

（官方示例页上就是这样。注意纯 Node 校验器里数出来会更多 —— 那边的文字宽度是
`0.8 × 字数 × 字号` 的估算，把浏览器里 24.5px 宽的 `1963` 估成 35.2px，
于是多报 `1965`/`1967`、`1975`/`1976`、`1994`/`1995` 等几对。量重叠这种事只能信真实浏览器。）
`side` 能保证「标签不压在自己的圆点上」，但保证不了「标签之间不打架」——
后者要么靠自动避让算法，要么就只标一部分年份（本 demo 的 `labelEvery` 旋钮，
调到 5 就只剩 12 个标签、实测零重叠）。

**2. 只有 `update` 会在 scale 变化时重算**

官方 spec 把 `x`/`y` 全写在 `enter` 里 —— 没问题，因为官方那张图是静态的。
本 demo 加了年份窗口，两根轴的 domain 会变，这时 `enter` 就不够了：
Vega 的 `Encode` 算子只对**新建的 item** 跑 `enter`，之后除了 `width`/`height` 信号变化会触发
`view.run('enter')`，其它任何 mod/reflow 都只跑 `update`（`assets/vega.js` 里 `reenter` 那段逻辑）。

实测（同一个 spec，只把 `dots` 的 `x`/`y` 在 `enter`/`update` 之间搬家，拖窗口到 1990–2010）：

| 写法 | 2010 那个点的屏幕 x |
| --- | --- |
| 位置写在 `update` | 697 → **532**（正确：domain 变成 [8400, 10200]） |
| 位置写在 `enter` | 697 → **697**（钉在原地，轴已经重标定了，点没跟上） |

结论：**静态图 `enter` 够用；一旦 scale 会变，位置属性必须放 `update`。**
`stroke` / `fill` / `strokeWidth` 这类常量留在 `enter`（只算一次，省一点求值）。

**3. `collect` 是正确性，不是美观**

`line` mark 没有 series/detail 通道，一个 mark 只出一条 path，**点的连接顺序就是上游数据的行顺序**。
`driving.json` 本来已经按 `year` 升序，但 spec 里显式 `{"type": "collect", "sort": {"field": "year"}}`
才算把这个前提写进声明：以后换个数据源、上游插了一个 `lookup`/`aggregate`，顺序不再自然成立时，
图不会悄悄变成一团乱麻。（同 demo 30 平行坐标的教训。）
`filter` 变换是保序的，所以 `trail` / `labels` 继承 `drive` 的顺序，不需要再排一次。

**4. `zero: false` 与 `nice`**

`miles` 在 3675–10067、`gas` 在 1.39–3.31。linear/pow/sqrt 比例尺**默认把 0 并入 domain**，
不写 `zero: false` 的话 x 变成 [0, 11000]、y 变成 [0, 3.5]，整条轨迹被挤到画布右上角一小块。
柱状图必须从 0 起，而这种「两个都不含 0 的连续量」必须显式关掉。
`nice: true` 把端点扩到整齐刻度（[3500, 10500] / [1.2, 3.4]），`round: true` 让 range 端点取整像素。

**5. 「对面那条轴只放标题」**

Vega 的轴标题绑在轴上，位置只能在该轴那一侧。官方要的效果是：刻度贴着图的上边和左边（离数据近），
而轴标题放在下边和右边（远离数据、当图注读）。做法是**声明两条共用同一个 scale 的轴**：

```json
{"orient": "top",    "scale": "x", "tickCount": 5, "grid": true, "format": ",d"},
{"orient": "bottom", "scale": "x", "title": "每年人均驾驶里程（英里）", "ticks": false, "labels": false}
```

第二条轴没有刻度、没有标签，纯粹是一个「标题挂架」。同一个 scale 声明多条轴是完全合法的，
`grid` 也只在带刻度那条上打开（网格线用的是所属轴的 scale，别把 `grid` 挂到空轴上）。

**6. 格式化的三处细节**

- 上轴 `"format": ",d"` → `4,000`。d3 的默认 tick 格式是 `,f`（**自带千分位**），
  对里程正好合适，但同样的默认套到年份上就会出现 `1,956` —— 所以年份要么 `"format": "d"`，
  要么像本例的标签那样自己 `format(datum.year, 'd')`。
- 左轴 `"format": "$0.2f"` → `$1.50`。d3-format 的语法是
  `[[fill]align][sign][symbol][0][width][,][.precision][~][type]`，
  `$` 落在 **symbol** 位（货币符号），后面的 `0` 是零填充标志，`.2f` 才是两位小数。
- 年份标签写 `{"signal": "format(datum.year, 'd')"}` 而不是 `{"field": "year"}`：
  本仓库的规矩是数字一律显式格式化，免得哪天 `config.numberFormat` 一改就冒出 `1,956`。

显式格式化也有代价，而且本 demo 正好能看到：**写死的规格串不会跟着 domain 自适应精度，
d3 的默认 tickFormat 会。** 把窗口收成相邻两年（比如 1956–1957，`gas` 只差 0.02），
y 轴 domain 变成 `[2.38, 2.40]`、`tickCount: 5` 给出 0.005 的步长，
而 `$0.2f` 只有两位小数，于是五个刻度标签重复了：

```
$2.38  $2.38  $2.39  $2.40  $2.40
```

官方那张静态图永远不会遇到（domain 永远是全量的 1.39–3.31），是本 demo 加了年份窗口才暴露出来的。
这里**故意保留官方的 `$0.2f`** 不改：删掉左轴的 `format` 确实能让标签自适应成
`2.380 / 2.385 / 2.390 …`，但全量视图下的货币符号也跟着没了（变成 `1.5 / 2.0 / 2.5`），
而本仓库要求数字显式格式化。两头都要的写法是把 `format` 本身也做成信号
（`span(yDomain) < 0.1 ? '$0.3f' : '$0.2f'`，`axis.format` 支持 `{"signal": ...}`）—— 那是练习 6 的内容。

**7. 空态与零跨度兜底**

`xDomain` / `yDomain` 是只有 `update` 的派生 signal：

```json
{"name": "milesExt", "update": "extent(pluck(data('trail'), 'miles'))"},
{"name": "xDomain",  "update": "span(milesExt) > 0 ? milesExt : (length(data('trail')) ? [milesExt[0] - 500, milesExt[1] + 500] : [3500, 10500])"}
```

两种退化用一个判据挡掉：

| 状态 | `extent` | `span` | 不兜底会怎样 | 兜底后 |
| --- | --- | --- | --- | --- |
| 窗口内 0 行（起始年份 > 结束年份） | `[null, null]`（实际是 `[undefined, undefined]`，signal 面板按 JSON 显示成 `null`） | 0 | domain 变 `[NaN, NaN]`，两根轴的刻度全部消失 | 退回全量范围 `[3500, 10500]` / `[1.2, 3.5]`，另加一行提示文字 |
| 窗口内 1 行（起=止 2010） | `[9596, 9596]` | 0 | 零跨度：**一条 WARN 都不报**，轴上只剩一个孤零零的刻度（本例写了 `format` 所以是 `9,596`；不写 `format` 时 d3 的默认精度会失控成 `9,596.000000`） | 在该值两侧各留 500 英里 / 0.25 美元，domain 退到 `[9000, 10100]` / `[2.35, 2.90]` |

`Infinite extent` 那两条 WARN 只在 **domain 写成官方的 `{"data": "trail", "field": "miles"}`** 时才报
（`extent` 变换发的，`assets/vega.js:8659`）：

```
WARN Infinite extent for field "miles": [Infinity, -Infinity]
WARN Infinite extent for field "gas": [Infinity, -Infinity]
```

如果只是把 `xDomain` 的 `update` 改成裸的 `milesExt`，走的是表达式函数 `extent()`，
**连 WARN 都不会有** —— domain 静悄悄地变成 `[NaN, NaN]`。这也是本仓库坚持自己兜底的理由：
不能指望引擎替你报警。

零跨度这种「不报错但图坏了」的情况，是 `tools/validate.cjs` 专门加了断言的一类 bug。
提示文字用的是 **signal 驱动 `text` 通道**的写法，而不是新建一个默认为空的数据集 ——
后者会被校验器按「数据集行数为 0」判失败。

## 试一试

1. **看样条的谎言**：把「插值方式」从 `cardinal` 换成 `linear`。1974 和 1979 两次石油危机造成的急折返处，
   `cardinal` 为了平滑会向外过冲，画出一段数据里并不存在的路径。官方选 cardinal 是审美取舍，
   要读数就得用 `linear`。（顺手试 `basis`：它连点都不穿过。）
2. **触发两种 domain 退化**：把「起始年份」拖到 2010、「结束年份」拖到 1956 → 0 行，看提示文字与兜底 domain；
   再把两个都拖到 2010 → 1 行，x 轴 domain 退到 `[9000, 10100]`、刻度是 `9,000 … 10,000` 六个，
   而不是一个孤零零的 `9,596`。然后把 `xDomain` 的 `update` 改成裸的 `milesExt`，
   重刷页面重复这两步 —— 会看到 0 行时刻度全没了却**一条 WARN 都不报**。
3. **拆掉 `zero: false`**：删掉 `scales.x` 和 `scales.y` 里的 `"zero": false`，
   整条轨迹会被压到右上角一小块 —— 这就是「线性轴默认并入 0」的杀伤力。
4. **拆掉查找表**：把 `dx` / `dy` 两个 scale 的 `range` 全改成 `[0, 0, 0, 0]`，
   只剩 `align`/`baseline` 时标签会压在圆点上 —— 说明像素微调那两张表干的是「让开 3.5px 半径的圆点」这件事；
   再把 `align` scale 的 range 改成 `["left","left","left","left"]`，看标签怎么倒向一边、开始互相重叠。
5. **复现 `enter` 陷阱**：把 `marks.dots` 里的 `x`/`y` 从 `update` 剪到 `enter`（= 官方原写法），
   然后拖年份窗口：轴重新标定了，圆点却不动。这是加交互时最容易踩的一脚。
6. **让 `format` 跟着 domain 走**：把窗口收成 1956–1957，y 轴会出现
   `$2.38 $2.38 $2.39 $2.40 $2.40` 这样的重复刻度（写死的两位小数撑不住 0.005 的步长）。
   把左轴的 `"format": "$0.2f"` 改成
   `{"signal": "span(yDomain) < 0.1 ? '$0.3f' : '$0.2f'"}`（`axis.format` 支持信号），
   重复就没了；再把窗口拖回全量，确认它自动退回两位小数。

## 参考

- 官方示例原文：<https://vega.github.io/vega/examples/connected-scatter-plot/>
- `line` mark（含 `interpolate` 可取值）：<https://vega.github.io/vega/docs/marks/line/>
- `symbol` mark（`size` 是面积）：<https://vega.github.io/vega/docs/marks/symbol/>
- `text` mark（`align` / `baseline` / `dx` / `dy`）：<https://vega.github.io/vega/docs/marks/text/>
- `ordinal` 比例尺：<https://vega.github.io/vega/docs/scales/#ordinal>
- 线性比例尺的 `zero` / `nice` / `round`：<https://vega.github.io/vega/docs/scales/#quantitative>
- 轴（`ticks` / `labels` / `grid` / `format`）：<https://vega.github.io/vega/docs/axes/>
- `collect` 变换：<https://vega.github.io/vega/docs/transforms/collect/>
- `filter` 变换：<https://vega.github.io/vega/docs/transforms/filter/>
- 表达式函数 `extent` / `span` / `pluck` / `format`：<https://vega.github.io/vega/docs/expressions/>
- d3-format 规格串：<https://github.com/d3/d3-format#locale_format>
- 原图（NYT, 2010）：*Driving Shifts Into Lower Gear*

## 与官方示例的差异

逐条列出对官方 spec 的改动及原因（前 3 条是本仓库铁律要求，后面是教学增补）：

1. **数据路径**：`"url": "data/driving.json"` → `"url": "../../assets/data/driving.json"`（本仓库自带数据集，零外部请求）。
2. **补 `description`**：顶层 `description` 换成一句中文说明；`data` / `signals` / `marks` 条目上加了中文
   `description` 注释键（这些位置合法）。**`scales` 上一个注释键都没加** ——
   scale 条目里的未知键会触发 `Unsupported scale property` WARN，本仓库校验器判失败。
3. **配套文件**：新增 `index.html`（`DEMO_META`）、`main.js`（一行 `renderDemo`）、本 README，
   官方页面只有裸 spec。
4. **加了顶层 `title`**：官方没有标题（网页上下文自带说明）。本仓库要求 spec 自带 `title`，
   副标题用 signal 拼出当前窗口与标注数量。
5. **加了 `collect` 排序**：官方直接依赖 `driving.json` 的文件顺序。文件确实是升序的，
   所以这一改**不改变默认渲染结果**，只是把「顺序必须按 year」这个前提显式写进 spec。
6. **加了 4 个交互 signal 与 2 个派生数据集**：`yearFrom` / `yearTo`（年份窗口）、
   `labelEvery`（标签密度）、`curve`（插值方式），以及 `trail`（窗口内的点）和 `labels`（要写字的点）。
   官方 spec **没有任何 signal，也没有按年份筛标签 —— 55 个年份全部标出来**。
   本 demo 的默认值 `labelEvery: 1` 就是官方那个「全标」状态，所以**默认视图与官方一致**。
7. **位置属性从 `enter` 挪到 `update`**：官方三个 mark 的 `x`/`y` 全在 `enter` 里。
   加了交互之后 scale 的 domain 会变，而 `enter` 只对新建 item 求值，老 item 不会重算
   （实测 2010 那个点会钉在 x=697 不动，见上文表格）。常量属性（`stroke`/`fill`/`strokeWidth`）仍留在 `enter`。
8. **scale domain 从 `{"data": ..., "field": ...}` 换成 `{"signal": "xDomain"}`**：
   官方 domain 取全量数据，永远不会空；本 demo 的窗口能过滤到 0 行或 1 行，
   必须按本仓库约定用只有 `update` 的派生 signal 兜底（`span(...) > 0 ? extent : 兜底`），
   否则 domain 退化成 `[NaN, NaN]` 或零跨度。
9. **加了 `emptyHint` 文字 mark**：官方没有空态。用 signal 驱动 `text`（非空时求值为 `''`），
   而不是新建一个默认为空的数据集 —— 后者会被校验器判失败。
10. **年份标签的 `text` 从 `{"field": "year"}` 换成 `{"signal": "format(datum.year, 'd')"}`**：
    渲染结果相同（`1956`），但本仓库要求数字显式格式化，避免受 `config.numberFormat` 影响出现 `1,956`。
11. **上轴补了 `"format": ",d"`**：官方不写，靠 d3 默认的 `,f`（结果也是 `4,000`）。显式写出来更保险。
12. **轴标题翻译成中文**：`"Miles driven per capita each year"` → 「每年人均驾驶里程（英里）」，
    `"Price of a gallon of gasoline (adjusted for inflation)"` → 「汽油价格（每加仑，已按通胀调整）」。
13. **年份标签显式写了 `"fontSize": 11`**：这正是 Vega 的 `text` mark 默认字号，渲染结果与官方一致，
    只是把默认值写出来方便读者调。
14. **两处纯书写改动，不影响渲染**：三个 mark 各加了 `"name"`（`trajectory` / `dots` / `yearLabels`，
    官方的 mark 都是匿名的），这样 README 和 `tools/inspect.cjs` 能按名字指认它们；
    颜色简写 `#000` / `#fff` 补齐成 `#000000` / `#ffffff`。

**没有改的地方**（官方原样保留）：`width` / `height` / `padding`、`config.axis` 的四项、
四个 `ordinal` 查找表的 domain/range、四条轴的 orient 组合与 `tickCount: 5`、
`interpolate: "cardinal"` 的默认值、线宽 3、`size: 49` 的白心黑边点、纯黑配色。
官方 spec 里**没有** `now()` / `Math.random()` 之类不可复现的调用，也**没有**覆盖 `width`/`height`/`padding`
之类内建 signal，所以这两类适配无需进行。

## 与 matplotlib 的对照

| 这张图的要素 | Vega 怎么表达 | matplotlib / seaborn 要付什么代价 |
| --- | --- | --- |
| 按时间顺序连点 | `line` mark + 上游 `collect` 排序 | `ax.plot(miles, gas, '-o')` —— 天然按数组顺序连线，**这块 matplotlib 更省事**（不需要声明排序，但也就没法把「必须按 year 排」写进声明里，靠调用者自觉） |
| 55 个年份标签的方位 | `side` 字段 + 4 个 `ordinal` scale → `align`/`baseline`/`dx`/`dy` | `for` 循环里逐点 `ax.annotate(year, (m, g), ha=..., va=..., xytext=(dx, dy), textcoords='offset points')`，`side → (ha, va, dx, dy)` 得自己写成 dict。**本质同构**（查找表 vs 查找表），区别只是命令式循环 vs 声明式通道 |
| 标签自动避让 | 内置 `label` 变换（本仓库因需要 canvas 位图而禁用；见 demo 18） | 无内置，要装第三方 `adjustText`（迭代物理弛豫），结果不可控也不可复现 |
| 只标部分年份 | 一层 `filter` 变换 + `labelEvery` signal | 循环里 `if year % 5: continue`，同样简单 |
| 「刻度在上/左，标题在下/右」 | 声明两条共用 scale 的轴，其中一条 `ticks: false, labels: false` | `ax.xaxis.set_ticks_position('top')` + `ax.set_xlabel(...)`（xlabel 默认就在下边）—— **matplotlib 更直接**，因为它的 label 和 ticks 本来就是可以分开摆的两个东西 |
| 平滑轨迹 | `"interpolate": "cardinal"` 一个键，还能用 signal 换 | 无内置样条插值：得 `scipy.interpolate.splprep/splev` 手算重采样点再 plot，且样条参数化方式要自己选 |
| 不并入 0 的坐标范围 | 必须显式 `"zero": false` | 默认就不并入 0，**matplotlib 更省事**（反过来画柱状图时才要 `ax.set_ylim(bottom=0)`） |
| 货币/千分位刻度 | `"format": "$0.2f"` / `",d"` | `matplotlib.ticker.StrMethodFormatter('${x:,.2f}')`，等价但要 import 一个类 |
| 年份窗口 / 标签密度 / 插值方式的交互 | 4 个 `signal` + `bind`，控件由运行时自动生成，改完整张图增量重算 | `matplotlib.widgets.Slider` / `ipywidgets` + 回调函数里手动 `clear()` 重画（或维护 `set_data`），并自己重算轴范围；Notebook 之外还得换 GUI 后端。**这块差距最大** |
| 单点数据的轴退化 | 必须自己兜底（本 demo 的 `xDomain` 派生 signal），否则 domain 零跨度、轴上只剩一个刻度 | **matplotlib 更省事**：实测 3.11.1，`ax.plot([9596], [2.61])` 的 `autoscale` 会把单点扩成 `xlim=(9068, 10124)`，刻度是 `9000 … 10200`，完全不用管（顺带一提，它扩出来的宽度和本 demo 手写的 ±500 几乎一样） |
| 空数据的轴退化 | 同上，`span(...) > 0` 一个判据兜住两种退化，另加 signal 驱动的提示文字 | 两边都得手写：matplotlib 对空数据给的是 `xlim=(-0.055, 0.055)`（围着 0 的一个无意义区间），也不报警 |
| 导出 | 场景图重画，`toSVG()` / `toCanvas()`，本仓库工具栏一键出透明 PNG | `savefig('x.svg')` / `savefig('x.png', transparent=True)`，**matplotlib 同样一行**，而且不需要浏览器 |

诚实的结论：**要的只是一张静态 PNG 且不介意写循环，matplotlib 更快** ——
20 行 Python 就能出这张图，字体、DPI、导出都是熟路。
Vega 的价值在另外三件事上：
（a）`side → align/baseline/dx/dy` 这类「离散值 → 视觉属性」的映射被提升成 spec 里的**数据结构**（`ordinal` scale），
    可读、可 diff、可被程序生成，而不是散落在循环体里的 if；
（b）「窗口/密度/插值」这类参数从代码变成了 `signal` 声明，交互与重算是引擎的事，不用写回调；
（c）整张图是一份可传输的 JSON，前后端/agent 都能生成和改写。
反过来，Vega 的短板也具体：样条只能用内置的几种（要自定义曲线就得自己拼 path），
中文标签在无头环境下宽度是估算的（长标题容易贴边），而 matplotlib 有完整的字体度量。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/46-connected-scatter/
```
