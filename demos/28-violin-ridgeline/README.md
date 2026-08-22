# 28 · 小提琴图与山脊线图：核密度的两种画法

同一个 `kde` 变换，换一种几何映射就是两张完全不同的图：

```
                       ┌─ area(orient=horizontal) + 对称 x/x2  →  ① 小提琴（一列一个组）
kde(groupby, field) ───┤
   每组一条密度曲线      └─ area(orient=vertical) + 基线错行 y/y2 →  ② 山脊线（一行一个组）
```

两张图都要解决同一个问题：**密度值（0.0001 量级）怎么变成像素**。答案是先在数据流里
把 density 归一化成 `w ∈ (0, 1]`，再让几何只跟 `w` 相乘 ——
小提琴乘的是「半个带宽」，山脊线乘的是「振幅」。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/28-violin-ridgeline/
```

## 学习目标

1. 用 `kde` 变换做**分组核密度估计**，并搞清它的六个关键参数：
   `groupby` / `bandwidth` / `counts` / `resolve` / `steps`（`minsteps`+`maxsteps`）/ `extent`。
   `bandwidth: 0` 表示自动估计，公式就是 R 的 `bw.nrd`：
   **1.06 · min(σ, IQR/1.34) · n<sup>-1/5</sup>**（见 `assets/vega.js` 的 `estimateBandwidth`）。
2. 看懂 `area` mark 的 **`orient`** 到底在说什么：它指定的是**哪个轴是自变量**。
   `vertical`（默认）= x 是自变量、`y`/`y2` 是区间；`horizontal` = y 是自变量、`x`/`x2` 是区间。
   小提琴要竖着长，所以必须 `orient: "horizontal"`。
3. 记住 **一个 `area`/`line` mark 只画一条连通路径**。要画 3 条小提琴、12 条山脊，
   必须用 `from: {facet: {...}}` 把数据拆成子组，每个子组内部再放一个 `area`。
4. 用**两次 `joinaggregate`**（一次带 `groupby`、一次不带）把「组内最大密度」与
   「全体最大密度」贴回逐行数据，从而用一个信号在三种归一化口径之间切换。
5. 掌握 encode 里的 **`offset` 可以吃表达式**这一招：
   `{"scale": "xcat", "field": "Species", "band": 0.5, "offset": {"signal": "..."}}`
   = 「先取分类带心，再推若干像素」，这是所有手工几何的粘合剂。
6. 明白山脊线的 **`rowStep`（行高）和 `amplitude`（振幅）是两个独立参数**，
   重叠量 = `amplitude / rowStep`；以及重叠图形的**遮挡关系完全由绘制顺序决定**。
7. 顺手学两个实用技巧：`point` 比例尺当「行基线发生器」、
   `luminance()` 按填充色亮度自动翻转描边色。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals: bwMass / resolveMode / widthMode / violinFill` | 小提琴的 4 个旋钮 | 前三个直接喂给 `kde` 的参数位（`bandwidth` / `resolve` / `counts`），第四个只参与几何 |
