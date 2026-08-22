# 27 · 蜂群图与 Wilkinson 点图

一张图里放两个面板，用同一批数据（`cars.json` 的 400 辆车，按产地分组看马力）演示两种
**不做聚合、保留每个个体**的分布图：

- **左：蜂群图（beeswarm）** —— 点的 x 是真实数值，y 由 `force` 变换的物理仿真决定，
  靠 `collide` 力把互相压住的点推开。
- **右：Wilkinson 点图（dot plot）** —— 点先被 `dotbin` 归到最近的箱位中心，再由 `stack`
  在同一箱位里累加序号堆成一列；点的直径严格等于箱宽。

直方图告诉你"这一段有 28 个"，这两张图告诉你"这 28 个分别在哪"。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/27-beeswarm-dotplot/
```

## 学习目标

1. 用 **`force` 变换做"布局"而不是画关系图**：只挂 `forceX` / `forceY` / `collide` 三个力、
   不挂 `link` / `nbody`，力导向仿真就变成一个通用的"防重叠散点抖动器"。
2. 弄清 `force` 变换作用在 **mark item** 上而不是数据行上：所以 `forceX` 的目标位置要先在
   `encode.enter` 里算成 item 的自定义属性（本例叫 `xfocus` / `yfocus`），
   `force` 再用字段名去引用它。
3. 知道为什么无头渲染必须 `static: true`：非 static 的仿真按动画帧推进，`toSVG()`
   拍到的是"跑了一帧"的中间态；static 会在一个数据流脉冲里跑满 `iterations` 次再输出。
4. 掌握 `dotbin` 与 `bin` 的区别：`bin` 输出"区间 + 计数"（个体消失），
   `dotbin` 输出"每一行属于哪个箱位中心"（个体保留），再配 `stack` 得到堆叠序号。
5. 学会让 **像素几何和数据单位互相换算**：signal 表达式里可以用 `domain()` / `scale()` /
   `data()`，于是"箱宽 2.5 马力"能被算成"点直径 5.1 像素"，反过来纵轴一格也正好是一个点高。
6. 用两个 `group` mark 做并排面板，同时**共享顶层的 `x` 与 `color` 比例尺**
   （比例尺是在作用域链上向上解析的）。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width` / `height` / `padding` / `autosize` | 画布 | `autosize: pad` 让 Vega 自动为 title、legend、轴留边，不会把标题挤出画布 |
