# 13 · 运行时动态数据：实时数据流

## 学习目标

spec 只负责「骨架」：空的 `data "live"`、一条 line + 一组 symbol 点、两个会自适应的坐标域。
真正的主角是 `main.js` 里的 Vega 运行时 API：

1. **`vega.changeset()`**：用 `insert` / `remove` 描述一次对数据集的增量修改。
2. **`view.change(name, changeset).runAsync()`**：把变更脉冲（pulse）推入数据流，驱动重算与重绘。
3. **spec 与运行时的配合**：x 域宽度由 `signal "window"`（`bind: range` 滑块）控制，
   y 域用 `domain` 的 signal 表达式跟随数据统计量自适应。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/demos/13-dynamic-data-runtime/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.window` | 控制 x 域显示的窗口宽度 | `bind: {"input": "range", ...}` 让 Vega 自动生成滑块控件；值是数字，右侧 Signals 面板可实时观察 |
| `data.live` | 实时数据集 | `values: []` 初始为空——本 demo 的数据 100% 来自运行时推入；每个元组是 `{t, v}` |
| `data.stats` | live 的派生统计 | `source: "live"` 表示以另一个数据集为输入；`aggregate` 变换用一条 `fields`/`ops`/`as` 三元组求出 `minT / maxT / minV / maxV`（同一字段可以出现多次，配不同的 op），随 insert/remove 自动增量重算；**空输入时输出零个元组**，所以下面要判 `length` |
| `scales.x.domain` | x 域 | signal 表达式：有数据时取 `[max(minT, maxT - window + 1), maxT]`——域宽**最多**为 window，随新点右移；在场点数不足 window 时（拖大滑块、或「清空」后按「单步」）左边界被 `minT` 夹住，收缩到数据实际范围 `[minT, maxT]`。**这个 `max()` 不能省**：`t` 从 1 起单调递增，不夹住的话「清空」后单步一次域就是 `[-38, 1]`，坐标轴会打出 −35/−30/… 这种根本不存在的「采样序号」，唯一的点还被挤到最右边。空态回落 `[0, window - 1]`；**必须显式 `zero: false`**——Vega 线性比例尺默认 `zero: true` 会把 0 扩展进 domain，滚动窗口左侧会被钉死在 0 |
| `scales.x.padding` | x 域两端的像素余量 | `padding: 6` 让比例尺把 domain 往两侧各撑开 6px 对应的量（所以 `view.scale('x').domain()` 会比 signal 算出的数略宽一点，例如 `[1, 40]` → `[0.63, 40.37]`；signal 表达式本身语义不变）。没有它，最新点的 `t` 恰好等于 domain 上界、最旧点恰好等于下界，两个点都正好压在下面 `clip` 的边界上被切成半圆（symbol `size: 36` → 半径 3px）。实测加上后点落在 x∈[6, 634]，离裁剪边 6px > 3px |
| `axes[0].tickMinStep` | x 轴刻度最小步长 | 和 `format: "d"` 配套用。域宽被 `max()` 夹小之后（清空后连按「单步」，域可能只有 `[1, 2]`），`tickCount: 10` 会生成 0.1/0.2 这类小数刻度，`format: "d"` 再把它们截断成同一个整数 → 轴上出现 `1,1,1,1,1,2,2,…` 的重复标签。`tickMinStep: 1` 强制步长 ≥ 1，恢复成 `1,2`（`[1, 4]` 恢复成 `1,2,3,4`）；域宽够大时它不起作用，例如 200 个点 @ window=40 → 域 `[161, 200]`，标签照旧是 165,170,…,200 |
| `scales.y.domain` | y 域 | 同样用 signal 表达式：`[minV - 2, maxV + 2]` 留出边距，空态回落 `[-10, 10]`；`nice` 让刻度取整 |
| `domain` 里的 `data('stats')` | signal 表达式访问数据集 | 表达式里用 `data('名字')` 读数据集元组数组，并自动建立依赖——数据一变，域就重算 |
| `marks` | line 折线 + symbol 点 | 都从 `data "live"` 取数；`clip: true` 把越出坐标域的部分裁掉（流式数据必备）。裁剪矩形就是 `width × height` 的绘图区，顶层 `padding: 8` 只给整个 view 加外边距、救不了压在裁剪边上的点——那要靠上面 x 比例尺的 `padding: 6` |
| `tooltip` | 点的悬停提示 | 复习 demo 12：signal 表达式拼文本 |

## main.js 逐段讲解

| 段落 | 作用 | 要点 |
| --- | --- | --- |
| `nextPoint()` | 生成随机游走点 | `t` 单调递增作 x；`v += (Math.random() - 0.5) * 4` 每步 ±2 抖动 |
| `applyChanges(points)` | 一次增量更新的完整套路 | `vega.changeset().insert(points).remove(pred)` 组装变更，`view.change('live', cs).runAsync()` 提交；remove 谓词 `d.t <= t - win` 把滑出窗口的旧点删掉，数据集里始终只剩最近 window 个点 |
| 开始/暂停 | `setInterval(tick, 500)` | 暂停即 `clearInterval`；按钮文案随状态切换 |
| 单步 | 停表后手动 `tick()` | 避免与定时器交错 |
| 清空 | remove 谓词恒真 | 删除全部元组；`stats` 随之变空，两个坐标域回落空态默认值 |
| `addSignalListener('window', ...)` | 拖滑块时主动剔除 | 否则暂停状态下缩小窗口，旧点要等下次插入才被删掉 |
| 预填 | 启动时 insert 一个 40 点数组 | `insert` 接受数组，一次 `runAsync` 即可，比逐点推入高效 |

### 关键概念

- **changeset 是「描述」，change+runAsync 是「执行」**：`view.change()` 只登记，
  `runAsync()` 才跑数据流（返回 Promise，可 `.then` 串联后续动作）。
- **remove 的两种形态**：谓词函数（按条件批量删）或元组引用（精确删）。本例全用谓词。
- **toggle 在哪**：JS 侧 ChangeSet 只有 insert/remove/modify/encode/reflow，没有 toggle；
  toggle 是 spec 侧 `data.on`-trigger 的指令（见 demo 12「试一试」第 4 条）。
- **节流直觉**：渲染随动画帧合帧，高频 `runAsync` 不会逐次重绘；但数据流每次都会跑，
  真正的高频场景应减少提交次数（攒批 insert），而不是依赖渲染合帧。

## 试一试（改练）

1. 把 `setInterval` 的 500 改成 50，观察合帧效果；再把每次 `tick` 改成攒 5 个点一次
   `insert` 数组，体会「攒批」与「逐点」的区别。
2. 删掉 `addSignalListener('window', ...)` 那段，暂停时把滑块从 120 拖到 10，
   观察旧点残留，理解为什么需要主动剔除。
3. 在 changeset 里加 `.modify(function (d) { return d.t === t; }, 'v', 0)`，
   把最新点改成 0，体验 modify 谓词形态。
4. 把 y 域的 signal 表达式换成固定 `[-30, 30]`，对比「自适应域」与「固定域」在
   长时间游走下的观感差异。
5. 用 `view.addDataListener('live', ...)` 在控制台打印每次变更后的元组数。
6. 把 x 比例尺的 `padding: 6` 删掉，看最新/最旧那两个点怎么被 `clip` 切成半圆；再把 domain 里的
   `max(minT, ...)` 换回裸的 `maxT - window + 1`，按「清空」再按「单步」，看坐标轴打出负的采样序号；
   最后把 `tickMinStep: 1` 也删掉，在同一状态下看 `format: "d"` 怎么打出 `1,1,1,1,1,2,2,…` 的重复标签。
   三处改动各自防的是一个具体坑，缺一不可。

## 参考

- 官方文档：[View API → change / insert / remove](https://vega.github.io/vega/docs/api/view/#data) ·
  [Signals → bind](https://vega.github.io/vega/docs/signals/#bind) ·
  [Scale domains（signal 表达式）](https://vega.github.io/vega/docs/scales/#domain) ·
  [aggregate 变换](https://vega.github.io/vega/docs/transforms/aggregate/)
- 同集 demo：12-hover-tooltip-legend（tooltip 与 signal 表达式）、19-runtime-api-tour（View API 全览）
