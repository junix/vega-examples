# 10 · 信号与控件绑定（bind 全家桶）

运行方式见项目根 README：`../../serve.sh` 后打开本目录页面。操作控件时留意右侧 Signals 面板与图表标题的实时变化。

## 学习目标

- 理解 **signal** 是 Vega 的响应式变量：控件输入、表达式、视觉通道都可以挂在同一个 signal 上，一处变、处处更新。
- 掌握 **bind**：一行声明把 signal 绑成 HTML 控件（`select` / `range` / `checkbox` / `number`），无需手写 UI。
- 学会在 **filter 变换表达式**里引用 signal（含 "All" 这类特殊选项的处理手法）。
- 知道 **title 也可以是 signal 表达式**，会随数据/控件动态重算。
- 会用**只有 `update`、没有 `bind` 的派生 signal**：signal 不一定来自控件，也可以是一段纯计算。
- 学会给**数据驱动的 scale domain 兜底**：交互一旦把数据过滤到 0 行或只剩一个取值，`{"data": …}` 形式的 domain 就会退化，坐标轴刻度全消失或只剩一个 `0.000000`。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals[].bind` | 把 signal 绑成 HTML 控件 | `input` 指定控件类型：`select`（options 列出含 `All` 的选项）、`range`（min/max/step 滑杆）、`checkbox`（布尔值）、`number`（数字输入框）；`name` 是控件旁的中文标签 |
| `signals[].update`（`xDomain` / `yDomain`） | **派生 signal**：没有 `bind`，只有 `update` | `span(extent(pluck(data('weather'), 'temp_max'))) > 0 ? extent(…) : [-5, 40]`——signal 的 `update` 里可以读 `data()`，所以它会随过滤结果自动重算，正好用来给 domain 兜底。在右侧 Signals 面板里能直接看着这两个 domain 随控件变 |
| `title.text` (signal) | 动态标题 | 整条标题是表达式：`'…' + weatherType + … + length(data('weather')) + ' 天'`，`data('weather')` 取过滤后的数据集行数；`format(windMax, '.1f')` 做数字格式化 |
| `data[].format.parse` | CSV 列类型声明 | 显式把 4 个数值列声明为 `number`；不写则按字符串处理，比较和比例尺都会出错 |
| `data[].transform` (filter) | 按 signal 过滤行 | `expr` 里直接引用 signal 名：`(weatherType === 'All' \|\| datum.weather === weatherType) && datum.wind <= windMax && (!precipOnly \|\| datum.precipitation > 0)`；signal 一变，变换自动重跑 |
| `scales` | 数据 → 视觉映射 | x/y 的 `domain` 不直接写 `{"data": …}`，而是引用派生 signal `xDomain` / `yDomain`（见下一行）——非退化时它就等于过滤后 `weather` 的 `extent`，所以**过滤后坐标轴照样会跟着收缩**，退化时才换成兜底区间（详见下方「data 驱动的 domain 会退化」）；`color` 用固定 `domain` 数组保证各天气类型颜色稳定，不随过滤漂移 |
| `marks[].encode.update` | 视觉通道绑定 | `size: {"signal": "pointSize"}`、`fillOpacity: {"signal": "pointOpacity"}`：通道值直接引用 signal，控件一动立刻重绘 |
| `marks[1]` (emptyHint) | 空态提示 | 一个不带 `from` 的单实例 `text` mark：`text` 求值为 `length(data('weather')) ? '' : '当前筛选条件下没有匹配的天数'`。非空时文字是空串，Vega 只留一个不含文字的空 `<text>` 元素，画面上看不见 |

### 关键概念

- **signal 引用三兄弟**：filter 的 `expr`、encode 的 `{"signal": ...}`、title 的 `{"signal": ...}` 用的是同一套表达式语言，signal 名就是变量名。
- **All 选项的处理**：select 的 `options` 里放一个哨兵值 `"All"`，filter 表达式里用短路或 `weatherType === 'All' ||` 跳过该条件——这是 Vega 里做"可选过滤"的惯用手法。
- **响应式数据流**：bind 控件改 signal → filter 重跑 → scale domain 重算 → mark 重编码 → title 重算，全自动，无需事件回调。
- **checkbox 的值是布尔量**：表达式里直接 `!precipOnly || …` 使用。
- **data 驱动的 domain 会退化**（本 demo 一两次点击就能踩到，是本例最值得记住的一条）：三个过滤控件（天气类型 6 选 × 风速滑杆 91 挡 × 复选框 2 态）一共有 **1092 个可达状态**，其中 **575 个**会让 `{"data": …}` 形式的 domain 退化。两种退化长得不一样：
  1. **空集**（299 个状态）：`weather` 里 `sun` / `drizzle` / `fog` 三类**从来不下雨**（sun 640 天、drizzle 53 天、fog 101 天，`precipitation > 0` 的都是 0 天），所以「天气类型 = sun」+ 勾选「只看降水日」就是 **0 行**；把风速滑杆拉到最小 0.5 再选 `snow` 也是 0 行。
     此时 Vega 的 extent 变换算出 `[Infinity, -Infinity]` 并抛
     `WARN Infinite extent for field "temp_max": [Infinity, -Infinity]`（`precipitation` 一条，共两条），
     `nice` 之后 scale 的 domain 实际是 **`[NaN, NaN]`**（注意：`JSON.stringify` 会把 `NaN` 打印成 `null`，所以直接 log 会看到骗人的 `[null, null]`）。
     后果是**两条轴的刻度标签一个不剩**：默认态 SVG 的 32 段文字里有 23 段是刻度（x 轴 10 个、y 轴 13 个），空态它们全部消失，只剩两条轴标题、图例 5 项 + 图例标题、以及图表标题。
  2. **零跨度**（另外 276 个状态）：数据还在，但选出来的值只有一个。选 `sun` / `fog` / `drizzle`（**只需一次点击**）时所有降水量都是 0，y 的 extent 就是 `[0, 0]`；把风速滑杆压到只剩 1 行时 x 的 extent 也会变成 `[3.3, 3.3]` 这种。
     这一类**不报任何 WARN**，也照样出图，所以最容易漏——但轴上只剩一个刻度，标签还是没格式化过的 **`0.000000` / `3.300000`**（`AGENTS.md`「数字与日期一律显式格式化」那一条正是禁这个）。这个超宽标签还会把布局撑歪：选 `sun` 时场景包围盒的左边从正常的 `−38px` 变成 `−86px`，`autosize: pad` 把画布跟着撑宽近 50px，在 demo 页面里 y 轴标题就被容器裁掉、直接看不见了。
  修法就是本例 spec 里的 `xDomain` / `yDomain` 两个派生 signal，各一个条件同时挡掉两种退化：
  - x：`span(extent(…)) > 0 ? extent(…) : [-5, 40]`——`span([null, null])` 是 `0`，所以空集和零跨度被同一个判据兜住。
  - y：`extent(…)[1] > 0 ? extent(…) : [0, 60]`——y 有 `zero: true`，只剩一行（比如 `[5.8, 5.8]`）会被补成 `[0, 5.8]`，**不算退化**；真正的退化只有「降水量全是 0」。空集时 `extent(…)[1]` 是 `null`，`null > 0` 为 `false`，一并兜住。
  实测：1092 个状态逐个跑一遍，退化 domain 0 个、丑刻度 0 个、WARN/ERROR 0 条，`sun` 态的包围盒也回到了和默认态一样的 `−38px`；而原本健康的 517 个状态，domain 与 SVG 文字与改前**逐字相同**。再配一个 `emptyHint` text mark 告诉用户「没有匹配的天数」，比一张空白图友好得多。
  经验：**只要 domain 由可被过滤/可被交互清空的数据集驱动，就要想好「0 行」和「只剩一个值」这两种情况长什么样。**

## 试一试（改练）

1. 把 `windMax` 滑杆的 `max` 改成 `5`，刷新后拖动滑杆，观察有多少天被滤掉。
2. 给 select 的 `options` 加一个 `"<4mm"` 之类的自定义选项，并改写 filter 表达式支持它。
3. 新增一个 bind 为 `range` 的 signal `yMax`，filter 里加 `datum.precipitation <= yMax`，从上往下拖看降水日被逐步滤掉。
   滑杆范围要**贴着数据量程**写：本数据集 `precipitation` 最大 55.9mm、y 轴 domain 上界 60，所以写
   `{"value": 60, "bind": {"input": "range", "min": 0, "max": 60, "step": 1}}`——写成 0–110 的话滑杆上半程（56 以上）拖了完全没反应。
   `value` 也别省：Vega 对没给 `value` 的 range 控件取 `(min + max) / 2`（`vega.js` 里 `range()` 的第一行），0–60 会从 30 起步，一进页面就悄悄少了 19 天；给 `value: 60` 才能保证默认视图不被过滤（这也是本例 `windMax` 写 `value: 9.5` = 数据最大风速的原因）。
4. 把 title 表达式改成只显示 `weatherType` 与可见天数，体会 title 完全由你控制。
5. 把 `color` 比例的 `domain` 改成 `{ "data": "weather", "field": "weather" }`，过滤掉某类后观察颜色是否漂移，理解固定 domain 的意义。

## 参考

- 官方文档：[Signals](https://vega.github.io/vega/docs/signals/) ·
  [Bind 控件](https://vega.github.io/vega/docs/signals/#bind) ·
  [表达式语言](https://vega.github.io/vega/docs/expressions/) ·
  [filter 变换](https://vega.github.io/vega/docs/transforms/filter/)
