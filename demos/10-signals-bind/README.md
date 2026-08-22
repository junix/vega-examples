# 10 · 信号与控件绑定（bind 全家桶）

运行方式见项目根 README：`../../serve.sh` 后打开本目录页面。操作控件时留意右侧 Signals 面板与图表标题的实时变化。

## 学习目标

- 理解 **signal** 是 Vega 的响应式变量：控件输入、表达式、视觉通道都可以挂在同一个 signal 上，一处变、处处更新。
- 掌握 **bind**：一行声明把 signal 绑成 HTML 控件（`select` / `range` / `checkbox` / `number`），无需手写 UI。
- 学会在 **filter 变换表达式**里引用 signal（含 "All" 这类特殊选项的处理手法）。
- 知道 **title 也可以是 signal 表达式**，会随数据/控件动态重算。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals[].bind` | 把 signal 绑成 HTML 控件 | `input` 指定控件类型：`select`（options 列出含 `All` 的选项）、`range`（min/max/step 滑杆）、`checkbox`（布尔值）、`number`（数字输入框）；`name` 是控件旁的中文标签 |
| `title.text` (signal) | 动态标题 | 整条标题是表达式：`'…' + weatherType + … + length(data('weather')) + ' 天'`，`data('weather')` 取过滤后的数据集行数；`format(windMax, '.1f')` 做数字格式化 |
| `data[].format.parse` | CSV 列类型声明 | 显式把 4 个数值列声明为 `number`；不写则按字符串处理，比较和比例尺都会出错 |
| `data[].transform` (filter) | 按 signal 过滤行 | `expr` 里直接引用 signal 名：`(weatherType === 'All' \|\| datum.weather === weatherType) && datum.wind <= windMax && (!precipOnly \|\| datum.precipitation > 0)`；signal 一变，变换自动重跑 |
| `scales` | 数据 → 视觉映射 | x/y 的 `domain` 来自**过滤后的** `weather` 数据，所以过滤后坐标轴会跟着收缩；`color` 用固定 `domain` 数组保证各天气类型颜色稳定，不随过滤漂移 |
| `marks[].encode.update` | 视觉通道绑定 | `size: {"signal": "pointSize"}`、`fillOpacity: {"signal": "pointOpacity"}`：通道值直接引用 signal，控件一动立刻重绘 |

### 关键概念

- **signal 引用三兄弟**：filter 的 `expr`、encode 的 `{"signal": ...}`、title 的 `{"signal": ...}` 用的是同一套表达式语言，signal 名就是变量名。
- **All 选项的处理**：select 的 `options` 里放一个哨兵值 `"All"`，filter 表达式里用短路或 `weatherType === 'All' ||` 跳过该条件——这是 Vega 里做"可选过滤"的惯用手法。
- **响应式数据流**：bind 控件改 signal → filter 重跑 → scale domain 重算 → mark 重编码 → title 重算，全自动，无需事件回调。
- **checkbox 的值是布尔量**：表达式里直接 `!precipOnly || …` 使用。

## 试一试（改练）

1. 把 `windMax` 滑杆的 `max` 改成 `5`，刷新后拖动滑杆，观察有多少天被滤掉。
2. 给 select 的 `options` 加一个 `"<4mm"` 之类的自定义选项，并改写 filter 表达式支持它。
3. 新增一个 bind 为 `range` 的 signal `yMax`（0–110），filter 里加 `datum.precipitation <= yMax`。
4. 把 title 表达式改成只显示 `weatherType` 与可见天数，体会 title 完全由你控制。
5. 把 `color` 比例的 `domain` 改成 `{ "data": "weather", "field": "weather" }`，过滤掉某类后观察颜色是否漂移，理解固定 domain 的意义。

## 参考

- 官方文档：[Signals](https://vega.github.io/vega/docs/signals/) ·
  [Bind 控件](https://vega.github.io/vega/docs/signals/#bind) ·
  [表达式语言](https://vega.github.io/vega/docs/expressions/) ·
  [filter 变换](https://vega.github.io/vega/docs/transforms/filter/)