| `title` | 总标题 + 副标题 | `anchor: "start"` 左对齐；副标题里写清数据来源和"已剔除缺失值" |
| `signals`：`panelGap` / `groupTop` / `panelW` / `panelH` / `panel2X` | 面板几何 | 只有 `panelGap`、`groupTop` 是常量，其余都是派生 signal；改 `width` 两个面板自动重排 |
| `signals`：`hpSpan` / `pxPerHp` | 单位换算 | `span(domain('x'))` 读的是 `nice` 之后的真实 domain（`[40, 240]`，跨度 200），`pxPerHp = panelW / hpSpan` |
| `signals`：`nodeRadius` / `gravityX` / `gravityY` / `staticLayout` | 蜂群参数 | 四个都绑了控件；`staticLayout` 直接喂给 `force` 的 `static` 参数 |
| `signals`：`dotStep` / `dotSmooth` / `dotUnit` / `dotMax` | 点图参数 | `dotUnit = dotStep * pxPerHp` 是"一个点的直径"；`dotMax` 用 `data('dot-stats')[0].maxStack` 把聚合结果读回 signal |
| `data: cars-raw` → `cars` | 清洗 | `cars.json` 有 6 行 `Horsepower` 为 `null`，不 `filter` 掉 linear domain 会被污染 |
| `data: origins` | 每组统计 | `aggregate` 出 `count` 与 `median`，供蜂群基线和行尾 `n = …` 标注使用 |
| `data: dots` | 点图核心两步 | `dotbin`（写 `hpBin`）→ `stack`（`groupby: ["hpBin"]`，写 `stackLo` / `stackHi`） |
| `data: dot-stats` | 最高列 / 箱数 | `ops: ["max", "distinct"]` 一次算出 `maxStack` 和非空箱数量 |
| `data: panel-titles` | 两行标题文字 | 用内联 `values` + `datum.px * panel2X` 定位，避免写两个几乎一样的 text mark |
| `scales: x` | 共享横轴 | `range: {"signal": "[0, panelW]"}`；两个面板的 mark 和 axis 都引用它 |
| `scales: origin` | 蜂群的三条泳道 | `band` 比例尺，`range: [0, panelH]`，`band: 0.5` 取带中心当基线 |
| `scales: dotY` | 点图纵轴 | domain `[0, dotMax]`，range `[panelH, panelH - dotMax*dotUnit]` —— 这样"一个计数单位"正好是 `dotUnit` 像素 |
| `scales: color` | 共享配色 | `tableau10`，domain 与 `origin` 一致（都 `sort: true`），所以两个面板颜色对得上 |
| `legends` | 图例 | `orient: "top"` + `direction: "horizontal"`，`autosize: pad` 会自动腾出这一行 |
| `marks[0]` text | 面板小标题 | 画在 `groupTop` 让出的 26px 里；写成绝对坐标而不是 group 内负 y，避免被画布裁掉 |
| `marks[1]` group `beeswarm-panel` | 左面板 | `axes` 里放 `x`（底）与 `origin`（左），`marks` 里放基线 rule + 蜂群 symbol + 行尾 text |
| `swarm` mark 的 `transform` | force 布局 | 三个力：`collide`(radius=nodeRadius, iterations=2)、`x`(x="xfocus")、`y`(y="yfocus") |
| `marks[2]` group `dotplot-panel` | 右面板 | `axes` 里放 `x`（底）与 `dotY`（左，`tickMinStep: 1` + `format: "d"`），`marks` 里是 symbol + 注释 text |

### 关键概念

**1) force 变换的坐标是像素，目标位置必须先算成 item 属性**

`force` 变换挂在 mark 上（不是挂在 `data` 上），它读写的是 mark item 的 `x` / `y`。
`forceX` / `forceY` 的 `x` / `y` 参数类型是 **field**（字段名），不是表达式，所以目标位置得先
在编码里算好：

```json
"encode": { "enter": {
  "xfocus": { "scale": "x",      "field": "Horsepower" },
  "yfocus": { "scale": "origin", "field": "Origin", "band": 0.5 }
}}
```

`xfocus` / `yfocus` 不是 Vega 认识的视觉属性，它只是被原样写到 item 上的"自定义槽位"。
接着：

```json
{ "force": "x", "x": "xfocus", "strength": { "signal": "gravityX" } }
```

于是 `forceX` 每一步把 `item.x` 往 `item.xfocus` 拉 `strength` 比例的距离，`collide`
再把半径 `nodeRadius` 内互相重叠的点推开。两者拉锯的结果就是蜂群：
**x 基本忠实于真实马力（`gravityX` 越大越忠实），y 在基线附近展开成一团。**

`gravityY` 控制"厚度"：它太小时点会被 `collide` 推到很远的上下方（甚至串到隔壁泳道），
太大时点全被压在基线上、只能往横向溢出（x 就不准了）。默认 `gravityX=0.7`、`gravityY=0.2`
是这批数据下"x 准 + 三条泳道互不侵犯"的一个平衡点。

**2) `static: true` 是无头渲染的硬要求**

`force` 变换内部是 d3-force 的仿真。默认（`static: false`）它注册一个 tick 回调，
每个动画帧推进一步、重新渲染，收敛需要几十帧；纯 Node 里没有动画帧，
`await view.toSVG()` 拍到的是仿真刚开始的样子（甚至是随机初始位置）。
`static: true` 走另一条分支：在**当前这一次数据流脉冲里**同步跑满 `iterations`（本例 300）
次 tick，然后一次性输出收敛后的坐标。所以：

