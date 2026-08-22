# Vega 画「少见而复杂的图形」：与 matplotlib 的逐项对照

> 这份文档回答一个具体问题：**要画不常见、形状特殊的图，Vega 相比 matplotlib
> （以及 seaborn / plotly 生态）到底强在哪、弱在哪？**
> 每一条都指向本仓库里一个可以直接跑的 demo，不讲空话。
>
> 结论先说：**在"统计图形一行出图"上 matplotlib 明显更省事；在"没人做过的形状 +
> 交互 + 程序化生成"上 Vega 明显更强。** 两者的分界线不是"图库谁大"，而是
> 声明式数据流 vs 命令式绘图 API 这个根本差异。

## 一、根本差异

| | Vega | matplotlib |
| --- | --- | --- |
| 编程范式 | **声明式**：一份 JSON 描述「数据 → 变换 → 比例尺 → mark → 编码」 | **命令式**：你按顺序调用绘图原语 |
| 谁算布局 | 引擎（变换管线 + scale + layout） | 你（大多数情况） |
| 图元数量 | 由数据行数决定，spec 里不出现 | 由你的循环决定 |
| 交互 | 一等公民：`signals` + 事件流选择器 + 声明式联动 | 后端相关的回调 API，需手写状态机 |
| 输出 | 场景图 → canvas / SVG / 无头字符串 | Agg / SVG / PDF / PGF 等后端 |
| 宿主 | 浏览器 + Node | Python |

这个差异决定了后面所有的强弱项：

- 凡是**"已有名字的标准统计图"**，matplotlib 大概率有一行 API，Vega 要你自己拼。
- 凡是**"形状要自己算、还要能交互"**，Vega 把「算完之后」的所有事（拾取、hover、
  联动、导出、响应式）都白送给你，matplotlib 要一件件补。

## 二、逐项对照

「本仓库 demo」列给出可直接运行的实现；「matplotlib 侧」写清是内置、要装包、还是得手算。

### 1. 流量与关系图

| 图形 | 本仓库 demo | matplotlib 侧 | 谁更省事 |
| --- | --- | --- | --- |
| 桑基图 / 冲积图 | [22](demos/22-sankey-alluvial/)：`stack` ×3 + 手工三次贝塞尔 path | `matplotlib.sankey.Sankey` **有内置**，但画的是经典「箭头流」样式；d3 那种二分图缎带桑基要靠 plotly / floWeaver | 看样式：箭头流 → matplotlib；缎带桑基 → 两边都手算，Vega 白得交互 |
| 弦图 | [23](demos/23-chord-arc-diagram/)：`pie` + 二次贝塞尔 | 无内置，第三方 `mpl-chord-diagram` / `nxviz` | 平手（都要靠外力） |
| 弧线邻接图 | [23](demos/23-chord-arc-diagram/)：椭圆弧 `A` 命令 | 无内置，手画 `Arc` patch | 平手 |
| 力导向节点-链接图 | [14](demos/14-force-directed-graph/)：`force` 变换 + 拖拽 | `networkx.spring_layout` 算坐标 + matplotlib 画 | **Vega 赢在交互**：拖拽节点、实时重加热是声明式的；matplotlib 要自己接事件 |
| 邻接矩阵 | [41](demos/41-matrix-adjacency/)：signal 驱动行列重排 | `imshow` / `matshow` 内置，一行出图 | 静态 → matplotlib；**要交互重排 → Vega** |

### 2. 分布图

| 图形 | 本仓库 demo | matplotlib 侧 | 谁更省事 |
| --- | --- | --- | --- |
| 箱线图 | [29](demos/29-boxplot-errorbar/)：`aggregate` 五数概括 + `rect`/`rule` 手工拼 | `ax.boxplot()` **内置一行**，含离群点与 Tukey 须 | **matplotlib 明显赢** |
| 小提琴图 | [28](demos/28-violin-ridgeline/)：`kde` + 对称 `area` | `ax.violinplot()` **内置**；`seaborn.violinplot` 更漂亮 | **matplotlib 明显赢** |
| 误差棒 | [29](demos/29-boxplot-errorbar/)：`aggregate(stderr)` + `rule` | `ax.errorbar()` **内置** | **matplotlib 赢** |
| 山脊线图 | [28](demos/28-violin-ridgeline/)：多组 `kde` + 行偏移 | 无内置，`joypy` 或手工叠 subplot | 平手 |
| 蜂群图 | [27](demos/27-beeswarm-dotplot/)：`force` + `collide`，`static: true` | 无内置，`seaborn.swarmplot` 有 | 平手 |
| Wilkinson 点图 | [27](demos/27-beeswarm-dotplot/)：`dotbin` + `stack` | 无内置 | **Vega 赢**（`dotbin` 是内置变换） |
| 直方图 / 分箱 | [04](demos/04-histogram-binning/)：`bin` + `aggregate` | `ax.hist()` **内置** | matplotlib 赢 |
| 六边形分箱 | [26](demos/26-hexbin-matrix/)：手算蜂巢格心 + 自定义 symbol path | `ax.hexbin()` **内置一行** | **matplotlib 明显赢** |
| 二维核密度 / 等值线 | [25](demos/25-contour-density2d/)：`kde2d` + `isocontour` | `ax.contour/contourf` 是 matplotlib 的**王牌**；`seaborn.kdeplot` 一行 | **matplotlib 明显赢** |