| `signals: bwTemp / rowStep / amplitude` | 山脊线的 3 个旋钮 | `rowStep` 决定「行在哪」，`amplitude` 决定「曲线多高」，互不影响 |
| `signals: tempPad / tempExtent` | 山脊线的取样域 | `tempPad = 3 · 带宽`；`tempExtent` 用 `data('temp-overall')[0].minT/maxT` 读回全年气温极值再左右各放宽 `tempPad` —— **signal 的表达式里可以调 `data()`**，所以取样域里没有一个写死的数字 |
| `signals: violinW / panelGap / ridgeW / panelH` | 布局派生量 | `ridgeW = width - violinW - panelGap`；`panelGap = 96` 是留给右面板**月份轴 + 轴标题**的宽度，不是纯留白 |
| `signals: ridgeBottom / ridgeTopRow` | 行基线的两个端点 | `ridgeBottom = panelH - 10`，`ridgeTopRow = ridgeBottom - 11 * rowStep` —— 12 行、11 个间隔 |
| `signals: bwMassLabel / bwTempLabel` | 图上文案 | `bwMass > 0 ? format(bwMass,'d') + ' g' : '自动'`，避免图上出现「bw = 0」这种误导 |
| `data: penguins → obs` | 清洗 | 先 `filter` 掉体重缺失的 2 行（否则 `null` 会被当 0 参与核平滑）；字段名带空格必须写 `datum['Body Mass (g)']`，顺手 `formula` 成短名 `mass` |
| `data: violin-density` | 核密度 + 归一化 | `kde` → `joinaggregate(groupby: Species)` 得 `grpMax` → `joinaggregate`（**不带 groupby**）得 `allMax` → `formula` 算出 `w` |
| `data: violin-stats` | 箱线摘要 | 一个 `aggregate` 同时拿 `q1/median/q3/mean/max/count`；`max` 是给「n = …」标签定位用的 |
| `data: hourly` | 读 CSV | **必须**写 `"format": {"type": "csv"}`，还要 `parse` 出 `date:'%Y-%m-%dT%H:%M:%S'`（中间的 `T` 是字面量）与 `temperature: "number"`；漏掉 `parse` 则温度是字符串，`kde` 直接报废 |
| `data: month-stats` | 月度均温 | 给山脊填色与提示框用；同时是 `tempColor` 比例尺的 domain 来源 |
| `data: ridge-density` | 12 条密度 + 反查均温 | `kde(extent: tempExtent, steps: 200, resolve: "shared")` —— 官方文档推荐的「可堆叠密度」三件套 → 全体 `allMax` → `w` → `lookup` 把 `meanT` 贴回每一行（`area` 的 `fill` 只能读自己 datum 上的字段） |
| `data: temp-overall` | 全年均温 + 极值 + 行数 | 不带 `groupby` 的 `aggregate` 就是全体统计；`count` 用来把「8,759 小时」写活（CSV 首行是表头、首条数据从 01:00 开始，所以不是 8760）；`min`/`max` 供 `tempExtent` 算取样域 |
| `scales: xcat / yMass / species` | 左面板 | 位置比例尺的 `range` 一律写**显式区间**（`xcat` 写 `[0, {"signal": "violinW"}]`、`yMass` 写 `[{"signal": "panelH"}, 0]`），绕开 `range: "width"/"height"` 的作用域陷阱；`species` 只管配色，`range` 给 `scheme` |
| `scales: xTemp` | 右面板横轴 | domain 取 `ridge-density.value`（kde 的取样点，已含 `tempExtent` 的余量），`nice: true` 后是 0–28 °C；`tickCount: 10` 让刻度落在 2 °C 上而不是 5 °C 上 |
| `scales: rowY` | **行基线发生器** | `type: "point"`，domain 是 12 个月份名（按 `month` 数值排序），range `[ridgeTopRow, ridgeBottom]`，`padding: 0` |
| `scales: tempColor` | 温度色带 | `{"scheme": "magma", "extent": [0.15, 0.82]}` —— `extent` 掐掉了 magma 两端过黑与过白的部分 |
| `legends` | 两个 `orient: "none"` 图例 | 物种图例放左面板左上空白区，温度色带放右面板右上空白区（冷月的曲线都挤在左侧，右上天然是空的） |
| 页头 6 个 `text` mark | 每面板 3 行 | 标题 / kde 参数回显 / 图元含义；`x` 用 `violinW + panelGap` 定位到右面板 |
| `marks[小提琴面板]` | `group` + 局部信号 | `signals: [{name:"width"...},{name:"height"...}]` —— 见下面「作用域陷阱」 |
| 面板内 `group` + `from.facet` | 拆出每个物种 | `facet: {name: "one-violin", data: "violin-density", groupby: ["Species"]}`；子组不设 `x`/`y`，坐标与父面板一致，省掉一层换算 |
| `marks[area 小提琴]` | 对称展开 | `orient: horizontal`、`y = yMass(value)`、`x`/`x2` = 带心 ∓ 半宽 |
| `marks[rect/rule/symbol]` | 内嵌箱线摘要 | 深条 = IQR、白线 = 中位数、空心点 = 均值；均值与中位数错开就说明分布偏斜（Gentoo：均值 5076 > 中位数 5000，右偏）。提示框里分位数用 `,.4~f` 而不是 `,d` —— Chinstrap 的 Q1 是 3487.5，用 `,d` 会被静默四舍五入成 3,488 |
| `marks[text n = …]` | 每组样本量 | `y` 取该组 `maxMass` 再 `offset: -7`，标签跟着小提琴顶端走，不用手算 |
| `marks[山脊面板]` | 同样声明局部 `width`/`height` | 底轴 `grid: true` 的竖线长度取的是**作用域里的 height**，不声明就会按顶层 560 铺，探出面板 68px |
| 面板内 `group` + `from.facet` + `sort` | 拆出每个月 | `sort: {"field": "datum.month", "order": "ascending"}` 保证 12 月最后画、压在 11 月之上 |
| `marks[area 山脊]` + `marks[line 脊线]` | 面 + 上边缘 | 两个 mark 共用同一份 facet 数据与同一条 `y` 表达式；`line` 只画上边缘，是分开重叠行的关键 |
| `marks[rule/text 全年均温]` + `marks[symbol 月均温]` | 右面板的两条参考物 | 竖虚线 `y2: {"signal": "panelH"}` 贯穿面板；12 个圆点画在所有 facet 子组**之后**，才不会被后面的行盖住 |

