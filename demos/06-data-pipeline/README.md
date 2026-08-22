# 06 · 数据变换管线：每个 Origin 功率重量比 Top-3

## 学习目标

看懂 Vega 的 `transform` 管线如何像流水线一样逐段加工数据：本 demo 用一条
`filter → formula → window → filter → collect` 的五段管线，从 cars.json 的 406 行原始记录
算出「每个 Origin（产地）功率重量比最高的 3 款车型」，并用 group mark + facet 分成三个面板展示；
另用一条旁路的 `aggregate` 数据给每组算出全体均值作脚注对照。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/demos/06-data-pipeline/
```

## spec 逐段讲解

### data 段：管线是本 demo 的主角

| 数据集 / 变换 | 输入 | 输出（新增/保留字段） | 作用 |
| --- | --- | --- | --- |
| `cars_clean` → `filter` | cars.json 全部 406 行 | 原字段不变，剔除 Horsepower 或 Weight_in_lbs 为 null 的行 | 原始数据有空值，不算会污染下游 |
| `cars_clean` → `formula` | 上一步的行 | 新增 `power_ratio` = Horsepower / Weight_in_lbs | 派生指标：每磅重量分到多少马力 |
| `top3` → `window` | source: `cars_clean` | 新增 `rank`：按 Origin 分组、组内按 power_ratio 降序的名次 | `groupby` 让排名在各产地内独立进行 |
| `top3` → `filter` | 带 rank 的行 | 只留 `rank <= 3` 的 9 行（3 组 × 3 名） | Top-K 的「截断」步骤 |
| `top3` → `collect` | 上一步的行 | 字段不变，按 (Origin, rank) 升序落盘排序 | 决定下游 band 比例尺 domain 的出现顺序 |
| `origin_avg` → `aggregate` | source: `cars_clean` | 每组一行：`Origin` + `avg_ratio`（mean） | 旁路参考值：产地全体车型的平均功率重量比 |

要点：

- **`source` 派生**：`top3` 与 `origin_avg` 都以 `cars_clean` 为上游，清洗/派生只做一遍，
  下游各自接自己的变换。数据流是 DAG，不必串成一根独苗。
- **`window` ≠ `aggregate`**：aggregate 把分组折叠成一行；window 保留每一行、只追加窗口计算列
  （`rank`/`row_number`/`dense_rank` 等）。Top-K 要用 window 排名再 filter，而不是 aggregate。
- **`collect` 的意义**：Vega 的离散比例尺 domain 默认按数据出现顺序排列；想让面板/名次按
  固定顺序出现，就显式 `collect` 排序，不要依赖加载顺序。

### 其余段落

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` | 响应式变量 | `cellWidth` 用 `bandwidth('gpos')` 跟随画布宽度，改 `width` 面板自动伸缩 |
| `scales.gpos` | 顶层 band 比例尺 | 把三个 Origin 面板沿 x 方向排开 |
| `marks.cell`（group） | 分面容器 | `from.facet` 按 Origin 把 `top3` 切成 3 份子数据（命名为 `cells`），每份驱动一个 group 实例 |
| group 内 `scales`/`axes` | 面板局部坐标系 | scale/axis 写在 group 里，每个 group 实例各建一份；但 range 必须写成**显式区间**（本例 `[0, {"signal": "cellWidth"}]` 与 `[14, {"signal": "cellHeight"}]`）——见下方「三个坑」 |
| group 内 `scales.x` 的 domain | 让三块面板可比 | domain 指向**未分面的 `top3`**，而不是 facet 子数据 `cells`——见下方「三个坑」 |
| group 内 `rect`/`text` | 面板内容 | 数据源是 facet 产物 `cells`；每条 datum 一根柱子 + 车型名 + 数值。`rect` 的 `hover` 必须配一个 `update` 集才能复位，见下方「hover 要配 update」 |
| 顶层 text（from `cell`） | 面板标题 | `from.data` 指向**组 mark 的名字**时，datum 就是组图形项：`datum.x`/`datum.width` 可读，`datum.datum.Origin` 取回分组键 |
| 顶层 text（from `origin_avg`） | 均值脚注 | 与面板共用 `gpos` 比例尺定位，但要 `offset: {"signal": "cellWidth / 2"}` 从**带起点**推到面板中心，不能用 `band: 0.5`——见下方「三个坑」 |

### 分面的三个坑（本 demo 都踩过，已修好）

