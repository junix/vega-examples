# 39 · Bump 图与斜率图：把「数值」变成「名次」与「升降」

同一份数据、同一套配色、同一个 spec，左右两块面板讲两件不同的事：

* **左：bump chart（名次图）** —— 纵轴不是人数，而是**当年的名次**。名次由 `window` 变换的
  `rank` 算出来，于是「谁超过了谁」变成图上肉眼可见的一次交叉。
* **右：slope chart（斜率图）** —— 只保留起止两个年份，每个类别一条直线。
  纵轴是真实人数，所以**线的倾角就是这段时间的增减**，比十六根柱子好读得多。

![两个面板](./index.html)

## 学习目标

读完这一个 demo，你应该能回答：

1. **怎么在 Vega 里算「名次」**：`window` 变换 + `groupby` + `sort`，和 SQL 的
   `RANK() OVER (PARTITION BY year ORDER BY jobs DESC)` 是同一件事，而且它是**声明式的数据流节点**，
   上游数据一变（换年份、换筛选）名次自动重算。
2. **怎么让「第 1 名在最上面」**：`point` 比例尺的 `range` 写成 `[0, panelH]`
   （0 是画布顶部），等价于 `range: "height"` 再加 `reverse: true`。
3. **怎么在一个 spec 里放两块坐标系不同的面板**：用两个 `group` mark 当子画布，
   面板的原点/尺寸全部由 signal 从 `width`/`height` 推导，坐标轴写在 `group` 内部。
4. **怎么只在序列两端打标签**：`aggregate` 的 `argmin` / `argmax` 返回**整条元组**，
   一步就拿到「每个类别最早/最晚那一行」，不需要先求 min 再回表 join。
5. **怎么算「相对起点的变化」**：`window` + `frame: [null, null]`（整个分区）+ `first_value`，
   让每一行都带上本分区起点的值，再用 `formula` 求差与百分比。
6. **两个面板怎么共享语义**：共享 `color` 比例尺 + 一个 `legend`，
   再用一个 `focus` signal 做跨面板联动高亮。

## 为什么用 us-employment.csv

契约里给的首选数据是 `iowa-electricity.csv`，但它只有 3 个类别（Fossil Fuels / Nuclear /
Renewables），bump 图上就 3 条线、名次只换过一次，教不出「名次交叉」这件事；
`disasters.csv` 的类别够多，但它是**残缺面板**——某些年份某些灾种整行缺失，
每年参与排名的类别数都不一样，折线会断、名次含义还会漂移，不适合当教学例子。