- 要在 `tools/validate.cjs` / `view.toSVG()` / 服务端导出里拿到稳定图，必须 `static: true`；
- 想在浏览器里看仿真"抖开"的动画过程，才关掉它（本例把它绑成一个 checkbox，两种都能看）。

顺带一提：`static: true` 也让同一份 spec **每次渲染结果完全一致**，截图对比才有意义。

**3) `dotbin` vs `bin`：点图不是直方图**

| | `bin` | `dotbin` |
| --- | --- | --- |
| 输出 | 每行加 `bin0` / `bin1`（区间端点），通常紧跟 `aggregate` 变成"每箱一行" | 每行加 `bin`（本例改名 `hpBin`）= 该行所属堆的**中心值**，行数不变 |
| 箱位边界 | 由 `extent` + `maxbins` / `step` 算出的**规则网格**，与数据无关 | 由数据本身"贪心扫描"出来：排序后从最小值起，凡落在 `[a, a+step)` 的点归成一堆，堆的位置取该堆首末值的中点 |
| 空箱 | 会出现（计数 0） | 不存在 —— 没有点就没有箱 |
| 箱宽的含义 | 只是横向区间宽度，纵向是计数（像素高度任意） | **既是横向区间宽度、也是点的直径**，所以纵向高度 = 点数 × 箱宽（有物理单位） |

`dotbin` 的参数就四个：`field`（必填）、`groupby`、`step`、`smooth`。
`step` 不给时默认取 `span(extent) / 30`。`smooth: true` 会做 Wilkinson 原文的平滑：
把相距不足 `step/4` 的相邻两堆之间的点互换，降低堆高的方差（视觉上更平滑，
代价是点的 x 位置更偏离真实值）。

`dotbin` 只给出"属于哪一堆"，纵向序号要自己算 —— 这就是 `stack` 的活：

```json
{ "type": "stack", "groupby": ["hpBin"], "sort": { "field": "Horsepower" },
  "as": ["stackLo", "stackHi"] }
```

`stack` 不给 `field` 时每行贡献 1，于是同一 `hpBin` 内的行拿到
`stackLo = 0,1,2,…`、`stackHi = 1,2,3,…`。`sort` 保证同一堆内按马力升序叠，
布局稳定可复现。

**4) 纵向几何：一格 = 一个点直径**

点图的纵轴不是"随便拉满面板"，它有真实单位。本例把这层换算全放在 `dotY` 比例尺里：

```
dotUnit = dotStep(马力) × pxPerHp          // 一个点的直径（像素）
pxPerHp = panelW / span(domain('x'))       // 横轴换算率
dotY: domain [0, dotMax]  →  range [panelH, panelH - dotMax * dotUnit]
```

于是 `scale('dotY', k) = panelH - k * dotUnit`，恰好"一个计数单位 = 一个点直径"，
而点心画在 `scale('dotY', stackLo + 0.5)`（半格偏移让圆心落在格子中间）。
symbol 的 `size` 是**直径的平方**（Vega 的 circle 用 `r = sqrt(size)/2`），
所以 `size: pow(0.9 * dotUnit, 2)` 得到直径 `0.9 * dotUnit` 的圆 ——
留 10% 缝隙好数点；严格的 Wilkinson 点图这里应该是 `pow(dotUnit, 2)`（点两两相切）。

同理蜂群那边 `size: pow(2 * nodeRadius, 2)`，画出的圆半径正好等于 `collide` 的半径，
"看起来不重叠"和"物理上不重叠"才是一回事。

