# 37 · 投影画廊、大圆航线与比例符号图

一份 spec、三块面板，讲地理可视化里最容易做错的三件事：

* **① 投影画廊** —— 同一份 `world-110m.json` 加一层 `graticule` 经纬网，
  `projection.type` 接一个 signal，下拉框换 10 种投影，右侧同步显示这个投影属于哪个家族、
  保角还是保面积。地图不是"世界的样子"，是**一个选择**。
* **② 大圆航线** —— 同一对机场经纬度，两种画法并排：`geoshape` 投影一条 GeoJSON
  `LineString`（蓝实线，沿大圆弯曲）对 `geopoint` + `rule` 先投影再直连（红虚线）。
  差别不是审美，是**几何上的对错**。
* **③ 地震比例符号图** —— `geopoint` 只把经纬度算成像素 x/y，剩下交给普通 `symbol`；
  `size` 通道编码的是**面积**，所以震级要走 `pow(exponent: 2)`。

## 学习目标

读完这一个 demo，你应该能回答：

1. **Vega 的 `projections` 是什么**：它不是 mark、不是 scale，是一个**独立的顶层区块**，
   把「经纬度 → 像素」这条映射注册成一个名字，后面 `geoshape` / `geopoint` / `graticule`
   按名字引用。`type` 和 `rotate` 都能接 signal，改名字就整幅重投影。
2. **`fit` + `extent` 怎么同时干掉「缩放」和「排版」两件事**：`fit` 给一份地理数据，
   `extent` 给一个像素矩形 `[[x0,y0],[x1,y1]]`，投影自己算出 scale 与 translate
   把前者塞进后者。三块面板就是三个矩形，**整个多面板布局没有一个 group mark**。
3. **`geoshape` 与 `geopoint` 的分工**：前者是 **mark 上的 transform**，把整个 GeoJSON
   几何体交给投影的流式重采样，输出 SVG path；后者是**数据流里的 transform**，
   只算两个数，之后你想用什么 mark 都行。
4. **为什么大圆线必须走 `geoshape`**：投影的 `stream` 会把一条长线段先**重采样**成很多小段
   再逐点投影，于是「球面上的最短路」在平面上自然弯了；`rule` 只有两个端点被投影，
   中间是屏幕上的直线。
5. **`size` 是面积不是长度**：想让视觉半径正比于震级，scale 必须是
   `pow` exponent 2（值 → 面积）；要让半径等于 `r` 像素，`size = pow(2*r, 2)`。
6. **投影会吐 `null`**：`orthographic` 下球背面的点、`albersUsa` 下美国之外的点，
   `geopoint` 都返回 `null`，必须在下游 `filter` 掉再画。

## 数据来源