`us-employment.csv` 是宽表（一行一个月、每个行业一列），2006-01 ~ 2015-12 共 120 行，
每个行业每个月都有值，是**完整面板**。挑其中 8 个行业、按年取均值，得到 8 × 10 = 80 行，
既有足够的名次交叉（2008 年休闲餐旅超过制造业；2011 年批发贸易超过建筑业，2013 年又被超回），
又能在斜率图上讲一个干净的故事：服务业上行、制造业与建筑业下行。
代价是要先 `fold` 把宽表摊成长表——顺便把「宽表转长表」这一步也演示了。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `title` | 顶部标题 + 副标题 | 副标题写清数据来源与单位（百万人），图上任何数字都不用再猜量纲 |
| `signals`（交互组） | `interp` / `yearFrom` / `yearTo` / `showValues` | 全部 `bind` 成控件：插值方式、斜率图的比较区间、端点标签是否带数值 |
| `signals`（派生组） | `slopeFrom` / `slopeTo` | `min`/`max` 把两个滑块归一，用户把起点拖到终点右边也不会画反 |
| `signals`（布局组） | `panelTop` / `panelH` / `bumpX` / `bumpW` / `labelPad` / `slopeX` / `slopeW` | 两块面板的原点与尺寸**没有一个写死**，全部由 `width`/`height` 推出来 |
| `signals`（交互状态） | `focus` | 由 `@bumpNode:mouseover` / `@slopeNode:mouseover` 事件写入，`mouseout` 清空 |
| `data: raw` | 读 CSV | **必须**写 `format: {"type": "csv"}`；`month` parse 成 `date`，8 个行业列 parse 成 `number`（没列进 `parse` 的列会留成字符串，本例用不到它们） |
| `data: industryNames` | 内联码表 | 英文列名 → 4 字中文短名，另外带 `dyLeft`/`dyRight` 两个标签避让偏移 |
| `data: long` | 宽表 → 长表 → 年均 | `fold` → `formula(utcyear)` → `aggregate(mean)` → `lookup` → `formula(mjobs)`，五个变换串成一条流水线 |
| `data: ranked` | 算名次 | `window` 按 `year` 分组、组内按 `jobs` 降序，`ops: ["rank"]` 输出 `rank` 字段 |
| `data: bumpFirst` / `bumpLast` | 两端标签的数据源 | `aggregate` + `argmin` / `argmax` 拿到整条元组，再 `formula` 摊平成 `year` / `rank` |
| `data: slope` | 斜率图数据 | `filter` 只留起止两年 → `window(first_value, frame:[null,null])` 拿到起点值 → `formula` 求 `delta` / `pct` |
| `data: slopeLeft` / `slopeRight` | 左右两侧标签 | 各自 `filter` 到 `slopeFrom` / `slopeTo` |
| `scales: x` | bump 的年份轴 | `point` 类型，`range` 是 `[labelPad, bumpW - labelPad]`——两端各缩进 46px 留给行业名标签 |
| `scales: yRank` | bump 的名次轴 | `point` + `domain … sort: true`（1…8 升序）+ `range: [0, panelH]`，于是第 1 名落在面板顶端 |
| `scales: xSlope` | 斜率图的两个时点 | `domain: {"signal": "[slopeFrom, slopeTo]"}`，随滑块变 |
| `scales: ySlope` | 斜率图的人数轴 | `domain` 取自**筛选后**的 `slope` 数据，换区间会自动重新适配；`padding: 14` 给端点标签留出上下空间 |
| `scales: color` | 共享配色 | `domain` 显式写成 8 个中文名（顺序＝2006 年名次），保证图例顺序稳定、颜色不随数据行序漂移；`range` 用内置 `tableau10` |
| `legends` | 唯一一个图例 | `stroke: "color"` + `symbolType: "stroke"`，图例符号画成线段而不是圆点；`titleLimit: 240` 防标题被截断成 `…` |
| `marks[0]` | 左面板 `group` | `encode.update` 里给 `x`/`y`/`width`/`height`，内部 `axes` 用面板局部坐标；`title` 带 `subtitle` 说明纵轴含义 |
| `marks[0].marks[0]` | 按行业分面 | `from.facet` 按 `label` 分组；分面内先 `collect` 按 `year` 排序，再画 `line` + `symbol` |
| `marks[0].marks[1..2]` | 两端行业名 | 来自 `bumpFirst` / `bumpLast`，`offset: ∓9` 顶到节点外侧，`align` 一个 right 一个 left |
| `marks[1]` | 右面板 `group` | 同样的套路，只有一根 `bottom` 轴（两个年份），纵轴刻度省略、数值直接写在端点旁 |

### 关键概念

**1. `window` 就是 SQL 窗口函数**

```json
{ "type": "window",
  "sort": { "field": "jobs", "order": "descending" },
  "groupby": ["year"],
  "ops": ["rank"], "as": ["rank"] }
```

等价于 `RANK() OVER (PARTITION BY year ORDER BY jobs DESC)`。
`rank` 这类**排序类**窗口操作不需要 `fields`（排谁的名由 `sort` 决定），
而 `first_value` 这类**取值类**操作必须给 `fields`。

**2. `frame` 决定「窗口开多大」**

`window` 的默认 `frame` 是 `[null, 0]`：从分区开头到当前行（累计窗口）。
斜率图这里要的是「整个分区」，所以写 `frame: [null, null]`：

```json
{ "type": "window", "groupby": ["label"],
  "sort": { "field": "year", "order": "ascending" },
  "frame": [null, null],
  "ops": ["first_value"], "fields": ["mjobs"], "as": ["startJobs"] }
```

于是这个分区里**每一行**都拿到起点值，`delta = mjobs − startJobs`、
`pct = delta / startJobs` 就能直接在终点那行上用。

**3. 「第 1 名在上」怎么来的**

Vega 的 y 像素坐标向下增长。名次比例尺是

```json
{ "name": "yRank", "type": "point",
  "domain": { "data": "ranked", "field": "rank", "sort": true },
  "range": { "signal": "[0, panelH]" }, "padding": 0.5 }
```

`domain` 排序后是 `[1,2,…,8]`，`range` 从 `0`（面板顶端）到 `panelH`（面板底端），
所以名次 1 落在顶端。写成 `"range": "height"` 时 Vega 给的是 `[panelH, 0]`
（连续比例尺的惯例，让 0 在底部），那时才需要 `reverse: true` 把它翻回来 —— 两种写法等价，
本例选了显式 `range`，因为面板高度是 signal，本来就要自己写数组。
`padding: 0.5` 让首尾名次各留半个 step，第 1 名不会贴着面板上边缘。

**4. 面板布局是怎么算出来的**

