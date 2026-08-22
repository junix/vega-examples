# 33 · 日历热力图：一格一天的年度网格

GitHub 贡献图那种图：**一个小方块 = 一天**，横轴是「一年中的第几周」，纵轴是星期，
颜色编码当天的数值；四年数据做成四个上下堆叠的小倍图面板。

数据是 `assets/data/seattle-weather.csv`（西雅图 2012–2015 逐日观测，1461 行）。
可切换编码字段（最高气温 / 最低气温 / 降水量 / 风速）与配色方案。

## 学习目标

- 学会把「日期」拆成**离散网格坐标**：行 = 星期、列 = 第几周，全部用 `formula` + 日期表达式函数手算，
  不依赖任何比例尺定位；
- 搞清"一年的第几周"这个看似简单的口径里的三个坑：**`week()` 的边界定义**、
  **一周从周日还是周一开始**、**夏令时让"一天"不等于 86400000 毫秒**；
- 掌握小倍图的两种排版手法，并在同一个 spec 里对照：
  `group` mark + `facet`（面板内用局部坐标）与 **绝对 y 偏移**（跨面板的图元一次画完）；
- 学会用一条 `path` mark 画**月份分隔阶梯线**：折线的 `d` 在数据里用字符串拼出来，
  再靠 mark 的 `x`/`y` 平移到各年面板；
- 学会让 `width` / `height` 反过来由内容驱动：覆盖内建的 `width`/`height` 信号，
  并用 `length(data('years'))` 让面板数量完全由数据决定；
- 掌握连续色图例的定制：`scheme` 用 signal 切换，`encode.labels` 给刻度加单位。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/33-calendar-heatmap/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `title` | 动态标题 + 副标题 | `text`/`subtitle` 都是 signal 表达式，跟着 `metric` / `weekStart` / `yearSpan` 变 |
| `signals.metric` | 颜色编码哪个字段 | `bind.select` 的 `options` 是字段名、`labels` 是中文带单位；下游只靠 `datum[metric]` 一处取值 |
| `signals.palette` | 配色方案名 | 直接喂给 `scales.color.range.scheme`（`scheme` 支持 signal） |
| `signals.weekStart` | 一周从周几开始（0=周日，1=周一） | 同时进入**行号**和**列号**两个公式，切换时整张图重排 |
| `signals.cell / gap` | 网格步长与格间留白 | 格子实际边长 = `cell - gap`；`cell` 是整张图的唯一尺寸源 |
| `signals.gridCols / leftPad / bandH / panelGap` | 版面常量 | 54 列、左侧 82px（放年份 + 星期标签）、面板上方 20px（放月份名）、面板间 16px |
| `signals.panelH / panelStep / gridW` | 派生几何 | `panelH = 7 * cell`；`panelStep = panelH + bandH + panelGap` 就是相邻面板左上角的间距 |
| `signals.nYears / yearSpan` | 数据驱动的版面 | signal 的 `update` 里可以调 `data('years')`：面板数量、副标题的年份区间都由数据算出来 |
| `signals.width / height` | **覆盖内建信号** | spec 顶层的 `width`/`height` 本身就是信号，`signals` 里同名条目会与它合并；写上 `update` 就变成"尺寸由内容算" |
| `signals.valueFmt / legendFmt / unit / unitBare / metricLabel` | 文字与数字格式 | tooltip 保留数据本身的 0.1 精度；图例刻度温度取整、降水/风速留一位小数；单位后缀两处共用 |
| `data.weather` | 原始 CSV + 网格坐标 | `format.type: "csv"` 必写；`date` 用 `date:'%Y-%m-%d'` 解析（见下文"坑一"）；四条 `formula` 依次算出 `yr / doy / firstShift / row / col` |
| `data.years` | 每年一行 | `aggregate` 按 `yr` 分组 → `window` 的 `row_number` 给年份排序号 → `collect` 固定输出顺序 → `formula` 得到面板序号 `yIdx` |
| `data.cells` | 画格子用的数据 | `lookup` 把 `yIdx` join 回每一天；`formula` 把当前 `metric` 取到统一的 `value` 字段上，于是比例尺 domain 只需盯着 `value` |
| `data.month_edges` | 月份分隔阶梯线 | `filter` 留下每月 1 号（1 月除外）→ `formula` 把三段折线拼成 SVG path 字符串（公式见下文） |
| `data.month_labels` | 月份名 | 用每月 **15 号**所在的列当锚点，天然落在这个月的中间偏左 |
| `data.dow_labels` | 左侧 7 个星期标签 × 4 年 | Vega 的 `cross` 只能自乘、不能跨数据集，所以改用 `formula` 造 `[0..6]` 数组 + `flatten` 展平 |
| `scales.color` | 唯一的比例尺 | `linear` + `range.scheme` 为 signal；`nice: true` 让图例刻度落在整数上。注意：位置一个比例尺都没用到 |
| `legends[0]` | 连续色渐变图例 | `orient: "none"` + `legendX/legendY` 精确落位到网格下方；`encode.labels.update.text` 给每个刻度加单位 |
| `marks[0]`（group） | 每年一个面板 | `from.facet` 按 `["yr","yIdx"]` 分面；group 自身的 `x/y` 就是面板左上角，内部格子只用面板局部坐标 |
| `marks[0].marks[0]`（rect） | 一天一个圆角方块 | `x = col*cell + gap/2`、`y = row*cell + gap/2`；只有 `fill` 走比例尺 |
| `marks[1]`（path） | 月份阶梯线 | `path` 字段是局部坐标下的折线，`x/y` 负责平移到对应年份的面板 |
| `marks[2..4]`（text） | 月份名 / 星期标签 / 年份标签 | 都用绝对坐标 `datum.yIdx * panelStep + bandH + …`，一个 mark 把四年的标签一次画完 |