| 数据集 | 来源文件 | 行数（默认参数下） | 说明 |
| --- | --- | --- | --- |
| `world` | `world-110m.json` | 177 | TopoJSON，`format.feature: "countries"` 抽出国界 |
| `grid` | 无（`graticule` 变换生成） | **1** | 整张经纬网就是**一行** MultiLineString |
| `sphere` | 内联 `{"type": "Sphere"}` | 1 | d3-geo 认的伪 GeoJSON：整个球面 |
| `projMeta` | 内联码表 | 1（`filter` 后） | 10 种投影的家族/性质/说明，按 `projType` 选出一行 |
| `airports` | `airports.csv` | 3069 | 本土 48 州范围内的机场（经纬度 `parse: number`） |
| `flights` | `flights-airport.csv` | 5366 | 原始 OD 表 `origin,destination,count` |
| `departures` | ← `flights` | 303 | 按 `origin` 求和，做机场比例符号 |
| `routes` | ← `flights` | 155 | 归并双向 → 阈值过滤 → 两次 `lookup` 接经纬度 → 造 `LineString` |
| `hubs` | ← `routes` | 69 | `fold` 摊平 a/b 两列 → `aggregate(count)` 去重 → 两次 `lookup` |
| `hub-labels` | ← `hubs` | 14 | 只给 `total ≥ labelMin` 的大机场打代码 |
| `states` | `us-10m.json` | 49 | 剔除 FIPS 2/15/72/78 后的本土 48 州 + DC |
| `quakes` | `earthquakes.json` | 297 | USGS 一周实时目录，`format.property: "features"` |

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `autosize: "none"` + 显式 `padding` | 关掉自动布局 | 三块面板的坐标全部写死在 signal 里，自动布局只会捣乱；代价是 `padding.top: 40` 必须**手工**给标题让位 |
| `signals`（交互组） | `projType` / `rotateLambda` / `rotatePhi` / `gridStep` / `minFlights` / `showStraight` / `labelMin` / `minMag` | 8 个 `bind` 控件，覆盖三块面板 |
| `signals`（版面组） | `galleryExtent` / `flightExtent` / `quakeExtent` / `infoX` / … | 每块面板一个像素矩形，直接喂给 `projection.extent` |
| `data: grid` | `graticule` 变换 | **不吃输入数据**，自己生成一行 MultiLineString；`step` 接 signal |
| `data: routes` | 无向航线 | `formula` 算规范化端点 a/b（`a < b` 的字典序）→ `aggregate` 求和 → `filter` 阈值 → 两次 `lookup` → **`filter` 掉 lookup 没命中的 null** → `formula` 造 `LineString` → 两次 `geopoint` 备好错误画法的端点 → `collect` 按流量排序（细线先画） |
| `data: hubs` | 端点去重 | `fold` 把 a/b 两列摊成行 → `aggregate` **只给 `groupby` 不给 `fields`** 就是计数 → `lookup` 接出发量与城市 |
| `data: quakes` | 震中 | `filter` 掉 `mag == null` → 三个 `formula` 从 `geometry.coordinates` 摊出 lon/lat/depth → `geopoint` → **`filter` 掉投影返回 null 的点** → `collect` 按震级排序 |
| `projections[0]` `gallery` | 画廊投影 | `type`/`rotate` 接 signal；`fit: {"signal": "data('grid')"}` —— 用经纬网而不是国界来 fit，这样换投影时视野稳定 |
| `projections[1]` `flight` | 航线面板 | `mercator` + `fit` 到 `states` |
| `projections[2]` `quake` | 地震面板 | `equalEarth`（等积），点密度才不会被面积失真骗 |
| `scales: arcWidth` | 航线粗细 | `sqrt` + `clamp: true`；注意实际 domain 是 `[0, 27500]` 而不是写的 `[3000, 27500]`（见下） |
| `scales: hub` | 机场符号 | `sqrt`，range 上限 620 —— 这是 **size（面积）** 的上限，不是半径 |
| `scales: quakeSize` | 震级符号 | `pow` exponent 2：值 → 面积，于是**半径**线性正比于震级 |
| `scales: quakeDepth` | 深度配色 | `linear` + `scheme: viridis` + `reverse: true`，浅震亮、深震暗 |
| `legends` | 三个 `orient: "none"` 图例 | `legendX`/`legendY` 手工定位到面板旁边；两个 size 图例 + 一个 gradient 色带 |
| `marks`（面板 ①） | sphere → graticule → world → 说明栏 | 三个 `shape` mark 各带一个 `geoshape` transform；说明栏用**字符串数组**当 `text` 实现多行 |
| `marks`（面板 ②） | states → rule（错） → shape（对） → symbol → 标签 → 注解 | 错误画法先画、正确画法后画，叠在一起才看得出偏差 |
| `marks`（面板 ③） | sphere → graticule → world → symbol → 注解 | 震中符号按震级排序后画，大震在上层 |

### 关键概念

- **`geoshape` 是 mark 的 transform，不是 data 的 transform。** 它写在 mark 对象的
  `transform` 数组里（和 `encode` 平级），输入是场景图 item，输出是 `path` 属性。
  想投影一个**字段里**的几何体（本例 `routes` 的 `arc`），要写
  `{"type": "geoshape", "projection": "flight", "field": "datum.arc"}`；
  不写 `field` 就默认拿整条 datum 当 GeoJSON。
- **`graticule` 一行顶一张网。** 它输出的是单个 `MultiLineString`，
  所以 `grid` 数据集永远只有 1 行——第一次看到 `grid: 1 行` 别以为数据没读进来。
- **`{"type": "Sphere"}` 是 d3-geo 的特殊约定**：不是标准 GeoJSON 类型，但
  `geoPath` 认，用来画整个球面的轮廓（`orthographic` 下就是那个圆盘）。
