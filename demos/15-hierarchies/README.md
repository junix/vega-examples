# 15 · 层次布局：Treemap 与 Sunburst

## 学习目标

- 掌握层次数据进入布局变换的两步套路：先 `stratify` 建层级，再 `treemap` / `partition` 做空间填充布局；
- 说清两类产出字段的含义：`treemap` 的 `x0/y0/x1/y1`（像素矩形）与 `partition` 的同名输出（语义是弧度/半径，惯例用 `as` 重命名为 `a0/r0/a1/r1`），以及公共字段 `depth` / `children`；
- 学会在变换产出上再用 `filter` 派生数据集，控制标签密度、剔除根节点等；
- 认识 `arc` 标记的 `startAngle / endAngle / innerRadius / outerRadius` 通道。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/15-hierarchies/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.layout / aspectRatio` | treemap 的切分算法与目标长宽比 | `bind` 成下拉框/滑杆；布局参数可以是信号，改动即重排 |
| `signals.tmWidth / tmHeight / sunRadius / sunCx / sunCy` | 两个面板的几何划分 | 左半给 treemap，右半以 `(sunCx, sunCy)` 为圆心、`sunRadius` 为半径放 sunburst；全部由 `width/height` 推导 |
| `data.flare-flat` | 原始数据 | flare.json 是**扁平表**：每行 `{id, name, parent, size?}`，用 `parent` 指回父节点的 `id`，只有叶子带 `size` |
| `data.tree-treemap` | 第一条管线：`source` 复用原始数据 → `stratify` → `treemap` | `stratify` 按 `key/parentKey` 把扁平表连成树（层级布局变换只认它或 `nest` 产出的 backing tree）；`treemap` 以 `size` 字段定面积，`sort` 让大块排前，`round` 取整像素，`padding` 留缝 |
| `data.treemap-labels` | 派生标签集 | 在布局产出上过滤：`!datum.children` 只留叶子，且矩形足够大才配拥有文字——标签密度由阈值控制 |
| `data.tree-sunburst` | 第二条管线：`stratify` → `partition` | `partition` 的 `size` 是 `[角度范围, 半径范围]`：`2 * PI` 整圈、`sunRadius` 最大半径；`as` 把默认输出名 `x0/y0/x1/y1` 改成语义化的 `a0/r0/a1/r1` |
| `data.sunburst-arcs` | 派生扇环集 | 滤掉 `depth = 0` 的根节点——根扇环会填满整个圆，去掉它中心自然留空 |
| `data.sunburst-center` | inline 数据 | 一条记录给中心文字用，演示 `values` 与外部 url 之外的第三种数据来源 |
| `scales.depthColor` | 按 `depth` 配色 | ordinal 比例尺；两个面板共享同一比例尺，保证「同深度同色」 |
| `marks[0]`（rect） | Treemap 矩形 | 全部节点都画：`x/y/x2/y2` 绑定 `x0/y0/x1/y1`；数据按先根遍历输出，父先子后，自然嵌套 |
| `marks[1]`（text） | Treemap 标签 | 定位用信号表达式取矩形中心 `0.5 * (datum.x0 + datum.x1)` |
| `marks[2]`（arc） | Sunburst 扇环 | `x/y` 是圆心；`startAngle/endAngle` 绑 `a0/a1`，`innerRadius/outerRadius` 绑 `r0/r1`；hover 时提 `zindex` 压住邻居 |
| `marks[3]`（text） | 中心根名 | 固定在 sunburst 圆心 |

### 关键概念

- **stratify 是层级布局的入口**：treemap / partition / pack / tree 等变换不直接吃数据行，
  它们要求上游有 `stratify`（扁平 id/parent 表）或 `nest` 产出的「backing tree」。
  如果手上的数据是嵌套 JSON（`{name, children: [...]}`），Vega 也不会自动识别
  `children` 字段——需要先拍平成 id/parent 表（或用自定义变换预处理，见 demo 20）。
- **`field: "size"` 与内部汇总**：布局先对每个内部节点做 `sum(size)` 得到子树总量，
  再按比例划分空间。所以叶子要有 `size`，内部节点没有也没关系。
- **产出字段**：两类布局都会在每条数据上追加 `depth`（根为 0）与 `children`（子节点计数，
  叶子为 0，可直接当布尔用）。坐标字段默认叫 `x0/y0/x1/y1`：treemap 里是像素矩形对角；
  partition 里是「角度/半径」对，用 `as` 重命名成 `a0/r0/a1/r1` 可读性更好。
- **一个 spec 多个面板**：本例没有用 group mark，而是让两条数据管线各自布局、
  共用一张画布，靠信号算好各自的位置。mark 按声明顺序绘制，不同面板的 mark 交错声明也没问题。

## 试一试（改练）

1. 右侧面板把 `layout` 换成 `binary` / `slice` / `dice`，比较切分风格；拖 `aspectRatio` 到 1 看方块化。
2. 把 `treemap-labels` 的过滤阈值 `40` 调小（如 `20`）或删掉面积条件，观察标签密度的变化与重叠问题。
3. 把 `sunburst-arcs` 的过滤条件改成 `datum.depth > 0 && datum.depth < 3`，只画两圈。
4. 把 `depthColor` 的 `range` 换成 `{ "scheme": "blues" }`，体会顺序色板表达「深度」语义的效果。
5. 把 `partition` 的 `size` 第一个信号改成 `"PI"`（半圆）并相应调整 `sunCx`，做一个半圆 sunburst。
6. 进阶：给 treemap 的 rect 也加上 `tooltip`（参考 demo 12），悬停看 `name` 与 `size`。

## 参考

- 官方文档：[Stratify 变换](https://vega.github.io/vega/docs/transforms/stratify/) ·
  [Treemap 变换](https://vega.github.io/vega/docs/transforms/treemap/) ·
  [Partition 变换](https://vega.github.io/vega/docs/transforms/partition/) ·
  [Arc 标记](https://vega.github.io/vega/docs/marks/arc/)
- 官方示例：[Treemap](https://vega.github.io/vega/examples/treemap/) ·
  [Sunburst](https://vega.github.io/vega/examples/sunburst/)
- 底层引擎：[d3-hierarchy](https://github.com/d3/d3-hierarchy)