### 关键概念一：行列坐标是怎么算出来的

四条 `formula` 就是整张图的全部布局逻辑：

```
yr         = year(datum.date)
doy        = floor((datum.date - datetime(yr, 0, 1)) / 86400000 + 0.5)     // 0 基的一年中第几天
firstShift = (day(datetime(yr, 0, 1)) - weekStart + 7) % 7                 // 1 月 1 日在它那一列的行号
row        = (day(datum.date)         - weekStart + 7) % 7                 // 行 = 星期
col        = floor((doy + firstShift) / 7)                                 // 列 = 第几周
```

为什么 `col` 是这个式子？把网格按**列优先**读：第 0 列从 1 月 1 日开始，
但 1 月 1 日不一定落在这一列的第 0 行——它落在第 `firstShift` 行，
于是这一列左上方空出 `firstShift` 个格子。把这些"虚拟格子"补进去，
第 `doy` 天在整个网格里的线性序号就是 `doy + firstShift`，除以 7 取整即列号、取余即行号。
可以验证 `(firstShift + doy) mod 7` 恒等于 `row`，所以
`col = (doy + firstShift - row) / 7 = floor((doy + firstShift) / 7)`，两个式子自洽。

`gridCols = 54` 的来历：最坏情况是闰年（`doy` 最大 365）且 1 月 1 日恰好落在一周最后一天
（`firstShift = 6`），此时 `col` 最大 `floor(371 / 7) = 53`，加上第 0 列共 54 列。
本数据集里 2012 年（闰年、1 月 1 日是周日、`weekStart = 1` 时 `firstShift = 6`）正好命中这个上界。

### 关键概念二：三个"第几周"的坑

