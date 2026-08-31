# 25 · 等值线与二维核密度：isocontour + kde2d

两个面板，一条主线：**等值线（contour）的输入永远是「栅格（grid）」，不是数据行。**

- **左：火山地形等值线。** `assets/data/volcano.json` 本身就是一张 87×61 的规则高程网格
  （`{width, height, values}`），可以直接喂给 `isocontour`，用**显式 `thresholds`** 切出
  20 条填色等值带 + 每 20 m 一条的白色等高线，并给等高线贴上高程标签。
- **右：企鹅喙形二维核密度等值线。** `assets/data/penguins.json` 是散点，先用 `kde2d`
  把它**估**成一张密度栅格，再用同一个 `isocontour`（这次用**自动 `levels`**）切等值线，
  叠加原始散点做对照。`bandwidth` / `cellSize` / `levels` 都挂在 signal 上，可以拖着看。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/25-contour-density2d/
```

无头校验：

```sh
node tools/validate.cjs 25
node tools/inspect.cjs 25 --rows 5
```

## 学习目标

1. 认清 `isocontour` 的**输入形态**：它要的不是一行行数据，而是一个
   **栅格对象** `{values, width, height}`（可选 `x1/y1/x2/y2`、`scale`、`translate`）。
   `volcano.json` 整个文件就是一个这样的对象，被 Vega 摄入成**一行**。
2. 认清 `isocontour` 的**输出形态**：每条阈值产出**一行**，行里的 `contour` 字段是一个
   GeoJSON `MultiPolygon`，并带一个 `value`（该条的阈值）。多边形圈住的是
   `值 >= 阈值` 的区域，所以低阈值的多边形**包含**高阈值的多边形 —— 按阈值升序绘制并填色，
   就自然叠成了地形色带。
3. 分清 `thresholds` / `levels` / `nice` / `zero` / `resolve` / `smooth` 六个参数的分工，
   知道「给了 `thresholds` 之后其余五个里哪几个会被无视」。
4. 学会 `kde2d`：把散点估成二维密度栅格，理解 `size` / `bandwidth` / `cellSize` 为什么
   全都以**像素**为单位，以及为什么 `x`/`y` 必须写成 `{"expr": "scale('xPen', ...)"}`。
5. 学会用 `geopath` + `path` mark 把 GeoJSON 画出来 —— **不给 `projection` 就是恒等投影**，
   坐标直接当像素用，这是等值线这类「非地理 GeoJSON」的标准打法。
6. 顺带三个实用手艺：`path` mark 必须显式 `fill: null` 才不会被默认填充色糊掉；
   两层 `text` 做描边光晕；两个面板靠 signal 手工摆位（不用 facet）。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals`（前 7 个） | 暴露可玩参数 | `bandStep` / `lineStep` 控制两套阈值步长；`smoothContours` 控制 `isocontour.smooth`；`bandwidth` / `levels` / `cellSize` 控制 kde2d + isocontour；`showPoints` 控制散点透明度 |