### 关键概念一：密度 → 像素，全靠一个 `w`

`kde` 输出的 `density` 是概率密度，量级取决于数据单位（体重是 1e-4/g 量级），
直接当像素用毫无意义。所以数据流最后一步一定是归一化：

```jsonc
// 组内最大值（equal 口径用）
{ "type": "joinaggregate", "groupby": ["Species"], "fields": ["density"], "ops": ["max"], "as": ["grpMax"] },
// 全体最大值（count / density 口径用）—— 不带 groupby 就是全体
{ "type": "joinaggregate", "fields": ["density"], "ops": ["max"], "as": ["allMax"] },
{ "type": "formula", "expr": "widthMode === 'equal' ? datum.density / datum.grpMax : datum.density / datum.allMax", "as": "w" }
```

`joinaggregate` 与 `aggregate` 的差别就在这里：它不压缩行数，而是把组级统计量**贴回每一行**，
所以后面的 mark 编码里可以直接 `datum.w`。

满宽（`w = 1`）= `bandwidth('xcat') · violinFill` = 77.4 × 0.9 = **69.6 px**
（band 比例尺：`step = 300 / (3 − 0.18 + 2 × 0.18) = 94.3`，`bandwidth = 94.3 × 0.82 = 77.4`）。
三种口径的实测宽度（默认带宽下，单位 px）：

| `widthMode` | `counts` | 分母 | Adelie(151) / Chinstrap(68) / Gentoo(123) |
| --- | --- | --- | --- |
| `count` | `true` | 全体最大 | **69.6 / 42.5 / 49.2** —— 面积∝样本量，谁的样本多谁胖 |
| `density` | `false` | 全体最大 | 51.4 / **69.6** / 44.6 —— 每组积分都是 1，谁的分布集中谁瘦高 |
| `equal` | `false` | 组内最大 | 69.6 / 69.6 / 69.6 —— 只比形状 |

### 关键概念二：小提琴的几何

分类轴是 band 比例尺，一个组占一条「带」。曲线要以带心为轴对称展开：

```
半宽(px) = w · bandwidth('xcat') · violinFill / 2
x  = xcat(Species) + bandwidth/2 − 半宽        ← band:0.5 + 负 offset
x2 = xcat(Species) + bandwidth/2 + 半宽        ← band:0.5 + 正 offset
y  = yMass(value)                              ← 自变量轴
```

写成 spec 就是：

```jsonc
"x":  { "scale": "xcat", "field": "Species", "band": 0.5,
        "offset": { "signal": "-datum.w * bandwidth('xcat') * violinFill / 2" } },
"x2": { "scale": "xcat", "field": "Species", "band": 0.5,
        "offset": { "signal": "datum.w * bandwidth('xcat') * violinFill / 2" } }
```

三个要点：`band: 0.5` 取带心（`band` 是「带宽的百分比」）；`offset` 可以是**信号表达式**，
于是像素级微调不必另开一个比例尺；`bandwidth('xcat')` 是表达式函数，
所以几何自动跟随 `violinW`、band `padding` 的变化 —— 没有一个魔法数字。

### 关键概念三：山脊线的行高 vs 振幅