因为点直径严格等于箱宽，**`dotStep` 变大时列会变高**（箱变宽 → 每箱点更多 × 每点更高，
双重放大）。本例把滑块上限定在 4 马力：此时最高列约 28 个点 × 8.2 px ≈ 230 px，
仍在 314 px 的面板内。想放开上限，就得同时给 `dotUnit` 加上
`min(dotStep * pxPerHp, panelH / dotMax)` 之类的截断 —— 但那样点直径就不再等于箱宽了，
图的"面积即数量"性质会被破坏，所以这里选择限制滑块而不是偷偷缩点。

**5) 两个面板共享比例尺**

`x` 和 `color` 定义在**顶层** `scales` 里，两个 `group` mark 内部的 mark 与 axis 直接按名字引用。
Vega 的比例尺按作用域链向上解析，所以不需要复制定义、也不会出现"左右两张图刻度不一致"
这种经典事故。反过来，`origin` 和 `dotY` 虽然也写在顶层，但只被各自的面板用到 ——
它们放顶层的唯一原因是 `dotY` 的 range 需要引用顶层 signal。

**6) 从数据算回 signal**

`dotMax` 的 update 表达式是 `data('dot-stats')[0].maxStack`。signal 表达式里的 `data()`
会建立对该数据集的依赖：拖 `dotStep` → `dots` 重跑 `dotbin`/`stack` → `dot-stats` 重新聚合
→ `dotMax` 更新 → `dotY` 的 domain/range 更新 → 点重新落位。这条链让"纵轴刚好装下最高列"
成为自动的，不用手填魔数。

## 试一试

1. **把 `force static` 的勾去掉**：蜂群会从初始位置抖开，几秒后收敛。再勾回来看它瞬间定位。
   然后运行 `node tools/validate.cjs 27` —— 校验器永远拿到的是 `static: true` 的默认值，
   所以稳定通过；把 spec 里 `"value": true` 改成 `false` 再跑一次，看 SVG 里点的坐标变得毫无规律。
2. **`gravityX` 拖到 0.02**：collide 占据主导，蜂群被推成一坨、x 完全失真（这时它已经不是
   蜂群图了）。再把 `gravityX` 拖到 1、`nodeRadius` 拖到 7：点无处可去，只能沿基线堆成
   厚厚一条，甚至挤进隔壁泳道 —— 这时该做的是调大 `gravityY` 或加大 `panelH`。
3. **`dotStep` 从 1 拖到 4**：看右上角注释里"箱宽 / 点直径 / 非空箱 / 最高列"四个数怎么联动，
   以及 `dotY` 轴的刻度上限如何跟着 `dotMax` 变化。`dotStep = 1` 时几乎每辆车自成一箱，
   图退化成一条一维散点带；`dotStep = 4` 时轮廓最接近直方图。
4. **勾上 `dotbin smooth`**：对比同一 `dotStep` 下最高列的变化（通常会降 1~3 个），
   轮廓更平滑；同时注意某些点的 x 位置偏离了它的真实马力。
5. **把点图也按产地分组**：给 `dots` 的 `dotbin` 加 `"groupby": ["Origin"]`、
   给 `stack` 的 `groupby` 改成 `["Origin", "hpBin"]`，再把 `y` 换成
   `scale('originDot', datum.Origin) + …` 之类的分组基线，就得到三条并排的点图带
   （和左边蜂群的三条泳道一一对应）。这是理解 `groupby` 在两个变换里各自作用的最好练习。
6. **把 `0.9 * dotUnit` 改成 `dotUnit`**：点两两相切，成为严格的 Wilkinson 点图；
   再改成 `1.1 * dotUnit` 看重叠是怎么产生的。

## 参考