- **`fit` 接的是 signal 表达式，不是数据集名**：写 `{"signal": "data('grid')"}`，
  写成 `{"data": "grid"}` 不认。
- **连续型 scale 默认把 0 并进 domain。** `arcWidth` 写的是 `domain: [3000, 27500]`，
  跑 `node tools/inspect.cjs 37` 读出来却是 `[0, 27500]` —— `sqrt` 也是连续型，
  默认 `zero: true`。结果是 8000 班的航线只落在 range 的 54% 处而不是 0%，
  对比度被压平了。要按写的来必须显式 `"zero": false`。
- **`size` 是外接正方形的面积，Vega 的口径是 `r = sqrt(size) / 2`。**
  这和 d3-shape 的 `sqrt(size / π)` **不一样**，别照搬 d3 的公式：
  - 想让半径等于 `r` 像素 → `size = pow(2 * r, 2)`（`size: 144` → 半径 6）；
  - 想让半径线性正比于数值 → scale 用 `pow` exponent 2（本例 `quakeSize`）；
  - 想让**面积**正比于数值 → scale 用 `sqrt`（本例 `hub`、`arcWidth`）。

  面板 ③ 的注解「半径 ∝ M，而 size 编码的是面积，所以要用 pow(exponent=2)」
  说的就是这条。
- **投影返回 `null` 是常态，不是异常。** `orthographic` 会把球背面的点、
  `albersUsa` 会把美国之外的点映成 `null`。`geopoint` 之后**必须**跟一个
  `{"type": "filter", "expr": "datum.x != null"}`，否则下游 mark 的 `x` 是
  `undefined`，图元静默消失（还不报 WARN）。
- **`lookup` 的 `default` 缺省是 `null`，等于左外连接。** `routes` 两次 lookup 之后
  那个 `filter` 不是保险，是必需的：被机场过滤条件排除掉的 iata 会留下 `alon: null`，
  拿去造 `LineString` 会得到 `[null, null]` 坐标，`geoshape` 直接吐 `NaN` path。

## 试一试（改练）

1. **把投影切一圈。** `projType` 依次选 `mercator` → `equalEarth` → `mollweide` →
   `albersUsa`，注意最后一个：全世界只剩美国，其余国家整块消失——这不是 bug，
   `albersUsa` 对美国之外的坐标返回 `null`。
2. **看 `fit` 的对象换了会怎样。** 把 `projections[0].fit` 从 `data('grid')` 改成
   `data('world')`：换投影时视野会跳，因为国界的包围盒随投影变化远比经纬网剧烈。
3. **量一量大圆偏差。** 保持默认 `minFlights: 8000`（155 条航线），
   悬停 **JFK↔SFO**（13562 班，横跨大陆的东西向）看蓝实线与红虚线拉开多远，
   再悬停 **LAX↔SEA**（13741 班，班次几乎相同但走南北向）——后者两条线几乎重合。
   **结论：大圆偏差沿东西向最大、沿南北向最小**，这是 mercator 的性质而非画法的性质。
   顺便把 `minFlights` 拉到 25000 试试：本土 48 州范围内只剩 LAX↔SFO 一条
   （HNL↔OGG 虽然有 24397 班，但夏威夷的机场早在 `airports` 那一步就被经度过滤掉了）。
4. **把 `showStraight` 关掉再打开**，体会「只有一条线时你根本发现不了它是错的」。
   这正是本面板要教的：错误画法**看上去完全正常**。
5. **验证 `size` 是面积。** 把 `quakeSize` 的 `type` 从 `pow`/`exponent: 2` 改成 `linear`，
   M6 的圆看上去只比 M3 大 41%（√2 倍）而不是 2 倍。再改成 `sqrt`，差别更小。
6. **修 `arcWidth` 的 domain。** 给它加 `"zero": false`，重跑
   `node tools/inspect.cjs 37` 确认 domain 变成 `[3000, 27500]`，看粗细对比强了多少。
7. **`hub-labels` 的偏移量有个小 bug**：`dy` 写的是
   `-(sqrt(scale('hub', datum.total) / PI) + 4)`，这是 **d3 的半径公式**；
   Vega 的口径是 `sqrt(size) / 2`，所以标签比实际圆缘多抬了约 12.8%。
   改成 `-(sqrt(scale('hub', datum.total)) / 2 + 4)` 再看看贴合度。
