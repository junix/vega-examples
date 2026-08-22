# 14 · 力导向图与节点拖拽

## 学习目标

- 看懂 `force` 变换如何把一组「力」（link / nbody / collide / center）组合成动态布局；
- 理解 mark 级 transform 的特殊性：它直接作用于场景图 item，所以节点不需要写 `x/y` 编码；
- 掌握用 signal 事件流 + mark `on` 触发器（`modify`）实现「按下钉住 → 拖动跟随 → 抬起释放」的完整拖拽状态机；
- 认识 `linkpath` 变换如何把边数据转成 SVG path，以及 `require` 参数的执行门控作用。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/demos/14-force-directed-graph/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.cx / cy` | 画布中心点 | 供 center 力引用，改 `width/height` 自动跟随 |
| `signals.nodeRadius / nodeCharge / linkDistance` | 三个绑定滑杆的布局参数 | `bind` 生成输入控件；改动会脉冲 force 变换重新布局。**一个滑杆管一种力**：`nodeRadius` → collide 半径（并决定 symbol 画多大）、`nodeCharge` → nbody 强度、`linkDistance` → link 目标边长。第四种力 center 没有滑杆，它固定由 `cx/cy` 决定 |
| `signals.dragged` | 当前被按住的节点 | `symbol:mousedown` 时 `item()` 取到光标下的场景 item；抬起后**故意不清空**，释放触发器还要靠它定位节点 |
| `signals.fix` | 拖拽中的光标坐标 | 三个事件处理器构成状态机：`mousedown → xy()` 立即钉住；`[mousedown, mouseup] > mousemove` 是 between 事件流，只捕获按下到抬起之间的移动；`mouseup → false` 结束拖拽 |
| `signals.restart` | 仿真重加热开关 | 绑到 force 变换的 `restart` 参数；`fix` 每次变化都置 `true`，仿真 alpha 重置后继续跳动 |
| `data` | 加载 miserables.json | 同一文件加载两次：`format.property` 分别取 `nodes` / `links` 两个数组；link 用节点**下标**引用 |
| `scales.color` | 节点分组配色 | ordinal 比例尺，domain 取自 `node-data` 的 `group` 字段，range 用内置色板 `category20` |
| `marks[0]`（links） | 画边 | `path` 标记 + `linkpath` 变换；`interactive: false` 不参与拾取，避免挡住节点；`strokeOpacity` 压低让边退居背景 |
| `marks[0].transform` | 边坐标 → path 字符串 | `linkpath` 从每条边的 `source/target` 节点读 `x/y` 生成折线；`require: {signal: "force"}` 表示等 force 仿真存在后才执行（否则节点还没有坐标） |
| `marks[1]`（nodes） | 画节点 | `symbol` 标记；**没有 `x/y` 编码**——force 是 mark 级变换，直接改写场景 item 的 `x/y/vx/vy`（见下方关键概念） |
| `marks[1].on` | 拖拽触发器 | `trigger: "fix"` 为真时把 `dragged` 的 `fx/fy` 改为光标坐标；`trigger: "!fix"` 时把 `fx/fy` 置 `null` 释放。`modify` 指向的信号值就是要改的场景 item |
| `marks[1].transform` | 力仿真本体 | 四种力：`center` 聚拢到中心、`collide` 防重叠、`nbody` 电荷排斥（负值）、`link` 沿 `link-data` 拉近距离；`signal: "force"` 把仿真对象导出成信号（供 linkpath 的 require 引用） |
| `encode.tooltip` | 悬停显示角色名 | tooltip 通道交给浏览器原生 title 提示 |

### 关键概念

- **mark 级 transform 作用在场景 item 上**：`transform` 写在 `data` 里时处理数据 tuple；写在 `mark`
  里时处理的是该 mark 的场景 item（每个 item 通过 `item.datum` 关联原始数据）。本例 force 变换的
  「节点」其实是 77 个 symbol 场景 item——d3-force 直接把 `x/y/vx/vy` 写到 item 上，
  所以 encode 里不需要（也不应该）再写 `x/y` 绑定。同理，`link` 力会把 link 数据的
  `source/target` 下标替换成场景 item 引用，`linkpath` 才能读到 `datum.source.x`。
- **`size` 是直径的平方，不是半径**：Vega 内建 `circle` 形状的画法是 `r = sqrt(size) / 2`
  （见 `assets/vega.js` 里 `builtins.circle`），也就是把 `size` 当作**外接正方形的面积**。
  想让节点的视觉半径正好等于 collide 力的碰撞半径 `nodeRadius`，`size` 必须写成直径的平方
  `pow(2 * nodeRadius, 2)`；若误写成 `2 * nodeRadius * nodeRadius`，画出来的半径只有
  `sqrt(2)/2 ≈ 0.707` 倍，碰撞半径比看到的圆大 41%，节点之间会留下永远合不上的空隙。
  实测（`nodeRadius = 6`，仿真收敛后）：`size = 144` → SVG 里 `<path d="M6,0A6,6…">`，
  最近的两个节点中心距恰好 `12.00 = 2 × 6`，两圆相切而不重叠。
- **`fx` / `fy` 是 d3-force 的固定坐标**：设置了 `fx/fy` 的节点不参与力学运动，被钉在该位置；
  置 `null` 即恢复自由。这是拖拽固定的标准做法。
- **trigger 与 modify**：mark 的 `on` 块在信号/事件脉冲时执行 `modify(数据集名, 目标item, 字段值)`。
  这里数据集名就是 mark 的名字 `"nodes"`（具名 mark 的场景 item 可当数据集被修改），
  目标 item 来自 `dragged` 信号的值。触发器在数据流里排在信号之后求值，因此同一脉冲内
  `dragged` 与 `fix` 都是新值，不存在时序竞争。
- **restart 重加热**：d3 仿真有「温度」alpha，随迭代衰减到 0 后布局冻结。把信号绑到 force 的
  `restart` 参数，信号脉冲且为真时 alpha 被重置——拖拽中每次 mousemove 都触发一次，
  松手时再触发一次让被释放的节点回弹。
- **坐标空间**：`xy()` 返回事件在顶层场景坐标系下的 `[x, y]`，与 force 写出的 `item.x/y`
  同空间，直接可用。若节点位置来自比例尺（如散点图），就要用 `invert('x', x())` 之类把像素
  反算回数据域再写回数据——本例没有比例尺，无需 invert。

## 试一试（改练）

1. 把 `nodeCharge` 滑到正值（如 `10`）：排斥变吸引，整图缩成一团；滑到 `-100` 看节点炸开。
2. 删掉 `collide` 那一行力，观察节点互相重叠；再把 `nodeRadius` 拉大看 collide 的作用（`nodeRadius` 同时放大圆和碰撞半径，两者始终相切）。把 `size` 改回 `2 * nodeRadius * nodeRadius`，会看到圆缩小但节点间距不变——这就是上面说的 41% 空隙。
3. 把 `linkpath` 的 `"shape": "line"` 改成 `"arc"` 或 `"curve"`，看边的形态变化
   （可选值：`line / arc / curve / diagonal / orthogonal`）。
4. 把 `restart` 信号的 `update` 改成 `"false"`，再拖节点——节点被钉住但周围节点不再让开，
   体会 restart 的作用。
5. 给 force 变换加 `"static": true`：一次性同步跑完 300 轮迭代再渲染（无动画过程），
   适合导出静态图。
6. 进阶：把 `window:mouseup` 释放处理器删掉，节点会被永久钉住——想想为什么
   （提示：`!fix` 触发器永远不成立了）。

## 参考

- 官方文档：[Force 变换](https://vega.github.io/vega/docs/transforms/force/) ·
  [Linkpath 变换](https://vega.github.io/vega/docs/transforms/linkpath/) ·
  [事件流语法](https://vega.github.io/vega/docs/event-streams/) ·
  [Signal 触发器 modify](https://vega.github.io/vega/docs/signals/#modify)
- 官方示例：[Force-Directed Layout](https://vega.github.io/vega/examples/force-directed-layout/)
- 底层引擎：[d3-force](https://github.com/d3/d3-force)