| `signals`（后 8 个） | 纯布局 | `volW=348, volH=244, penW=300, penH=244` 与 `volX=46, penX=volX+volW+100, panelY=40, captionY=panelY+volH+48`。两个面板是**手工摆位**的 group mark，不是 facet |
| `data: volcano` | 载入栅格 | `volcano.json` 是**一个对象**而非数组，摄入后只有 1 行，字段就是 `width` / `height` / `values`。`inspect` 里显示为 `{ width: num 87, height: num 61, values: arr[5307] }` |
| `data: volcanoBands` | 填色等值带 | `isocontour` + **显式** `thresholds: sequence(100, 200, bandStep)`；`scale: {"expr": "volW / datum.width"}` 把网格下标坐标放大成面板像素 |
| `data: volcanoLines` | 描边等高线 | 同一张网格，阈值步长粗一档（`lineStep`），只描边不填色 |
| `data: volcanoLabels` | 等高线标签锚点 | 从 `contour.coordinates`（四层数组）取环中点，滤掉贴边框的锚点，`clamp` 兜底，`format(value,'d') + ' m'` 出标签文字 |
| `data: penguins` | 清洗散点 | 字段名带空格与括号，只能写 `datum['Beak Length (mm)']`；**先 `filter` 掉 null**，否则 `kde2d` 会把 `NaN` 打进栅格、比例尺 domain 也会被污染（342/344 行存活） |
| `data: penguinDensity` | 二维核密度 | `kde2d` 按 `Species` 分 3 组，每组输出**一行**，行里的 `grid` 是栅格对象。`x`/`y` 用 `expr` 先过比例尺，把 mm 换成像素 |
| `data: penguinContours` | 密度等值线 | `isocontour` 的 `field: "grid"` 指向上一步的栅格；用 `levels` 自动挑阈值；`resolve: "shared"` 让三个种类共用一套阈值 |
| `scales` | 6 条 | `xVol`/`yVol` 只是**装饰性参考轴**（等值线本身走像素坐标，不过比例尺）；`elev` 是 viridis 连续色；`xPen`/`yPen` 供 `kde2d` 的 `expr` 与散点共用；`species` 是 tableau10 |
| `legends` | 2 条 | 顶层放：`elev` 的 gradient 图例（`values: [100,…,180]` 与等高线对齐）＋ `species` 的 symbol 图例 |
| `marks[0]` `volcanoPanel` | 左面板 | group mark：`encode.update` 定位，内部 `axes` 引用**顶层** scale（scale 作用域向外查找），子 mark 依次是底色 rect → 填色 path → 白线 path → 光晕 text → 文字 text |
| `marks[1]` `penguinPanel` | 右面板 | 底板 rect → 密度等值线 path（描边 + 7% 填充）→ 散点 symbol（`showPoints` 控制不透明度，`hover` 放大） |
| `marks[2]` | 动态图注 | 用 `length(data('volcanoBands'))` / `length(data('penguinContours'))` 把「参数 → 实际条数」写在图上，改 signal 时数字会跟着变 |

### 关键概念

**① `isocontour` 的输入：栅格对象**

```js
{ values: [...],        // 长度必须是 width * height，行优先（row-major）
  width: 87, height: 61,
  x1, y1, x2, y2,       // 可选：有效子区域（kde2d 用它剥掉模糊padding）
  scale, translate }    // 可选：坐标变换，见下
```

`field` 参数指到哪个字段就用哪个字段当栅格；**不写 `field` 就把整行当栅格**。
左面板不写 `field`（`volcano.json` 本身就是栅格），右面板写 `field: "grid"`。

**② `isocontour` 的输出：一条阈值一行**

```js
{ contour: { type: 'MultiPolygon', value: 140, coordinates: [ … ] },
  width: 87, height: 61, values: [...] }   // 源行的字段被 rederive 复制过来
```

`coordinates` 是 `[多边形][环][点][x|y]` 四层数组。本例的标签锚点就是
`datum.contour.coordinates[0][0][floor(n/2)]` —— 第 1 个多边形、第 1 个环、环上的中点。
源行字段被复制过来这一点很关键：右面板正因如此，等值线行上仍带着 `Species`，
才能直接 `{"scale": "species", "field": "Species"}` 上色。

**③ 坐标是怎么算出来的（手工几何全在这里）**

`isocontour` 出来的坐标本来是**网格下标**（左面板 0…87 × 0…61）。变换公式（`transformPaths`）是：

```
x_out = (x_grid - x1) * sx + tx
y_out = (y_grid - y1) * sy + ty
```

其中 `sx, sy` 取 `_.scale`（transform 上写的）**或** `grid.scale`（栅格对象自带的），
`tx, ty` 同理取 `_.translate` 或 `grid.translate`。于是有两种截然不同的用法：

- **左面板：栅格不带 `scale`，必须自己给。** 面板 348×244、网格 87×61，
  `348 / 87 = 4` 且 `244 / 61 = 4`，两轴倍数恰好相同，所以一个数字就够：
  `"scale": {"expr": "volW / datum.width"}` → 4。这也是把 `volW/volH` 选成 348/244
  的原因 —— 让缩放是整数倍，等值线不会被非等比拉扁。
