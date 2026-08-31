# 45 · 雷达图：point 角度尺 + pow 半径尺 + linear-closed 闭合折线

对应官方示例：<https://vega.github.io/vega/examples/radar-chart/>
（原始 spec：<https://github.com/vega/vega/blob/main/docs/examples/radar-chart.vg.json>）

七根辐条 = 七个维度，每个系列在七根辐条上各取一个点，连成一条**闭合**折线。
官方那份 spec 只有 185 行，却把「Vega 里怎么画极坐标图」这件事讲完了：
**Vega 没有极坐标系统**（没有 `projection: polar`，没有极坐标轴），
所有雷达图 / 玫瑰图 / 径向树都要自己写 `r·cosθ` / `r·sinθ`。
官方示例的价值在于：它把「类目→角度」和「数值→半径」这两步交给**两个普通比例尺**，
于是极坐标图重新变成了「声明式」的东西。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/45-radar-chart/
```

## 学习目标

1. **类目 → 角度**：`point` 比例尺的 `range` 直接写成 `[-PI, PI]`（弧度），
   `padding: 0.5` 不是留白美观，而是**正确性**——不写它，首尾两个维度会落在同一个方向上。
2. **数值 → 半径**：一个普通线性比例尺，`range: [0, radius]`。顺带把
   「半径线性 vs 面积线性」这个径向图的通病讲清楚（本例做成可切换的 `pow` 指数）。
3. **闭合**：`line` mark 的 `interpolate: "linear-closed"` —— 一个枚举值顶替
   「把首点再 append 一次」的数据加工，而且 `line` mark 是可以 `fill` 的。
4. **`from` 可以指向另一个 mark 的 `name`**：官方在这里用了两次，是这份 spec 最值得抄走的技巧。
   引用方拿到的 `datum` 是**场景元素**（有算好的 `x`/`y`/`stroke`…），
   `datum.datum` 才是原始数据行。于是顶点数值标签、最外圈多边形都**不用重算一次坐标**。
5. **手工径向网格**：同心环（`sequence` + facet + `parent`）、辐条（`rule`）、
   维度标签按方位角分档设置 `align`/`baseline`。
6. **两个真实的坑**：官方用顶层 `encode` 平移根 group 来把原点搬到圆心 ——
   一旦这张图有了 `title` 或 `legend`，它们会跟着被平移出画布（本文给出实测像素）；
   以及**雷达图的面积随维度顺序而变**，所以它只能比形状，不能比总量（本文给出实测倍数）。

## 和 24-radial-rose-stack（玫瑰图）的区别

本仓库已经有一个径向图 demo，但雷达图和玫瑰图是**两种完全不同的图**，别混：

| | 24 玫瑰图 / 径向堆叠柱 | 45 雷达图 |
| --- | --- | --- |
| 图元 | `arc`（扇形），一个类目一个扇形 | `line`（闭合折线 / 面积），一个**系列**一条路径 |
| 角度的含义 | 扇形**占一段角度区间**（`band` 比例尺 + `startAngle`/`endAngle`） | 顶点**落在一条角度线上**（`point` 比例尺，无宽度） |
| 谁在竞争角度 | 24 个月份平分 360° | 7 个**维度**平分 360° |
| 多个系列 | 靠堆叠（`stack` → `innerRadius`/`outerRadius`） | 靠叠加多条闭合折线（半透明填充） |
| 视觉编码的量 | **扇形面积**（所以半径必须用 `sqrt`，否则外圈被平方级夸大） | **单根辐条上的半径**（所以半径通常线性；而正因如此，围出的面积没有意义） |
| 极坐标怎么写 | `arc` mark 自带 `startAngle`/`endAngle`/`innerRadius`/`outerRadius`；`text` mark 有 `theta`/`radius` 通道（**θ=0 在 12 点、顺时针为正**） | 自己算 `x = r·cosθ`、`y = r·sinθ`（**θ=0 在 3 点**，`y` 轴向下所以正角顺时针） |

最后一行是最容易翻车的地方：**Vega 里有两套角度约定**。
`arc` mark 与 `text`/`symbol` 的 `theta` 通道是「12 点起、顺时针」（跟钟表一致）；
自己写 `cos`/`sin` 时是数学约定「3 点起」，又因为屏幕 `y` 轴向下，正角看起来是顺时针。
两套混用就会得到一张「转了 90°」的图。本例全程用 `cos`/`sin`，所以 `key-3`（θ=0）在正右方。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals: seriesPick` | 系列筛选（select，4 档） | 最后一档 `none` 专门用来看空态：折线消失，网格 / 辐条 / 比例尺全在 |
| `signals: radiusMode` | 半径映射（radio） | 只喂给 `radialExponent`：`radius`→1（等价 linear，官方写法）、`area`→0.5（等价 sqrt） |
| `signals: autoScale` | 半径域是否随所选系列自适应 | 打开后 `radialMax` 由所选系列决定：图变大，但两个系列不再可比 |
| `signals: ringStep` | 同心环间隔（5~20） | 上限 20 < 最小可能的域上界 38，保证 `sequence` 至少吐一行 |
| `signals: showValues` / `areaOpacity` | 顶点数值开关 / 填充不透明度 | 官方把顶点数值写死在 `enter` 里；要能开关就必须挪到 `update` |
| `signals: labelRoom / labelPad` | 外圈标签的像素余量 / 标签离外圈的距离 | Node 无头渲染下文字宽度是估算（`0.8×字数×字号`），CJK 会被低估，所以宁可多留 |
| `signals: plotSide / radius / cx / cy` | 几何：正方形边长、外圈半径、圆心 | `plotSide = min(width, height)` 保证圆不被压扁；`radius = plotSide/2 - labelRoom` |
| `signals: radialMax` | 半径域上界 | data 驱动 + `length(data('selected'))` 兜底，见「与官方示例的差异」第 5 条 |
| `signals: keyCount / angleStep / labelAngle` | 复原 `point` 比例尺的角度公式 | `angleStep = 2PI/n`；`labelAngle = -PI + 2·step` 是第 1、2 根辐条的角平分线 |
| `data: table` | 官方内联合成数据，原样照抄 | 14 行长表 = 7 个 `key`（维度）× 2 个 `category`（系列）。雷达图的输入天生是长表 |
| `data: selected` | 按 `seriesPick` 过滤 + `collect` 排序 | `collect` 不是为了好看：`line` mark 严格按数据顺序连点，顺序乱了折线自己打结 |
| `data: keys` | 维度表（7 行） | 官方用 `aggregate` + `groupby` 去重（不给 `fields`/`ops` 就只输出分组键，外加一列 `count`） |
| `data: rings` | 同心环的数值（4 行：10/20/30/40） | `sequence` 是**右开区间**，`stop` 取不到 —— 域上界正好是 `ringStep` 整数倍时，最外圈自动让给 `outer-line`，不会两条线重叠 |
| `scales: angular` | `point`，`range: [-PI, PI]`，`padding: 0.5` | 类目 → 弧度。`padding` 见「核心技巧一」 |
| `scales: radial` | `pow`，`exponent` 用 signal，`range: [0, radius]` | 官方是 `linear` + `zero` + `domainMin: 0`；`pow` 指数 1 与 linear 完全等价 |
| `scales: color` | `ordinal` + `category10` | 域是 `category`（0/1），两个系列两个色 |
| `legends` | `orient: "none"` + `legendX`/`legendY` | 官方没有图例。用 `orient: none` 手工定位，绕开自动布局（见「核心技巧六」） |
| `marks: radar` (group) | 把原点搬到圆心 | **官方是写在顶层 `encode` 上的**，这里改成内层 group，原因见「核心技巧六」 |
| `marks: categories` (group, facet) | 一个系列一个 group | `line` mark 没有 series 通道，多序列只能 `group` + `from.facet` |
| `marks: category-line` | 闭合折线 + 半透明填充 | `interpolate: "linear-closed"` |
| `marks: value-text` | 顶点数值 | `from: {"data": "category-line"}` —— **mark 当数据源** |
| `marks: ringLevels` (group, facet) | 同心环，一个环一个 group | 内层 `line` 从全局 `keys` 取点，半径从 `parent.level` 来 |
| `marks: radial-grid` (rule) | 七根辐条 | `rule` 的 `x`/`y` 是起点、`x2`/`y2` 是终点 |
| `marks: outer-line` (line) | 最外圈多边形 | `from: {"data": "radial-grid"}` —— **又一次 mark 当数据源**，直接吃 `x2`/`y2` |
| `marks: ring-label` (text) | 环上的数值 | `format(datum.level, 'd')`；摆在辐条间隙的角平分线上 |
| `marks: key-label` (text) | 七个维度名 | `align`/`baseline` 用 `test` 数组按方位角分档 |
| `marks: emptyHint` (text) | 空态提示 | signal 驱动 `text`，非空时求值为 `''` |
| `marks: caption` (text) | 右栏说明（多行） | `text` 给一个**字符串数组**就是多行文本，配 `lineHeight` |

