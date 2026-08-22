# 16 · 分级统计地图（Choropleth）

## 学习目标

学会用 Vega 画一张按数值填色的地图：加载 TopoJSON 地理数据、用 `lookup` 把业务数据接到地理要素上、
用投影把经纬度变成屏幕坐标、用 `quantize` 比例尺做分级填色并配图例。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/16-geo-choropleth/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data.unemployment` | 失业率表 | TSV 文件，`format.parse: "auto"` 让 `id`/`rate` 解析为**数字** |
| `data.counties` | 县级地理要素 | `format: {type: "topojson", feature: "counties"}` 把 TopoJSON 的 `objects.counties` 展开成 GeoJSON Feature 流 |
| `data.counties.transform[0]` | lookup 连接 | 以县 `id`（FIPS 码）把 `unemployment.rate` 接到每条地理要素上，类似 SQL 的 LEFT JOIN |
| `data.counties.transform[1]` | 过滤 | 丢掉没匹配上失业率的县（多为无几何形状的占位记录），避免画成灰色块 |
| `data.states` | 州界要素 | 同一文件的另一个 object：`feature: "states"`，只用来画边界线 |
| `projections` | 地理投影 | `albersUsa` 是美国本土专用的 Albers 投影变体，会把阿拉斯加、夏威夷自动平移缩放到本土左下角附近 |
| `scales.color` | 填色比例尺 | `quantize` 把连续定义域 `[0, 0.15]` 均分成 7 段，各段映射到 `bluepurple` 色带的一个离散色 |
| `legends` | 图例 | `fill: "color"` 绑定填色比例尺；`format: "0.1%"` 把小数刻度格式化为百分数 |
| `marks[0]` | 县多边形层 | `shape` 标记配合 `geoshape` 变换：按投影把每条要素的几何转成可绘制的路径；`fill` 由 `rate` 经 `color` 比例尺决定 |
| `marks[1]` | 州界描边层 | 同一投影下的 `states` 要素，`fill: null` 只描 0.75px 白边，叠在县层之上勾勒州界 |

### 关键概念

- **TopoJSON 与 `feature` / `mesh`**：TopoJSON 把多个几何体的公共弧段只存一次以压缩体积。
  `format.feature` 展开成一个个独立多边形（Feature），适合按要素填色；
  `format.mesh` 则把所有弧段合并成一条 MultiLineString，适合只画边界线（不能逐要素填色）。
  本例的州界层用 `feature: "states"` + 不填充也能达到描边效果，且保留了逐州交互的可能。
- **投影（projection）**：经纬度是球面坐标，必须投影到平面。常用类型：`albersUsa`（美国，含阿拉斯加/夏威夷重排）、
  `mercator`、`equirectangular`、`naturalEarth1` 等。不写 `scale`/`translate` 时投影会自动适配绘图区宽高。
- **lookup 的 key 两侧类型必须一致**：本例两侧都是**数字**——TSV 的 `parse: "auto"` 把 `01001` 这样的
  县级 FIPS 码解析成数字 `1001`，而 TopoJSON 里要素的 `id` 本身也存成数字 `1001`，前导零在两侧同时消失，
  因此直接匹配成功。若一侧是带前导零的字符串（如 `"01001"`）另一侧是数字，就会全部匹配不上，
  此时需用 `formula` 统一类型（如 `'' + datum.id` 补齐或 `+datum.id` 转数字）。
- **`shape` 标记与 `geoshape` 变换**：`geoshape` 在变换层把要素几何转换为屏幕路径（默认写入 `path` 字段），
  `shape` 标记负责绘制它；`hover` 编码集与 `tooltip` 通道和普通标记一样可用。

## 试一试（改练）

1. 把色带换成 `"scheme": "oranges"` 或把 `count` 改成 `9`，感受分级粗细的差异。
2. 把比例尺类型改成 `"type": "threshold"` 并配 `"domain": [0.04, 0.08, 0.12]`、3 个颜色，
   对比 quantize（等间距分级）与 threshold（自定义断点）的语义差别。
3. 把州界层改用 `format: { "type": "topojson", "mesh": "states" }` 的数据源（只需一个 `path` 标记画
   `path` 字段），观察与 `feature` 写法的异同。
4. 删掉 `filter` 变换，看没有失业率的县会怎样显示（`fill` 会按 `null` 处理）。

## 参考

- 官方示例：[County Unemployment](https://vega.github.io/vega/examples/county-unemployment/)
- 官方文档：[Projections](https://vega.github.io/vega/docs/projections/) ·
  [geoshape 变换](https://vega.github.io/vega/docs/transforms/geoshape/) ·
  [lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [Data 格式（topojson）](https://vega.github.io/vega/docs/data/)