**坑一：`'2012-01-01'` 不能用 `parse: {"date": "date"}`。**
`"date"` 走的是 JS `Date.parse`，而只有日期没有时间的 ISO 串按规范解析成 **UTC 午夜**。
本机时区是 `America/Los_Angeles`（UTC−8），于是 `new Date('2012-01-01')` 是
`2011-12-31 16:00` 本地时间，`year()` 给 2011、`date()` 给 31 ——整张图会整体错一天，
而且 1 月 1 日会被算进上一年的面板。写成 `"date:'%Y-%m-%d'"` 走 d3 的 `timeParse`，
按**本地时区午夜**解析，本地日期访问器（`year/month/date/day`）才自洽。
（想全程用 UTC 也可以：`"utc:'%Y-%m-%d'"` 配 `utcyear/utcmonth/utcdate/utcday`，
但**不能混用**——本 demo 选了"本地解析 + 本地访问器"这一套。）

**坑二：不要直接用 `week()` 当列号。**
Vega 的 `week(d)` 实现是 `timeSunday.count(该年1月1日 - 1ms, d)`，
即"从 1 月 1 日（含）到 d 之间有几个周日"。当 1 月 1 日**本身就是周日**时，
它自己就被数进去，整年比别的年份多 1：

| 年份 | 1 月 1 日星期 | `week(1月1日)` | `week(12月31日)` |
| --- | --- | --- | --- |
| 2012 | 周日 | **1** | **53** |
| 2013 | 周二 | 0 | 52 |
| 2014 | 周三 | 0 | 52 |
| 2015 | 周四 | 0 | 52 |

四个面板叠在一起时，2012 年会整体右移一列，月份分隔线跟着错位——这正是本 demo
自己算 `col` 而不用 `week()` 的原因。另外 `week()` 的周起始日**写死是周日**，
`isoweek()` 写死是周一（且是 1 基、还带跨年周语义：1 月 1 日可能属于上一年的第 52/53 周），
两者都不接受"周起始日"参数，所以想让 `weekStart` 可切换只能自己算。

**坑三：一天不总是 86400000 毫秒。**
`(datum.date - 年初) / 86400000` 在有夏令时的时区里会掉精度：3 月的"春季前跳"让某一天只有
23 小时，于是 3 月之后所有天的商都比整数小 1/24，`floor` 直接把它们全体减 1。
本 demo 的 `+ 0.5` 就是在做四舍五入（容差 ±12 小时，足够吸收 1 小时的偏移）。
`inspect.cjs` 的输出里能看到这件事的痕迹：1 月的行是 `08:00:00Z`（UTC−8），
4 月之后变成 `07:00:00Z`（UTC−7）。把 `+ 0.5` 删掉实测一下：
2012-04-01 的 `doy` 会算成 90（正确是 91），于是 3 月 31 日和 4 月 1 日**叠在同一个格子上**，
之后整年整体退后一天。

想绕开这个坑，可以直接用 Vega 基于 `d3-time` 的日历函数 `dayofyear()`——
它是 `timeDay.count()` 封装，天数按日历边界数、与时长无关，但**从 1 开始计数**，
所以要写成 `dayofyear(datum.date) - 1` 才能接上本例 0 基的 `doy`
（实测两种写法的列号完全一致）。本 demo 保留手算是为了把这个坑摊开讲。

### 关键概念三：月份分隔线是一条三段折线

日历网格是列优先排列的，所以"上个月"和"这个月"在图上不是被一条直线分开，而是一道**阶梯**。
设某月 1 号落在第 `c` 列第 `r` 行，则"该月及以后"的格子集合 =
`{列 > c}` ∪ `{列 = c 且行 ≥ r}`，它与"上个月"的公共边界恰好由三段组成
（下面用格数为单位，乘 `cell` 得像素）：

```
① 竖线  x = c+1，y 从 0 到 r      —— 分开 (c, 0..r-1)[上月] 与 (c+1, 0..r-1)[本月]
② 横线  y = r，  x 从 c 到 c+1    —— 分开 (c, r-1)[上月]   与 (c, r)[本月]
③ 竖线  x = c，  y 从 r 到 7      —— 分开 (c-1, r..6)[上月] 与 (c, r..6)[本月]
```

三段首尾相接，于是可以写成一条 path：