这是山脊线唯一需要想清楚的地方：**两个参数互相独立**。

```
基线_m   = rowY(monthName)                       ← point 比例尺，相邻两点相差 rowStep
y (顶)   = 基线_m − w · amplitude                 ← 只有这里用 amplitude
y2 (底)  = 基线_m                                 ← 面的下沿永远贴基线
重叠量   = amplitude / rowStep                    （单位：行）
```

- `rowStep` 只出现在 `rowY` 的 `range`：`[ridgeBottom − 11·rowStep, ridgeBottom]`。
  `point` 比例尺在 `padding: 0` 时把 n 个点均匀铺在 range 两端之间，步长 = 跨度 /(n−1) = `rowStep`。
- `amplitude` 只出现在 `y` 的 `offset` 里。
- 重叠量 = 1 表示「最高的峰刚好顶到上一行的基线」；默认 68/34 = **2.00**，
  即最高的峰盖过上面两行的基线。密度最大的 1 月与 12 月才有资格顶到 `amplitude`，
  其它月份按 `w` 比例缩短 —— 夏季气温跨度大、峰更平，一眼就能看出季节差异。

**遮挡关系靠绘制顺序**，不靠 zindex：facet 子组按 `sort: {"field": "datum.month"}` 升序生成，
1 月（最上一行）先画、12 月（最下一行）最后画，于是每一行都压在它上面那一行之上，
`fillOpacity: 0.95` 的不透明填充才能形成「山脊挡住远山」的效果。
把 `order` 改成 `descending`，图形立刻变成「后面的山挡住前面的山」，一眼就能看出区别。

### 关键概念四：`resolve` 与 `extent` —— 曲线的两端收在哪

| `resolve` | 取样域 | 效果 | 取样点数 |
| --- | --- | --- | --- |
| `independent`（默认） | 每组自己的 `[min, max]` | 小提琴两端正好收在该组极值处，形状最紧凑 | 自适应，`minsteps`~`maxsteps` 之间 |
| `shared` | 全体数据的 `[min, max]` | 各组共用一个栅格，可以逐列比较、相减 | 固定 `steps`（源码里就是 `minsteps = maxsteps = steps \|\| maxsteps`） |

小提琴把 `resolve` 留成信号，可以现场对比两种效果：切到 `shared`，Chinstrap 的小提琴会长出
一条细长的近零尾巴 —— 因为 Gentoo 的 6300 g 把取样域拉到了那里（三组的实测取样区间从
`[2850,4775] / [2700,4800] / [3950,6300]` 变成清一色的 `[2700,6300]`，点数从 78/104/102 变成 201/201/201）。

**但 `resolve` 只决定取样域是「各组的」还是「全体的」，两者都仍然卡在观测值上** ——
而端点处的密度并不为 0。小提琴因此两端各留一小段平口：Adelie 在自己的最小体重 2850 g 处
`w = 0.257`（17.9 px 宽），在最大体重 4775 g 处 `w = 0.138`（9.6 px）。
这正是 seaborn 里 `cut=0` 的效果，也是小提琴图的常见画法（只画观测范围内的密度），
所以左面板**故意不给** `extent` —— 一给 `extent`，`resolveMode` 信号就没得可切了
（源码里 `local = domain || extent(g)`，显式 `extent` 会把两种 `resolve` 的取样域都覆盖掉）。

山脊线不能这么将就：它靠曲线的高低差读季节，端点被截断会直接看成一道垂直断崖。
所以右面板补上第三个参数 **`extent`**：

```jsonc
{ "type": "kde", "field": "temperature", "groupby": ["month", "monthName"],
  "bandwidth": { "signal": "bwTemp" },
  "extent":    { "signal": "tempExtent" },   // 数据 [min,max] 两侧各放宽 3 个带宽
  "resolve":   "shared",                     // 12 组共用这一份栅格
  "steps":     200 }                         // 栅格点数也钉死
```

`extent + steps + resolve: shared` 就是官方文档点名的「可堆叠密度」三件套。
高斯核在 3 个带宽外只剩峰值的 1.1%，所以放宽 `3 · bandwidth` 足够把尾部压到 0：
不加 `extent` 时 12 月的曲线在最左端还有 `w = 0.524`（= 35.6 px，半个峰高）被垂直切掉，
加上之后 12 行的两端落差全部 ≤ 0.1 px（实测最大 `w = 0.0033`）。