这一节要坦白：**分布类统计图是 matplotlib（尤其加上 seaborn）的主场。**
Vega 本体没有复合 mark —— 箱线图那种「盒 + 中位线 + 须 + 端帽 + 离群点」的组合
必须自己拼五个 mark（这正是 demo 29 的教学价值，但生产上是成本）。
注意区分：**Vega-Lite 有** `boxplot` / `errorband` 复合 mark，本仓库聚焦 Vega 本体所以没有。

### 3. 时间与序列

| 图形 | 本仓库 demo | matplotlib 侧 | 谁更省事 |
| --- | --- | --- | --- |
| 流图（streamgraph） | [31](demos/31-streamgraph/)：`stack` 的 `offset: center` + inside-out 排序 | `ax.stackplot(baseline='wiggle'/'sym')` **内置** | 平手（Vega 多送一个可切基线的下拉框） |
| K 线图 | [32](demos/32-candlestick-ohlc/)：`rule` 影线 + `rect` 实体 + 十字光标 | matplotlib 3.x 已移除 candlestick，要装 `mplfinance` | 平手 |
| 日历热力图 | [33](demos/33-calendar-heatmap/)：手算 周/星期 + `facet` 分年 | 无内置，`calmap` / `calplot` / `july` | 平手 |
| 甘特图 / 时间线 | [40](demos/40-gantt-timeline/)：区间 `rect` + 依赖折线 | `ax.broken_barh()` 能画条，依赖箭头要手画 | 平手 |
| Bump 图 / 斜率图 | [39](demos/39-bump-slope-chart/)：`window(rank)` + 反向 `point` 轴 | 无内置，手算名次再 `plot` | **Vega 赢**：名次是 `window` 变换算的，换数据自动跟随 |
| 瀑布图 | [38](demos/38-waterfall-marimekko/)：`window` 累计和 + 连接虚线 | 无内置，手算 `bottom=` 参数 | 平手 |
| 马赛克 / Marimekko | [38](demos/38-waterfall-marimekko/)：两级 `stack` 嵌套 | `statsmodels.graphics.mosaicplot.mosaic` | 平手 |

### 4. 层次结构

| 图形 | 本仓库 demo | matplotlib 侧 | 谁更省事 |
| --- | --- | --- | --- |
| Treemap | [15](demos/15-hierarchies/)：`treemap` 变换（5 种切分算法） | 无内置，`squarify` 只做 squarify 一种 | **Vega 赢** |
| Sunburst / Icicle | [15](demos/15-hierarchies/)：`partition` 变换 | 无内置，手算角度 | **Vega 赢** |
| 圆填充（circle packing） | [35](demos/35-pack-dendrogram/)：`pack` 变换 | 无内置，得自己实现装箱 | **Vega 明显赢** |
| 树 / 径向树状图 | [35](demos/35-pack-dendrogram/)：`tree` + `linkpath(orient: radial)` | `scipy.cluster.hierarchy.dendrogram` 画矩形树状图很方便，**径向**要手算 | 矩形 → scipy；**径向 → Vega 赢** |

层次布局是 Vega 的强项：`treemap` / `partition` / `pack` / `tree` / `stratify` /
`treelinks` / `linkpath` 全是内置变换，而 Python 侧这些算法散落在不同的第三方包里、
且大多只给你坐标不给你图。

### 5. 空间与场

