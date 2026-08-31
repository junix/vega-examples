# 38 · 瀑布图与马赛克（Marimekko）图

两张"教科书上有、绘图库里没有"的图，放在同一个 spec 的两个 group mark 里：

- **左：瀑布图（waterfall）** —— 一张损益表逐项增减，累计到净利。柱子悬空、涨绿跌红、
  柱间用虚线连成一条累计链。
- **右：马赛克 / Marimekko 图** —— 影片类型 × MPAA 分级的二维列联表。
  **列宽**编码"这一类型有多少部片"，**列内分段高度**编码"这一类型里的分级构成"。

两张图的共同点：Vega 里**没有**叫 `waterfall` 或 `mosaic` 的 mark。
它们都是「几何量先在数据流里算出来，mark 只负责照着画」——
瀑布图靠 `window` 的累计和，马赛克图靠**两级嵌套的 `stack`**。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/38-waterfall-marimekko/
```

## 学习目标

1. 用 `window` 变换的 `sum` 做**累计和**（默认窗口就是 `[null, 0]`：首行到当前行），
   并理解为什么"累计和"正好就是瀑布图每根柱子的起止高度。
2. 用同一个 `window` 里的 `lead` 拿到**下一行**的字段值，从而用 `rule` mark 画出
   柱间连接虚线 —— 这是瀑布图区别于"一堆悬空柱"的关键细节。
3. 用 `format(x, '+,.0f')` 做**带正负号**的数值标注，用 `format(x, '.0%')` 做百分比标注，
   彻底避开 `0.30000000000000004` 这类直出。
4. 掌握**两级 stack**：外层 `stack` 定 x（列宽），内层 `stack`（带 `groupby`）定 y（列内分段），
   两次都用 `offset: "normalize"` 归一到 0~1；再用 `lookup` 把外层结果贴回内层的每一行。
5. 知道为什么这样组织**不会造成数据流成环**，以及 `collect` + `window(row_number)`
   为什么是"拿到稳定的从左到右列序"的正确做法。
6. 知道 group mark 里的 `"range": "width"` / `"height"` 解析的是**外层**同名 signal，
   必须给 group 声明局部 `width` / `height` signal，子图才会按自己的尺寸画。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals`（布局组） | `panelTop` / `panelH` / `wfW` / `mariX` / `mariW` | 两个面板的位置与尺寸全部参数化。`mariX + mariW = 930 < width 940`，右侧不溢出 |
| `signals`（交互组） | `barPad`、`showLinks`、`showValues`、`colGap`、`minCellH`、`minCellW` | 全部 `bind` 成控件：柱缝、连接线开关、数值开关、列缝、标签密度双阈值 |
| `signals`（数据组） | `genres`、`ratings` 两个字符串数组 | 既当过滤白名单（`indexof(...) >= 0`），又当堆叠顺序表（`indexof` → `rank`）。改数组即换列/换分段，其它地方一行不用动 |
| `data: pnl` | 内联的损益表 + 4 步变换 | `window(sum, lead)` → `formula` 算 `y0`/`y1` → `formula` 算颜色分类 `cat` → `formula` 预格式化标签 `tag` |
| `data: pnl-links` | 连接虚线的数据源 | `filter datum.nextLabel != null`：末行没有下一根柱子，`lead` 返回 `null` |
| `data: movies` | 从 `movies.json` 做出列联表 | `filter`（剔 null + 白名单）→ `formula` 改名 `genre`/`rating` → `formula` 算 `rank` → `aggregate count` |
| `data: mari-cols` | **外层 stack**：每列一行，算列的 x 区间 | `aggregate sum` → `stack(normalize)` → `formula` 算 `colShare`/`cxMid` → `collect` 排序 → `window(row_number)` 得列序 `colIdx` |
| `data: mari-cells` | **内层 stack**：列内分段的 y 区间 + 贴回 x 区间 | `stack(groupby=[genre], normalize)` → `lookup` 从 `mari-cols` 取 `cx0`/`cx1`/`colN` → `formula` 算 `share` |
| `data: mari-labels` | 控制百分比标签密度 | 两个像素阈值：格子高 `(y1-y0)*panelH ≥ minCellH` 且格子宽 `(cx1-cx0)*mariW ≥ minCellW`。默认 27 个格子里只标 15 个 |
| `scales: wfColor` | ordinal，`increase`/`decrease`/`total` → 绿/红/蓝 | 语义色（涨跌）不能交给配色 scheme，必须点名 |
| `scales: mariColor` | ordinal，5 个分级 → `blues` 的 5 级 | `{"scheme":"blues","count":5,"extent":[0.32,1]}`：`extent` 砍掉最浅的一段，避免最淡的色在白底上看不见。**注意 scale 条目里不能写 `comment`/`description`，会触发 `Unsupported scale property` 告警** |
| `marks[0]` group `waterfall` | 左面板 | 自带局部 `width`/`height` signal + `xw`/`yw` 比例尺 + 两条轴 + 一个 `orient:"none"` 的横向图例 |
| `marks[0].marks` | `rule`（连接线）→ `rect`（柱）→ `text`（数值）→ `text`（单位） | 顺序即图层顺序：虚线先画，被柱子压住的部分自然看不见 |
| `marks[1]` group `marimekko` | 右面板 | `xm`/`ym` 都是 `domain: [0,1]` 的 linear，轴 `format: ".0%"` |
| `marks[1].marks` | `rect`（格子）→ `text`（列内占比）→ `text`（列名） | 列名奇偶交错两行 + 首末列改对齐方式，双重防重叠 |