- **右面板：栅格自带 `scale` 与 `x1/y1`，什么都不用写。** `kde2d` 返回的栅格是
  `{width:85, height:71, x1:5, y1:5, x2:80, y2:66, scale:4}`（默认 `cellSize=4` 时），
  `isocontour` 自动用它们把坐标还原回 0…300 × 0…244 的面板像素。
  这几个数的来历：`cellSize = 4 → k = 2`；`bandwidth = 14` 经
  `radius(bw) = round((√(4bw²+1) − 1) / 2) = 14`，再 `>> k` 得模糊半径 `r = 3`；
  为了让盒式模糊不吃掉边界，两侧各留 `r + 2 = 5` 格 padding，于是
  `width = 2×5 + (300 >> 2) = 85`、`height = 2×5 + (244 >> 2) = 71`，
  有效区 `[x1, x2) = [5, 80)` 正好 75 = `300 >> 2` 格。

**④ `thresholds` vs `levels`（以及 `nice` / `zero` / `resolve`）**

| 参数 | 含义 | 本例 |
| --- | --- | --- |
| `thresholds` | **显式**阈值数组。给了它，`levels` / `nice` / `zero` / `resolve` 全部被忽略 | 左面板：`sequence(100, 200, 5)` → 100,105,…,195 共 20 条 |
| `levels` | **期望**的等值线条数，由内部 `quantize` 自动挑阈值 | 右面板：`levels=6` → 每个种类 6 条（阈值 4.1e-4 … 2.5e-3，等间距） |
| `nice` | 让自动阈值对齐到人类友好的数值（代价：条数会偏离 `levels`） | 默认 `false`，本例未用（密度值本来就没有「整数」可对齐） |
| `zero` | 自动阈值的下界是否从 0 起（默认 `true`） | 默认，密度非负，所以从 0 起是对的 |
| `resolve` | 多张栅格时阈值怎么定：`independent`（默认，每张各算）/ `shared`（全体共用一套） | 右面板 `shared` —— 三个种类的等值线**必须同阈值才可比**；改成 `independent` 每个种类都会画成「自己的等高线」，看着一样密，实际不可比 |
| `smooth` | 是否对 marching-squares 的折线做线性插值抹平（默认 `true`） | 挂在 `smoothContours` signal 上，关掉能看到明显的阶梯锯齿 |

`shared` 的阈值有个容易踩空的细节：源码里算的是
`quantize(levels)(所有栅格的最大值组成的数组)` —— 也就是**只拿各张栅格的峰值**去取 extent，
不是把所有格子的值堆在一起。默认参数下三张栅格峰值为 2.875e-3 / 2.800e-3 / 2.259e-3，
`zero` 默认 `true` 于是下界取 0，`step = 2.875e-3 / (6 + 1) = 4.107e-4`，
得到的 6 条阈值正是 4.107e-4、8.213e-4、…、2.464e-3（可用
`node tools/inspect.cjs 25 --data penguinContours` 复核）。

`levels` 是「期望值」不是「保证值」：内部 `quantize(k)` 取
`step = (max - min) / (k + 1)`，再 `range(min + step, max, step)`，
所以实际条数可能和 `k` 差一两条（本例 `levels=2` 时每组画出 3 条）。
这也是为什么图注里的条数用 `length(data('penguinContours'))` **实测**而不是写死。

**⑤ `kde2d`：所有单位都是像素**

```json
{ "type": "kde2d",
  "groupby": ["Species"],
  "size": [{"signal": "penW"}, {"signal": "penH"}],
  "x": {"expr": "scale('xPen', datum['Beak Length (mm)'])"},
  "y": {"expr": "scale('yPen', datum['Beak Depth (mm)'])"},
  "bandwidth": {"signal": "[bandwidth, bandwidth]"},
  "cellSize": {"signal": "cellSize"},
  "as": "grid" }
```

- `size` 是**输出视图尺寸（像素）**，`bandwidth` 是**像素**，所以 `x`/`y` 必须先过比例尺
  换成像素 —— 直接喂 mm 会让带宽的物理意义彻底错位。