| 图形 | 本仓库 demo | matplotlib 侧 | 谁更省事 |
| --- | --- | --- | --- |
| 矢量场 / 风场 | [34](demos/34-vector-field/)：自定义箭头字形 + `angle` + `pow(2)` size | `ax.quiver()` / `ax.streamplot()` **内置且成熟** | **matplotlib 明显赢** |
| 分级统计地图 | [16](demos/16-geo-choropleth/)：TopoJSON + `lookup` + `quantize` | `cartopy` / `geopandas.plot()` 很顺手 | 平手 |
| 投影画廊 | [37](demos/37-geo-projections-arcs/)：`projection` 的 type/rotate 接 signal | `cartopy.crs` 投影库更全、更专业 | **cartopy 更专业**；Vega 赢在「拖滑杆转地球」几乎零成本 |
| 大圆航线 | [37](demos/37-geo-projections-arcs/)：`geoshape` 自动重采样 LineString | `cartopy` 的 `transform=ccrs.Geodetic()` 一行搞定 | 平手（两边都对） |
| Voronoi | [18](demos/18-voronoi-labels/)：`voronoi` 变换 | `scipy.spatial.voronoi_plot_2d` | 平手 |
| 词云 | [17](demos/17-wordcloud/)：`wordcloud` 变换 | `wordcloud` 包（生成位图） | Vega 输出**矢量**文字，可选中可缩放 |

### 6. 任意形状

| 能力 | 本仓库 demo | matplotlib 侧 |
| --- | --- | --- |
| 自定义符号形状 | [36](demos/36-custom-shapes-gradients/)：`symbol` 的 `shape` 直接吃 SVG path | `Path` + `PathPatch`，或 `marker=` 传 `Path` |
| 参数方程曲线 | [36](demos/36-custom-shapes-gradients/)：`sequence` + `formula` | `numpy` 算点 + `ax.plot` —— **numpy 这里更顺手** |
| 渐变填充 | [36](demos/36-custom-shapes-gradients/)：`fill: {gradient, stops}` | 无直接 API，得用 `imshow` + clip 或 `LinearSegmentedColormap` 拼 |
| 变宽线 | [36](demos/36-custom-shapes-gradients/)：`trail` mark | 无内置，`LineCollection` 逐段设线宽 |
| 裁剪 | [36](demos/36-custom-shapes-gradients/)：group 的 `clip` | `set_clip_path()` |

平手偏 Vega：**Vega 的形状是数据驱动的** —— path 字符串本身可以是数据行的函数
（demo 22 的每条缎带、demo 26 的每个六边形都是这么来的）。matplotlib 里同样的事
要写循环，而循环一多，图元与数据的对应关系就只存在于你的代码里，不再存在于图的定义里。

## 三、Vega 真正的结构性优势

这几条不是「图库谁大」，是范式带来的，matplotlib 补不上：

1. **交互是声明的，不是写出来的。**
   `signals` + 事件流选择器（`[mousedown, mouseup] > mousemove`）+ 声明式联动，
   刷选、缩放、跨视图 crossfilter、图例点选过滤都是 spec 的一部分：
   [10](demos/10-signals-bind/) / [11](demos/11-events-brush-zoom/) /
   [12](demos/12-hover-tooltip-legend/) / [09](demos/09-crossfilter/)。
   matplotlib 的 `widgets` + `mpl_connect` 能做，但你得自己维护状态机，
   而且换后端（Agg / Qt / notebook）行为会变。

2. **布局是数据的函数。**
   面板数量、画布尺寸、刻度个数都能由数据算出来 —— demo 33 的画布高度就写成
   `nYears * panelStep + 64`，数据多一年，图自己长高一格。

3. **变换可以串成管线。**
   `filter → kde2d → isocontour → geopath` 直接接起来（demo 25）；
   `fold → aggregate → lookup → formula → collect`（demo 30）。
   每一步都是可命名、可复查的数据集 —— 这也是本仓库
   `node tools/inspect.cjs <slug>` 能把每个中间数据集打出来的原因。

4. **同一份声明能跑在三处**：浏览器 canvas、浏览器 SVG、Node 无头
   （[19](demos/19-runtime-api-tour/) / [21](demos/21-node-headless-render/)），
   而且 `toSVG()` 是从**场景图**重新生成的真矢量，不是截图。

5. **spec 是数据，可以被程序生成、diff、校验。**
   本仓库的 `tools/validate.cjs` 就是靠这一点做到「跑一遍数据流、断言每个数据集非空、
   把 Vega 的 WARN 当失败、量场景包围盒抓布局溢出」。
   对着一段 matplotlib 脚本做同等强度的自动校验要难得多。

## 四、Vega 真正的短板（诚实版）