### 核心技巧一：类目 → 角度，以及 `padding: 0.5` 为什么是正确性问题

```json
{
  "name": "angular",
  "type": "point",
  "range": {"signal": "[-PI, PI]"},
  "padding": 0.5,
  "domain": {"data": "keys", "field": "key"}
}
```

三件事：

1. **`range` 是弧度，不是像素。** 比例尺的 range 只是一个数值区间，Vega 不关心它的单位。
   写成 `[-PI, PI]` 之后，`scale('angular', 'key-3')` 直接就是可以喂给 `cos`/`sin` 的角度。
   这是「Vega 没有极坐标系统，但有比例尺」的全部解法。
2. **为什么是 `point` 而不是 `band`。** 雷达图的顶点要**落在**辐条上，不占角度区间；
   `point` 就是宽度为 0 的 `band`（`bandwidth() === 0`）。用 `band` 就得再手动 `+ bandwidth()/2`
   把点挪到区间中心（demo 24 的玫瑰图正是那种情况：扇形要占满一个角度区间）。
3. **`padding: 0.5` 是正确性，不是留白。** `point` 比例尺的位置公式是

   ```text
   step = span(range) / (n - 1 + 2 * padding)
   pos(i) = range[0] + step * (padding + i)
   ```

   `padding` 默认 **0**，此时 `step = 2PI/6 = 1.0472`（60°），
   七个位置是 `-PI, -2.0944, -1.0472, 0, 1.0472, 2.0944, PI` ——
   **`-PI` 和 `PI` 是同一个方向**，`key-0` 与 `key-6` 重合在正左方，
   七个维度只画出六个方向，闭合折线还会在那里对折一次。
   `padding: 0.5` 让首尾各留半步：`step = 2PI/7 = 0.8976`（51.43°），
   位置变成 `±2.6928, ±1.7952, ±0.8976, 0`，正好把整个圆周 n 等分。
   （本 demo 把这个公式抄成了 `angleStep` signal，页面右侧的 signal 面板里能直接看到 `0.8976`。）

   > 换句话说：**周期性的 range 上，闭区间的两个端点是同一个点**，所以任何「把类目铺满一圈」
   > 的比例尺都必须留出「半个 step + 半个 step」。这条同样适用于 `band`
   > （用 `paddingOuter: 0.5`，或者干脆把 range 写成 `[0, 2PI]` 让最后一个 band 的右端点落回起点）。