### 关键概念 1：瀑布图的几何 = 累计和

一根柱子的上下沿由**累计和**决定，公式只有两行：

```
cum_i  = delta_1 + delta_2 + … + delta_i          （window sum，窗口 [null, 0]）

普通柱：y0 = cum_i − delta_i   y1 = cum_i         （从上一行的累计值画到本行的累计值）
合计柱：y0 = 0                 y1 = cum_i         （从零基线画到累计值）
```

spec 里就是照抄这两行：

```json
{ "type": "window", "ops": ["sum", "lead"], "fields": ["delta", "label"], "as": ["cum", "nextLabel"] },
{ "type": "formula", "expr": "datum.kind === 'total' ? 0 : datum.cum - datum.delta", "as": "y0" },
{ "type": "formula", "expr": "datum.cum", "as": "y1" }
```

- `window` 的 `frame` 默认是 `[null, 0]`，即"从分区首行到当前行"，所以 `sum` 天然就是累计和；
  想要滑动窗口才需要显式写 `frame`。
- 首行「营业收入」写成 `kind: "total"`，`delta = 1200`：合计柱公式给出 `y0 = 0, y1 = 1200`，
  和"从零画到营收"完全一致，不需要特例。
- 末行「净利润」写成 `kind: "total"`，`delta = 0`：`cum` 保持不变（265），
  于是合计柱 `y0 = 0, y1 = 265`，正好接在前一根柱子的终点高度上。
- 注意 `y0 > y1` 是常态（下跌柱），`rect` 的 `y`/`y2` 不要求大小关系，照填即可。

### 关键概念 2：连接虚线怎么定位

连接线要从第 *i* 根柱子的**右边缘**拉到第 *i+1* 根柱子的**左边缘**，高度取 `cum_i`：

```json
"x":  { "signal": "scale('xw', datum.label) + bandwidth('xw')" },
"x2": { "signal": "scale('xw', datum.nextLabel)" },
"y":  { "scale": "yw", "field": "cum" }
```

三个要点：

1. **右端点靠 `lead` 拿到**。`window` 的 `lead` 是按行号取值（`w.data[w.index + 1]`），
   与 `frame` 无关，所以能和 `sum` 塞进同一个 `window` 变换里。
2. `scale('xw', v)` 对 band 比例尺返回的是**波段左边缘**，加 `bandwidth('xw')` 才是右边缘。
   这就是为什么连接线的长度恰好等于柱缝宽度 —— 也就是 `barPad`。