```
M (c+1)*cell, 0
L (c+1)*cell, r*cell
L  c   *cell, r*cell
L  c   *cell, 7*cell
```

`r = 0` 时前两段退化成零长度，整条 path 自动变成"第 `c` 列左侧一条完整竖线"——不需要特判。
1 月被 `filter` 掉了，因为它的"上个月"在上一年，边界就是网格自身的左边框。
`formula` 里用 `round()` 把坐标取整，避免 `cell` 为奇数时出现 `6.5` 之类的半像素（视觉上更利）。

### 关键概念四：小倍图的两种排法，本例都用了

- **`group` mark + `facet`**：`from.facet` 按 `["yr","yIdx"]` 把 `cells` 切成四份，
  每份进一个 group。group 的 `x/y` 一算好，内部 1461 个格子就只需要写
  `datum.col * cell`——**局部坐标**是 group mark 最大的好处（还顺手拿到了面板底色和边框）。
  注意分面字段里带上了 `yIdx`：facet 的 group datum 只有 `groupby` 里列出的字段，
  少写一个就拿不到面板序号。
- **绝对 y 偏移**：月份线、月份名、星期标签、年份标签都是**跨面板一次画完**的顶层 mark，
  位置写成 `datum.yIdx * panelStep + bandH + …`。这样每类装饰只有一个 mark、
  一个数据集，`validate.cjs` / `inspect.cjs` 也能直接看到它们的行数
  （group 内部的局部 data 是看不到的）。

两种做法可以在一个 spec 里共存，因为它们最终都落在同一个根 group 的坐标系里。

### 关键概念五：让画布尺寸由数据和参数反推

spec 顶层的 `width` / `height` 本身就是**内建信号**，`signals` 数组里出现同名条目时
Vega 会把两者合并（顶层值当 `value`，你写的 `update` 当更新表达式）。于是可以写：

```json
{ "name": "width",  "update": "leftPad + gridW + 4" }
{ "name": "height", "update": "max(nYears, 1) * panelStep + 64" }
```

配合 `"autosize": {"type": "pad"}`（不是 `"fit"`——`fit` 会反过来改写 width/height），
拖动 `cell` 滑杆就是整图等比缩放；数据里多一年，画布自动长高一格面板。
`nYears` 用 `length(data('years'))` 取值：signal 的 `update` 表达式里允许调 `data()`，
Vega 会自动建立依赖，数据加载完成后信号会重算并触发重排。

## 试一试

1. **看清坑二**：把 `data.weather` 里 `col` 的公式换成 `"week(datum.date)"`。
   2012 年那一行会整体右移一列、月份阶梯线与格子错开——这就是四个面板不再对齐的样子。
2. **换周起始日**：把 `weekStart` 切到「周日起」。左侧星期标签、每年首日所在的行、
   月份阶梯线的形状会一起变；顺便看 2012 年的列数从 54 掉回 53。
3. **换编码字段**：切到「降水量」。你会看到绝大多数格子挤在色带最暗的一端——
   降水是强右偏分布。把 `scales.color` 的 `"type": "linear"` 改成 `"sqrt"` 或 `"symlog"`，
   低值区立刻拉开（注意 `sqrt` 不能用于会出现负值的 `temp_min`）。
4. **月份名换位置**：把 `data.month_labels` 的 `filter` 从 `date(datum.date) === 15`
   改成 `=== 1`，标签就锚到每月 1 号那一列，与阶梯线严格对齐（但相邻月份可能挤在一起）。
5. **只画一年**：给 `data.weather` 加一条 `{"type": "filter", "expr": "datum.yr === 2015"}`。
   因为 `height` 由 `nYears` 推导，画布会自动缩成一个面板高——不用改任何尺寸常量。
6. **加"当年排名"图层**：在 `cells` 后面接一个 `window` 变换算出每年内的
   `rank`（按 `value` 降序），再把当年最热的 5 天用 `stroke` 高亮出来。