- Vega `force` 变换：https://vega.github.io/vega/docs/transforms/force/
- Vega `dotbin` 变换：https://vega.github.io/vega/docs/transforms/dotbin/
- Vega `stack` 变换：https://vega.github.io/vega/docs/transforms/stack/
- Vega `aggregate` 变换：https://vega.github.io/vega/docs/transforms/aggregate/
- Vega `group` mark（面板/分面）：https://vega.github.io/vega/docs/marks/group/
- Vega `symbol` mark（含 `size` 是面积的说明）：https://vega.github.io/vega/docs/marks/symbol/
- Vega band 比例尺（`band` 属性取带内位置）：https://vega.github.io/vega/docs/scales/#band
- Vega 表达式语言（`domain` / `scale` / `data` / `span` / `format`）：https://vega.github.io/vega/docs/expressions/
- Vega 官方示例 Beeswarm Plot：https://vega.github.io/vega/examples/beeswarm-plot/
- Vega 官方示例 Wilkinson Dot Plot：https://vega.github.io/vega/examples/wilkinson-dot-plot/
- Leland Wilkinson, *Dot Plots*, The American Statistician 53(3), 1999：
  https://www.cs.uic.edu/~wilkinson/Publications/dotplots.pdf

## 与 matplotlib 的对照

**这两张图在 Vega 里是"声明"出来的，在 matplotlib 里必须"算"出来。**

### 蜂群图

Vega 侧只有三行力的声明加两个 `xfocus`/`yfocus` 编码，布局引擎（d3-force）是内置的：

```json
"forces": [
  { "force": "collide", "radius": {"signal": "nodeRadius"}, "iterations": 2 },
  { "force": "x", "x": "xfocus", "strength": {"signal": "gravityX"} },
  { "force": "y", "y": "yfocus", "strength": {"signal": "gravityY"} }
]
```

matplotlib 本体**没有任何蜂群布局**。你有三条路：

1. **装 seaborn**：`sns.swarmplot(data=df, x="Horsepower", y="Origin", hue="Origin")`。
   一行就完事，而且它是确定性的贪心算法（不是物理仿真），结果比 force 更规整。
   代价是：多一个依赖；点数大、点又画得大时 seaborn 会打印类似
   `UserWarning: 12.5% of the points cannot be placed; you may want to decrease the size of
   the markers or use stripplot.` 的警告，并**把放不下的点留在原地互相重叠**——
   它不像 force 那样"挤不下就继续往外扩"，而是直接放弃这部分点的不重叠保证。
   参数只有 `size` / `dodge` / `orient`，没有"力强度"这种连续旋钮可调。
2. **装 beeswarm / bee-swarm 之类的第三方包**，成熟度和维护状况都不如 seaborn。
3. **自己写布局**：排序后逐点尝试 y 偏移（`0, +d, -d, +2d, …`），检测与已放置点的
   欧氏距离是否小于 `2r`，冲突就换下一个候选 —— 大约 30~50 行，还要自己处理
   "点半径是数据坐标还是显示坐标"（`scatter` 的 `s` 是 points² 面积，
   而重叠判定发生在像素空间，需要 `ax.transData` 来回换算，这一步最容易写错）。
   force 仿真那条路更难：得自己装 `networkx` 或手写 Verlet 积分。

另外，Vega 里 `nodeRadius` 改变时 `collide` 半径和 symbol 直径**同时**跟着变，因为两者都由
同一个 signal 驱动；matplotlib 里"重叠判定用的半径"和"`scatter(s=...)` 画出来的半径"
是两个独立的数，改一个忘改另一个是常见 bug。

### Wilkinson 点图

Vega 侧是两个内置变换（`dotbin` + `stack`）加一次线性换算。

matplotlib / seaborn / pandas 里**没有 `dotbin` 的等价物**。`plt.hist` 只给你计数，
`sns.stripplot` 是随机抖动（不是堆叠），`sns.histplot` 也不画个体点。要复刻这张图，
你得亲手实现 Wilkinson 1999 的贪心扫描（不长，但要写对）：

```python
xs = np.sort(df.Horsepower.values)
centers, i = np.empty_like(xs, dtype=float), 0
while i < len(xs):
    j = i
    while j < len(xs) and xs[j] < xs[i] + step:
        j += 1
    centers[i:j] = (xs[i] + xs[j-1]) / 2      # 堆中心 = 首末值中点
    i = j
```