极坐标换算就一行，写在 `encode` 里：

```json
"x": {"signal": "scale('radial', datum.value) * cos(scale('angular', datum.key))"},
"y": {"signal": "scale('radial', datum.value) * sin(scale('angular', datum.key))"}
```

`key-0`（θ = -2.6928 rad = -154.3°）、`value = 19`，`radius = 165`、域 `[0, 42]`：
`r = 19 × 165/42 = 74.64`，于是 `x = 74.64 × cos(-2.6928) = -67.251`、
`y = 74.64 × sin(-2.6928) = -32.386` —— 和场景图里那个顶点的实测值完全一致（下一节会把它打出来）。

### 核心技巧二：数值 → 半径，以及「半径线性 vs 面积线性」

官方写的是最朴素的线性尺：

```json
{"name": "radial", "type": "linear", "range": {"signal": "[0, radius]"},
 "zero": true, "nice": false, "domain": {"data": "table", "field": "value"}, "domainMin": 0}
```

三个不起眼但都必要的键：`zero: true` + `domainMin: 0` 把域钉在 0 起（**半径必须从圆心 0 开始**，
否则「离圆心的距离」不再正比于数值）；`nice: false` 阻止 Vega 把 42 圆整成 45 ——
径向图没有轴，圆整出来的域只会让最外圈那点空隙变得莫名其妙。

本 demo 把它换成 `pow` + 一个 signal 指数，好让「半径线性 / 面积线性」可以现场对比：

```json
{"name": "radial", "type": "pow", "exponent": {"signal": "radialExponent"},
 "range": {"signal": "[0, radius]"}, "domain": {"signal": "[0, radialMax]"}, "nice": false}
```

- `exponent = 1` → 与 `linear` **完全等价**（官方形态）。半径正比于数值，读者沿辐条读刻度。
- `exponent = 0.5` → 与 `sqrt` 等价。此时**面积**正比于数值。

比例尺的 `type` **不能**是信号（解析期就要定死），但 `exponent` / `domain` / `range` / `padding`
这些属性都可以写 `{"signal": ...}` —— 「可切换的比例尺」标准做法就是选一个更一般的类型（`pow`），
再用 signal 调参。

为什么要在雷达图里提这件事？因为**径向图的视觉量是面积，而人读的是半径**。
系列 1 的 `key-2 = 42` 与 `key-4 = 6`：半径比 7:1，但那两块楔形的面积比是 49:1。
所以：

- **玫瑰图 / 比例符号图**：读者读的是面积（扇形、圆点），半径必须 `sqrt`
  （AGENTS.md 的「`size` 是面积不是长度」和 demo 24 的 `radiusMode` 讲的就是这条）。
- **雷达图**：读者沿辐条读刻度，所以半径线性才是对的（官方写法正确）。
  代价是**围出来的面积失去意义** —— 下一节专门讲这件事。

### 核心技巧三：`interpolate: "linear-closed"`

```json
{"type": "line", "encode": {"enter": {"interpolate": {"value": "linear-closed"}, ...}}}
```

`line` mark 默认画的是**开放**折线，最后一点不回到起点。雷达图要闭合，常见的两种做法：

1. 在数据里**把首点再追加一次**（造一个 `order` 字段、`sequence`/`formula` 复制第一行、
   再 `collect` 排序）—— 三个变换，而且从此每个下游都要小心那行重复数据；
2. `interpolate: "linear-closed"` —— 一个枚举值。

Vega 支持全部 d3-shape 曲线，其中带 `-closed` 的都会自动闭合：
`linear-closed`、`basis-closed`、`cardinal-closed`、`catmull-rom-closed`。
雷达图**只应该用 `linear-closed`**：曲线闭合（`cardinal-closed`）会让路径在顶点之间鼓出去，
`basis-closed` 甚至根本不穿过顶点 —— 读数直接失真。

另外注意 `line` mark **可以 `fill`**：闭合路径的填充就是雷达图那片半透明区域，
不需要额外的 `area` mark（`area` mark 是「沿一个轴的带状区域」，在极坐标里根本用不上）。
官方用 `fillOpacity: 0.1`，本 demo 做成 `areaOpacity` signal（默认 0.12）——
两片区域叠在一起时越低越容易看清各自轮廓。

### 核心技巧四：`from` 指向另一个 mark 的名字（`datum` 与 `datum.datum`）

这是官方这份 spec 最值得抄走的一招，而且它用了两次。

**第一次 —— 顶点数值标签：**

```json
{"type": "text", "name": "value-text", "from": {"data": "category-line"},
 "encode": {"update": {
   "x": {"signal": "datum.x"},
   "y": {"signal": "datum.y"},
   "text": {"signal": "format(datum.datum.value, 'd')"}}}}
```

`from.data` 给的不是数据集名，而是**另一个 mark 的 `name`**。此时这个 text mark 的每个 `datum`
是 `category-line` 的一个**场景元素**。实测（`vega.View` 里 dump 出来的第一个顶点）：

```json
{
  "datum": {"key": "key-0", "value": 19, "category": 0},
  "mark": "[mark line category-line]",
  "interpolate": "linear-closed",
  "stroke": "#1f77b4", "strokeWidth": 2, "fill": "#1f77b4", "fillOpacity": 0.12,
  "x": -67.25089049700199,
  "y": -32.3863219555606
}
```

于是：

- `datum.x` / `datum.y` = **已经算好的像素坐标**（那一长串极坐标表达式一个字都不用重写）；
- `datum.datum` = **原始数据行**，所以数值要写 `datum.datum.value`；
- 顺带还能读到 `datum.stroke`（想让标签用系列色就 `"fill": {"signal": "datum.stroke"}`）。

**第二次 —— 最外圈多边形：**

