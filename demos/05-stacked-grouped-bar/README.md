# 05 · 堆叠与分组柱状图

## 学习目标

- 用 `stack` 变换把同一类目下的多段数值「叠」起来：它按 `groupby` 分组、按 `sort`
  决定堆叠顺序，并为每条记录产出 `y0`（段起点）/ `y1`（段终点）两个新字段。
- 在**一个 spec 里放多个 `group` 标记当面板**：用 `encode.enter` 的 `x / y / width / height`
  给每个面板定位（本例下面板靠 `"y": {"value": 290}` 垂直偏移），面板内部的比例尺、
  坐标轴、标记都写在 group 的子级里，`range: "width" / "height"` 自动跟随面板宽高。
- 掌握分组柱状图的经典模式：面板内再放一个 `from.facet` 的 group 标记，按 `age`
  拆成 19 个子分组，每个子分组内部定义自己的嵌套 band 比例尺（`x-sex`）来并排两根柱子。
- 用 `legend.encode.labels` 把图例里的原始值 `1 / 2` 改写成 `男 / 女`。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[population]` | 公共数据 | `filter` 保留 year 为 2000 的记录，再按 `(age, sex)` 聚合 `sum(people)`；两个面板共用这份结果 |
| `data[stacked]` | 堆叠专用数据 | `stack`：`groupby: ["age"]` 表示每个年龄独立成柱；`sort: {"field": "sex"}` 让 sex=1（男）在底部；产出字段显式命名为 `y0 / y1` |
| `scales[color]` | 共享颜色比例尺 | 顶层定义、两个面板共用，保证同色同义；domain 显式写 `[1, 2]` 固定顺序 |
| `legends` | 图例 | `fill: "color"` 生成符号图例；`encode.labels.update.text` 用信号表达式按 `datum.value` 改写显示文本 |
| `marks[stacked-panel]` | 上面板容器 | `group` 标记本身可被编码：灰色 `stroke` 描出面板范围；`width` 跟随视图、`height` 固定 220 |
| 面板内 `scales / axes` | 面板局部比例尺与坐标轴 | 写在 group 子级 → 只作用于本面板；`y-stack` 的 domain 取堆叠终点 `y1`（即每柱总高） |
| 面板内 `marks[rect]` | 堆叠柱 | 一根柱子的每段：`y = y0`、`y2 = y1` 直接绑定 stack 产出字段，无需手算累加 |
| 面板内 `marks[text]` | 面板标题 | 不带 `from` 的标记只生成一个图形实例；`x` 取面板 `width` 信号右对齐 |
| `marks[grouped-panel]` | 下面板容器 | 结构同上面板，但 `y` 偏移 290 腾出上面板（220 高）加其 x 轴的空间——面板布局完全靠这几个数值约定 |
| 面板内 `marks[age-group]` | 按年龄分面 | `from.facet`：`groupby: "age"` 为每个年龄生成一个子 group，facet 数据命名为 `by-age`；子组 `x` 用面板的 band 比例尺定位、`width` 取 `bandwidth('x-age-gr')` |
| 子组内 `scales[x-sex]` | 嵌套 band 比例尺 | 每个子组独立拥有一份，`range: "width"` 跟随子组宽度；domain 取自本组 facet 数据 `by-age` 的 `sex` 字段 |
| 子组内 `marks[rect]` | 分组柱 | `x = x-sex(sex)` 并排两根柱；`y / y2` 用的是**面板的** `y-group` 比例尺——子组坐标原点与面板对齐，所以数值坐标一致 |

## 试一试

1. 把 `filter` 的 `2000` 改成 `1990` 或 `1850`，两个面板会一起换数据（它们共用 `population`）。
2. 把 `stack` 的 `sort` 改成 `{"field": "sex", "order": "descending"}`，男女色块上下互换。
3. 调整下面板 `encode.enter` 里的 `"y": {"value": 290}` 和两个面板的 `"height": {"value": 220}`，
   观察面板布局如何完全由这几个数值控制；再把面板总高 `height: 510` 改小，看看会裁掉什么。
4. 把嵌套比例尺 `x-sex` 的 `padding` 从 `0.12` 调到 `0.5`，组内两根柱变瘦；再给外层
   `x-age-gr` 的 `padding` 调到 `0.4`，组与组之间拉开。
5. 给下面板的 rect 去掉 `hover` 编码集，对比上下两个面板的悬停体验。
6. 进阶：给堆叠柱的每段加 `text` 标记显示数值（`y` 取 `y0` 与 `y1` 的中点需要信号表达式，
   想想怎么写）。

## 参考

- 官方示例：[Stacked Bar Chart](https://vega.github.io/vega/examples/stacked-bar-chart/) ·
  [Grouped Bar Chart](https://vega.github.io/vega/examples/grouped-bar-chart/) ·
  [Nested Bar Chart](https://vega.github.io/vega/examples/nested-bar-chart/)
- 官方文档：[stack 变换](https://vega.github.io/vega/docs/transforms/stack/) ·
  [group 标记](https://vega.github.io/vega/docs/marks/group/) ·
  [Legends（encode 段落）](https://vega.github.io/vega/docs/legends/)
