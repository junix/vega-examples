# 09 · 联动过滤：crossfilter 三直方图

## 学习目标

做一个经典的 crossfilter 交互：三张直方图（延误 / 起飞时刻 / 航程），在任意一张上刷选一个区间，
其余两张立即按「同时满足所有刷选条件」的航班子集重算分布。涉及本教程最综合的机制：

- `signal` 的**事件流**写法（pointerdown/pointermove/dblclick 如何驱动一个区间信号）
- `crossfilter` + `resolvefilter` 变换如何把多个刷选信号变成高效的多维过滤
- 「灰色全集背景 + 蓝色子集前景」双层直方图的结构与原因

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` `chartHeight/chartGap/height` | 布局参数 | `height` 只有 `update` 表达式：由前两个信号算出总高，三张图纵向均分 |
| `signals` `delayExtent/hourExtent/distExtent` | 各维度的数据范围常量 | 同时被 bin 变换、x 比例尺、range 信号初值复用；必须覆盖数据真实范围（超出的值会被 bin 到 ±Infinity） |
| `signals` `delayAnchor/delayRange` 等 6 个 | 刷选状态 | 每个维度一对：anchor 记按下点，range 是当前选中区间（详见下文「事件流」） |
| `data[0]` `flights-raw` | 加载 + 预处理 | `format.parse` 按 `date:'%Y/%m/%d %H:%M'` 把字符串解析成 Date；`formula` 用 `hours(datum.date)` 提取小时；三个 `bin` 把 delay/hour/distance 离散化成 `[x0, x1)` 区间对 |
| `data[1]` `flights` | 交叉过滤 | 唯一的 `crossfilter` 变换：`fields` 三个维度 + `query` 三个区间信号，输出名为 `xfilter` 的「每记录位图」信号（详见下文） |
| `scales` `layout` | 纵向分区 | band 比例尺把 ["delay","hour","distance"] 均分到总高，每个 group 用 `{"scale":"layout","value":"delay"}` 取自己的 y 位置 |
| `scales` `delayScale` 等 | 三张图共用的 x 比例尺 | 定义在顶层，group 内按比例尺名引用；domain 直接绑 extent 信号 |
| `marks` 三个 group | 三张直方图 | 每个 group 内部自带两份数据（bg/fg）、一个 y 比例尺、一条 x 轴、四层标记（灰柱/蓝柱/刷选框/标题） |
| group 内 `delay-bg` / `delay-fg` | 背景与前景数据 | bg 来自 `flights-raw`（全集、静态）；fg 来自 `flights` 经 `resolvefilter`（子集、随刷选变化）；之后都接 `aggregate` 按 bin 计数 |
| `aggregate` 的 `key`/`drop:false` | 保留空 bin | 刷选缩小后某些 bin 计数变 0，不保留的话柱子会消失而不是变矮，`key`+`drop:false` 保证柱位稳定 |

### 事件流：brush 信号怎么写

以 delay 维度为例（另外两个完全同构）：

```json
{ "name": "delayAnchor", "value": 0,
  "on": [{ "events": "@delay:pointerdown!", "update": "invert('delayScale', x())" }] }
```

- `@delay:pointerdown` —— `@名字` 表示「名为 delay 的 group 标记上的事件」；`!` 表示消费掉该事件（不再向外冒泡）。
- `x()` 是事件触发点的横坐标（相对于该 group 的局部坐标系）；`invert('delayScale', x())` 用比例尺的逆变换把像素换算回数据值（分钟）。anchor 记录的就是「按下那一刻的数据值」。

```json
{ "events": "[@delay:pointerdown, window:pointerup] > window:pointermove!",
  "update": "[min(delayAnchor, invert('delayScale', x())), max(delayAnchor, invert('delayScale', x()))]" }
```

- `[A, B] > C` 是**区间过滤事件流**：只在「A 事件发生之后、B 事件发生之前」才放行 C 事件——即「在 delay 图上按下、且尚未松开」期间的 `window:pointermove`。用 window 监听移动/抬起，指针拖出图表也能继续刷选。
- 拖动中 range 不断更新为 `[min(anchor, 当前值), max(anchor, 当前值)]`，向左拖也不会出现颠倒的区间。

```json
{ "events": "@delay:dblclick!", "update": "[delayExtent[0], delayExtent[1]]" }
```

- 双击重置为完整范围。**注意必须构造一个新数组**：如果写 `"update": "delayExtent"` 赋的是同一引用，Vega 认为信号值没变，不会向下游传播，重置就失效了。

刷选框 rect 不需要事件：它只通过 `"x": {"signal": "scale('delayScale', delayRange[0])"}` 这样的绑定跟着 range 信号走。事件全部落在 group 上（group 的 `fill: "transparent"` 依然可被拾取；柱子和刷选框都设了 `interactive: false`，不会抢事件）。

### 数据依赖：各数据集如何被 brush 交叉过滤

```
flights-raw ────────────────────────────────→ delay-bg / hour-bg / dist-bg（灰色全集，静态）
    │
    └→ flights（crossfilter：fields=[delay,hour,distance]，query=[delayRange,hourRange,distRange]）
            │  输出信号 xfilter = 每条记录的位图：第 i 位为 1 表示「该记录落在第 i 个维度的区间之外」
            ├→ resolvefilter(ignore: 1) → aggregate → delay-fg（蓝色子集）
            ├→ resolvefilter(ignore: 2) → aggregate → hour-fg
            └→ resolvefilter(ignore: 4) → aggregate → dist-fg