```json
{"type": "line", "name": "outer-line", "from": {"data": "radial-grid"},
 "encode": {"update": {"x": {"field": "x2"}, "y": {"field": "y2"}}}}
```

`radial-grid` 是那七根 `rule`，每个场景元素长这样（实测第一根）：

```json
{"x": 0, "y": 0, "x2": -148.66, "y2": -71.591, "datum": {"key": "key-0", "count": 2}}
```

把七根辐条的**终点**直接当七个顶点连起来，就是最外圈那个七边形 —— 一个坐标都不用重算，
而且以后改 `radius`、改 `padding`、改维度个数，辐条和外圈永远同步，不可能对不上。

三个陷阱：

- 引用的是**已编码属性名**（`x`/`y`/`x2`/`y2`/`fill`/`stroke`…），不是数据字段名。
  想要数据字段得走 `datum.datum.*`（`{"field": "datum.value"}` 也可以，`field` 支持点路径）。
- 被引用的 mark 必须在**同一作用域**（同一个 group 内）。依赖顺序由 Vega 自己排，
  但作用域跨不过去 —— 把 `value-text` 挪到 `categories` group 外面就找不到 `category-line` 了。
- 引用者的 `zindex` / 声明顺序要让它画在被引用者之上，否则标签会被半透明填充压住一层色。

### 核心技巧五：手工径向网格（同心环 + 辐条 + 按角度分档的标签）

**同心环**用 `sequence` 生成刻度值，再 facet 成「一个环一个 group」：

```json
{"name": "rings", "transform": [
  {"type": "sequence", "start": {"signal": "ringStep"}, "stop": {"signal": "radialMax"},
   "step": {"signal": "ringStep"}, "as": "level"}]}
```

`sequence` 是**右开区间**（`stop` 取不到）。默认参数下域上界 42、间隔 10 → `10, 20, 30, 40`
（42 本来就不是 10 的整数倍，所以这里右开与否都一样）；**右开真正起作用的是域上界正好等于
`ringStep` 整数倍的时候** —— 把 `ringStep` 那个 `range` 控件的 `step` 临时改成 1、
打开「半径域自适应」只看系列 0（上界 38），再把间隔拖到 19：闭区间会在 38 处多画一圈，
和 `outer-line` 那圈多边形完全重叠成一条双线。右开自动躲开了这件事。
（反过来，真要包含末点得写 `stop: 42.0001` 之类。）
`as: "level"` 把默认的输出字段名 `data` 改掉 —— 不改的话，环上的表达式会写成
`parent.data`，读起来像在拿「父级的数据集」，很容易误解。

环本身画成多边形（而不是圆），才和辐条构成雷达图那张「网」：

```json
{"type": "group", "name": "ringLevels",
 "from": {"facet": {"data": "rings", "name": "ring", "groupby": ["level"]}},
 "marks": [{"type": "line", "from": {"data": "keys"},
   "encode": {"enter": {"interpolate": {"value": "linear-closed"}, ...},
     "update": {
       "x": {"signal": "scale('radial', parent.level) * cos(scale('angular', datum.key))"},
       "y": {"signal": "scale('radial', parent.level) * sin(scale('angular', datum.key))"}}}}]}
```

两个作用域细节：内层 mark 的 `from` 用的是**全局数据集 `keys`**（嵌套作用域里可以直接引用顶层数据集，
不必非得用 facet 出来的那份）；半径来自 `parent.level` —— facet group 的 `datum` 就是分组键那一行，
子 mark 里用 `parent.<字段>` 读它。想画圆形网格就换成 `arc` mark 且
`innerRadius === outerRadius`（demo 24 的刻度环正是这么画的）。

**辐条**是七根 `rule`，起点 `x`/`y` 是圆心 `(0, 0)`（因为整张图已经平移到圆心了），
终点 `x2`/`y2` 是外圈上的点。

**维度标签**的 `align`/`baseline` 用 `test` 数组分档 —— 官方那两串 `test` 的全部含义是：

```json
"align": [
  {"test": "abs(scale('angular', datum.key)) > PI / 2", "value": "right"},
  {"value": "left"}
],
"baseline": [
  {"test": "scale('angular', datum.key) > 0", "value": "top"},
  {"test": "scale('angular', datum.key) == 0", "value": "middle"},
  {"value": "bottom"}
]
```

- `|θ| > PI/2` ⇔ `cos θ < 0` ⇔ 标签在圆的**左半边** → 文字右对齐（往外写）；否则左对齐。
- `θ > 0` ⇔ `sin θ > 0` ⇔ 标签在**下半边**（屏幕 y 向下）→ 基线在顶（文字往下挂）；
  `θ == 0` 是正右方的特例 → 垂直居中；其余在上半边 → 基线在底。

编码集里的**数组**就是「条件编码」：从上往下第一个 `test` 为真的生效，最后一条不带 `test` 的是兜底。
这比在 signal 里拼一串三元表达式可读，而且每一档都能单独改。

值得指出官方这里的**不完美**：`align` 只分左右两档，没有「正上方 / 正下方要居中」那一档。
本例的七个维度里没有谁正好落在 ±PI/2，所以看不出来；但维度数是 2、4、6 的某些组合会踩到
（`n = 2` 时两个点正好在 ±PI/2），那时标签会横向偏出半个文字宽。
本 demo 保留官方写法未动 —— 与其加一档只在别的数据上才生效的死代码，不如把这件事写在这里。

**环上的数值标签**摆在哪？摆在辐条上会被顶点数值撞。本 demo 用

```json
{"name": "labelAngle", "update": "-PI + angleStep * 2"}
```