代价要说清楚：`tempPad = 3 · (bwTemp > 0 ? bwTemp : 1)` 跟着带宽走，所以横轴会随 `bwTemp`
变宽：默认 0.8 时 `nice` 成 `[0, 28]`，拖到 1.5 是 `[-5, 30]`，拖到 3 是 `[-10, 35]` ——
西雅图当然没有 −10 °C 的正常值，但高斯核确实会把概率质量摊到数据范围之外，
而 Vega 的 `kde` 没有边界反射修正（见最后一节）。轴上出现负温本身就是「带宽拖太大」的信号。

### 作用域陷阱：group 里的 `range: "width"` 与 `grid: true`

两个面板都写了这么一段：

```jsonc
{
  "type": "group",
  "encode": { "update": { "width": {"signal": "ridgeW"}, "height": {"signal": "panelH"} } },
  "signals": [
    { "name": "width",  "update": "ridgeW" },
    { "name": "height", "update": "panelH" }
  ]
}
```

`encode` 里的 `width`/`height` 只是**这个 group 图元的尺寸属性**，
并不会在 group 的作用域里创建同名信号。而 `range: "width"`、以及轴的 `grid: true`
计算网格线长度时，读的都是**作用域里名为 `width`/`height` 的信号** ——
不声明就一路继承到顶层的 980×560。本例的后果是：右面板底轴的竖网格线会按 560 画，
比 `panelH`(492) 多探出 68px，戳进下面的轴标题里。

两种修法，本例两种都用了：**比例尺**写显式区间（`[0, {"signal": "ridgeW"}]`），
**轴网格**靠 group 的局部信号。详见 `demos/05-stacked-grouped-bar/README.md` 的「作用域陷阱」一节。

### 小技巧：`luminance()` 自动翻转描边色

magma 色带从深紫走到浅橙，跨度很大：白色脊线压得住 1 月的深紫（对比 14.9:1），
到了 7、8 月的浅橙就只剩 1.9:1，基本看不见。于是让描边色跟着填充色的亮度翻转：

```jsonc
"stroke": { "signal": "luminance(scale('tempColor', datum.meanT)) > 0.28 ? '#43301f' : '#ffffff'" }
```

`luminance()` 返回 WCAG 相对亮度，`scale()` 在表达式里现算填充色。
阈值 0.28 让 6–9 月翻成深色描边，全年 12 行的脊线对比度都 ≥ 4.1:1。
月均温圆点用同一个表达式做 `fill`/`stroke` 互换。

## 试一试

1. **拖 `bwMass`**：默认 0 = 自动，三组算出来分别是 Adelie 178 g / Chinstrap 157 g /
   Gentoo 204 g，三条曲线都是单峰。手动压到 **100 g**，Gentoo 立刻分出两个包
   （峰在 ≈4743 g 与 ≈5522 g，正是雌雄两个众数：Gentoo 雌均值 4680 g、雄均值 5485 g；
   同一档上 Adelie 与 Chinstrap 也开始冒出 3~4 个小次峰）；继续压到 **20 g**，
   三个组分别抖出 18 / 16 / 20 个假峰；反过来拉到 **400 g**（其实 200 g 就够），
   连 Gentoo 的双峰也被抹平成一个。核密度图最需要警惕的就是这件事：
   **形状是带宽的函数，不完全是数据的性质** —— 所以带宽必须是个能拖的信号，而不是写死的常数。
2. **把 `widthMode` 依次切到 `density` / `equal`**：对着上面那张宽度表看，
   哪种口径回答哪个问题（「谁的样本多」/「谁的分布集中」/「形状像不像」）。
   顺手把 `violinFill` 拉到 1，看小提琴挤满整条带；拉到 0.2 变成细长的「密度条」。
3. **把 `amplitude` 和 `rowStep` 分别拖到两端**：先固定 `rowStep = 34` 拖 `amplitude`
   （曲线越来越高、重叠越来越多），再固定 `amplitude` 拖 `rowStep`
   （行距变化但曲线高度不变）。页头会实时显示 `重叠 = amplitude / rowStep`。
