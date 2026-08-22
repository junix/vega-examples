# 08 · 宽长互转：fold 与 pivot

## 学习目标

- 理解「宽表」（一行多年度、每季度一列）与「长表」（一行一个季度值）两种数据形态，以及为什么可视化库通常更喜欢长表。
- 掌握 `fold`（宽 → 长）与 `pivot`（长 → 宽）两个变换的参数与输出结构。
- 学会用 `group` 标记把多个独立图表分区放进一个 spec，以及用 band 比例尺把数据画成一张「表格」。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` `sales-wide` | 原始宽表（inline） | 6 行：year + q1..q4 四列销售额 |
| `data[1]` `sales-long` | 宽 → 长 | `fold`：`fields` 列出要「折叠」的列，`as: ["quarter", "sales"]` 指定生成的两个新字段名——quarter 存**原列名**（"q1"…），sales 存**原单元格的值**。6 行宽表变成 6×4=24 行长表 |
| `data[2]` `sales-pivoted` | 长 → 宽 | `pivot`：`groupby: ["year"]` 决定每个 year 输出一行；`field: "quarter"` 的值（q1..q4）变成**新列名**；`value: "sales"` 提供单元格内容；`op: "sum"` 是聚合方式（一个 (year, quarter) 组合出现多次时必须靠 op 合并，本例每组只有一条，sum 即原值） |
| `data[3]` `sales-cells` | 再 fold 一次 | pivot 的输出仍是宽表，没法用「一条 datum → 一个单元格」的方式逐格渲染；再 fold 回长表后，每条记录正好对应表格一个单元格 |
| `data[4]` `quarters` | 列头数据 | 4 条记录，只为画出 q1..q4 四个列标题 |
| `scales` `color` | 季度配色 | 顶层定义，两个分区都能按名字引用；显式 `domain` 保证颜色顺序稳定 |
| `legends` | 季度图例 | `orient: "right"`，超出 width 的部分由默认 autosize（pad）自动扩出画布 |
| `signals` | 分区几何 | `foldTop/foldHeight/pivotTop/pivotHeight`：抽成信号是为了让 group 的 `encode` 与它的**局部 height 信号**共用同一个数字 |
| `marks[0]` `fold-section` | 折线图分区 | `group` 标记：有自己的 `scales`/`axes`/`marks` 和独立局部坐标系 |
| `marks[0].signals` | **局部 height 信号** | `{"name": "height", "update": "foldHeight"}`。`range: "height"` 的含义是「取当前作用域里名为 height 的信号」，group mark **不会**自动把它重绑为自己的高度 —— 少了这一条，y 轴会按顶层的 630 铺开，折线直接冲出分区（详见 demos/05 的「作用域陷阱」一节） |
| `marks[0].scales[x]` | 年份轴 | 必须显式 `"zero": false` ——线性比例尺默认把 0 纳入 domain，年份轴一旦从 0 起，2019~2024 就被压成右边缘一条竖线；`padding: 14` 是像素留白，免得首末点贴在轴两端 |
| `marks[0].marks[1]` | facet 多序列 | `from.facet` 按 quarter 把 `sales-long` 切成 4 个子数据集 `series`，每个子分组画一条 line + 一组 symbol |
| `marks[1]` `pivot-section` | 表格分区 | 同样声明了局部 `height` 信号；两个 band 比例尺：`xcol`（显式 domain 定列序）定位列、`yrow`（domain 取 pivot 输出的 year 并 `sort: true`）定位行 |
| `pivot-section` 内 text/rect | 表格本体 | 列头（quarters 数据，画在 y=-10）、行头（sales-pivoted 的 year，画在 x=-10）、rect 描单元格边框、text 写数值；`"band": 0.5` 取带宽中点做居中 |

### 关键概念

- **fold 的输出字段**：`as` 的第一个字段装「这一格原来属于哪一列」（列名字符串），第二个字段装值。字段名任意，但顺序固定为 [key, value]。
- **pivot 的输出字段**：新列名来自 `field` 字段的**取值**（本例即 "q1".."q4"），不在 spec 里显式列出——数据里出现什么值，输出就有哪些列。
- **变换可以串成管线也可以成环**：`sales-wide → sales-long → sales-pivoted → sales-cells`，pivot 后再 fold 完全合法。变换只描述数据形状，不区分「第几手」数据。
- **group 标记分区**：一个 spec 里想放多个独立图表时，每个图表包一个 `group`，组内比例尺、坐标轴、数据都局部生效；组的位置用 `encode.enter.x/y` 指定。
- **别忘了给 group 声明局部 `width`/`height` 信号**：这是 Vega 最容易踩且不报错的坑。
  `range: "width"/"height"` 只是「查作用域里这个名字的信号」，group 不会自动重绑。
  本项目的 `node tools/validate.cjs` 加了布局溢出检查专门抓它。
- **线性比例尺的 `zero`**：默认会把 0 拉进 domain。画金额、计数时这是对的（柱状图必须从 0 起），
  但画年份、温度、pH 这类不以 0 为基准的量时必须显式关掉。

## 试一试

1. 在 `sales-wide` 里加一行 2025 年的数据，折线和表格会同时更新——体会「数据驱动」。
2. 把 pivot 的 `"op": "sum"` 改成 `"max"` 或 `"mean"`，对比结果（本例每组只有一条记录，结果不变；想想什么数据下会变）。
3. 把 `yrow` 比例尺 domain 里的 `"sort": true` 删掉，观察表格行序变成什么（提示：与数据到达顺序有关）。
4. 把 `fold` 的 `as` 改成 `["key", "value"]`，再把后续引用到的字段名一并改掉。
5. 只保留 q1/q2 两列参与 fold（`fields: ["q1", "q2"]`），看折线与表格各少了什么。

## 参考

- 官方文档：[Fold 变换](https://vega.github.io/vega/docs/transforms/fold/) ·
  [Pivot 变换](https://vega.github.io/vega/docs/transforms/pivot/) ·
  [Facet](https://vega.github.io/vega/docs/marks/group/#facet) ·
  [Group 标记](https://vega.github.io/vega/docs/marks/group/)
