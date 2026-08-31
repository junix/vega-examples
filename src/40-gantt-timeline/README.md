# 40 · 甘特图与历史时间线：区间条、依赖箭头与错行标签

一份 spec、两块面板，讲「区间」这类数据的两种画法：

* **① 项目计划甘特图** —— 横轴是 `time` scale、纵轴是 `band` scale，
  一条任务 = 一个 `rect`（`x`/`x2` 各接一端）。上面叠进度条、虚线依赖折线、
  三角箭头、菱形里程碑，和一条可以拖的「今天线」。
* **② 英国君主在位时间线** —— 12 位君主的在位区间，
  按 `index % rowCount` **交替错行**，把「标签互相压住」这个老问题用一条 `formula` 解决。

两块面板都只有一个共同主题：**区间数据 = 两个端点，而不是一个点**。
散点、折线、柱状图的每一行都对应一个位置；区间条的每一行对应**一段**，
于是宽度为 0 的行（里程碑、`start === end` 的 George IV）就成了必须专门兜底的边界情况。

## 学习目标

读完这一个 demo，你应该能回答：

1. **怎么画区间条**：`rect` 的 `x` 与 `x2` 分别接区间两端，`y` 接 band、`height` 接
   `bandwidth()`。这和柱状图 `y2: {"value": 0}` 的写法只差一个「另一端是不是常数」。
2. **怎么画依赖箭头**：`lookup` 的 `from` 可以指向**表自己**（自连接），
   把前置任务的 `end` 接过来；再在数据流里用 `scale()` / `bandwidth()`
   把四个端点算成像素，最后 `path` mark 只做字符串拼接。
3. **为什么可以在数据变换里调 `scale()`**：Vega 的解析顺序是
   initScale → parseData → parseScale，所以 `formula` 里 `scale('gx', datum.end)` 合法。
   但要小心**循环依赖**——本例 `scale('ty', …)` 必须写在 `monarchs-laid` 而不是
   `monarchs` 里，因为 `ty` 的 domain 就取自 `monarchs`。
4. **零宽度区间怎么办**：`start === end` 的任务改画菱形 `symbol`（矩形会缩成零宽度）；
   时间线上 George IV（1820–1820）则用 `max(scale(end), x0 + 3)` 兜一个 3px 的最小宽度。
5. **错行怎么做**：`datum.index % rowCount` 一条 `formula`，配一个
   `sequence` 变换现生成 0…rowCount-1 的轨道行。把 `rowCount` 拖到 1 就能看见
   君主名字挤成一坨——这就是错行存在的理由。
6. **年份轴必须写 `"format": "d"`**：`ty` 是 `linear` scale，默认格式带千分位，
   1565 会显示成 `1,565`。这是本仓库最常见的低级错误之一。

## 数据来源

| 数据集 | 来源 | 行数 | 说明 |
| --- | --- | --- | --- |
| `gantt-tasks` | 内联 `values` | 11 | 手写的 2026 Q2 小项目计划；`format.parse` 把 `start`/`end` 从 `"2026-03-02"` 解析成 Date；一个 `formula` 判 `isMilestone` |
| `gantt-bars` | ← `gantt-tasks` | 9 | `filter` 掉里程碑 |
| `gantt-milestones` | ← `gantt-tasks` | **2** | Sign-off（05-04）与 GA launch（05-29） |
| `gantt-deps` | ← `gantt-tasks` | 10 | `filter(depends != null)` → **自连接 lookup** → 五个 `formula` 算折线端点 |
| `monarchs` | `monarchs.json` | 12 | 1565–1820 的英国君主；`start`/`end` 是**年份数字**不是日期；Cromwell 那行带 `commonwealth: true` |
| `monarchs-laid` | ← `monarchs` | 12 | 全部手工几何：`x0`/`x1`/`wpx`/`cx`/`yc`/`inside`/`labelX`/`labelAlign`/`yearText` |
| `tl-rows` | `sequence` 变换 | = `rowCount`（默认 3） | 错行轨道的浅色基线，随滑块增减 |