1. **没有复合统计 mark。** boxplot / violin / errorbar 都要手拼五六个 mark
   （demo 29 是活证据）。要糖就得上 Vega-Lite。
2. **数据流是 DAG，没有迭代与不动点。** 所以写不出 d3-sankey 那种
   「反复松弛以减少连线交叉」的布局 —— demo 22 的层内节点次序只能人工指定，
   这是它相对 d3-sankey 的真实差距。`force` 变换是唯一的例外（它内部自己迭代）。
3. **没有通用的标签避让。** `label` 变换需要真实 canvas 位图（纯 Node 跑不了），
   密集散点下效果有限；matplotlib 侧 `adjustText` 也不完美，但至少不挑运行环境。
4. **完全没有 3D。** mplot3d 那一套没有对应物。
5. **表达式语言弱。** 没有循环、没有自定义函数（只能用 `expressionFunction`
   从宿主注入，见 [20](demos/20-custom-transform-expr/)）。复杂几何要靠
   `sequence` + `flatten` 绕出来（demo 30 的逐轴刻度就是这么造的）。
6. **没有数学排版。** matplotlib 的 `mathtext` / `usetex` 能直接排 LaTeX 公式，
   Vega 只能贴纯文本。
7. **出版级排版更弱。** 精确物理尺寸、字体嵌入、CMYK、PDF/PGF 后端与 LaTeX 协同，
   matplotlib 成熟得多。
8. **生态。** matplotlib 背后是 numpy / scipy / statsmodels / pandas / cartopy /
   scikit-learn 一整套；统计量、拟合、地理投影、聚类都是现成的。
   Vega 只有 `regression` / `loess` / `kde` / `quantile` 这几个内置统计变换。
9. **中文/CJK 文字宽度测量。** 浏览器里靠 canvas `measureText` 是准的，但**无头 Node
   下退化为 `0.8 × 字数 × 字号` 的估算**，CJK 会被显著低估，导出的 SVG 里长中文标签
   可能贴边或越界。写长中文图例/标题时要留余量（本仓库多个 demo 踩过）。

## 五、怎么选

| 你的需求 | 选谁 |
| --- | --- |
| 标准统计图，越快出图越好 | **matplotlib / seaborn** |
| 论文排版、LaTeX 公式、精确物理尺寸 | **matplotlib**（PGF 后端） |
| 3D | **matplotlib**（mplot3d）或别的 |
| 要 scipy / statsmodels 的统计能力 | **matplotlib** |
| 等值线、hexbin、quiver 这类场与密度图 | **matplotlib**（内置且成熟） |
| 层次布局（treemap / pack / 径向树） | **Vega** |
| 要嵌进网页、要交互、要联动多视图 | **Vega** |
| 图形形状要自己算，而且算完还要能 hover / 刷选 / 导出 | **Vega** |
| spec 要由程序生成、要能自动校验 | **Vega** |
| 一份定义同时供浏览器与服务端无头出图 | **Vega** |

一句话：**matplotlib 的强项是"这个图有名字"，Vega 的强项是"这个图还没有名字"** ——
而且 Vega 让你在算完几何之后，白拿交互、拾取、响应式和矢量导出。

## 六、附：导出能力对照

本仓库**每个** demo 页面顶部都有统一的导出工具栏（由 `assets/demo.js` 自动注入）：
SVG / PNG（1×~4×）/ **透明背景开关（默认开）**。批量导出见 `node tools/export.cjs`。

| | Vega（本仓库） | matplotlib |
| --- | --- | --- |
| SVG | `view.toSVG(scale)`，从场景图重新生成 | `savefig('x.svg')` |
| PNG | `view.toCanvas(scale).toDataURL()` | `savefig('x.png', dpi=…)` |
| 透明背景 | 把内建 `background` signal 置 `null`；PNG 为 RGBA 且 alpha=0 | `savefig(..., transparent=True)` |
| 无头出图 | Node 直接出 SVG；PNG 需真实浏览器（`tools/export.cjs` 用 headless Chromium） | Agg 后端原生支持，无需浏览器 |
| PDF / EPS | 无（要靠 SVG 转） | 原生支持 |

这一栏 matplotlib 更全（PDF/EPS/PGF 原生），但 Vega 的 SVG 是**带语义结构的场景图**
（mark 分组、`aria-label`），后期在 Illustrator / Figma 里改起来更顺。

细节见每个 F 组 demo README 里的 `## 与 matplotlib 的对照` 一节。