4. **把山脊 facet 组的 `sort.order` 改成 `"descending"`**：遮挡方向反转，
   变成「近处的山被远处的山压住」，立刻明白重叠图形为什么必须管绘制顺序。
5. **把 `ridge-density` 的 `kde` 里 `"extent"` 那一行删掉**：取样域缩回观测值
   `[3.1, 24.4]`，12 月的曲线左端立刻被切出一道 35.6 px 的垂直断崖（7、8 月右端各 8.7 px）。
   再顺手把 `resolve` 改成 `"independent"`，每个月只在自己的温度范围内取样，
   12 行不再左右对齐 —— 这两步合起来就是「可堆叠密度为什么要 `extent` + `steps` + `shared`」。
6. **把 `area` 的 `orient` 从 `"horizontal"` 改掉（或整行删掉）**：
   小提琴会退化成「以 x 为自变量」的乱麻，一眼看清 `orient` 到底在说什么。
7. 进阶：把小提琴改成**半小提琴**（只留右半边），并在左半边画 demo 27 那样的散点 ——
   只要把 `x` 的 `offset` 改成 `0` 即可，几何公式一行都不用重写。

## 参考

- [`kde` 变换](https://vega.github.io/vega/docs/transforms/kde/) —
  `groupby` / `bandwidth` / `counts` / `extent` / `resolve` / `steps` / `minsteps` / `maxsteps`
- [`joinaggregate` 变换](https://vega.github.io/vega/docs/transforms/joinaggregate/) — 组级统计量贴回逐行数据
- [`aggregate` 变换](https://vega.github.io/vega/docs/transforms/aggregate/) — `q1` / `median` / `q3` 等 op 列表
- [`lookup` 变换](https://vega.github.io/vega/docs/transforms/lookup/)
- [`area` mark](https://vega.github.io/vega/docs/marks/area/) — `orient` 的语义
- [`line` mark](https://vega.github.io/vega/docs/marks/line/)
- [`group` mark 与 `from.facet`](https://vega.github.io/vega/docs/marks/group/)
- [Point 比例尺](https://vega.github.io/vega/docs/scales/#point) / [Band 比例尺](https://vega.github.io/vega/docs/scales/#band)
- [连续配色方案与 `extent`](https://vega.github.io/vega/docs/schemes/)
- [表达式函数](https://vega.github.io/vega/docs/expressions/) — `bandwidth()` / `scale()` / `luminance()` / `format()`
- 官方例子：[Violin Plot](https://vega.github.io/vega/examples/violin-plot/)、
  [Density Heatmap](https://vega.github.io/vega/examples/density-heatmaps/)

## 与 matplotlib 的对照

**小提琴图：matplotlib / seaborn 这一局赢得干净。**
`sns.violinplot(data=df, x="Species", y="Body Mass (g)", inner="box")` 一行出图，
`hue=... , split=True` 还能直接把两组拼成左右半边；`ax.violinplot()` 也内置了
`showmedians` / `quantiles` / `bw_method`。Vega 这边要自己走完
「`kde` → 两次 `joinaggregate` → `formula` 归一化 → `from.facet` → 对称 `x`/`x2`」五步，
本 demo 的小提琴部分（数据流 + 几何）有近百行 spec，seaborn 只要 1 行。**该承认就承认。**

**山脊线图：反过来了。** matplotlib 没有山脊线（joyplot），标准做法是手写循环：

```python
for i, (name, g) in enumerate(df.groupby("month")):
    kde = gaussian_kde(g.temperature, bw_method=0.3)
    y   = kde(grid) / dmax * amplitude          # 归一化 + 振幅，得自己算
    base = bottom - (11 - i) * row_step         # 行基线，得自己算
    ax.fill_between(grid, base, base - y, color=cmap(norm(g.temperature.mean())),
                    zorder=i, lw=0)             # 遮挡靠手动 zorder
    ax.plot(grid, base - y, color=ink(i), lw=1, zorder=i)
    ax.text(x0 - pad, base, name, ha="right", va="center")   # 月份标签也得手动摆
ax.set_yticks([])                                # 还得把真 y 轴关掉
```

跟本 demo 的 spec 逐条对上，Vega 用**声明式语法元素**顶掉的手工活是：

| 手工活 | matplotlib | 本 demo 的 Vega 写法 |
| --- | --- | --- |
| 分组 + 逐组核密度 | `groupby` + `gaussian_kde` 循环 | `kde` 的 `groupby` 一次算完 12 组 |
| 共用取样栅格 | 自己造 `np.linspace(vmin, vmax, 200)` | `resolve: "shared"` + `steps: 200` |
| 归一化 | `d / dmax`，`dmax` 得先扫一遍全部组 | 不带 `groupby` 的 `joinaggregate` |
| 行基线 | `bottom - (n-1-i) * row_step` 手算 | `point` 比例尺 + `range: [ridgeTopRow, ridgeBottom]` |
| 遮挡顺序 | 每条曲线手动指定 `zorder` | facet 子组的 `sort` 决定绘制顺序 |
| 行标签 | `ax.text` 逐个摆，还要关掉真 y 轴 | 一条 `orient: "left"` 的轴，`domain: false, ticks: false` |
| 颜色映射 | `cmap` + `Normalize` + 手动画 colorbar | `scale`（`scheme` + `extent`）+ `legends` 自动出色带 |
| 描边色随亮度翻转 | 自己算 `rgb_to_hsv` 或 `colour` 库 | `luminance(scale(...)) > 0.28 ? ... : ...` |
| 7 个参数的交互调节 | `matplotlib.widgets` / `ipywidgets` + 回调里重算重画 | `signals` 的 `bind`，**零额外代码**，且只重算受影响的那部分数据流 |

诚实补一句：seaborn 官方画廊里有个 *Overlapping densities (ridge plot)* 配方，
用 `FacetGrid(row=...)` + `kdeplot` + `subplots_adjust(hspace=-.25)` 靠**让子图互相压住**
实现重叠，比上面的手写循环短。但那条路子是「12 个透明子图」而不是「一个坐标系里的 12 条基线」，
于是跨行共用一个归一化分母、画一条贯穿 12 行的参考线、按行均温统一配色这些事都变得别扭 ——
恰好是本 demo 靠 `joinaggregate` / `rule` / `scale` 顺手做掉的三件。
第三方 `joypy` 也能直接画，但它是薄封装：换配色、改重叠、加参考线都得回到
Matplotlib Axes 上手动做，而且不维护交互。

**matplotlib 仍然更省事的地方**（诚实版）：

- **核密度本身的表达力**。`scipy.stats.gaussian_kde` 支持 `weights=`、
  `bw_method` 传可调用对象、协方差矩阵、多维；Vega 的 `kde` 只有高斯核、单变量、
  一个标量 `bandwidth`，也没有边界反射修正（数据范围端点处密度被系统性低估）。
  要加权核密度，Vega 里只能自定义变换（见 demo 20）。
  另外 seaborn 有个现成的 `cut`（默认 2，单位就是带宽）替你把取样域向外延伸；
  Vega 这边得自己写 `extent` 信号 —— 本 demo 的 `tempPad = 3 · bandwidth` 就是手搓的 `cut=3`。
- **任意 numpy 数学**。想按分位数裁尾、想画累积密度差、想做对数横轴上的核密度，
  Python 里就是几行数组运算；Vega 里得先想清楚「这能不能表达成一串变换」。
  （`kde` 有 `cumulative: true` 可以出 CDF，这一条算平手。）
- **不用担心作用域陷阱**。matplotlib 的子图尺寸就是子图尺寸，
  不存在「`range: "width"` 读到了顶层信号」这种只能靠肉眼或校验器抓的坑。
- **文字排布**。标签重叠时 matplotlib 有 `adjust_text` 之类的救兵，
  Vega 的 `label` 变换需要真实 canvas 位图（本项目的 Node 校验器跑不了，见 demo 18）。

结论：**图形越「标准」，命令式库越省事；图形越「非标准」，声明式语法的收益越大。**
小提琴是标准图（seaborn 一行），山脊线是非标准图（matplotlib 二十行手工几何 + 无交互），
而 Vega 这边两张图共用同一个 `kde` 变换、同一套归一化套路、同一个 `area` mark，
只是把「密度乘到哪个方向」换了一下 —— 这就是声明式语法的复利。