3. `y = scale(cum_i)` 这条水平线，对普通柱来说正好是下一根柱子的起点 `y0`（因为
   `y0_{i+1} = cum_{i+1} − delta_{i+1} = cum_i`），对合计柱来说正好是它的顶边 `y1`。
   **同一个公式对两种柱子都成立**，不需要分支。

### 关键概念 3：马赛克图 = 外层 stack 定 x，内层 stack 定 y

这是本 demo 的核心。一张马赛克图的格子矩形需要四个数：`x0, x1, y0, y1`。
它们来自**两次互相独立的 `stack`**：

```
外层（每列一行）：stack(field = colN,  offset = normalize)                → cx0, cx1
                  ⇒ 列宽 (cx1 − cx0) = 该列影片数 / 全部影片数            → 列宽 ∝ 列总量

内层（每格一行）：stack(groupby = [genre], field = n, offset = normalize) → y0,  y1
                  ⇒ 段高 (y1 − y0)  = 该格影片数 / 该列影片数            → 列内构成，每列都撑满 0~1
```

关键是 `offset: "normalize"`：它把每个堆叠组的总量缩放到 1。
外层只有一个组（没写 `groupby`），归一化后 `cx1` 从 0 递增到 1，于是 x 轴天然是"累计占比"；
内层按 `genre` 分组，每列各自归一到 0~1，于是每列都从底撑到顶 —— 这正是马赛克图的定义。

**两次 stack 的结果要合到一起**，靠 `lookup`：

```json
{ "type": "lookup", "from": "mari-cols", "key": "genre",
  "fields": ["genre"], "values": ["cx0", "cx1", "colN", "colShare"] }
```

**为什么不成环？** 因为 `mari-cells` 和 `mari-cols` 都直接 `source: "movies"`：

```
movies ──┬── mari-cols  （aggregate → stack → collect → window）
         │        │
         │        └── lookup 的 from
         └── mari-cells （stack → lookup → formula）── mari-labels（filter）
```

如果偷懒把外层 aggregate 写进 `mari-cells` 自己的 transform 链里，再 lookup 自己派生出来的数据集，
数据流就成环了，Vega 会直接报错。**先分叉，再汇合**是唯一正确的写法。

### 关键概念 4：像素几何只做三件事

x/y 区间都是 0~1 的**无量纲**比例，转像素全部交给 `xm`/`ym` 两个 `domain: [0,1]` 的 linear 比例尺。
只有三处必须手写像素：

1. **列缝**：`x = scale('xm', cx0) + colGap/2`，`x2 = scale('xm', cx1) − colGap/2`。
   列宽是连续值，不像 band 比例尺有 `paddingInner` 可用，缝只能自己抠。
2. **标签密度**：`(y1 − y0) * panelH` 和 `(cx1 − cx0) * mariW` 才是格子的真实像素尺寸，
   低于阈值就不标。注意这个 `filter` 写在**顶层 data** 里，只能引用顶层 signal
   （`panelH` / `mariW`），看不到 group 内部的局部 `width` / `height`。
3. **列名防重叠**：奇偶列交错成两行（`colIdx % 2`），
   首列改左对齐、末列改右对齐（`datum.cx0 <= 0 ? 'left' : datum.cx1 >= 1 ? 'right' : 'center'`）。
   后者的好处是**不需要知道文字实际宽度**：换对齐点就等于把标签压回面板内。

### 关键概念 5：group mark 的局部 width / height

两个面板都写了这么一段：

```json
"signals": [
  { "name": "width",  "update": "wfW" },
  { "name": "height", "update": "panelH" }
]
```

不写会怎样？group 内部 scale 的 `"range": "width"` 解析的是**顶层** `width`（940），
于是左面板会按 940 宽去画，糊出画布之外 —— 而 `vega.parse` 不报错、数据流不报错、
`toSVG` 也照样出图，只有肉眼（和 `tools/validate.cjs` 的包围盒检查）能看出来。
group 内的 `axes` 摆放、`text` mark 里的 `width - 2` 也都跟着这对局部 signal 走。

### 关键概念 6：数字格式化