- `cellSize` 只取 2 的幂（内部 `k = floor(log2(cellSize))`）：`1` = 逐像素，
  `4` = 每轴降采样 4 倍。它换的是「精度 ↔ 速度」，把它调到 1 会看到等值线明显更贴合样本。
- `bandwidth` 给负数或不给 = 自动估计带宽。
- `counts: true` 输出「平滑后的计数」，`false`（默认）输出概率密度（整张栅格和为 1）。
  本例用默认，所以阈值是 1e-4 量级的小数 —— **正因如此图上不标密度数值**，
  只用「同一套阈值 + 相同配色」传达「哪里更密」。
- `groupby` 分几组就出几行，每行一张栅格；分组字段会留在行上供后续上色。

**⑥ `geopath` 的恒等投影**

```json
{ "type": "path", "from": {"data": "volcanoBands"},
  "transform": [{ "type": "geopath", "field": "datum.contour" }] }
```

`geopath` 没有 `projection` 参数时用 `defaultPath`（`d3.geoPath()` 不带投影），
即**恒等投影**：GeoJSON 坐标被当成屏幕像素直接输出成 SVG path。
所以第 ③ 点里的 `scale` 才是唯一的坐标变换环节 —— 没有第二次隐式缩放。

**⑦ 两个必须显式写的坑**

- `path` mark 的 `fill` 有默认值（config 里的 mark 填充色）。画「只有线的等高线」时
  必须显式 `"fill": {"value": null}`，否则默认填充会把下面的色带整片盖住。
- 文字光晕：Vega 的 `text` mark 先画 `fill` 再画 `stroke`，描边会盖住字。
  想要「深色描边 + 白字」得用**两层 text 从同一个数据集出**：
  下层 `fill = stroke = #1d2630, strokeWidth = 3`，上层 `fill = #ffffff` 无描边。
  `inspect` 里能看到 `"120 m"` 出现两次，就是这两层。

**⑧ 为什么没有 `heatmap` 位图底图**

Vega 的 `heatmap` 变换会把栅格逐像素写进一张 canvas 位图（`toCanvas` → `getContext('2d')`），
输出给 `image` mark 的 `url` 用。**它需要真实 canvas**：本项目的无头校验器跑在纯 Node
（不依赖 `node-canvas`），`domCanvas()` 返回 `null`，直接抛
`Cannot read properties of null (reading 'getContext')` —— 连数据流都跑不完
（和 `src/17-wordcloud` / `18-voronoi-labels` 同一类问题）。
所以本 demo **只用 `isocontour` 表达**：把 `bandStep` 调到 5，20 条填色等值带在视觉上
已经很接近连续位图，而且是纯 SVG、可缩放、可无头校验、导出 SVG 后每条带都还是可选中的图元。
真要位图效果又不能用 canvas，替代路线是 `sequence` + `flatten` 造 87×61 = 5307 个
`rect` mark —— 能跑，但图元数量涨 100 倍。

## 试一试

1. **看清 `thresholds` 与 `levels` 的差别**：把 `bandStep` 从 5 改成 20，左图的填色等值带
   从 20 条掉到 5 条，色阶变成明显的台阶；图注里的条数会同步变成 5。再把 `levels`
   从 6 拉到 12，右图每个种类的等值线加密到 12 条 —— 前者是你点名的阈值，后者是它替你挑的。
2. **看清 `smooth` 在干什么**：取消勾选 `smoothContours`，把浏览器放大到 300%
   盯住左图 180 m 那条线，会看到 marching-squares 的 45° 锯齿；勾回来就被线性插值抹平了。
   注意锯齿的尺度正好是一个网格格子 = 4 px。
3. **看清带宽与栅格粒度的分工**：先把 `bandwidth` 从 14 拉到 40（等值线胀成三个大椭圆，
   Adelie 和 Chinstrap 快要连成一片），再拉回 5（等值线碎成一堆小岛，开始拟合噪声）；
   然后把 `cellSize` 从 4 改成 1，在同一个 `bandwidth` 下等值线会明显更贴合散点 ——
   带宽管「平滑多少」，`cellSize` 管「算得多细」。