内联的项目计划是**编的**（一个虚构的图表项目），但它自洽：11 项任务、
依赖构成一棵有效的有向无环图、进度值与「今天线」默认位置（2026-04-16）互相对得上——
Wireframes 40%、Data pipeline 65%、Chart engine 5%，正好演示「进度条右端在今天线左边 = 落后」。
`monarchs.json` 则是真实数据（与 Vega 官方示例库同源）。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `autosize: "none"` + 显式 `padding` | 关掉自动布局 | 两块面板的坐标全部写在 signal 里。代价是 **`padding.top: 52` 必须手工给标题让位**，否则标题被 viewBox 裁掉 |
| `signals`（布局组） | `ganttX` / `ganttW` / `tlX` / `tlW` / `panelTop` / `panelH` | 左面板留 118px 给任务名标签；两块面板各自的原点与尺寸 |
| `signals`（今天线） | `todayDay` / `today` / `todayText` | `today` = `time(datetime(2026, 2, 1)) + todayDay × 86400000`。**注意 `datetime` 的月份是 0 基**，`2` 表示 3 月 |
| `signals`（`elbow`） | 依赖折线的水平出腿上限 | 实际出腿 = `min(elbow, 间隙/2)`，所以任务背靠背时折线自动退化成一条竖线 |
| `signals`（`rowCount` / `tlPitch` / `tlBarH`） | 错行几何 | `tlPitch = panelH / rowCount`，拖 `rowCount` 时行距自动重算 |
| `data: gantt-tasks` | 内联计划表 | `format.parse` 用 `"date:'%Y-%m-%d'"`；`depends` 存前置任务的 `task` 名，是一张**自引用外键表** |
| `data: gantt-deps` | 依赖边 | `lookup` 的 `from` 指回 `gantt-tasks` 自己；`x1`/`y1`/`x2`/`y2`/`xm` 五个 `formula` 把端点算成像素 |
| `data: monarchs-laid` | 时间线几何层 | 11 个 `formula` 一层层算：像素起止 → 宽度 → 中心 → 行中心 → 名字放不放得下 → 贴边对齐 → 年份文字 |
| `data: tl-rows` | 轨道行 | `sequence` 变换，`stop: {"signal": "rowCount"}` |
| `scales: gx` | 甘特图时间轴 | `type: "time"`，`domain` 用 **`fields: ["start", "end"]`**（两列一起取 extent），`nice: "month"` |
| `scales: gy` | 任务轴 | `band`，domain 直接取数据顺序（数据已按 start 升序写好），于是依赖箭头总是自上而下 |
| `scales: ty` | 年份轴 | `linear` + **`zero: false`**（否则 1565 之前会多出 0–1565 一大段空白）+ `padding: 12` |
| `legends` | 两个 `orient: "none"` 图例 | `legendX`/`legendY` 手工定位到各自面板下方 |
| `marks[0..4]` | 面板标题、分隔线、两行脚注 | 直接用根坐标系里的 `text`/`rule`，比再套一层 group 简单 |
| `marks: ganttPanel` | 左面板 group | 内部 8 个子 mark：计划条 → 进度条 → 依赖折线 → 箭头 → 里程碑菱形 → 里程碑日期 → 进度百分比 → 今天线 + 标签 |
| `marks: timelinePanel` | 右面板 group | 4 个子 mark：轨道基线 → 区间条 → 名字 → 起止年 |

### 关键概念

- **区间 `rect` 的两个端点**：`{"x": {"scale": "gx", "field": "start"}, "x2": {"scale": "gx", "field": "end"}}`。
  写 `width` 而不是 `x2` 也行，但那样得自己算 `scale(end) - scale(start)`，
  而且 domain 一变就要重算——`x2` 让 scale 替你管。
- **`lookup` 自连接**：`"from": "gantt-tasks"` 和被变换的数据集同名，完全合法。
  Vega 的数据流是 DAG，`gantt-deps` 依赖 `gantt-tasks` 的**输出**，不构成环。
  这是「画依赖关系」最省事的写法：不需要预先把边表拆出来。
- **数据变换里用 `scale()` 的边界**：能用，但**被引用的 scale 不能反过来依赖这个数据集**。
  本例 `gx`/`gy` 的 domain 取自 `gantt-tasks`，而 `scale('gx', …)` 写在 `gantt-deps` 里
  （下游数据集），所以没问题；`ty` 的 domain 取自 `monarchs`，所以
  `scale('ty', …)` 必须写在 `monarchs-laid` 里。搞反了会在运行期抛
  `Cycle detected in dataflow graph`（见「试一试」第 7 条）。
  更阴的是**把 scale 名拼错**：那既不报错也不 WARN，只静静返回 `undefined` → 全图 NaN。