**坑 1：facet 子数据当 domain → 面板之间不可比。**
`cells` 是 facet 切出来的**子**数据，group 内 x 比例尺若写 `domain: {"data": "cells", …}`，
三块面板就各自 nice 到自己的最大值，量纲互不相同：实测三根 rank-1 柱子长 174.0 / 171.6 / 172.4 px
几乎一样，而真实值是 0.0506 / 0.0454 / 0.0729（USA 比 Japan 高 61%），读图的人必然读错。
把 domain 换成未分面的 `top3` 后，三块面板共用 `[0, 0.08]`，柱长变成 119.6 / 107.3 / 172.4 px
——长度比 1.607 与数值比 1.606 一致。**要分面独立量纲是有意的选择，就得在轴上写清楚；
默认想要的几乎总是共享 domain。**

**坑 2：`range: "width"/"height"` 在 group 里不会自动重绑。**
它的含义只是「取当前作用域里名为 width/height 的信号」，group mark **不会**把它改写成自己的宽高。
实测：把本例 y 比例尺的 range 从 `[14, {"signal": "cellHeight"}]` 换成 `"height"`，
band 会按顶层 `height: 210` 铺开，第 3 根柱子落到 y≈178.5，冲出 128px 高的面板底边。
两种正确写法：显式区间（本例用法），或在 group 上补 `"signals": [{"name": "height", "update": "cellHeight"}]`
（demos/05、demos/08 用的是后者）。

**坑 3（对齐）：`band: 0.5` 取的是 band 中点，不是面板中点。**
本例面板只占 band 的 86%（`cellWidth = bandwidth('gpos') * 0.86`）且左对齐，
band 中点是 140 / 390 / 640，面板中点是 124.6 / 374.6 / 624.6 ——用 `band: 0.5` 的脚注会比面板标题右偏 15.4px。
面板标题走的是 group 图形项自身的 `datum.x + datum.width / 2`，天然正确；脚注拿不到图形项，
就得用 `offset: {"signal": "cellWidth / 2"}` 自己算。

### hover 要配 update

`rect` 的 `hover` 集里写了 `fillOpacity: 0.7`，就必须在 `update` 集里写回静息值 `fillOpacity: 1`。
Vega 的 `view.hover()` 在 pointerout 时执行的是 `['update', 'hover']` 这个**数组**形式的 encode 指令，
而 `Encode` 变换只在数组里**每个集都存在**时才执行（否则 `StopPropagation`）——
缺了 `update`，鼠标移开后 0.7 的淡色会永久留在那根柱子上。

## 试一试（改练）

1. 把 `window` 的 `"ops": ["rank"]` 改成 `["row_number"]` 或 `["dense_rank"]`，思考三者
   在并列（tie）时的差别（本数据浮点比率几乎不会并列）。
2. 把第二个 filter 的 `datum.rank <= 3` 改成 `<= 5`，面板会容纳更多柱子；注意
   `cellHeight` 不够时把 y 比例尺 range 上限调高。
3. 把 `collect` 的排序改成只按 `power_ratio` 降序，观察三个面板的排列顺序如何变化
   （`gpos` 的 domain 跟随数据顺序）。
4. 把 group 内 x 比例尺的 domain 从 `"top3"` 改回 `"cells"`，对比三块面板的轴刻度上限与柱长
   ——这就是「坑 1」的现场；再把 `rect` 的 `update` 集删掉，用鼠标划过柱子看淡色是否复位。
5. 给 `top3` 再加一段 `lookup`（预习 demo 07）把 `origin_avg.avg_ratio` 拼回每行，
   然后在 group 里画一条 `rule` 参考线。
6. 把 `origin_avg` 的 `"ops": ["mean"]` 改成 `["mean", "count"]`（fields 对应写两个），
   在脚注文字里把样本数 `count` 也拼进去。

## 参考

- 上游官方示例（本仓库是独立目录，没有 vendored 这些文件，直接看线上版）：
  [Top K Plot](https://vega.github.io/vega/examples/top-k-plot/) ·
  [Top K Plot With Others](https://vega.github.io/vega/examples/top-k-plot-with-others/)
  （signal 驱动的 Top-K）·
  [Barley Trellis Plot](https://vega.github.io/vega/examples/barley-trellis-plot/)（group + facet 分面）
- 官方文档：[Transforms 概览](https://vega.github.io/vega/docs/transforms/) ·
  [window](https://vega.github.io/vega/docs/transforms/window/) ·
  [aggregate](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [collect](https://vega.github.io/vega/docs/transforms/collect/) ·
  [facet](https://vega.github.io/vega/docs/marks/group/#facets)