即第 1、2 根辐条的角平分线（本例 -77.14°），离两边的顶点标签各 25.7°；
原先图省事写的 `-PI/2`（正上方）离 `key-1` 只有 12.9°，在最内圈那两个标签会贴在一起。
角度公式来自「核心技巧一」的 `pos(i) = -PI + step*(0.5 + i)`：相邻两点的中点是 `-PI + step*(i+1)`，
取 `i = 1` 即得。

### 核心技巧六：把原点搬到圆心（以及顶层 `encode` 的坑）

官方的做法是给**根 group** 加 encode：

```json
"encode": {"enter": {"x": {"signal": "radius"}, "y": {"signal": "radius"}}}
```

顶层的 `encode` 编码的就是根 group mark，`x`/`y` = 平移量。原点搬到圆心之后，
所有几何都写成以圆心为原点的 `(r·cosθ, r·sinθ)`，负坐标合法 —— 这是极坐标图必备的一步。

**但根 group 里装着的不只有 mark，还有 `title`、`legends`、`axes`。** 官方示例这三样都没有，
所以看不出问题。实测：把官方 spec 一字不改，只补上本 demo 那份 `title`
（正标题 15px + 副标题 11px + `anchor: "start"` + `offset: 10`）和一个默认方位的
`legends: [{"fill": "color", "title": "category"}]`。下面的「组内坐标」是
`view.scenegraph().root` 里那两个子项自己的包围盒（还没算上根 group 的平移）：

| | 组内坐标（实测包围盒） | 画布坐标 = 组内 + 平移 (160, 160) + padding (40, 40) | 画布只有 400×400 |
| --- | --- | --- | --- |
| 图例 | x ∈ [338, 408] | x ∈ **[538, 608]** | 整块在画布右边界之外，全裁 |
| 标题 | y ∈ [-210.9, -181.9] | y ∈ **[-10.9, 18.1]** | 上沿探出画布顶边 10.9px，正标题被切掉一截 |

（只加一个不带副标题的 `title` 时标题落在 y ∈ [11.1, 24.1]，勉强没被裁 —— 一旦有副标题、
或者标题字号大一点，就一定越界。图例那一行则与标题写法无关，任何时候都是全裁。）

所以本 demo 改成**内层 group** 承担平移：

```json
{"type": "group", "name": "radar", "encode": {"update": {
  "x": {"signal": "cx"}, "y": {"signal": "cy"}}}, "marks": [ ... ]}
```

根 group 保持不动，`title` / `legends` 就按正常布局落在它们该在的地方，
雷达自己在内层 group 里享受「圆心即原点」。
顺带解释为什么图例还写了 `orient: "none"` + `legendX`/`legendY`：
`autosize: {"type": "none"}` 下 Vega **不会**为图例把画布撑大（也不会为标题让出 padding），
自动布局的图例很容易压到图上；`orient: "none"` 把定位权收回来，配合
`legendX = plotSide + 30` 就稳稳落在正方形绘图区右侧的留白里。
（同理，`title` 需要的顶部空间是靠显式的 `"padding": {"top": 58, ...}` 手动留的。）

### 关键概念清单

- `point` 比例尺 = `bandwidth` 为 0 的 `band`；`range` 可以是任意数值区间（弧度也行）。
- 周期性 range 上必须 `padding: 0.5`，否则首尾类目重合。
- 比例尺的 `type` 不能是 signal，但 `exponent`/`domain`/`range`/`padding` 可以。
- `pow` 指数 1 ≡ `linear`，0.5 ≡ `sqrt`。
- `line` mark 没有 series 通道 → 多序列必须 `group` + `from.facet`；facet 内**保留源数据顺序**，
  所以上游要 `collect` 排序。
- `interpolate: "*-closed"` 自动闭合路径；`line` mark 可以 `fill`。
- `from: {"data": "<mark 名>"}` 把一个 mark 当数据源：`datum` 是场景元素、`datum.datum` 是原始行。
- facet group 里用 `parent.<字段>` 读分组键；嵌套作用域可以直接引用顶层数据集。
- `sequence` 是右开区间；`as` 可以改输出字段名（默认 `data`）。
- `encode` 里的数组是条件编码：第一个 `test` 命中即生效，末条兜底。
- 顶层 `encode` 平移的是根 group —— `title`/`legend`/`axes` 会一起被平移。
- `autosize: "none"` 不会为标题和图例扩画布：padding 要手写，图例用 `orient: "none"` 手工定位。

## 雷达图为什么不能比面积

这是官方示例没交代、但雷达图最常被误用的一点，也是本 demo 在图上直接写了一段说明的原因。

n 个顶点、相邻夹角固定为 `Δθ = 2π/n` 的星形多边形，面积是

```text
A = ½ · sin(2π/n) · Σ r_i · r_{i+1}      （下标循环，r_n = r_0）
```

关键在 `Σ r_i·r_{i+1}` —— 它只依赖**相邻**两项的乘积，所以**维度的排列顺序一变，面积就变**。
拿本例系列 0 的七个值 `[19, 22, 14, 38, 23, 5, 27]`（固定这七个数，只改环上的顺序）实测：

| | 当前顺序 | 所有 6! 种环状排列里的最小 | 最大 |
| --- | --- | --- | --- |
| 系列 0 面积（数据单位²） | 1131.7 | 1022.6 | 1330.7 |
| 系列 1 面积（数据单位²） | 624.7 | 503.1 | 684.5 |

同一份数据，面积能差 **1.30 ~ 1.36 倍**（把大值排在一起面积最大，大小交错排面积最小）。
推论：

1. **不要比两个系列的面积 / 「覆盖率」。** 系列 0 合计 148、系列 1 合计 109（比 1.36），
   但当前顺序下的面积比是 1131.7 / 624.7 = **1.81** —— 面积把差距夸大了 33%。
   （而且如果半径切到「面积 ∝ 数值」模式，这两个数还会变一遍。）