- **`bandwidth('gy')` 是表达式函数**，可以在 `signal` 里直接调，用来给进度条内缩
  （`max(bandwidth('gy') - 6, 2)`）和把菱形放在带宽中点。
- **`datetime(y, m, d)` 的月份是 0 基**（跟 JS 的 `Date` 一致）：
  `datetime(2026, 2, 1)` 是 **2026-03-01**。这条每次都要重新确认一遍。
- **折线的「肘」**：`xm = x1 + min(elbow, (x2 - x1) / 2)`。
  取 `min` 是为了让两任务紧邻时（`x2 - x1` 很小）出腿不会越过终点，
  折线自动退化成一条竖线而不是画出一个回头钩。
- **零宽度的三种兜底**：里程碑换 `symbol`（菱形）；
  George IV 用 `max(scale(end), x0 + 3)` 保 3px；
  窄条的名字用 `inside` 判定抬到条外、年份文字用 `wpx > 38` 直接留空。
  **凡是「宽度编码数值」的图，都要想清楚数值为 0 时画什么。**
- **`format: "d"` 与 `format: "%m-%d"`**：年份轴是 `linear`，用 d3-format 的 `d`；
  日期轴是 `time`，用 d3-time-format 的 `%m-%d`。两套格式化语言，别串。
- **进度百分比用 `format(datum.progress, '.0%')`**：直接写 `datum.progress * 100 + '%'`
  会得到 `5.000000000000001%` 这类字符串，校验器的浮点检查会抓到。

## 试一试（改练）

1. **拖 `todayDay`**（0–92 天）：看进度条右端与红色今天线的相对位置。
   `Chart engine` 只做了 5%，把今天线拖到 5 月中旬就能看出它落后多少。
2. **把 `elbow` 拖到 0**：所有依赖折线退化成「直角两段」；拖到 40，
   看紧邻任务（Kickoff → Interviews，间隙只有 4.6px）的折线**并没有**跟着变长——
   `min(elbow, 间隙/2)` 在起作用。
3. **把 `rowCount` 拖到 1**：12 位君主全挤在一行，名字互相压住、
   `inside` 判定几乎全为 false。再拖回 3。**这是本 demo 最值得看的一次对比。**
4. **把 `ty` 的 `format: "d"` 删掉**：年份立刻变成 `1,565` / `1,600`。
   这是 AGENTS.md「数字与日期一律显式格式化」那条的活例子。
5. **把 `ty` 的 `zero: false` 删掉**：domain 变成 `[0, 1820]`，
   所有君主被压到最右边 14% 的宽度里。
6. **把 `gantt-milestones` 的菱形改回 `rect`**（`x`/`x2` 都接 `start`）：
   两个里程碑直接消失——零宽度矩形什么都不画，而且**不报任何 WARN**。
7. **把 `x0` / `x1` 那两个 `formula` 从 `monarchs-laid` 挪回 `monarchs`**：
   `vega.parse` 能过，但 `runAsync()` 直接抛
   `Error: Cycle detected in dataflow graph.`（实测；日志里一条 WARN 都没有，
   `tools/validate.cjs` 报的是「View 无头运行失败」）。
   这就是「为什么要分两层数据集」最直白的答案：`ty` 的 domain 取自 `monarchs`，
   而 `monarchs` 又想用 `ty`，环就成了。
8. **给 `gantt-tasks` 加一行**，让它依赖一个**不存在**的任务名：
   `lookup` 默认 `default: null`，`fromEnd` 会是 `null`，
   `scale('gx', null)` 得到 `NaN`，path 字符串变成 `M NaN,...`。
   加一句 `{"type": "filter", "expr": "datum.fromEnd != null"}` 修好它——
   顺便体会为什么 AGENTS.md 说「`lookup` 的 `default: null` 当外连接，判空要用 `!= null`」。
