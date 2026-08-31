# 15 · 层次布局：Treemap 与 Sunburst

## 学习目标

- 掌握层次数据进入布局变换的两步套路：先 `stratify` 建层级，再 `treemap` / `partition` 做空间填充布局；
- 说清两类产出字段的含义：`treemap` 的 `x0/y0/x1/y1`（像素矩形）与 `partition` 的同名输出（语义是弧度/半径，惯例用 `as` 重命名为 `a0/r0/a1/r1`），以及公共字段 `depth` / `children`；
- 学会在变换产出上再用 `filter` 派生数据集，控制标签密度、剔除根节点等；
- 认识 `arc` 标记的 `startAngle / endAngle / innerRadius / outerRadius` 通道。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/15-hierarchies/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.layout / aspectRatio` | treemap 的切分算法与目标长宽比 | `bind` 成下拉框/滑杆；布局参数可以是信号，改动即重排 |
| `signals.labelFont` | treemap 标签字号 | 字号与「标签放不放得下」的过滤阈值都用它换算，避免两处各写一份数字后走样 |
| `signals.tmWidth / tmHeight / sunRadius / sunCx / sunCy` | 两个面板的几何划分 | 左半给 treemap，右半以 `(sunCx, sunCy)` 为圆心、`sunRadius` 为半径放 sunburst；全部由 `width/height` 推导 |
| `data.flare-flat` | 原始数据 | flare.json 是**扁平表**：每行 `{id, name, parent, size?}`，用 `parent` 指回父节点的 `id`，只有叶子带 `size` |
| `data.tree-treemap` | 第一条管线：`source` 复用原始数据 → `stratify` → `treemap` | `stratify` 按 `key/parentKey` 把扁平表连成树（层级布局变换只认它或 `nest` 产出的 backing tree）；`treemap` 以 `size` 字段定面积，`sort` 让大块排前，`round` 取整像素，`padding` 留缝 |
| `data.treemap-labels` | 派生标签集 | 在布局产出上过滤：`!datum.children` 只留叶子；高度要放得下一行字（`> labelFont + 4`）；宽度要放得下**这个名字本身**（`> length(datum.name) * labelFont * 0.8 + 4`）——只看矩形宽度是不够的，见下文「关键概念」 |
| `data.tree-sunburst` | 第二条管线：`stratify` → `partition` | `partition` 的 `size` 是 `[角度范围, 半径范围]`：`2 * PI` 整圈、`sunRadius` 最大半径；`as` 把默认输出名 `x0/y0/x1/y1` 改成语义化的 `a0/r0/a1/r1` |
| `data.sunburst-arcs` | 派生扇环集 | 滤掉 `depth = 0` 的根节点——根扇环会填满整个圆，去掉它中心自然留空 |
| `data.sunburst-center` | inline 数据 | 一条记录给中心文字用，演示 `values` 与外部 url 之外的第三种数据来源 |
| `scales.depthColor` | 按 `depth` 配色 | ordinal 比例尺；两个面板共享同一比例尺，保证「同深度同色」 |
| `marks[0]`（rect） | Treemap 矩形 | 全部节点都画：`x/y/x2/y2` 绑定 `x0/y0/x1/y1`；数据按先根遍历输出，父先子后，自然嵌套 |
| `marks[1]`（text） | Treemap 标签 | 定位用信号表达式取矩形中心 `0.5 * (datum.x0 + datum.x1)`；`limit` 绑 `datum.x1 - datum.x0 - 4`，是「文字不许超出自己矩形」的硬保证 |
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
- **布局只约束矩形，不约束文字**：这是层次图最容易翻车的地方。`treemap` 给出的
  `x0/x1` 是矩形边界，而 `text` 标记的宽度由字体与字符数决定，两者毫无关系。
  只写「矩形够宽才配有标签」（例如 `x1 - x0 > 40`）挡不住长名字：本例实测过，
  阈值 40 时 48 个标签里有 22 个横向溢出自己的矩形、7 对互相压字、3 个越出画布左边界被裁。
  可用的两道防线：
  1. **上游估宽**：Vega 表达式语言没有测字宽的函数，用 `length(datum.name) * 字号 * 0.8`
     当宽度上界。`0.8` 不是随手取的——它正是 Vega 在没有 canvas 时的估算常数
     （`~~(0.8 * text.length * fontSize)`）。本例的字体与这批 CamelCase 名字实测最宽只有
     `0.585 * 字号 / 字符`，都比这个上界窄，所以纯 Node 校验（走估算）与浏览器渲染（走 canvas
     真实测量）挑出的是同一批 15 个标签，不会出现「Node 里被截断、浏览器里没截断」的分歧。
     换字体、换成宽字形较多的文本（如全大写的 `WWW`）或换成中文时，这个上界都要重新量
     —— `0.8 × 字数 × 字号` 对 CJK 是**低估**（一个汉字约一个字号宽），估宽会失效，只剩 `limit` 兜底。
  2. **下游硬裁**：`text` 标记的 `limit` 通道。超过 `limit` 像素的文字会被截断并补上
     `…`（省略号可用 `ellipsis` 换）。关键是 `limit` **参与包围盒计算**——
     Vega 先按 `limit` 截好字符串再量宽度，所以溢出检查看到的就是截断后的宽度。
  两道一起用：过滤负责「不留一堆只剩两个字母的残标签」，`limit` 负责「万一估歪了也绝不出框」。
  默认 `squarify` 下标签从 48 个收到 15 个，而横向溢出、互相压字、越出画布全部归零。
- **一个 spec 多个面板**：本例没有用 group mark，而是让两条数据管线各自布局、
  共用一张画布，靠信号算好各自的位置。mark 按声明顺序绘制，不同面板的 mark 交错声明也没问题。

## 试一试（改练）

1. 在页面右侧的 **Signals 绑定面板**里把 `layout` 换成 `binary` / `slice` / `dice`，比较切分风格；
   拖 `aspectRatio` 到 1 看方块化。注意 `layout` 只作用于画布**左半**的 treemap——
   右半的 sunburst 由 `partition` 布局，没有切分算法可选。
   （顺带能看到 `slice` / `dice` 下标签会全部消失：每个叶子被压成一条极扁或极窄的带，
   谁都装不下自己的名字。）
2. 把 `treemap-labels` 里的宽度条件换回只看矩形的 `datum.x1 - datum.x0 > 40`，
   标签会从 15 个涨到 48 个——这时 `limit` 单独顶着：其中 25 个被截断成 `Quantit…` / `Betwe…` 这样，
   但实测仍然零溢出、零压字、零出画布。再把 `marks[1]` 的 `limit` 也删掉，就能看到本 demo 修好之前的样子。
3. 把 `sunburst-arcs` 的过滤条件改成 `datum.depth > 0 && datum.depth < 3`，只画两圈。
4. 把 `depthColor` 的 `range` 换成 `{ "scheme": "blues" }`，体会顺序色板表达「深度」语义的效果。
5. 把 `partition` 的 `size` 第一个信号改成 `"PI"`（半圆）并相应调整 `sunCx`，做一个半圆 sunburst。
6. 进阶：给 treemap 的 rect 也加上 `tooltip`（参考 demo 12），悬停看 `name` 与 `size`。
   注意得先把这个 mark 的 `"interactive": false` 去掉——`interactive: false` 会让 Vega
   跳过该 mark 的命中检测（SVG 渲染下直接输出 `pointer-events: none`），tooltip 永远不触发。

## 参考

- 官方文档：[Stratify 变换](https://vega.github.io/vega/docs/transforms/stratify/) ·
  [Treemap 变换](https://vega.github.io/vega/docs/transforms/treemap/) ·
  [Partition 变换](https://vega.github.io/vega/docs/transforms/partition/) ·
  [Arc 标记](https://vega.github.io/vega/docs/marks/arc/)
- 官方示例：[Treemap](https://vega.github.io/vega/examples/treemap/) ·
  [Sunburst](https://vega.github.io/vega/examples/sunburst/)
- 底层引擎：[d3-hierarchy](https://github.com/d3/d3-hierarchy)
