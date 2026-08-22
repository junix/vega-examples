# 12 · 悬停提示与图例交互

## 学习目标

在散点图（cars.json：Horsepower × Miles_per_Gallon，按 Origin 着色 + shape 双图例）上学三件事：

1. **tooltip 是一个视觉通道**：和 `fill`、`x` 一样写在 `encode` 里，既可以直接绑定字段，
   也可以用 `signal` 表达式拼接多行富文本。
2. **hover 编码集 vs. signal 联动**：内置 `hover` 编码集只作用于被悬停的那一个图形；
   要实现「其余点变暗」这种跨图元效果，需要用 signal 记录悬停的 datum，再在 `update` 里做条件编码。
3. **可点击图例**：给图例的 symbols/labels 命名并打开 `interactive`，就能用
   `@legendSymbol:click` 事件流驱动筛选 signal；顺带演示图例样式定制。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/12-hover-tooltip-legend/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.hovered` | 记录当前悬停的数据元组 | 事件 `@point:mouseover` 命中 named mark 时 `update: "datum"` 把整个 datum 存进 signal；`mouseout` 置回 `null` |
| `signals.clickedOrigin` | 记录图例选中的产地（单选） | `@legendSymbol:click, @legendLabel:click` 时更新；表达式里做「再点同一项则还原为 null」的切换；`force: true` 保证值不变时也触发下游重算 |
| 空白还原 | 点击非图元区域清除筛选 | 事件流 `pointerup[!event.item]`：过滤器 `[!event.item]` 表示「指针没有落在任何场景图元上」 |
| `data.source` | 加载 cars.json 并清洗 | `format.parse` 把 `Year` 按 date 解析（tooltip 里才能按年格式化）；`filter` 变换剔除关键字段为 null 的记录（cars.json 有 6 条 Horsepower、8 条 Miles_per_Gallon 缺失） |
| `scales.color` / `scales.shape` | Origin → 颜色 / 形状 | 两个 ordinal 比例尺共用同一 domain，于是颜色图例和形状图例天然同序；shape 的 range 直接给符号名数组 |
| `legends[0]` | 颜色图例（可交互） | `fill: "color"` 引用比例尺生成；样式定制：`title` / `orient: "right"` / `titleFontSize` / `labelFontSize` / `symbolType` / `symbolSize`；`encode.symbols/labels` 里命名 `legendSymbol`/`legendLabel` 并设 `interactive: true`，图例项才能接收点击事件，透明度随 `clickedOrigin` 联动 |
| `legends[1]` | 形状图例（只读对照） | `shape: "shape"`；与颜色图例同 `orient` 时自动纵向堆叠 |
| `marks[0].encode.update.tooltip` | 悬停提示内容 | tooltip 是通道，不是配置项：`{"signal": "..."}` 用 `+` 拼接多行文本，`'\\n'` 换行；`Year` 按 date 解析后是 UTC 零点，用 `utcFormat(datum.Year, '%Y')` 取年份——若用本地时区的 `timeFormat`，UTC 以西的时区会把 "1970-01-01" 显示成 1969 年 |
| `update` 里的条件编码 | 一个通道写多条规则 | `[{"test": ..., "value"/"scale": ...}, ...]` 自上而下取第一条命中的；`opacity` 先判悬停联动、再判图例筛选，顺序即优先级 |
| `datum === hovered` | 判断「我就是悬停点」 | signal 里存的是 datum 对象引用，直接做引用相等比较；`size`/`stroke`/`strokeWidth` 靠它放大加粗 |
| `encode.hover` | 内置悬停编码集 | 只改了 `cursor: pointer`——它无法表达「其余点变暗」，因为 hover 集只作用于当前图元，这正是需要 signal 方案的原因 |

### 关键概念

- **事件流选择器**：`@markName:type` 只监听某个 named mark 上的事件；
  多个来源用逗号写在一个字符串里（`"@legendSymbol:click, @legendLabel:click"`）。
- **事件上下文里的 `datum`**：在图例事件的 update 表达式中，`datum` 是图例项对应的数据
  （含 `value` 字段，即比例尺 domain 里的取值，这里是 "USA"/"Europe"/"Japan"）。
- **legend 的 `encode`**：图例内部由 `symbols` / `labels` / `title` 等子标记组成，
  可以像普通 mark 一样覆写编码；加了 `name` 之后就能被 `@名字:事件` 选中。

## 试一试（改练）

1. 把 `clickedOrigin` 的 update 表达式改成 `"datum.value"`（去掉切换逻辑），
   体验「再点同一项无法还原」的差别；想想 `force: true` 为什么仍然必要。
2. 给形状图例也加上同样的 `encode`（换一对名字如 `legendSymbol2`/`legendLabel2`，
   并把事件流补进 `clickedOrigin`），让两个图例都能点击筛选。
3. 把 tooltip 改成字段直绑：`"tooltip": {"field": "Name"}`，对比 signal 表达式的自由度。
4. 参考官方示例 `docs/examples/interactive-legend.vg.json`，新增一个
   `"name": "selected"` 的空数据集，用 data 的 `on`-trigger（`insert`/`toggle`/`remove` 指令）
   实现 shift 多选；编码侧用 `indata('selected', 'value', datum.Origin)` 判断选中状态。
5. 在 `hover` 编码集里再加一个 `"fillOpacity": 0.5`，观察它和 `update` 里 opacity 规则的叠加顺序。

## 参考

- 官方示例精读：`docs/examples/interactive-legend.vg.json`（本 demo 的图例交互由此简化而来）
- 官方文档：[Signals](https://vega.github.io/vega/docs/signals/) ·
  [Event Streams](https://vega.github.io/vega/docs/event-streams/) ·
  [Legends](https://vega.github.io/vega/docs/legends/) ·
  [Marks → tooltip 通道](https://vega.github.io/vega/docs/marks/)