## 参考

- [Formula 变换](https://vega.github.io/vega/docs/transforms/formula/) ·
  [Aggregate](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [Window](https://vega.github.io/vega/docs/transforms/window/) ·
  [Lookup](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [Flatten](https://vega.github.io/vega/docs/transforms/flatten/) ·
  [Collect](https://vega.github.io/vega/docs/transforms/collect/) ·
  [Filter](https://vega.github.io/vega/docs/transforms/filter/)
- 日期与时间表达式函数（`year` / `month` / `date` / `day` / `datetime` / `week` / `isoweek` /
  `dayofyear` / `timeFormat`）：[Expressions · Date-Time Functions](https://vega.github.io/vega/docs/expressions/#datetime-functions)
- 标记：[Rect](https://vega.github.io/vega/docs/marks/rect/) ·
  [Path](https://vega.github.io/vega/docs/marks/path/) ·
  [Text](https://vega.github.io/vega/docs/marks/text/) ·
  [Group](https://vega.github.io/vega/docs/marks/group/)
- [比例尺（Linear / scheme）](https://vega.github.io/vega/docs/scales/) ·
  [配色方案一览](https://vega.github.io/vega/docs/schemes/) ·
  [图例（gradient / orient:none / encode）](https://vega.github.io/vega/docs/legends/)
- [Signals（含覆盖内建 width/height）](https://vega.github.io/vega/docs/signals/) ·
  [Autosize](https://vega.github.io/vega/docs/specification/#autosize)
- 数据格式与 `parse`：[Data](https://vega.github.io/vega/docs/data/) ·
  [Format](https://vega.github.io/vega/docs/data/#format)
- 相关 demo：[15 层次布局](../15-hierarchies/)（多面板 + 手工几何）·
  [08 Reshape](../08-reshape-fold-pivot/)（`flatten` / `fold` 的其它用法）·
  [12 Tooltip 与图例](../12-hover-tooltip-legend/)

## 与 matplotlib 的对照

**Vega 侧靠什么语法元素把这张图说出来。**
日历热力图在任何库里都**没有内置图元**——它必须被"表达"出来。Vega 表达它的方式是：

| 需求 | Vega 里的写法 |
| --- | --- |
| 日期 → 行列坐标 | 4 条 `formula` 变换（声明在数据里，不是画图时算） |
| 每年一个面板 | `group` mark + `from.facet`，或顶层 mark 里的 `yIdx * panelStep` |
| 一天一个方块 | `rect` mark，`x/y/width/height` 直接是 signal 表达式 |
| 月份阶梯分隔 | `filter` 出每月 1 号 + `formula` 拼 path 字符串 + 一个 `path` mark |
| 颜色映射 | 一条 `linear` scale，`range.scheme` 绑 signal |
| 图例刻度带单位 | `legends[].encode.labels.update.text` |
| 切字段 / 切配色 / 切周起始日 / 缩放 | 6 个 `signals` + `bind`，**零行 JS** |
| 画布尺寸随内容变 | 覆盖 `width`/`height` 信号，`update` 里读 `data('years')` |

关键是：**位置一个比例尺都没用到**。这张图的 `scales` 只有一条，管颜色。
所有几何都是"数据字段 × signal"的算术，而 Vega 允许把这些算术写进数据管线（`formula`）
和编码通道（`{"signal": "..."}`），所以整张图仍然是一份**纯数据的声明**——
换字段、换配色、换周起始日、缩放格子，都是改一个 signal，Vega 自己决定哪些格子要重算重画。

**换成 matplotlib / seaborn 要付什么代价。**

- **行列坐标**：一样得自己算，而且得在 pandas 里算：
  `df['doy'] = (df.date - pd.Timestamp(year=y, month=1, day=1)).dt.days` 之类。
  好消息是 pandas 的 `dt.isocalendar().week` / `dt.dayofweek` 现成好用，
  且 `Timestamp` 相减是真正的日历运算，**不会踩夏令时的坑**（Vega 这边得自己 `+0.5`）。
  坏消息是 ISO 周号有跨年语义（1 月初可能返回 52/53），拿它直接当列号，
  同样会让某些年份错位——这个坑两边一模一样，只是名字不同。
- **网格**：`seaborn.heatmap` 要求数据是规整的 7×53 矩阵，得先
  `df.pivot(index='dow', columns='week', values='temp_max')` 并用 NaN 填补首尾残周；
  或者放弃 heatmap，用 `ax.add_collection(PatchCollection([Rectangle(...) for ...]))`
  自己摆 365 个矩形，颜色用 `cmap(norm(v))` 手动查表。前者省事但拿不到圆角、格间留白，
  也不好在格子上叠别的东西；后者灵活但要自己维护 `norm`（并且要记得 `ax.set_xlim/ylim`
  和 `ax.invert_yaxis()`，否则星期是倒的）。
- **多年小倍图**：`fig, axes = plt.subplots(4, 1)` 很自然，这一点比 Vega 的
  facet + 手算 `panelStep` 更省心——**matplotlib 在"若干个坐标系怎么摆"上确实更直接**。
- **月份阶梯线**：没有任何内置支持。得自己算出上面那三段线段，
  然后 `ax.plot(xs, ys)` 或 `ax.add_line(Line2D(...))`。公式一模一样，
  区别只是它写在 Python 循环里、每次改参数都要重跑整个脚本。
- **图例**：`fig.colorbar(mappable, ax=..., orientation='horizontal')`，
  单位要 `cbar.set_label('最高气温 (°C)')`、刻度格式要
  `cbar.formatter = FuncFormatter(lambda v, _: f'{v:.0f} °C')` 再 `cbar.update_ticks()`。
  能做，但"给刻度标签加单位"这件事在 Vega 是一行 `encode`，在 matplotlib 是一个回调对象。
- **交互**：这是差距最大的一块。切字段/切配色/切周起始日/缩放，在 Vega 里是
  `bind` 出来的四个控件、**一行 JS 都不用写**；matplotlib 里要么每次改常量重跑脚本，
  要么引入 `matplotlib.widgets.Slider/RadioButtons` 手写 `on_changed` 回调并
  `fig.canvas.draw_idle()`（且在 Jupyter 之外体验很差），要么改用 `ipywidgets` / Plotly / Bokeh。
  Tooltip 更是要么装 `mplcursors`，要么改用别的库。
- **中文字体**：matplotlib 默认字体没有中文，得
  `plt.rcParams['font.sans-serif'] = ['PingFang SC']` 并处理负号显示；
  浏览器里这件事不存在。

**反过来 matplotlib 更省事的地方，也得诚实说：**

- 计算部分放在 pandas / numpy 里，能用真正的日历运算和向量化，比在 `formula` 表达式里
  拼字符串、凑 `+0.5` 舒服得多；调试也容易（可以 `print(df.head())`）。
- `subplots` 网格排版、`tight_layout`、`constrained_layout` 让"多面板互不重叠"几乎免费；
  Vega 这边 `leftPad` / `bandH` / `panelGap` 全是自己数出来的像素。
- 出版级输出（矢量 PDF、指定 DPI、精确物理尺寸、LaTeX 数学）是 matplotlib 的主场。
- 想画的东西越"不像图表"（自定义投影、注释箭头、复杂 hatch），命令式 API 越舒服；
  Vega 的声明式语法在"必须逐个图元特判"的场合会变成负担。

一句话：**几何都要手算，两边都逃不掉；差别在于手算的结果放在哪里。**
Vega 把它放进数据管线和编码表达式，于是"参数—重算—重画"这条链子由运行时自动维护，
交互和响应式尺寸是免费附赠的；matplotlib 把它放进一次性的 Python 脚本，
换算得舒服、排版得省心，但每改一个参数就是重跑一遍脚本，交互得另请高明。