然后再自己按 `centers` 分组、给每组内的点编号（`groupby(...).cumcount()`），
最后 —— 也是最麻烦的一步 —— 把"点直径 = 箱宽"落实到画布上：

```python
# s 的单位是 points²，箱宽的单位是马力；必须过一遍 transData
p0, p1 = ax.transData.transform([(0, 0), (step, 0)])
diam_px = p1[0] - p0[0]
diam_pt = diam_px * 72 / fig.dpi
ax.scatter(centers, (idx + 0.5) * step, s=diam_pt**2)   # y 用数据单位才不会变形
ax.set_aspect(...)  # 还得锁定纵横比，否则窗口一改点就重叠
```

这段换算依赖 `fig.dpi`、`figsize`、坐标轴范围三者，任何一个变了就得重算 ——
所以 matplotlib 版的点图一旦 `plt.show()` 里拖动窗口或改 `dpi` 保存，
点就会互相重叠或散开。Vega 里同一件事是 `dotUnit = dotStep * panelW / span(domain('x'))`
一个 signal，`width` 改了它自动重算，纵轴 range 也跟着重算。

### 交互

本例的 6 个滑块/勾选框在 Vega 里是 `signals[].bind`，共 6 段 JSON、零行 JS，
拖动时整条数据流（`dotbin` → `stack` → `aggregate` → signal → scale → mark）自动重跑。
matplotlib 要补出同样的东西：`matplotlib.widgets.Slider` + 手写回调 + 手动
`ax.clear()` / 重画 / `fig.canvas.draw_idle()`，而且蜂群那边每次都要重跑整个布局算法；
换成 Jupyter 里的 `ipywidgets` 会好一些，但仍然是"回调里重画整张图"的命令式写法，
状态一多就容易漏更新。悬停 tooltip 在 Vega 是一行 `"tooltip": {"signal": ...}`，
matplotlib 需要 `mplcursors` 或手写 `motion_notify_event` + 最近点搜索。

### 反过来说，matplotlib 更省事的地方

- **`sns.swarmplot` 一行出图**：如果你要的就是默认审美的蜂群图，不需要参数可调，
  seaborn 比这份 200 行 JSON 快得多。同理 `sns.violinplot(inner="stick")`、
  `sns.stripplot(jitter=True)` 这些"够用的近似"都是一行。
- **统计能力**：想在图上叠核密度、置信区间、回归、显著性检验，Python 侧有
  scipy / statsmodels，写一行就有；Vega 只有 `kde` / `loess` / `regression` / `quantile`
  这几个内置变换，超出范围就得在数据端预处理。
- **导出与排版**：`plt.savefig("f.pdf")` 直接出矢量 PDF，字体嵌入、`usetex` 公式、
  `constrained_layout` 自动排版都是现成的；Vega 只能出 SVG/PNG，进 LaTeX 还要一道转换。
- **纯粹的代码复用**：布局算完之后 Python 里那些中心值、堆叠序号就是普通 numpy 数组，
  可以拿去做别的分析；Vega 的中间结果活在数据流里，取出来要走 `view.data('dots')`。
- **调试**：Python 里可以 `print(centers[:20])` 单步查；Vega 的数据流出问题时，
  只能靠 `view.data()`、`tools/inspect.cjs` 这类外部探针看中间态。

一句话总结：**Vega 赢在"布局算法内置 + 单位换算可声明 + 交互免费"，
matplotlib 赢在"生态里已经有人替你封装好了默认款 + 统计和排版更强"。**
蜂群图这种"需要一个布局引擎"的图，正是 Vega 的语法优势最明显的地方；
而如果你只想要一张静态的、参数写死的蜂群图，`sns.swarmplot` 一行就够了。
