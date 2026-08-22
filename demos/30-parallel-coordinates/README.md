# 30 · 平行坐标图：多轴归一化与逐轴刻度反算

平行坐标（parallel coordinates）把 N 个数值维度画成 N 条竖轴，每条记录是一条穿过全部轴的折线。
它是少数能在一张二维图里同时看六七个维度的图形，代价是过绘（overplotting）——
本例用 392 辆车 × 6 个维度 = 2352 个数据点、392 条折线来演示这个代价怎么控制。

## 学习目标

- 学会平行坐标的核心套路：**`fold` 宽表转长表 → 按维度求 min/max → 归一化到 0–1 → 所有维度共用一条 y 比例尺**；
- 学会「共用一条归一化 scale + 每条轴自己的真实刻度」这一手：轴的刻度标签不是 0–1，
  而是用 `dmin + frac × (dmax − dmin)` 反算回原始数值，配 per-dimension 的 `format` 串；
- 掌握「一条折线 = 一个 facet group」这个必须的结构：`line` mark 只会把 `from.data` 的所有行连成**一条**路径，
  想画 392 条线就得 `group` mark facet 出 392 个分组；
- 学会用 `formula` + 表达式函数 `sequence()` + `flatten` 变换，凭空造出一张「刻度表」数据集；
- 学会两个高亮技巧：透明命中层（invisible hit layer）解决细线难悬停，`zindex` 把悬停的线提到线束之上。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/30-parallel-coordinates/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.lineOpacity` | 折线不透明度 | 平行坐标唯一的过绘对策。0.22 时能看出线束密度；拖到 0.9 就糊成一片，拖到 0.05 只剩主干 |
| `signals.interpolate` | 折线插值方式 | 直接绑到 `line.interpolate`。`monotone` 让相邻轴之间的线更容易用眼睛跟随，但会轻微歪曲「值在轴上的位置」之外的部分 |
| `signals.tickCount` | 每条轴的刻度数 | 参与 `axis-ticks` 的 `formula`，改了整张刻度表重算 |
| `signals.hitWidth` | 命中层线宽 | 1px 的可见线太难悬停，用一条同路径、透明、加粗的线专门吃鼠标事件 |
| `signals.hovered` | 悬停中的记录 | `@carline:mouseover → datum`。`line` mark 被拾取时交出的 item 是该分组的**第一行**，而 `fold` 用 `derive` 克隆了原始行，所以 `datum` 里带着 `Name` / `Origin` / 六个原始字段 |
| `signals.originFilter` | 图例点击筛选 | `@legendSymbol:click` 切换选中，`pointerup[!event.item]`（点在空白处）清空 |
| `data.cars` | 原始宽表 | `isValid()` 逐字段剔 null（cars.json 的 `Horsepower`/`Miles_per_Gallon` 有缺失，406 → 392 行）；`identifier` 变换补一个唯一 `recordId`，这是后面 facet 的分组键（`Name` 不唯一，不能当键） |
| `data.dims` | 维度元数据表（inline） | 6 行：`key`（字段名）、`label`（中文轴标题）、`order`（轴顺序）、`fmt`（该维度刻度的 d3-format 串）。**轴的 x 位置就是这张表的 point 比例尺**，改这张表就能增删/重排轴 |
| `data.folded` | 宽表 → 长表 | `fold` 把 6 个字段折成 6 行 `{dim, value}`；它内部用 `derive(d)` 克隆原行，所以 `recordId`/`Origin`/`Name` 全都保留。392 × 6 = 2352 行 |
| `data.extent` | 每维度的真实值域 | `aggregate` groupby `dim`，同一字段两次 `["value","value"]` 配 `["min","max"]` → `dmin`/`dmax`，6 行。归一化和刻度标签都依赖它 |
| `data.paths` | 折线数据 | 两次 `lookup`（从 `extent` 取 `dmin/dmax`，从 `dims` 取 `order`）→ `formula` 算 `norm` → `collect` 按 `dimOrder` 排序。**排序是必须的**：facet 分组保留源数据顺序，不排序则折线的连线顺序不确定 |
| `data.axis-ticks` | 每条轴的刻度表 | `formula` 用表达式函数 `sequence(0, 1.0000001, 1/(tickCount-1))` 给每个维度挂一个等分比例数组 → `flatten` 拆成一行一个刻度（6 × 6 = 36 行）→ `lookup` 取该维度值域 → `formula` 反算 `tickValue` |
| `scales.xDim` | 六条轴的横向位置 | `type: "point"`、`domain` 取 `dims.key`、`range: "width"`、`padding: 0` ⇒ 第一条轴在 x=0、最后一条在 x=width，间距 `width/5 = 156px`。ordinal 域按数据行序，所以轴序由 `dims` 表决定 |
| `scales.y` | **唯一**的纵向比例尺 | `domain: [0, 1]`、`range: "height"`（等价 `[height, 0]`，即 0 在底边）。六个量级从 3 到 5140 的维度全靠归一化挤进这一条比例尺 |
| `scales.origin` | 按产地配色 | ordinal + `tableau10`，`sort: true` 让 Europe/Japan/USA 的配色稳定 |
| `legends[0]` | 折线图例 | `stroke` 通道 + `symbolType: "stroke"` ⇒ 图例符号画成一小段线而不是圆点；`encode.symbols/labels` 命名成 `legendSymbol`/`legendLabel` 才能被事件选择器 `@legendSymbol:click` 命中 |
| `marks[0]`（group + facet） | 392 条折线 | `from.facet.groupby: ["recordId"]`；组内两个 `line`：可见线（`interactive: false`）+ 命中线（`name: "carline"`）。group 的 `zindex` 由 `hovered` 驱动，把选中的线提到最上层 |
| `marks[1]`（rule） | 六条竖轴 | `y: {"scale":"y","value":0}`、`y2: {"scale":"y","value":1}` —— 用比例尺把归一化的 0/1 翻成底边/顶边像素，比写死 `height`/`0` 更能表达意图 |
| `marks[2]`（rule） | 刻度短线 | `x` 用信号表达式 `scale('xDim', datum.key) - 6`：**表达式里也能调比例尺**，这是手工几何的关键工具 |
| `marks[3]`（text） | 刻度标签 | `format(datum.tickValue, datum.fmt)` —— 数值和格式串都来自数据行，一条 mark 声明覆盖六种不同量级/小数位 |
| `marks[4]`（text） | 轴标题 | `y: -10`（负值即绘图区上方）。默认 `autosize: "pad"` 会按整个场景图的包围盒自动扩边距，所以伸到绘图区外的 mark 不会被裁掉 |
| `marks[5]`（text） | 悬停读数 | 没有 `from` 的 mark 只产生**一个** item，正好用来做一行随 signal 变化的文字；`y: height + 16` 放在绘图区下方 |

### 关键概念

**1. 归一化：六个量级怎么共用一条比例尺**

六个维度的真实值域差了三个数量级（`Cylinders` 3–8，`Weight_in_lbs` 1613–5140）。
把它们画在同一条 y 上必须先无量纲化：

```
norm = (value − dmin) / (dmax − dmin)        // dmin/dmax 来自 extent 数据集，按 dim 分组
y_px = scale('y', norm)                       // y: domain [0,1] → range [height, 0]
```

`formula` 里写了 `datum.dmax > datum.dmin ? ... : 0.5` 的兜底：如果某个维度全表只有一个取值，
分母为 0 会算出 `NaN`，整条折线消失且比例尺报 `Infinite extent`。常数维度画在轴中点是合理退化。

**2. 逐轴刻度：把 0–1 反算回真实数值**

共用比例尺的代价是「y 轴的刻度对谁都不对」，所以不能用内置 `axis`，得自己造刻度表。
第 i 个刻度的归一化位置与显示值：

```
frac_i      = i / (tickCount − 1)                    // i = 0 … tickCount−1，等分 [0,1]
tickValue_i = dmin + frac_i × (dmax − dmin)          // 线性反变换，frac=0 → dmin，frac=1 → dmax
x           = scale('xDim', key)                     // 轴的横向位置
y           = scale('y', frac_i)                     // 刻度的纵向位置
```

`sequence(0, 1.0000001, 1/(tickCount-1))` 里那个 `1.0000001` 不是玄学：
`sequence`（= `d3.range`）**右开区间**，写 `stop = 1` 会漏掉最后一个刻度，
加一个比浮点误差大、比刻度间距小的余量才能保证 `frac = 1` 被包含进来。

这套刻度是**在归一化空间等分**的，所以首尾标签一定是该维度的真实 min/max
（如 `1,613 lbs` / `5,140 lbs`），但中间的值不会是「整数好看刻度」（`2,318` 而不是 `2,500`）。
对平行坐标来说这是个划算的取舍：读者最关心的「这条线贴顶还是贴底」直接有真实数字对照。
想要 nice 刻度就得走另一条路——给每个维度建一条 `nice: true` 的真实 linear scale，
在 encode 里用 `scale(datum.dim, datum.value)`（**比例尺名可以是表达式**，只要 scale 名等于维度名），
然后用六个内置 `axis` 配 `scale` + `translate`。那条路刻度更漂亮，代价是 spec 里要写六份重复的 scale/axis。

**3. 一条折线 = 一个 facet group**

`line` mark 的语义是「把 `from.data` 的所有行按顺序连成一条路径」——它没有 series/detail 通道，
一个 line mark 永远只产出一条路径。所以多序列折线在 Vega 里只有一种写法：
`group` mark + `from.facet` 按分组键切分，组内的 line 只看到自己那 6 行。
`facet` 分组内部保留源数据顺序，因此上游 `collect` 按 `dimOrder` 排序是正确性要求，不是美观要求。

组内还有一条同路径、`strokeOpacity: 0`、`strokeWidth: hitWidth` 的**命中层**：
Vega 的线段拾取用的是描边区域（`isPointInStroke`），与颜色/透明度无关，
所以透明粗线是免费的大号鼠标目标；可见线则设 `interactive: false`，避免两层互相抢事件。
代价是折线的 `path` 数量翻倍：`inspect.cjs` 报的 `path: 1585` = 392 条可见线 + 392 条命中线 + 399 个 group 各自的 background/foreground 占位 path（392 个 facet 组 + root/legend/legend-entry/scope/title）+ 3 个图例符号。`line: 42` 则是 6 条轴 + 36 个刻度短线，`text: 49` 是 36 个刻度标签 + 6 个轴标题 + 读数 + 图例 3 项与标题 + 图标题与副标题。

**4. 高亮的三段式表达**

`strokeOpacity` 一个表达式覆盖三种状态，读起来就是一句话：

```
hovered ? (是我 ? 1 : lineOpacity × 0.25)                       // 有人被悬停：我高亮，别人淡出
        : (无筛选 || 产地匹配 ? lineOpacity : lineOpacity × 0.12) // 没人被悬停：看图例筛选
