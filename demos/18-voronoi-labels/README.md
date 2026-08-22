# 18 · Voronoi 拾取与标签防重叠

## 学习目标

在散点图上学两个高级技巧：

1. 用 `voronoi` 变换生成一层透明单元格来**高效拾取最近点**（鼠标落在哪个单元格，就选中哪个点），
   而不是给几百个点逐个挂事件监听；
2. 用 `label` 变换（vega-label）给少数重点散点**自动摆放互不重叠的文字标签**。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/18-voronoi-labels/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.hovered` | 当前悬停的汽车记录 | 事件写法 `@cells:mouseover` 表示“监听名为 cells 的标记项”；`update: "datum"` 把该单元格对应的数据元组（即那辆车）写入 signal |
| `data.cars` | 原始数据 | 过滤掉 `Horsepower` / `Miles_per_Gallon` 为 null 的记录 |
| `data.pts` | 像素坐标 + Voronoi | `formula` 用表达式函数 `scale('x', …)` 算出像素坐标 `px/py`；`voronoi` 以 `px/py` 为站点、以绘图区为 `extent`，把每个单元格的 SVG 路径字符串写入 `cell` 字段 |
| `data.labelcars` | 待打标签的点 | `window` 变换按 `Origin` 分区、按 `Horsepower` 降序求 `rank`，`filter` 取每组前 2 名 |
| `data.hovercar` | 悬停点的派生数据 | `filter` 表达式引用 signal `hovered`；signal 一变，数据流自动重算，只剩悬停那辆车 |
| `scales.x / y / c` | 位置与配色 | 注意 domain 取自 `cars` 而非 `pts`：`pts` 的 formula 依赖比例尺，若比例尺 domain 又依赖 `pts` 会造成数据流环路 |
| `marks.cells` | 透明 Voronoi 单元格 | `path` 标记画 `cell` 字段，`fill: "transparent"` 不可见但**仍可接收鼠标事件**（canvas 拾取用独立的颜色索引，与视觉填充无关） |
| `marks.points` | 散点 | `x/y` 直接绑 `px/py`（与 Voronoi 同一坐标来源，保证单元格与点严格对齐）；`update` 里用 signal 表达式做条件高亮：悬停点放大、描深色边，其余点变淡 |
| `marks.labelpoints` | 标签锚点（红圈） | 给 6 个重点车画空心红圈；它的真正作用是作为下方 text 标记的**数据源**提供位置 |
| `marks.labels` | 防重叠标签 | `from.data` 指向**另一个标记** `labelpoints`；`label` 变换读取这些锚点项的位置，尝试 `anchor` 列出的方位（上/下/右/左）加 `offset` 像素偏移，把不重叠的标签位置写回 `x/y/opacity/align/baseline`；`avoidMarks: ["points"]` 声明还要避开散点云 |
| `marks.hovername` | 悬停车名 | 数据源 `hovercar` 只有 0 或 1 条记录，因此这段文字随鼠标移动而出现/消失 |

### 关键概念

- **为什么 Voronoi 拾取高效**：Delaunay/Voronoi 一次性把平面划分成“每个点独占的最近区域”，
  之后浏览器只需对少量单元格做命中测试；逐点监听则要求每个小圆点都被精确命中，体验差且事件多。
- **标记作为数据源（mark as data source）**：`from: { "data": "labelpoints" }` 让 text 标记的
  每条 datum 变成红圈标记的**图形项**。因此取原记录字段要多跳一级：`{ "field": "datum.Name" }`
  = 图形项的 `datum`（汽车元组）的 `Name`；同理 `datum.x`/`datum.y` 能拿到锚点的屏幕坐标。
- **`label` 变换的输出**：默认 `as: ["x", "y", "opacity", "align", "baseline"]`，直接改写在 text
  图形项上（找不到无重叠位置时 `opacity` 为 0，标签自动隐藏）。
- **画布依赖警告**：`label` 变换的碰撞检测要把避让对象渲染到离屏 canvas 做位图运算，
  **Node 无头环境没有 canvas 会抛错**；浏览器中正常工作。本 demo 的无头校验因此只能覆盖到
  “空数据跑通”（见汇报说明）。

## 试一试（改练）

1. 把 `datum.rank <= 2` 改成 `<= 5`，标签变多后观察 `label` 变换如何选择方位、放不下时如何隐藏。
2. 把 `anchor` 删掉 `"top", "bottom"` 只留左右，比较标签分布变化。
3. 给 `cells` 标记加 `"stroke": { "value": "#cccccc" }`，把 Voronoi 网格可视化出来，理解拾取区域形状。
4. 把 `hovername` 的 `dy` 改成 `14`，或把 `avoidMarks` 再加 `"labelpoints"`，看碰撞避让的差异。

## 参考

- 官方示例：[Labeled Scatter Plot](https://vega.github.io/vega/examples/labeled-scatter-plot/) ·
  [Airport Connections（Voronoi 拾取）](https://vega.github.io/vega/examples/airport-connections/)
- 官方文档：[voronoi 变换](https://vega.github.io/vega/docs/transforms/voronoi/) ·
  [label 变换](https://vega.github.io/vega/docs/transforms/label/) ·
  [window 变换](https://vega.github.io/vega/docs/transforms/window/) ·
  [事件流语法](https://vega.github.io/vega/docs/event-streams/)
