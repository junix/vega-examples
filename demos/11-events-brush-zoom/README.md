# 11 · 事件流：interval 刷选 + 滚轮缩放 + 拖拽平移

运行方式见项目根 README：`../../serve.sh` 后打开本目录页面。本 demo 的所有交互都在 spec 的 signal `on` 事件流里声明，`main.js` 一行事件代码都没有。

## 学习目标

- 看懂 Vega **事件流（event stream）**的完整语法：`source` / `type` / `between` / `filter` / `consume`，以及字符串简写（`"window:mouseup"`、`"wheel!"`、`"[a, b] > c"`）。
- 用 `mousedown → mousemove → mouseup` 事件序列维护一个 **interval brush**（区间框选）：按下锚定起点、拖动更新终点、松手保留结果、双击清除。
- 掌握官方 **anchor/zoom 缩放模式**：滚轮处以 `invert()` 记录数据域锚点，再按比例缩放 `xdom`/`ydom` 两个 domain signal。
- 理解事件流里的 `filter` **只能访问 `event` 对象**（编译期不挂 signal 作用域），所以"Shift+拖拽平移、裸拖拽框选"的分流要写成 `event.shiftKey` 判断。
- 认识 `extent` 变换：把数据的实际取值范围输出成 signal，作为缩放前的初始 domain。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.brush` | 框选区间（像素坐标 `[x0, y0, x1, y1]`） | 三个 `on` 处理器：① `mousedown`（filter `!event.shiftKey`）把四角都锚在按下点；② `window:mousemove` + `between` 在"按下…抬起"区间内持续更新终点；③ `dblclick` 清空 |
| `signals.panDown / xcur / ycur` | 平移的起点快照 | Shift+`mousedown` 时用 `xy()` 记下指针像素位置、用 `slice(xdom)` 克隆当前 domain——快照让拖动全程以"按下那一刻"为基准 |
| `signals.delta` | 平移的像素位移 | 同样是 `between` 区间流，但起点事件 filter 是 `event.shiftKey`；`update` 里 `panDown[0] - x()` 表示"指针向左移，视图向右跟着走" |
| `signals.anchor / zoom` | 缩放锚点与倍率 | `wheel` 时用 `invert('xscale', x())` 把指针像素位置反算成数据值；`"wheel!"` 的 `!` 等价 `consume: true`（阻止页面滚动）；`pow(1.0015, deltaY * pow(16, deltaMode))` 同时兼容行模式与像素模式的滚轮 |
| `signals.xdom / ydom` | 两个比例尺的 domain | 初始 `update: "slice(xext)"` 取数据全范围；`on` 监听 `{"signal": "delta"}` / `{"signal": "zoom"}`——**signal 也能当事件源**，这是 signal 之间接力更新的关键 |
| `data.penguins.transform` | 清洗 + 输出范围 | `filter` 去掉缺失行（字段名含空格，用 `datum['Beak Length (mm)']` 访问）；两个 `extent` 把 x/y 字段的 `[min, max]` 写进 `xext` / `yext` signal |
| `scales.xscale / yscale` | domain 由 signal 驱动 | `domain: {"signal": "xdom"}`：domain 一变，坐标轴、网格、点的位置全部自动重算——这就是缩放/平移的实现方式 |
| `marks.points` | 散点 | `fill` 用带 `test` 的产生式：`!brush` 或落在 brush 像素区间内 → 按 Species 着色，否则灰色；`scale('xscale', …)` 把数据值投影到像素再与 brush 比较 |
| `marks.brushRect` | 半透明框选矩形 | `interactive: false` 让它不拦截鼠标事件；`x/x2/y/y2` 由 `brush` signal 经 `min/max` 归一化（允许向任意方向拖） |

### 事件流语法要点

- **对象写法**：`{"source": "window", "type": "mousemove", "consume": true, "between": [起点, 终点], "filter": "..."}`。
  - `source`：事件监听目标，缺省是视图本身（view），`window` 表示全局（拖出图表也能继续接收 move/up）。
  - `type`：DOM 事件类型（`mousedown` / `mousemove` / `wheel` / `dblclick` …）。
  - `between: [A, B]`：只在"A 发生之后、B 发生之前"放行事件——`mousedown` 后接 `[mousedown, window:mouseup]` 区间的写法是刷选/拖拽的标准配方；`between` 里的每个事件同样支持自己的 `filter`（本 demo 用它区分是否按住 Shift）。
  - `filter`：表达式，**只能引用 `event`**（如 `event.shiftKey`），不能引用 signal。
  - `consume: true`：`preventDefault()`，阻止浏览器默认行为（如滚轮滚动页面）。
- **字符串简写**：`"window:mouseup"` = source+type；`"wheel!"` 结尾 `!` = consume；`"[a, b] > c"` = between 区间，官方示例 `brushing-scatter-plots` 用的就是这种（如 `"[@cell:pointerdown, window:pointerup] > window:pointermove"`）。对象写法能带 filter，字符串写法不能。
- **`{"signal": "xxx"}` 作为 events**：signal 变化也能触发其他 signal 的更新（`delta` → `xdom`），形成 signal 依赖链。
- **`force: true`**（见 `zoom`）：每次滚轮事件都强制更新，即使算出的值与旧值相同。
- **`update` 表达式**里可用的常用函数：`x()` `y()`（指针像素坐标）、`xy()`（二者数组）、`invert('scale名', px)`（像素→数据）、`scale('scale名', v)`（数据→像素）、`span()` `slice()` `clamp()` `inrange()` `min()` `max()` `pow()`。

### 框选与缩放如何共存

框选记录在**像素坐标系**，点的高亮判断用 `scale()` 把数据值投影到像素后再 `inrange`——所以缩放/平移后 brush 矩形固定在屏幕上，而哪些点"在框内"会随视口实时重算，二者永不失配。

## 试一试（改练）

1. 把 `wheel!` 的 `!` 去掉再滚轮，观察页面是否跟着滚动，理解 `consume`。
2. 把 brush 起点事件的 filter 改成 `"event.altKey"`，体验用 Alt 键分流；再把 `between` 里起点事件的 filter 漏掉，观察 Shift 平移时 brush 被误触发——理解为什么两处 filter 必须成对。
3. 给 `brush` 增加一个 `on`：`{"events": "keyup", "filter": "event.key === 'Escape'", "update": "null"}`，实现按 Esc 清除框选。
4. 把 `pow(1.0015, …)` 的底数改成 `1.01`，感受缩放速度差异。
5. 参考官方 `brushing-scatter-plots` 的 `rangeX/rangeY` 写法，把 brush 转成数据域区间（`invert`）再做高亮，比较与像素方案在缩放后的行为差异。
6. 将 `brushRect` 的 `fillOpacity` 改为 `0.3`，观察 `interactive: false` 与否对事件的影响（试着删掉它再拖拽）。

## 参考

- 官方示例（仓库内）：`docs/examples/zoomable-scatter-plot.vg.json`（anchor/zoom 与 between 区间）、`docs/examples/brushing-scatter-plots.vg.json`（字符串区间写法与 invert）
- 官方文档：[Event Streams](https://vega.github.io/vega/docs/event-streams/) ·
  [Signals](https://vega.github.io/vega/docs/signals/) ·
  [表达式函数（x/y/xy/invert/scale/span…）](https://vega.github.io/vega/docs/expressions/) ·
  [extent 变换](https://vega.github.io/vega/docs/transforms/extent/)