```

配合 group 的 `zindex`（`hovered` 时为 1）把选中的线提到线束之上——
否则它会被后面绘制的几百条线压住，高亮了也看不见。

## 试一试

1. 拖 `lineOpacity`：0.05 / 0.22 / 0.9 各看一次。这是平行坐标最重要的参数，它决定你看到的是「主干」还是「一团墨」。
2. 把 `data.dims` 里 `Acceleration` 那行删掉，或者把 `Cylinders` 的 `order` 改成 6 并把后面几行顺次减 1 ——
   轴的数量与顺序完全由这张表驱动，spec 其余部分一行都不用改。轴顺序很关键：相邻轴之间的「交叉 vs 平行」才是平行坐标的读法
   （平行 = 正相关，X 形交叉 = 负相关，试试让 `Weight_in_lbs` 和 `Miles_per_Gallon` 相邻）。
3. 把 `tickCount` 拖到 3 和 9，观察 `Cylinders` 轴：`fmt` 是 `,.0f`，9 个刻度时会出现重复的 `4`/`5`
   （等分位置四舍五入到整数）。把它的 `fmt` 改成 `,.1f` 看差别，体会「等分刻度 + 定点格式」的固有张力。
4. 给 `marks[0]` 组内的可见线加一个 `tooltip` 编码（参考 demo 12），或把 `hovered` 的事件从 `mouseover` 换成 `click`，
   做成「点选钉住」——记得 `update` 写成 `hovered && hovered.recordId === datum.recordId ? null : datum` 才能点第二下取消。
5. 进阶：加一个 `brush` 交互做轴上区间筛选（平行坐标的标准玩法）——
   在每条轴上放一个可拖的 `rect`，用 `signal` 记下 `[y0, y1]`，再在 `paths` 上加 `filter`
   只留下在该轴区间内的 `recordId`。参考 demo 11 的 brush 与 demo 09 的 crossfilter。

## 参考

- [Fold 变换](https://vega.github.io/vega/docs/transforms/fold/) · [Aggregate 变换](https://vega.github.io/vega/docs/transforms/aggregate/) · [Lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/)
- [Flatten 变换](https://vega.github.io/vega/docs/transforms/flatten/) · [Formula 变换](https://vega.github.io/vega/docs/transforms/formula/) · [Identifier 变换](https://vega.github.io/vega/docs/transforms/identifier/) · [Collect 变换](https://vega.github.io/vega/docs/transforms/collect/)
- [表达式函数](https://vega.github.io/vega/docs/expressions/)（`sequence`、`format`、`scale`、`isValid`）
- [Group 标记与 facet](https://vega.github.io/vega/docs/marks/group/) · [Line 标记](https://vega.github.io/vega/docs/marks/line/) · [Rule 标记](https://vega.github.io/vega/docs/marks/rule/) · [Text 标记](https://vega.github.io/vega/docs/marks/text/)
- [Point / Band 比例尺](https://vega.github.io/vega/docs/scales/#point) · [图例](https://vega.github.io/vega/docs/legends/) · [事件流选择器](https://vega.github.io/vega/docs/event-streams/)
- 官方相关示例：[Parallel Coordinates](https://vega.github.io/vega/examples/parallel-coordinates/)（用的是「每维一条真实 scale」那条路线，可与本例对读）

## 与 matplotlib 的对照

**Vega 侧靠什么声明式地表达出来**

| 这张图的组成 | Vega 的语法元素 |
| --- | --- |
| 宽表转长表 | `fold` 变换（一行 JSON） |
| 每维度 min/max | `aggregate` + `groupby`，再 `lookup` 贴回每一行 |
| 归一化 | 一条 `formula` |
| 392 条折线 | `group` + `from.facet`，Vega 自己按键分组、自己管增删改 |
| 六条轴、36 个刻度 | 两条 `rule` + 两条 `text` mark，数据来自 `sequence` + `flatten` 造出的刻度表 |
| 悬停高亮 / 图例筛选 | `signals` + 事件流选择器 + encode 里的三元表达式；**没有一行事件回调代码** |
| 参数旋钮 | `signal.bind` 自动生成滑块和下拉框 |

关键差别不是「代码短」，而是**声明的是关系而不是步骤**：
`norm` 是 `value` 和该维度 `dmin/dmax` 的函数，`strokeOpacity` 是 `hovered`/`originFilter` 的函数。
拖动 `tickCount` 时，Vega 的数据流引擎自己知道要重算 `axis-ticks`（36 行）而不必碰 `paths`（2352 行）；
悬停时只重算受影响 mark 的 encode，数据流一动不动。

**换成 matplotlib / seaborn 要付什么**

- **图本身：pandas 自带 `pandas.plotting.parallel_coordinates`**，一行能出图 —— 但它把每列**按全表统一**处理，
  不做逐列归一化（列量级差三个数量级时图直接报废），也不画逐轴刻度。所以实战里基本都得手写：
  `(df - df.min()) / (df.max() - df.min())` 归一化，`ax.plot(range(n), row.values)` 逐行画线（或 `LineCollection` 批量画），
  再 `for i, col in enumerate(cols)` 建 6 个 `ax.twinx()`（或手工 `ax.text` + `ax.vlines`）补真实刻度 ——
  `twinx` 的做法还得逐个 `spine.set_position(('axes', i/(n-1)))` 挪轴的位置，
  刻度值则要自己 `np.linspace(dmin, dmax, k)` 配 `FuncFormatter`。本例 README 里那两个公式，
  在 matplotlib 版本里是必须亲手写出来的代码；在 Vega 里是 `formula` 的 `expr` 字符串。
  常见的替代是装第三方包（`plotly.express.parallel_coordinates`、`pandas-alive`、`yellowbrick` 的
  `ParallelCoordinates`），但那就换了一套渲染栈，且交互能力各有各的天花板。
- **透明度过绘**：`plt.plot(..., alpha=0.2)` 一样能做，这块没差。matplotlib 甚至更快
  （`LineCollection` 一次提交 392 条线；Vega 这里是 392 个 group × 2 个 line mark 的场景图节点）。
- **交互**：这是差距最大的地方。matplotlib 里「悬停高亮单条 + 图例点击筛选 + 三个参数滑块」
  需要 `fig.canvas.mpl_connect('motion_notify_event')` 自己算命中（线段点到线的距离，
  或者 `Line2D.contains(event)` 逐条试）、自己维护「当前高亮是谁」的状态、
  自己 `set_alpha`/`set_zorder`/`set_linewidth` 再 `fig.canvas.draw_idle()`；
  滑块要 `matplotlib.widgets.Slider` 并手写回调；而且这一切**只在交互式后端里活着**，
  存成 PNG 就全没了。Vega 的等价物是本例的 6 个 signal，且导出成 HTML 后交互照旧。
- **命中层这一招**：matplotlib 没有对应概念（它的 `contains` 用的是 `pickradius`，
  倒是可以直接把 `line.set_pickradius(7)` 当命中半径用 —— 这点比 Vega 的双层 mark 更省事）。

**反过来，matplotlib 更省事的地方**

- **nice 刻度**：`MaxNLocator` 免费给你「好看的整数刻度」。Vega 里内置 `axis` 也有，
  但本例为了六轴共用一条归一化 scale 主动放弃了它，只能等分刻度 + 定点格式（见「试一试 3」的取舍）。
- **纯静态出图 / 批量导出**：`savefig` 一行，矢量 PDF、300 dpi PNG、LaTeX 字体全都开箱即用；
  Vega 要走 `vega-cli` 或本仓库 demo 21 的 Node 无头渲染。
- **数据规模**：几万条线时 `LineCollection` 还能扛，Vega 的场景图会先撑不住
  （每条线一个 group + 两个 mark 的开销在这里是实打实的）。真要上万级记录，
  Vega 侧的正解是先聚类/抽样/分箱（比如按产地聚合成中位数线束），而不是硬画。
- **纸面排版的精细控制**：轴标签防重叠、公式排版、子图网格对齐这些事，matplotlib 的 API 更成熟直接。