2. **不同维度数的雷达图之间完全不可比**：`sin(2π/n)` 和求和项数都随 n 变。
3. **维度顺序是设计决策**：要么按语义分组（相关的维度相邻），要么就此固定不变 ——
   一旦改了顺序，历史图之间不可比。
4. **各维度量纲不同时必须先归一化**（本例七个维度共用一把 `radial` 尺，是同量纲的），
   而归一化方式（min-max / z-score / 除以基准值）会再一次改变形状。

雷达图正确的用法只有一个：**看形状**（哪几个维度突出、哪几个凹陷，两个形状在哪里交叉），
以及在维度数 ≤ 8、系列数 ≤ 3 时做定性对比。要比总量就换柱状图，
要比多变量的分布就换平行坐标（demo 30）或热力矩阵（demo 41）。

## 试一试

1. **把 `angular` 的 `padding` 从 `0.5` 改成 `0`**（`spec.vg.json` 里那一行）。
   实测：比例尺真实步长从 0.8976 变成 1.0472（`view.scale('angular').step()` 可以直接读），
   `key-0` 与 `key-6` 落在**同一条辐条**上（都指向正左方 180°，两个标签叠在一起），
   网格塌成六边形，两条折线都在那条辐条上折回 —— 「核心技巧一」那条正确性问题肉眼可见。
   顺带注意：spec 里的 `angleStep` signal **不会**跟着变（它是照 `padding: 0.5` 的公式
   `2PI/n` 手算的「复原」，不是从比例尺读出来的）—— 所以环上数值标签的角度也不再是角平分线。
2. **半径映射切到「面积 ∝ 数值」**（`radialExponent` 变 0.5）。所有顶点向外推，
   小值被抬得最多（`5` 的半径从 `19.6px` 变成 `56.9px`），刻度环也跟着不等距 ——
   这正是「半径线性 / 面积线性」二选一的代价。再回想 demo 24：玫瑰图必须选后者，雷达图通常选前者。
3. **把 `category-line` 的 `interpolate` 改成 `cardinal-closed` 或 `basis-closed`**。
   前者鼓出顶点（读数偏大），后者根本不穿过顶点 —— 于是「顶点数值标签」和曲线彻底对不上。
4. **打开「半径域随所选系列自适应」再只看系列 0**：`radialMax` 从 42 变 38，整张图放大约 10%，
   环变成 10/20/30。好看，但两个系列不再可比 —— data 驱动 domain 的典型代价。
   再把系列筛选拉到「都不选」：`selected` 变 0 行，`radialMax` 靠 `length(...)` 兜回整表最大值，
   网格与辐条纹丝不动，只多出一句提示文字（去掉那个 `length(...)` 判断，域会退化成 `[0, null]`，
   环和折线一起消失）。
5. **把 `ringLevels` 里的 `line` 换成 `arc`**（`innerRadius === outerRadius`、
   `startAngle: 0`、`endAngle: 2*PI`）→ 圆形网格。对比一下：多边形网格更容易沿辐条读数，
   圆形网格更容易看「谁更靠外」。

## 与官方示例的差异

官方示例本身没有外部数据（14 行内联 `values`），也没有 `now()` / `Math.random()`
之类不可复现的调用，所以 G 组契约里「换数据路径」「去掉不可复现调用」两条不适用。
**图形结构、极坐标换算、`interpolate: "linear-closed"`、两处「mark 当数据源」、
`align`/`baseline` 的 `test` 数组，全部与官方一致**
（表达式本身一字未改，只是**几何编码整体从 `enter` 挪到了 `update`**，见下表第 10 条；
`value-text` 另外多包了一层 `format`）。
改动如下：