8. **把 `graticule` 的 `step` 拉到 45**，经纬网稀疏到只剩骨架；
   再看 `grid` 数据集——**永远是 1 行**，变的是那一行里 `coordinates` 数组的长度。
9. 把面板 ③ 的 `quake` 投影从 `equalEarth` 改成 `mercator`：
   高纬地震（阿拉斯加、冰岛）的视觉密度会被面积失真放大好几倍。
   这就是"等积投影用于点密度图"的理由。

## 与 matplotlib 的对照

matplotlib 本身**没有地理投影**，这一整张图在 Python 侧要靠 Cartopy（或 GeoPandas + pyproj）：

| 本 demo 的做法 | matplotlib + Cartopy 的做法 | 差距在哪 |
| --- | --- | --- |
| `projections` 顶层区块，`type` 接 signal | `ccrs.Orthographic(...)` 在建 `Axes` 时定死 | Cartopy 的投影绑在 **Axes** 上，换投影＝**重建整个坐标轴**，所有已画的 artist 都得重画。Vega 只是改一个 signal |
| `fit` + `extent` 自动缩放平移到像素矩形 | `ax.set_extent(...)` 给**经纬度**范围，像素范围靠 `fig.add_axes` 手工排 | Cartopy 没有"把这份数据塞进这个矩形"这一步，缩放与排版是两件事，得自己对齐 |
| `geoshape` 自动重采样出大圆弧 | `ax.plot(..., transform=ccrs.Geodetic())` | **这一条 Cartopy 反而更简洁**：`transform=` 参数就是干这个的。Vega 的等价物是"手工造一个 LineString 再交给 geoshape"，多一步 `formula` |
| `geopoint` 把经纬度算成像素放进数据流 | `ax.projection.transform_points(...)` 手工调，返回 numpy 数组 | Vega 里投影结果是**数据流里的字段**，可以继续参与 filter/sort/lookup；Cartopy 里它是一次性的 numpy 数组，要自己接回 DataFrame |
| `size` 通道 + `pow` scale | `ax.scatter(..., s=mag**2 * k)` 手算 | matplotlib 的 `s` 也是面积（单位 points²），坑一模一样，只是没有 scale 对象替你管 domain/range/clamp |
| 三个 `legends` 声明式生成 | 比例符号图例要**手工造假点**（`ax.scatter([], [], s=...)`）再 `ax.legend` | 这是 matplotlib 最痛的一块：size legend 没有内建支持，色带要 `fig.colorbar` 单独走一套 API |
| 换 `minFlights` 滑块，整条数据流重算 | 改参数 → 重跑脚本 → 重画 | 声明式数据流最值钱的地方：**过滤条件是图的一部分**，不是脚本的一次性输入 |

一句话：**Cartopy 在"画一张地图"这件事上不比 Vega 差，甚至 `transform=Geodetic()`
比手拼 LineString 更优雅；差距全在"这张地图是活的"**——投影、阈值、标签门槛都是 signal，
改一下整条数据流（过滤 → 聚合 → lookup → 投影）自动重跑，而 Python 侧对应的是重跑脚本。

## 参考

- 官方文档：[Projections](https://vega.github.io/vega/docs/projections/) ·
  [geoshape transform](https://vega.github.io/vega/docs/transforms/geoshape/) ·
  [geopoint transform](https://vega.github.io/vega/docs/transforms/geopoint/) ·
  [graticule transform](https://vega.github.io/vega/docs/transforms/graticule/) ·
  [Legends](https://vega.github.io/vega/docs/legends/)
- d3-geo 的投影列表（Vega 的 `type` 就是这些名字）：
  [d3-geo](https://github.com/d3/d3-geo) ·
  [d3-geo-projection](https://github.com/d3/d3-geo-projection)
- 同集相关：[16 分级统计地图](../16-geo-choropleth/)（topojson + lookup 填色）、
  [34 矢量场](../34-vector-field/)（同样踩 `size` 是面积这条）、
  [24 玫瑰图](../24-radial-rose-stack/)（`sqrt` scale 让面积正比于数值）
- 数据出处：Natural Earth（`world-110m.json`）、US Census（`us-10m.json`）、
  BTS 航班统计（`flights-airport.csv` / `airports.csv`）、USGS 实时地震目录（`earthquakes.json`）
