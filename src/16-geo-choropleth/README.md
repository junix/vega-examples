# 16 · 分级统计地图（Choropleth）

## 学习目标

学会用 Vega 画一张按数值填色的地图：加载 TopoJSON 地理数据、用 `lookup` 把业务数据接到地理要素上、
用投影把经纬度变成屏幕坐标、用 `quantize` 比例尺做分级填色并配图例。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/16-geo-choropleth/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data.unemployment` | 失业率表 | TSV 文件，`format.parse: "auto"` 让 `id`/`rate` 解析为**数字** |
| `data.counties` | 县级地理要素 | `format: {type: "topojson", feature: "counties"}` 把 TopoJSON 的 `objects.counties` 展开成 GeoJSON Feature 流 |
| `data.counties.transform[0]` | lookup 连接 | 以县 `id`（FIPS 码）把 `unemployment.rate` 接到每条地理要素上，类似 SQL 的 LEFT JOIN |
| `data.counties.transform[1]` | 过滤 | **两个条件都要写**：`datum.rate != null` 丢掉查不到失业率的要素，`datum.geometry != null && length(datum.geometry.coordinates) > 0` 丢掉没有几何形状的占位要素。少写任何一半都会留下一批画不出东西的空标记，详见下方「filter 要过滤两件事」 |
| `data.states` | 州界要素 | 同一文件的另一个 object：`feature: "states"`，只用来画边界线 |
| `projections` | 地理投影 | `albersUsa` 是美国本土专用的 Albers 投影变体，会把阿拉斯加、夏威夷自动平移缩放到本土左下角附近 |
| `signals` | 截断线与统计 | `rateCap` 滑杆决定配色 domain 的上限；`cappedCount` / `maxRate` 从旁路数据集取值，写进副标题 |
| `data[over-cap]` / `data[rate-extent]` | 旁路统计 | `filter` + 无 `groupby` 的 `aggregate` 得到单行结果，供 signal 用 `data('…')[0].n` 取用 —— 这是把「统计量」注入文字的标准手法 |
| `scales.color` | 填色比例尺 | `quantize` 把连续定义域 `[0, rateCap]` 均分成 7 段，各段映射到 `bluepurple` 色带的一个离散色。**注意 domain 是截断的**：本数据实际最高 30.1%，默认 15% 的上限会把 192 个超限的县一律**夹**进最深一档 |
| `legends` | 图例 | `fill: "color"` 绑定填色比例尺；`format: "0.1%"` 把小数刻度格式化为百分数 |
| `marks[0]` | 县多边形层 | `shape` 标记配合 `geoshape` 变换：按投影把每条要素的几何转成可绘制的路径；`fill` 由 `rate` 经 `color` 比例尺决定；tooltip 里的 FIPS 码用 `pad(datum.id, 5, '0', 'left')` 补前导零 |
| `marks[1]` | 州界描边层 | 同一投影下的 `states` 要素，`fill: null` 只描 0.75px 白边，叠在县层之上勾勒州界 |

### 关键概念

- **TopoJSON 与 `feature` / `mesh`**：TopoJSON 把多个几何体的公共弧段只存一次以压缩体积。
  `format.feature` 展开成一个个独立多边形（Feature），适合按要素填色；
  `format.mesh` 则把所有弧段合并成一条 MultiLineString，适合只画边界线（不能逐要素填色）。
  本例的州界层用 `feature: "states"` + 不填充也能达到描边效果，且保留了逐州交互的可能。
- **投影（projection）**：经纬度是球面坐标，必须投影到平面。常用类型：`albersUsa`（美国，含阿拉斯加/夏威夷重排）、
  `mercator`、`equirectangular`、`naturalEarth1` 等。不写 `scale`/`translate` 时投影会自动适配绘图区宽高。
  `albersUsa` 只覆盖 50 个州：范围外的点它返回 `null`，于是本例里 73 条波多黎各要素（FIPS `72xxx`）
  虽然带着几何通过了 filter，`geoshape` 也拿不到路径，最终是 73 个没有 `d` 属性的空 `<path>` ——
  县这一层的 3213 个 `<path>` 里正好有 73 个不带 `d`，州界层的 53 个里也有 2 个（波多黎各与美属维尔京群岛）。
  这类「投影范围外」的静默丢弃不报错、不 WARN，只能自己数。
  要画属地就得换 `mercator` 之类的通用投影，或者单独开一个小图。
- **lookup 的 key 两侧类型必须一致**：本例两侧都是**数字**——`unemployment.tsv` 里 FIPS 码本来就写成
  `1001`（不带前导零），`parse: "auto"` 把它解析为数字；TopoJSON 里要素的 `id` 也是 JSON 整数 `1001`。
  两侧天然同类型，因此直接匹配成功。若一侧是带前导零的字符串（如 `"01001"`）另一侧是数字，就会全部匹配不上，
  此时需用 `formula` 统一类型（如 `'' + datum.id` 补齐或 `+datum.id` 转数字）。
- **数字化的 FIPS 码显示时必须补回前导零**：县级 FIPS 是**定长 5 位**（前 2 位州 + 后 3 位县），
  但州码小于 10 的那几个州（01 AL、02 AK、04 AZ、05 AR、06 CA、08 CO、09 CT，共 314 个县）
  存成数字后只剩 4 位。
  直接 `'FIPS ' + datum.id` 会写出 `FIPS 1001` 这种 4 位数，读者无法判断州码是 `01` 还是 `10`。
  所以 tooltip 里用 **`pad(datum.id, 5, '0', 'left')`** 补齐 —— `pad(str, length, padchar, align)`
  的 `align` 取 `'left'` 表示**往左边填充**，得到 `FIPS 01001`。用 `format(datum.id, '05d')` 也等效。
- **`shape` 标记与 `geoshape` 变换**：`geoshape` 在变换层把要素几何转换为屏幕路径（默认写入 `path` 字段），
  `shape` 标记负责绘制它；`hover` 编码集与 `tooltip` 通道和普通标记一样可用。

### filter 要过滤两件事：有没有数、有没有形状

`lookup` 只负责把 `unemployment.rate` 接到要素上，**它管不了要素本身有没有几何**。
`us-10m.json` 的 `objects.counties` 里有 3641 条要素，实测拆开看：

| 类别 | 条数 | 不过滤会怎样 |
| --- | --- | --- |
| 有 `rate` + 有几何 | 3213 | 正常上色，这是我们要的 |
| 有 `rate`、几何是 `null`（还有 5 条 `arcs` 为空的退化 `MultiPolygon`） | 394 | 只按 `rate` 过滤时**全部留下**，渲染成没有 `d` 属性的空 `<path>` |
| 无 `rate`、无几何 | 21 | 被 `rate` 条件丢掉 |
| 无 `rate`、**有真几何** | 13 | 被 `rate` 条件丢掉 —— 它们是 FIPS `xx000` 的水域面（五大湖与近海，`26000` 的包围盒几乎覆盖整个密歇根州）和美属维尔京群岛的三个岛 |

所以「只写 `datum.rate != null`」这件事，方向恰好和直觉相反 —— 它并不是在清理占位要素：
真正被它挡在画布外、并且**画出来会有可见后果**的，是那 13 条有几何却没数的水域面与属地；
而 394 条**没几何的占位要素因为有数全被留下**。两个条件写全，counties 数据集从 3607 行收敛到
3213 行，SVG 里的县级 `<path>` 也同步从 3607 个降到 3213 个。

空标记不会报错、也看不见，但它们照样占着场景图节点、照样每帧走一遍 encode 与包围盒计算、
照样被写进导出的 SVG，属于纯浪费 —— 这类「查不出问题的问题」只能靠
`node tools/inspect.cjs 16` 数 `<path>`、或直接盯数据集行数发现。

### 分级统计地图的截断问题

失业率是长尾分布：绝大多数县在 3%~10%，少数县高到 30%。domain 若取真实极值
（`[0.012, 0.301]`），七档里前两档就装走了九成的县，整张图几乎一片浅色；
所以实践中几乎总要**截断长尾**。

但截断意味着「最深那一档里的县彼此不可区分」—— 15% 和 30% 同色。
这件事必须让读者看得见，否则地图就在撒谎。本 demo 的处理是：

1. 把上限做成 `rateCap` 滑杆，读者可以自己拉到 35% 看差别；
2. 用旁路 `aggregate` 数一下有多少县被压在上限之外（默认 15% 时是 192 个），写进**副标题**；
   注意副标题说的是「超出上限」而不是「最深一档共有多少县」—— 最深一档的区间是
   `[12.9%, 15%]`，实际装了 403 个县，其中 192 个是从上限之外夹进来的；
3. 图例上只有 6 个标签（`2.1% / 4.3% / 6.4% / 8.6% / 10.7% / 12.9%`）而色带有 7 档 ——
   quantize 图例标的是各档之间的**分界点**（Vega 自己生成的 aria 描述就写着 "6 boundaries"），
   第一档的起点 `0%` 省略不标。最后一档标签 `12.9%` 的语义是「≥12.9%」而不是「12.9% 到 15%」：
   domain 被截断后，比例尺会把 15% 以上的值一律夹到最后一档。

## 试一试（改练）

1. 把色带换成 `"scheme": "oranges"` 或把 `count` 改成 `9`，感受分级粗细的差异。
2. 把比例尺类型改成 `"type": "threshold"` 并配 `"domain": [0.04, 0.08, 0.12]`、3 个颜色，
   对比 quantize（等间距分级）与 threshold（自定义断点）的语义差别。
3. 拖 `rateCap` 滑杆从 5% 到 35%，看副标题里被截断的县数怎么变、地图整体明暗怎么变；
   拉到 35% 时几乎没有县被截断，但也几乎看不出差异 —— 这就是截断的取舍。
4. 把 `domain` 改成 `{"data": "unemployment", "field": "rate"}`（让 Vega 取真实极值），
   对比"完全不截断"的效果。
5. 把州界层改用 `format: { "type": "topojson", "mesh": "states" }` 的数据源（只需一个 `path` 标记画
   `path` 字段），观察与 `feature` 写法的异同。
6. 把 filter 里的几何条件（`datum.geometry != null && length(...) > 0`）删掉，counties 从 3213 行变回
   3607 行，`node tools/inspect.cjs 16` 里 SVG 的 `path` 计数同步 +394，多出来的全是没有 `d` 属性的空标记。
   再把 `datum.rate != null` 也删掉（3641 行），五大湖与近海的水域面就会被画出来：它们的 `rate` 是 `null`，
   `quantize` 对 `null` 返回 `undefined`，`fill` 于是落到渲染器的默认值 —— 导出的 SVG 里这些 `<path>`
   干脆没有 `fill` 属性，浏览器按 SVG 默认的**黑色**填。所以「没数据的要素会自动画成灰块」是靠不住的假设：
   缺数据必须自己显式处理（过滤掉，或给一条 `"test": "datum.rate == null"` 的 `fill` 规则指定灰色）。
7. 把 tooltip 里的 `pad(datum.id, 5, '0', 'left')` 换回 `datum.id`，悬停阿拉巴马州的县：
   `FIPS 01001` 会退化成 `FIPS 1001`。

## 参考

- 官方示例：[County Unemployment](https://vega.github.io/vega/examples/county-unemployment/)
- 官方文档：[Projections](https://vega.github.io/vega/docs/projections/) ·
  [geoshape 变换](https://vega.github.io/vega/docs/transforms/geoshape/) ·
  [lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [Data 格式（topojson）](https://vega.github.io/vega/docs/data/)