| # | 改动 | 原因 |
| --- | --- | --- |
| 1 | 顶层 `encode` 平移根 group → 改成内层 `group mark "radar"` 平移 | 本仓库契约要求每个 spec 有 `title`，而本 demo 还加了图例。实测：根 group 被平移 `(160,160)` 后，图例整块落到画布 x ∈ [538, 608]、标题落到画布 y ∈ [-10.9, 18.1]，在 400×400 的画布上双双被裁（图例全裁、标题上沿裁掉 10.9px）。见「核心技巧六」 |
| 2 | `radial` 从 `linear` + `zero` + `domainMin: 0` 改成 `pow` + `exponent: {"signal": "radialExponent"}`，`domain` 改成 `{"signal": "[0, radialMax]"}` | 为了让「半径线性 / 面积线性」和「半径域自适应」可切换。`pow` 指数 1 与 `linear` 完全等价，域显式写 `[0, ...]` 已经包含 `zero`/`domainMin` 的效果，`nice: false` 保留 |
| 3 | 新增 `selected` 数据集（`filter` + `collect`），`categories` 的 facet 源从 `table` 改成 `selected` | 加了 `seriesPick` 筛选。`collect` 是**正确性**：`line` mark 按数据顺序连点，facet 内保留源数据顺序（AGENTS.md「变换」一节） |
| 4 | `keys` 在官方的 `aggregate` 之后加了一次 `collect` 排序；`angular` 的 domain 从 `{"data": "table"}` 改成 `{"data": "keys"}` | 官方靠「`aggregate` 按首次出现顺序输出」间接得到 key-0…key-6 的顺序，这是隐式依赖行序。显式排序之后，辐条顺序、环多边形顺序、比例尺域顺序三者都由同一个排好序的 `keys` 决定 |
| 5 | 新增派生 signal `radialMax`，写成 `autoScale && length(data('selected')) ? extent(...)[1] : extent(pluck(data('table'), 'value'))[1]` | **空态兜底**（G 组契约第 5 条）。官方的域直接绑 `table`（永不为空，所以官方无需兜底）；本 demo 允许把系列过滤到 0 行，`extent([])` 会给出 `[null, null]`，域退化成 `[0, null]` → 环与刻度全废。写法沿用 `src/10-signals-bind/`：只有 `update` 的派生 signal + `length(...)` 判据 |
| 6 | 新增 `marks: emptyHint`（signal 驱动 `text`，非空时求值为 `''`） | 同上。刻意**不**新建一个默认为空的数据集来放提示 —— 校验器断言每个数据集行数 > 0，会判它失败 |
| 7 | 新增 `rings` 数据集（`sequence`）+ `ringLevels` 同心环 + `ring-label` 环上数值 | 官方只有辐条和最外圈，没有任何半径刻度 —— 读者无法知道某个顶点是多少（除了看顶点数字）。雷达图必须有径向刻度 |
| 8 | 新增 `title`（`subtitle` 用 signal 报当前模式与行数）、`legends`（`orient: "none"` + `legendX/Y`，`encode.labels` 把 0/1 显示成「系列 0/1」）、`caption` 多行说明文字 | 契约要求有 `title` 和「让人一眼看懂在看什么」的说明。官方图上没有任何图例，读者只能猜两种颜色是什么 |
| 9 | 六个 `bind` signal：`seriesPick` / `radiusMode` / `autoScale` / `ringStep` / `showValues` / `areaOpacity`（官方一个都没有，只有一个派生的 `radius`） | 契约要求「能用 signal 表达的参数就别写死，让读者能拖着玩」 |
| 10 | **五个官方 mark 的几何编码全部从 `enter` 挪到 `update`**（`category-line` 的 `x`/`y`/`fillOpacity`、`value-text` 的 `x`/`y`/`text`、`radial-grid` 的 `x2`/`y2`、`outer-line` 的 `x`/`y`、`key-label` 的 `x`/`y`/`text`/`align`/`baseline`）；`value-text` 的 `text` 另外包一层 `format(datum.datum.value, 'd')` 并加 `opacity` 开关 | 表达式一字未改，只是换了编码集。**`enter` 只在图元创建时跑一次**，而本 demo 把 `radial` 的 `exponent`/`domain`、`areaOpacity`、`showValues` 都做成了 signal —— 留在 `enter` 里的编码拖动控件时不会重算（官方 spec 全是常量，所以官方写 `enter` 没问题）。`radial-grid`/`outer-line`/`key-label` 只依赖静态的 `radius`，写 `enter` 也能跑，一并挪到 `update` 是为了让读者不用逐条判断「这条依赖的信号会不会变」。`format` 是本仓库的硬规矩：数字一律显式格式化 |
| 11 | 画布 400×400 / `padding: 40` → 640×520 / `padding: {"top": 58, ...}`；`radius` 从 `width / 2` 改成 `min(width, height) / 2 - labelRoom`；`autosize` 保持官方的 `{"type": "none", "contains": "padding"}` | 要给标题（顶部 58px）、图例与说明（右侧）腾地方，还要给外圈的维度标签留 `labelRoom = 58px`。官方的 `radius = width/2` 让标签探到 x ≈ 409（画布 400 宽，Node 估算字宽下超出 9px；浏览器真实字宽刚好卡住）。`min(width, height)` 保证画布不是正方形时圆也不被压扁 |
| 12 | `key-label` 的 `radius + 5` → `radius + labelPad`（9）；`stroke`/`fill` 由 `lightgray` / `black` 换成三档灰（环 `#c9ced6` < 辐条 `#b7bec8` < 外圈 `#8b949e`，文字 `#24292f`）；环线加 `strokeDash: [3, 3]`；折线 `strokeWidth` 1 → 2、最外圈 1 → 1.2；顶点数值补 `fontSize: 10` + `fontWeight: "bold"`（官方不写 `fontSize`，取默认 11） | 官方三层网格同色同粗，加了同心环之后会糊成一片；给网格分层次、把折线加粗，主次才分明 |
| 13 | 教学注释全部写成 `data` / `signals` / `marks` 条目上的 `description` 键 | **`scales` 条目里放任何未知键都会触发 `Unsupported scale property` WARN，被校验器判失败**（G 组契约第 4 条）。所以三个比例尺的解释只能写在本文档里 |
| 14 | `ring-line` / `radial-grid` / `outer-line` / `ring-label` / `key-label` / `emptyHint` / `caption` 加 `interactive: false`（官方一个都没有） | 它们不需要被拾取；Vega 的拾取是自上而下取第一个命中，网格与文字盖在折线上会抢走 hover。唯一保留可拾取的是 `value-text`——它贴在顶点上，官方也是可拾取的 |

**检查过但不需要改的**：

- **内建 signal 冲突**（G 组契约第 2 条）：官方只自定义了 `radius`，本 demo 加的
  `plotSide` / `cx` / `cy` / `angleStep` … 也都不撞 `width` / `height` / `padding` /
  `background` / `autosize` / `cursor`，无需改名。
- **`range: "width"/"height"` 的作用域**（第 6 条）：三个比例尺全在顶层，
  且 range 写的是显式区间 `[-PI, PI]` / `[0, radius]`，group mark 内不声明任何 scale ——
  天然绕开「group 不重绑 width/height」这个坑。
- **`label` / `wordcloud` 变换**：官方没用，本 demo 的标签靠角度分档摆放，也没用。
- **`zindex`**：官方用 `zindex: 0/1` 把网格压在折线之下（因为它把 `categories` 写在最前面）。
  本 demo 保留这个写法，新增的环用 `zindex: 0`、环上数值用 `zindex: 2`（要盖在半透明填充之上）。

## 与 matplotlib 的对照

雷达图是 matplotlib **相对占优**的一类图，因为它真的有极坐标子图：