画布宽 960、高 430，两块面板的几何全部由 signal 推出来（默认值代入后）：

```
bumpX  = 56                       左面板原点：给「第 N 名」轴标签留 42px + 余量
bumpW  = round(width * 0.45) = 432
x.range = [46, 432-46] = [46, 386]  面板内部再各缩 46px，给行业名标签
slopeX = bumpX + bumpW + 114 = 602  114 = 左面板右侧标签(≈44) + 右面板左侧标签(≈73) + 空隙
slopeW = width - slopeX - 104 = 254 右侧留 104px 给 "22.0（+21%）" 这种标签
panelTop = 36                       给面板标题 + 副标题
panelH   = height - panelTop - 40 = 354   底部 40px 给 x 轴标签与轴标题
```

改顶层 `width` 两块面板会一起缩放（760 ~ 1200 都试过不会互相压到），
这是把布局写成 signal 而不是写死数字的好处。

**5. 标签避让：手工表 vs `label` 变换**

斜率图两端的数值标签会挤在一起（比如 2015 年零售贸易 15.6 与休闲餐旅 15.2，只差 0.4 百万人，
在 354px 高的面板上只差 8px）。Vega 有个 `label` 变换能自动做碰撞检测避让，
但它要把已有图元栅格化进真实 canvas 位图，本项目的无头校验器跑不了，所以这里退一步：
把偏移量写进 `industryNames` 码表的 `dyLeft` / `dyRight` 字段，
和中文名一起 `lookup` 进来，mark 里只是 `"dy": {"field": "dyRight"}`。
8 个行业里只有 3 对需要非 0 偏移（±3 ~ ±5 px），其余都是 0。
**注意这张表是按默认区间 2006→2015 调的**：拖动滑块换区间后，
个别标签可能又会贴到一起 —— 这正是自动避让算法要解决的问题，也是手工表的固有代价。

**6. 一个 CSV 解析的坑**

`format.parse` 里写 `"month": "date"` 之后，Vega 存的是**时间戳数字**（`Date.parse` 的结果），
不是 `Date` 对象；`node tools/inspect.cjs 39` 打出来是 `month: num 1136073600000` 而不是 `date …`，
这是正常的。日期函数照常可用，但要注意用 **`utcyear`** 而不是 `year`：
`2006-01-01` 被按 UTC 午夜解析，在 UTC 以西的时区里 `year()` 会算成 2005，整张图的年份都会错一格。

## 试一试

1. **把名次换回人数**：把左面板 `line`/`symbol` 的 `y` 从 `{"scale": "yRank", "field": "rank"}`
   改成 `{"scale": "ySlope", "field": "mjobs"}`（顺手把 `ySlope` 的 `domain` 改成取自 `ranked`）。
   你会看到 8 条几乎平行的线——**名次图之所以有用，正是因为它把量级差异压掉、只留相对位置**。
2. **拖 `yearFrom` / `yearTo` 到 2008 → 2010**：斜率图会切到金融危机那两年，
   `ySlope` 的 domain 自动收缩，建筑业变成 −23%。再把两个滑块拖到同一年，
   看看 `pct` 全变成 `+0%`、线退化成一个点（`filter` 后每类只剩一行）。
3. **换 `interp`**：`step-after` 把名次画成阶梯，语义上其实更准确（名次是按年离散的），
   `basis` 会让曲线不穿过节点——顺便体会一下「好看」和「诚实」的取舍。
4. **让排名口径反过来**：把 `window` 的 `sort.order` 改成 `"ascending"`，
   名次就变成「从小到大」；配色和图例顺序不会跟着乱，因为 `color` 的 `domain` 是写死的 8 个名字。
5. **加第 9、第 10 个行业**：在 `raw.format.parse`、`long` 的 `fold.fields`、
   `industryNames` 三处各加一行（比如 `transportation_and_warehousing` / `other_services`），
   `color.domain` 也补上。名次轴会自动长出「第 9 名」「第 10 名」——
   `domain` 取自数据，不用改任何刻度设置。

## 参考