| 位置 | 写法 | 结果 |
| --- | --- | --- |
| 增减柱标签 | `format(datum.delta, '+,.0f')` | `−430` / `+34`（`+` 修饰符强制带符号；负号是 d3-format 的 U+2212 真减号，不是 ASCII 连字符） |
| 合计柱标签 | `format(datum.cum, ',.0f')` | `1,200` / `265`（合计是绝对量，不带符号） |
| 瀑布图 y 轴 | `"format": ",.0f"` | `0` … `1,200` |
| 马赛克两条轴 | `"format": ".0%"` | `0%` … `100%`（`.0%` 会自动乘 100 并补 `%`） |
| 格子内标签 | `format(datum.share, '.0%')` | `55%` / `79%` —— 直接写 `datum.share` 会印出 `0.5490753911806543` |
| 列名占比 | `format(datum.colShare, '.0%')` | `Drama 32%` |

### 一个诚实的细节：空格子

6 个类型 × 5 个分级理论上是 30 格，但 `mari-cells` 只有 **27** 行 ——
`Action / G`、`Thriller-Suspense / G`、`Horror / G` 三个组合在数据里一部都没有。
`aggregate` 只输出**真实出现过**的分组，所以这三格根本不会有 `rect`，
相邻分段自动接上，视觉上完全正确，不需要 `impute` 补零。
若确实想让空格子占位（例如做动画过渡），才需要在 `aggregate` 后加一步 `impute`。

## 试一试

1. **拆掉瀑布图的连接线**：取消勾选 `showLinks`（或删掉 `pnl-links` 那个 `rule` mark）。
   立刻会发现悬空柱子之间"接得上"这件事完全看不出来 —— 连接线不是装饰，是语义。
2. **把 `barPad` 拉到 0.05**：柱缝几乎消失，连接线短到看不见，瀑布图退化成一根断裂的面积图；
   再拉到 0.6，柱子变细、连接线变长，"台阶感"最强。顺手体会
   `scale('xw', label) + bandwidth('xw')` 为什么能自动跟着变。
3. **把马赛克图的内层 stack 改成绝对量**：把 `mari-cells` 里的
   `"offset": "normalize"` 删掉（默认 `"zero"`），再把 `ym` 的 `domain` 改成
   `{"data": "mari-cells", "field": "y1"}`。列不再撑满高度，图从"构成对比"变成"绝对量对比" ——
   这就是马赛克图和普通堆叠柱状图的分界线。
4. **把 `minCellH` 拖到 6**：27 个格子全标上百分比，其中好几个是 `1%` 甚至 `0%`，
   叠在 1~2 像素高的格子里糊成一团。再拖回 16，体会"密度阈值"在信息图里是必需品。
5. **换一批列 / 换堆叠顺序**：把 `genres` 改成
   `["Drama","Comedy","Action","Horror","Musical","Documentary","Western"]`，
   或把 `ratings` 倒过来写成 `["R","PG-13","PG","G","Not Rated"]`。
   前者会看到极窄的列（`Documentary` 只有几十部，注意标签阈值把它的百分比全滤掉了），
   后者会看到整张图上下翻转 —— 因为 `rank` 是从 `ratings` 数组算出来的，
   而内层 `stack` 的 `sort` 用的就是 `rank`。别忘了同步改深色格子用白字的判据 `datum.rank >= 3`。

## 参考