```python
import numpy as np, matplotlib.pyplot as plt
keys = [f"key-{i}" for i in range(7)]
v0 = np.array([19, 22, 14, 38, 23, 5, 27]);  v1 = np.array([13, 12, 42, 13, 6, 15, 8])
theta = np.linspace(0, 2*np.pi, len(keys), endpoint=False)      # ← 对应 padding: 0.5 那件事
ax = plt.subplot(projection="polar")
for v in (v0, v1):
    t = np.concatenate([theta, theta[:1]])                       # ← 手工闭合：把首点再追加一次
    r = np.concatenate([v,     v[:1]])
    ax.plot(t, r); ax.fill(t, r, alpha=0.1)
ax.set_thetagrids(np.degrees(theta), keys)                       # ← 维度标签，自动对齐
```

| 这一步 | Vega | matplotlib |
| --- | --- | --- |
| 极坐标系 | **没有**。自己写 `r·cosθ` / `r·sinθ`（或用 `arc` / `theta`-`radius` 通道） | `projection="polar"`，内建 |
| 同心网格 + 维度标签 | 手画 `line` + `rule` + `text`，标签的 `align`/`baseline` 自己分档 | `set_thetagrids(角度, 标签)` 一行，含自动对齐；网格默认就有 |
| 角度均分 | `point` 比例尺 + `padding: 0.5`（**声明式，维度数由数据决定**） | `np.linspace(..., endpoint=False)`（**记得 `endpoint=False`**，同一个坑的另一种形态） |
| 闭合 | `interpolate: "linear-closed"` | `np.concatenate([v, v[:1]])`，每条线都得写一遍 |
| 多序列 | `group` + `from.facet`（啰嗦，但系列数由数据决定，不用改代码） | `for` 循环（直白，但系列数写死在代码里） |
| 顶点数值标签 | `from: {"data": "category-line"}`，直接吃**已经算好的** `x`/`y` | 自己再算一遍 `ax.annotate(txt, (t_i, r_i))`（极坐标标注要另设 `textcoords`） |
| 半径线性 ↔ 面积线性 | 改 `pow` 的 `exponent`（一个 signal） | 极坐标只有 linear / symlog，要 sqrt 得把数据开方，刻度标签也得手动改回原值 |
| 交互 | `bind` 自动生成控件，signal 一变整图增量重算 | `matplotlib.widgets` + 回调里重画，或用 ipywidgets |
| 导出 | 场景图 → SVG / PNG（透明背景由 `background` signal 控制） | `savefig`，SVG / PNG 都行 |

诚实结论：

- **matplotlib 更省事的地方**：极坐标系 + `set_thetagrids` 直接省掉本 demo 一半的 mark
  （同心环 28 行 + 辐条 20 行 + 环上数值 22 行 + 维度标签 29 行 ≈ 近百行 JSON）。radar 是少数
  「命令式绘图库自带的东西正好够用」的图。
- **Vega 更强的地方**：① 维度数、系列数完全由数据决定，加一个维度不用改 spec；
  ② 「mark 当数据源」让坐标只算一次，衍生图元（顶点标签、外圈多边形）永远和主图元同步；
  ③ 六个参数是 signal，控件自动生成，改一个参数是增量重算而不是整图重画；
  ④ 同一份 spec 出交互页面、SVG 和 PNG。
- **别的库**：`seaborn` 没有雷达图（它不做极坐标）；`plotly` 有
  `go.Scatterpolar(fill="toself")`，闭合和填充一行搞定，是这三家里最省事的；
  `ECharts` 有专门的 `radar` 坐标系（连「各维度独立 max」都内建）。
  Vega 的定位不是「内建图表类型多」，而是「把图元和比例尺拆开、让你拼」。

## 参考

- 官方示例：<https://vega.github.io/vega/examples/radar-chart/>
  · 原始 spec：<https://github.com/vega/vega/blob/main/docs/examples/radar-chart.vg.json>
- `point` 比例尺（`padding` / `step` / `bandwidth`）：<https://vega.github.io/vega/docs/scales/#point>
- `pow` 比例尺与 `exponent`：<https://vega.github.io/vega/docs/scales/#pow>
- `line` mark 与 `interpolate` 取值表：<https://vega.github.io/vega/docs/marks/line/>
- `rule` mark（`x`/`y` → `x2`/`y2`）：<https://vega.github.io/vega/docs/marks/rule/>
- `text` mark（`align` / `baseline` / 多行 `text`）：<https://vega.github.io/vega/docs/marks/text/>
- `group` mark 的 `from.facet` 与 `parent`：<https://vega.github.io/vega/docs/marks/group/>
- mark 当数据源（`from.data` 指向 mark 名）：<https://vega.github.io/vega/docs/marks/#from>
- `sequence` 变换：<https://vega.github.io/vega/docs/transforms/sequence/>
- `aggregate` 变换（不给 `fields`/`ops` 即去重）：<https://vega.github.io/vega/docs/transforms/aggregate/>
- `collect` 变换：<https://vega.github.io/vega/docs/transforms/collect/>
- 条件编码（`test` 数组）：<https://vega.github.io/vega/docs/marks/#encode>
- 图例的 `orient: "none"` 与 `legendX`/`legendY`：<https://vega.github.io/vega/docs/legends/>
- `autosize` 与 padding：<https://vega.github.io/vega/docs/specification/#autosize>
- 本仓库相关：`AGENTS.md`「`size` 是面积不是长度」「`sequence` 是右开区间」「`line` mark 没有 series 通道」；
  `src/24-radial-rose-stack/`（玫瑰图：arc + sqrt 半径）；
  `src/10-signals-bind/`（data 驱动 domain 的空态兜底）；
  `src/42-job-voyager/`（同为 G 组：facet + `parent` 的另一种用法）