* `window` 变换（含 `rank` / `first_value` / `frame` 参数表）：<https://vega.github.io/vega/docs/transforms/window/>
* `fold` 变换（宽表转长表）：<https://vega.github.io/vega/docs/transforms/fold/>
* `aggregate` 变换（`argmin` / `argmax` 返回整条元组）：<https://vega.github.io/vega/docs/transforms/aggregate/>
* `lookup` 变换：<https://vega.github.io/vega/docs/transforms/lookup/>
* `collect` 变换（分面内排序）：<https://vega.github.io/vega/docs/transforms/collect/>
* `label` 变换（自动标签避让，本项目无头环境下不可用）：<https://vega.github.io/vega/docs/transforms/label/>
* `point` 比例尺与 `padding` / `reverse`：<https://vega.github.io/vega/docs/scales/#point>
* `group` mark（子画布、局部坐标系、内嵌 axes/data）：<https://vega.github.io/vega/docs/marks/group/>
* `line` mark 与 `interpolate`：<https://vega.github.io/vega/docs/marks/line/>
* `text` mark（`align` / `dx` / `dy` / `offset`）：<https://vega.github.io/vega/docs/marks/text/>
* 坐标轴自定义（`encode.labels` 改刻度文字）：<https://vega.github.io/vega/docs/axes/>
* 图例（`symbolType: "stroke"` / `titleLimit`）：<https://vega.github.io/vega/docs/legends/>
* 数据格式与 `format.parse`：<https://vega.github.io/vega/docs/data/#format>
* 事件流选择器（`@markName:mouseover`）：<https://vega.github.io/vega/docs/event-streams/>

## 与 matplotlib 的对照

**Vega 这边靠什么把这张图「说」出来**

| 这张图的组成部分 | Vega 的语法元素 | matplotlib / seaborn 要做什么 |
| --- | --- | --- |
| 宽表转长表 | `fold` 变换 | pandas `melt`（还算省事，但它是图外的一步预处理，不是图的一部分） |
| 每年的名次 | `window` + `rank` | `df.groupby('year')['jobs'].rank(ascending=False)`，同样是画图前的预处理 |
| 相对起点的变化 | `window` + `frame:[null,null]` + `first_value` | `groupby('industry').transform('first')` 再手算差值 |
| 第 1 名在最上 | `point` 比例尺 `range: [0, panelH]` | `ax.invert_yaxis()`（这个 matplotlib 反而更短） |
| 两块坐标系不同的面板 | 两个 `group` mark，几何由 signal 推导 | `fig.add_gridspec` / `subplots`，也很直接 |
| 每个类别一条线 | `from.facet` 分面 + 一个 `line` mark | `for name, g in df.groupby('industry'): ax.plot(...)`，手写循环 |
| 两端标类别名 | `argmin`/`argmax` + `text` mark | 手动 `df.loc[df.year == df.year.min()]` 再逐行 `ax.annotate` |
| 数值格式化 | `format(datum.mjobs, '.1f')` | f-string，差不多 |
| 悬停高亮联动 | 一个 `focus` signal + 两处 `strokeOpacity` 表达式 | matplotlib 得写 `mpl_connect('motion_notify_event', …)` 回调、
自己做命中测试、自己重设每条线的 alpha、自己 `draw_idle()`；静态导出（PNG/PDF）里这功能直接消失 |
| 换比较区间重画 | 两个 `bind: range` 滑块，数据流自动重算 | `matplotlib.widgets.Slider` + 回调里重算 DataFrame 再重画，
或者上 ipywidgets（要 notebook 环境） |

**说实话，谁更省事**

* **matplotlib 更省事的地方**：`invert_yaxis()` 一行搞定的事，Vega 要想清楚
  `range` 数组的方向；两三行 `ax.plot` 循环就能出 8 条线，不用理解 `facet` 与 `collect`；
  如果只是要一张扔进论文的 PNG，matplotlib 从 DataFrame 到出图的路径确实更短。
  另外像本例的标签避让，Python 生态有 `adjustText` 这种成熟包（`pip install adjusttext` 一行），
  比往码表里手填 `dyLeft`/`dyRight` 优雅得多。
* **Vega 更省事的地方**：`rank`、`first_value`、`argmin` 这些「预处理」在 Vega 里
  **是图的一部分**，写在 `data.transform` 里。所以拖动年份滑块时，
  filter → window → formula → scale domain → mark → 标签文字**整条链自动重算**，
  一行胶水代码都不用写；matplotlib 里这些都在图外，交互就意味着「回调里重跑 pandas 再重画」。
  两个面板共享 `color` 比例尺与图例、悬停联动高亮同样几乎零成本。
* **本质区别**：matplotlib 的产物是**一张图**，Vega 的产物是**一个数据流 + 一套映射规则**。
  一次性静态出图，前者更快；要交互、要嵌网页、要让别人改参数自己看，后者的边际成本低得多。
  而 bump / slope 这两种图型两边都**没有内置函数**——都得自己组装，
  差别只在「组装的是数据流还是绘图调用」。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/39-bump-slope-chart/
```

无头校验：

```sh
node tools/validate.cjs 39
node tools/inspect.cjs 39 --rows 5
```