4. **验证 `resolve` 的必要性**：把 `penguinContours` 里的 `"resolve": "shared"` 改成
   `"independent"`，三个种类各自被拉到「自己的满量程」，看着密度都差不多。
   默认参数下三张栅格的峰值密度实测是 Gentoo 2.875e-3、Chinstrap 2.800e-3、Adelie 2.259e-3
   （样本数分别 123 / 68 / 151）—— 概率密度已按组归一，所以样本最多的 Adelie 峰值反而最低，
   因为它散布最宽。这个「谁更集中」的信息只有 `shared` 才留得下来。
5. **改造成「密度也用颜色说话」**：给右面板的等值线加
   `"fillOpacity": {"signal": "0.25 * (datum.contour.value / 0.0025)"}`，
   或者新建一条 `linear` 比例尺 `domain: {"data": "penguinContours", "field": "contour.value"}`
   配 `scheme: "blues"` 去驱动 `fill`，就能从「同色多圈」变成「填色密度图」。
6. **自己造一张网格验证坐标公式**：用 `sequence(0, 87*61)` + `formula` 造
   `values`（例如 `sin(datum.data % 87 / 8) * cos(floor(datum.data / 87) / 8)`），
   再 `{"type": "aggregate", "fields": ["v"], "ops": ["values"], "as": ["values"]}`
   拼成栅格行，喂给 `isocontour` —— 能直接检验第 ③ 点里的
   `x_out = (x_grid - x1) * sx + tx`。注意 `assets/data/platformer-terrain.json`
   **不是**栅格对象（它是一行一格的 `{x, y, lumosity, …}` 列表），要先 pivot 成
   行优先数组才能当 `values` 用。
7. **换个数据集试 kde2d**：把右面板的数据换成 `assets/data/normal-2d.json`
   （500 行 `{u, v}`，无缺失值、无分组），去掉 `groupby` 与 `filter`，
   `x`/`y` 改成 `scale('xPen', datum.u)` / `scale('yPen', datum.v)` ——
   单组情况下 `resolve` 就没有意义了，正好验证第 ④ 点里的说法。

## 参考