```

- 任一 `*Range` 信号变化 → `crossfilter` 增量更新位图 → 三个 `resolvefilter` 各自重新过滤 → 各自 aggregate 重算 → 柱子高度更新。声明完依赖关系后，这一切自动发生，没有一行命令式代码。
- **`ignore` 是位掩码**：fields 数组里第 i 个维度对应位 `1 << i`（delay=1、hour=2、distance=4）。`ignore: 1` 表示「过滤时无视 delay 维度的条件」。
- **为什么要 ignore 自己**：这是 crossfilter 的经典规则——某张图的分布应该反映「其余维度的筛选」，而不是被自己的刷选掏空。否则你在 delay 图上刷 [0, 60]，delay 图自己只剩这一段的柱子，无法看到这段在整体里的位置，也无法继续调整。ignore 自己是「自己的刷选只作用于别人」。

### 为什么需要两层 rect（灰色全集 + 高亮子集）

- 单层直方图直接画 `*-fg` 也能联动，但刷选后柱子整体变矮，**失去了「全集长什么样」的参照**，看不出子集在各 bin 上的占比差异（例如「早班机集中在短航线」这种结构）。
- 灰色 `*-bg` 提供静态参照系：它是全集分布，且取自 `flights-raw` 而**不是** `flights`。原因不是「`crossfilter` 会把被所有维度排除的记录剔除」——它一条都不删：把三个区间同时收窄到有 930/2000 条记录被三个维度同时排除时，`view.data('flights')` 依然是全部 2000 行（而三张图的蓝柱总数正确地降到 62/158/91）。真正的原因是 `crossfilter` 输出 pulse 的 `add`/`rem`/`mod` 里装的是**位图下标（整数）而不是 tuple**，只有下游的 `resolvefilter` 认得这种下标、能把它翻译回记录。所以把 `aggregate` 直接挂到 `flights` 上，`groupby` 的 `delay0`/`delay1` 全是 `undefined`，只会得到一个退化分组（bins=1，`count` 是下标计数的副产物、数值无意义），rect 的 `x` 算成 `undefined`、`x2` 算成 `NaN`，一根柱子也画不出来。
- y 比例尺的 domain 也取自静态的 `*-bg`，这样刷选时坐标轴不动，蓝色柱子在灰色背景内消长，变化一目了然。若 domain 取自 `*-fg`，每次刷选都会重新定标，柱状图会「弹跳」。

## 试一试

1. 在延误图上刷 `[0, 60]`：看起飞时刻图的蓝色分布偏向哪些小时；双击延误图重置。
2. 把 `delay-fg` 的 `ignore: 1` 改成 `0`（不忽略自己），再刷延误图——本图的柱子会跟着自己的刷选一起塌掉，体会 ignore 的作用。
3. 改 bin 的 `step`（如 distance 的 100 改成 200），观察直方图粒度变化。
4. 把某个 `*Extent` 改小（如 `delayExtent` 改成 `[-60, 180]`）——超范围的 5 条记录（199/204/205/217/365 分钟）会被 bin 到 `delay0 = Infinity`，而 `scale('delayScale', Infinity)` 返回 `NaN`，rect 的 x/x2 都成 `NaN` 后被渲染器压成「x=0、宽度 0」的矩形，于是这 5 条记录**贴在最左端静默消失**——不是出现在最右侧（最右侧画的仍是正常的 170–180 bin），整份 SVG 里也找不到任何 `NaN`/`Infinity` 坐标。改小下界同理：`delayExtent` 改成 `[0, 370]` 时 992 条负延误记录落到 `-Infinity`，同样退化成 x=0 的零宽柱子而整批消失。这就是 extent 必须覆盖数据范围的原因：溢出不报错，只悄悄丢数据。
5. 进阶：仿照现有三个 group 增加第四张图（如按起飞日期 `date(datum.date)`），需要动哪几处？（`signals` 加一对 extent/anchor/range、`flights-raw` 加一个 `bin`、`crossfilter` 的 `fields`/`query` 各加一项、`layout` 的 domain 加一项、`height` 的 `(chartHeight + chartGap) * 3` 改成 `* 4`；`ignore` 掩码**只需给新图写 `ignore: 8`**——新维度追加在 `fields` 末尾时，已有的 delay=1 / hour=2 / distance=4 完全不变，只有把新维度插到 `fields` 中间才需要重排。）

## 参考

- 官方示例：[Crossfilter Flights](https://vega.github.io/vega/examples/crossfilter-flights/)（本 demo 是它的简化版：去掉了滚轮缩放与刷选框拖动平移，并把分布拆成了灰/蓝两层）
- 官方文档：[Signals](https://vega.github.io/vega/docs/signals/) ·
  [事件流语法](https://vega.github.io/vega/docs/event-streams/) ·
  [表达式（invert/scale/x 等）](https://vega.github.io/vega/docs/expressions/) ·
  [Bin](https://vega.github.io/vega/docs/transforms/bin/) ·
  [Aggregate](https://vega.github.io/vega/docs/transforms/aggregate/)