9. **把君主名的 `inside` 阈值** `length(name) * 5.8 + 8` 里的 5.8 改成 4：
   更多名字被判定为「放得下」，然后就会溢出条外。5.8 是按 10px 字号的中文/拉丁混排估的，
   改字号就要跟着改——这正是「手工排版」的代价（见下一节）。

## 与 matplotlib 的对照

matplotlib 没有甘特图，也没有时间线；两块面板都要从 `barh` 手工搭：

| 本 demo 的做法 | matplotlib 的做法 | 差距在哪 |
| --- | --- | --- |
| `rect` 的 `x` / `x2` 各接一端 | `ax.barh(y, width=end-start, left=start)` | matplotlib 只有 `left` + `width`，**必须自己做减法**；换了轴范围或单位就要重算。Vega 是两个端点各自过 scale |
| `time` scale + `nice: "month"` + `tickCount: {"interval": "week", "step": 2}` | `ax.xaxis_date()` + `mdates.WeekdayLocator(interval=2)` + `DateFormatter` | 功能对等，但 matplotlib 要装配 Locator/Formatter 两个对象；Vega 是 scale 的两个属性 |
| `band` scale 排任务 | `ax.set_yticks(range(n))` + `set_yticklabels(...)` | matplotlib 的 y 是数字位置，band 的 `paddingInner`/`paddingOuter` 得自己换算成 `height=0.62` 这类魔数 |
| 自连接 `lookup` + `path` mark | 自己写循环：查前置任务 → 算四个点 → `ax.plot` | **量级差别**：Python 侧是过程式的 for 循环，任务表一变就整段重跑；Vega 侧是数据流节点，上游 `filter` 一变依赖边自动重算 |
| 箭头 `symbol` + `triangle-right` | `ax.annotate(..., arrowprops=dict(arrowstyle='->'))` | matplotlib 的 annotate 更强（自动避让、多种箭头样式），但它是**一次一个**，画 10 条要循环 10 次 |
| `index % rowCount` 错行 | 一样要自己算，`ax.text(x, row_offset, ...)` | 这条 matplotlib 不吃亏——错行本来就是手工几何。区别只是 Vega 把它写成 `formula` 留在数据里，可以被 tooltip、hover 复用 |
| `inside` / `labelAlign` 自适应标签 | `adjustText` 第三方库，或自己量 `renderer.get_text_width` | matplotlib **能**拿到真实文字尺寸（`Text.get_window_extent`），这一点比 Vega 表达式里的 `length(name) * 5.8` 估算更准；代价是必须先画一遍才能量 |
| 拖 `rowCount` / `elbow` / `todayDay` 实时重算 | 重跑脚本，或上 `ipywidgets` | 声明式数据流的老优势：**参数是图的一部分** |

诚实的结论：**这张图 matplotlib 画得出来，而且文字避让还能做得更准**——
它有真实的 renderer 可以量字宽。Vega 赢在两处：一是**依赖边的自连接**
（`lookup` 一句 vs. 一段循环），二是**参数化**（三个滑块背后是整条数据流重算，
不是重跑脚本）。如果只出一张静态 PNG 且任务表不会变，`barh` + 循环完全够用。

## 参考

- 官方文档：[Scales · Band](https://vega.github.io/vega/docs/scales/#band) ·
  [Scales · Time](https://vega.github.io/vega/docs/scales/#time) ·
  [lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [sequence 变换](https://vega.github.io/vega/docs/transforms/sequence/) ·
  [Path mark](https://vega.github.io/vega/docs/marks/path/) ·
  [表达式函数 · scale / bandwidth](https://vega.github.io/vega/docs/expressions/)
- 格式化：[d3-format](https://github.com/d3/d3-format)（`"d"` / `".0%"`）·
  [d3-time-format](https://github.com/d3/d3-time-format)（`"%m-%d"`）
- 同集相关：[05 分组柱状图](../05-stacked-grouped-bar/)（band + group 的作用域陷阱）、
  [07 表连接](../07-lookup-joins/)（`lookup` 的基础用法）、
  [47 蛇形时间线](../47-serpentine-timeline/)（同样是时间线，但走几何参数化）
- 数据出处：`monarchs.json`（英国君主在位年份，与 Vega 官方示例库同源）；
  项目计划为教学用虚构数据