- [`window` 变换](https://vega.github.io/vega/docs/transforms/window/) —— `ops` 全表、`frame` / `ignorePeers` 语义、`lag` / `lead` / `row_number`
- [`stack` 变换](https://vega.github.io/vega/docs/transforms/stack/) —— `groupby` / `sort` / `offset`（`zero` / `center` / `normalize`）
- [`aggregate` 变换](https://vega.github.io/vega/docs/transforms/aggregate/) —— `count` 与 `groupby` 只输出真实分组
- [`lookup` 变换](https://vega.github.io/vega/docs/transforms/lookup/) —— 把另一个数据集的字段贴到当前流上
- [`collect` 变换](https://vega.github.io/vega/docs/transforms/collect/) —— 显式排序，`window(row_number)` 之前的必要一步
- [`filter` 变换](https://vega.github.io/vega/docs/transforms/filter/)、[`formula` 变换](https://vega.github.io/vega/docs/transforms/formula/)
- [`rect` mark](https://vega.github.io/vega/docs/marks/rect/)、[`rule` mark](https://vega.github.io/vega/docs/marks/rule/)、[`text` mark](https://vega.github.io/vega/docs/marks/text/)
- [`group` mark](https://vega.github.io/vega/docs/marks/group/) —— 面板内的 `signals` / `scales` / `axes` / `legends`
- [Band 比例尺](https://vega.github.io/vega/docs/scales/#band)、[Ordinal 比例尺](https://vega.github.io/vega/docs/scales/#ordinal)、[Scale Range 与 scheme/extent](https://vega.github.io/vega/docs/scales/#range)
- [表达式函数](https://vega.github.io/vega/docs/expressions/) —— `scale()` / `bandwidth()` / `format()` / `indexof()`
- [d3-format 格式说明串](https://github.com/d3/d3-format#locale_format) —— `+`、`,`、`.0%`、`~s` 各是什么意思
- [图例配置](https://vega.github.io/vega/docs/legends/) —— `orient: "none"` + `legendX` / `legendY` 的手工摆放

## 与 matplotlib 的对照

### 这张图在 Vega 里靠什么表达出来

| 图形要素 | Vega 语法元素 | 说明 |
| --- | --- | --- |
| 瀑布图柱子起止 | `window(sum)` + 两个 `formula` | 声明"累计和"这件事，不写循环 |
| 柱间连接线 | `window(lead)` + `rule` mark + `bandwidth()` | 右端点由数据流算出，位置由比例尺算出 |
| 涨跌配色与图例 | `formula` 产出分类字段 + `ordinal` scale + `legends` | 图例是 scale 的副产品，不是另画一遍 |
| 列宽 ∝ 列总量 | 外层 `stack(offset=normalize)` | |
| 列内构成 | 内层 `stack(groupby, offset=normalize)` | |
| 两级结果合并 | `lookup` | |
| 标签密度控制 | 派生数据集 + `filter` | 阈值是 signal，能拖着调 |
| 交互（悬停高亮、参数滑杆） | `hover` 编码集、`tooltip`、`signals.bind` | 零行 JS |

### 换成 matplotlib / seaborn 要写什么

**瀑布图**：matplotlib 没有 `waterfall`（Plotly 有 `go.Waterfall`，pandas / seaborn 都没有）。手写大致是：

```python
cum = df.delta.cumsum()
bottom = np.where(df.kind.eq('total'), 0, cum - df.delta)     # 自己算 y0
height = np.where(df.kind.eq('total'), cum, df.delta)         # 自己算高度（注意负高度）
colors = np.where(df.kind.eq('total'), C_TOT,
                 np.where(df.delta >= 0, C_UP, C_DOWN))
ax.bar(range(len(df)), height, bottom=bottom, color=colors)

for i in range(len(df) - 1):                                  # 连接线：显式循环 + 手算像素
    ax.plot([i + w/2, i + 1 - w/2], [cum[i], cum[i]], ls='--', c='gray', lw=1)

for i, r in df.iterrows():                                    # 数值标注：又一个循环
    v = r.cum if r.kind == 'total' else r.delta
    y = min(bottom[i], bottom[i]+height[i]) - 12 if r.delta < 0 else max(...) + 8
    ax.text(i, y, f'{v:+,.0f}', ha='center', va='center', fontsize=9)

ax.legend(handles=[Patch(color=C_UP, label='增加'), ...])      # 图例要自己造 handle
```

代价清单：
- `bar(bottom=…)` 的 `height` 可以为负，于是"标签放上边还是下边"必须自己判断，
  `min`/`max` 写错就会把字压在柱子里。
- 连接线的 x 端点要用**柱宽 `w`** 手算（`i + w/2` → `i + 1 − w/2`）。柱宽一改，
  这段代码全部要跟着改；Vega 里 `bandwidth('xw')` 会自己跟着 `barPad` 变。
- 图例没有"比例尺"的概念，必须手工构造 `Patch` 列表，颜色常量要和 `np.where` 里那份保持同步 ——
  这是最容易腐化的地方。
- 想要"拖滑杆看柱缝变化"，得引入 `matplotlib.widgets.Slider` 并写回调重画，
  或者上 ipywidgets / Bokeh / Plotly Dash。

**马赛克图**：statsmodels 里有现成的
[`statsmodels.graphics.mosaicplot.mosaic`](https://www.statsmodels.org/stable/generated/statsmodels.graphics.mosaicplot.mosaic.html)，
能直接吃一个 `{(genre, rating): count}` 字典。想只用 matplotlib 的话：

```python
tab = pd.crosstab(df['Major Genre'], df['MPAA Rating'])
colw = tab.sum(1) / tab.values.sum()                 # 外层：列宽
inner = tab.div(tab.sum(1), axis=0)                  # 内层：列内构成
x = 0
for g, w in colw.items():                            # 双重循环，逐格 add_patch
    y = 0
    for r in RATINGS:
        h = inner.loc[g, r]
        ax.add_patch(Rectangle((x + gap/2, y), w - gap, h, fc=cmap[r], ec='w'))
        if h * PANEL_H_PX >= 16 and w * PANEL_W_PX >= 26:      # 密度阈值也得手写
            ax.text(x + w/2, y + h/2, f'{h:.0%}', ha='center', va='center')
        y += h
    x += w
ax.set_xlim(0, 1); ax.set_ylim(0, 1)
ax.xaxis.set_major_formatter(mtick.PercentFormatter(1.0))
```

代价清单：
- 两级 stack 变成两层 Python 循环 + 手工累加 `x` / `y`。Vega 里这是两条 `stack` 声明。
- 「格子够大才标百分比」的阈值必须换算成**真实像素**，也就是要知道 axes 的 bbox 尺寸；
  改一次 `figsize` 就得重算（`ax.get_window_extent()`）。Vega 里 `panelH` / `mariW` 就是 signal。
- `statsmodels.mosaic` 虽然省事，但列的顺序、配色、标签格式、空格子处理都不好控制，
  而且它画的是"递归四分"式马赛克，不是列宽固定的 Marimekko。
- 两个面板并排 + 各自图例：`plt.subplots(1, 2)` 很容易，但两张子图要共享同一份颜色定义、
  同一份格式化函数，只能靠模块级常量维持一致；Vega 里 `scales` 声明在顶层，两个面板同名引用。

### 反过来，matplotlib 在哪些方面更省事

诚实地说，不少：

- **临时探索**。`df.delta.cumsum()` 一行就有累计和；Vega 要写 `window` + `formula`，
  JSON 也比 Python 啰嗦得多。只想看一眼数据长什么样，matplotlib/pandas 快得多。
- **中文排版与字体**。matplotlib 里 `rcParams['font.sans-serif']` 一行搞定；
  SVG 里字体依赖浏览器，导出 PDF 给排版用还得处理字体嵌入。
- **数值算法**。`statsmodels.mosaic`、`scipy` 的检验（比如给这张列联表配一个卡方检验、
  画 Pearson 残差着色的马赛克图）在 Python 生态里是现成的；Vega 只有 80 个数据变换，
  没有统计检验，残差得在外面算好再喂进来。
- **像素级微调**。`ax.annotate` 的 `xytext` + `arrowprops`、`bbox_inches='tight'`、
  `constrained_layout`，做"投稿级"的最后 5% 调整比在 JSON 里堆 `dx`/`dy` 舒服。
- **矢量导出与嵌入论文**。`savefig('f.pdf')` 直接得到可嵌 LaTeX 的 PDF。

一句话总结：**matplotlib 是"我来算，你来画"，Vega 是"我说这张图是什么，你自己算怎么画"。**
瀑布图和马赛克图这类"几何量本身就是统计量"的图形，正好落在后者的甜区 ——
所以本 demo 的 spec 里一行几何循环都没有，而参数（柱缝、列缝、标签阈值、列集合、堆叠顺序）
全部是可以拖着玩的 signal。