- [Vega `isocontour` 变换](https://vega.github.io/vega/docs/transforms/isocontour/) —— `thresholds` / `levels` / `nice` / `zero` / `resolve` / `smooth` / `scale` / `translate` 参数表
- [Vega `kde2d` 变换](https://vega.github.io/vega/docs/transforms/kde2d/) —— `size` / `bandwidth` / `cellSize` / `counts` / `groupby`
- [Vega `heatmap` 变换](https://vega.github.io/vega/docs/transforms/heatmap/) —— 需要真实 canvas，见第 ⑧ 点
- [Vega `contour` 变换（旧版一体式）](https://vega.github.io/vega/docs/transforms/contour/) —— `kde2d` + `isocontour` 的前身，已不推荐
- [Vega `geopath` 变换](https://vega.github.io/vega/docs/transforms/geopath/) 与 [`path` mark](https://vega.github.io/vega/docs/marks/path/)
- [Vega `text` mark](https://vega.github.io/vega/docs/marks/text/)、[group mark](https://vega.github.io/vega/docs/marks/group/)
- [Vega 连续配色方案（含 viridis）](https://vega.github.io/vega/docs/schemes/)
- [d3-contour](https://github.com/d3/d3-contour) 与 [d3-contour 的 marching squares 说明](https://en.wikipedia.org/wiki/Marching_squares) —— Vega 的实现直接改编自 d3-contour

## 与 matplotlib 的对照

**Vega 这边靠什么把图声明出来**

| 图上的东西 | Vega 里的语法元素 |
| --- | --- |
| 高程网格 → 等值线 | `transform: isocontour`（`thresholds` / `levels`） |
| 散点 → 二维密度 → 等值线 | `transform: kde2d` → `transform: isocontour` |
| 等值线 → 屏幕图元 | `transform: geopath`（恒等投影）+ `path` mark |
| 网格下标 → 面板像素 | `isocontour.scale` / 栅格自带的 `grid.scale` + `x1/y1` |
| 按高程/种类上色 | `scale: linear + scheme viridis` / `scale: ordinal + tableau10` |
| 带宽、条数、栅格粒度可调 | `signals` + `bind`（`range` / `select` / `checkbox`），改完整条数据流自动重算重画 |
| 双面板 | 两个 group mark 手工摆位，共用顶层 scale 与 legend |

**换成 matplotlib / seaborn 要付什么代价**

- **左面板（规则网格等高线）：matplotlib 反而更省事。** `plt.contourf(Z, levels=...)` +
  `plt.contour(Z, levels=[100,120,...])` + `plt.clabel(cs, fmt='%d m')` 三行就有了，
  而且 `clabel` 会**自动在等高线上开口、把标签嵌进线里、按曲率挑放置点** ——
  这是 Vega 完全没有的能力。本 demo 的标签只能自己在数据流里挑锚点
  （取环中点 → 滤掉贴边的 → clamp），效果远不如 `clabel`，还得用两层 `text`
  手搓描边光晕（matplotlib 一句 `path_effects=[withStroke(...)]` 就完事）。
  这一格 matplotlib 明确赢。
- **右面板（二维核密度）：`seaborn.kdeplot(x=, y=, hue=, levels=, bw_adjust=)` 也是一行。**
  但注意两点差别：(1) seaborn 的带宽是**数据单位**上的 Scott/Silverman 因子，
  Vega 的 `bandwidth` 是**像素**，所以 Vega 的密度形状会随面板尺寸变化 —— 更「所见即所得」，
  但换画布就得重调；(2) seaborn 的 `levels` 是**概率质量等值线**（0.05 = 包住 95% 的样本），
  Vega 的 `levels` 是**密度值等分**，两者语义不同，别互相套。
  另外 seaborn 的 `common_norm` 就是 Vega 的 `resolve: shared/independent`。
- **真正拉开差距的是交互。** matplotlib 里想做「拖动 `bandwidth` 滑块 → 重算 KDE → 重画等值线」，
  得写 `matplotlib.widgets.Slider` + 回调函数，回调里手工 `ax.collections.clear()`、
  重新 `contour()`、`fig.canvas.draw_idle()`，还要自己管住 colorbar 别越画越多；
  换到 web 上还要再选一套（mpld3 / ipywidgets / Bokeh）。
  Vega 这边是 `"bind": {"input": "range"}` 一句，剩下的**增量重算**由数据流负责 ——
  `bandwidth` 变了只有 `penguinDensity` 及其下游重跑，`volcano` 一侧完全不动。
  图注里的条数也是同一条链上顺带算出来的（`length(data(...))`），不需要额外回调。
- **可组合性 / 可移植性。** Vega 这两个面板共用同一套 `elev` / `species` 比例尺和图例，
  改配色只动一处；输出是一份纯 JSON，可以被程序生成、diff、嵌进网页、
  导出成**可选中图元**的 SVG（每条等值带都是独立 `<path>`，可以事后在 Illustrator 里点选）。
  matplotlib 的等值线导出成 SVG 也是 path，但整份图形是 Python 代码，
  跨语言复用只能重写。
- **反过来，matplotlib 更省事的地方还有：** 位图密度底图（`imshow` / `pcolormesh` /
  `hexbin` 一行搞定，Vega 需要 canvas 才能用 `heatmap`，见第 ⑧ 点）；
  colorbar 的刻度/单位/extend 箭头等细节；
  等值线的**层级关系查询**（`cs.allsegs`、`cs.levels` 直接可编程访问）；
  以及 3D（`plot_surface`）、对数色标、掩膜数组（`np.ma`）这些 Vega 根本没有的东西。
  数据量大时 matplotlib 的 Agg 后端也比几千个 SVG `<path>` 快得多。

一句话：**规则网格的静态等高线图，matplotlib 更短更好看（`clabel` 是杀手级功能）；
一旦要「参数可调 + 多面板共享比例尺 + 上网 + 用 JSON 描述」，Vega 的声明式数据流才划得来。**
