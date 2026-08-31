# 47 · 蛇形时间线：把线性刻度沿「直段 + 半圆弧」路径展开

对应官方示例 **[serpentine-timeline](https://vega.github.io/vega/examples/serpentine-timeline/)**
（作者 Madison Giammaria）。

一条 100 年的时间轴要是横着画，画布得有 1660px 宽；这张图把它折成蛇形（boustrophedon，
「牛耕式」），塞进 520×360 的方块里。**整条轴没有用一个 `axes` 条目** ——
domain 线、刻度线、刻度标签、方向箭头、里程碑，全部是普通 mark，
坐标由同一条 `formula` 链从「弧长」算出来。

这也是本 demo 最值得学的一点：Vega 的**轴不是特权对象**。
`axes` 只会画直线轴；但只要你能把 domain 值喂进 scale 拿到一个数，
再自己把这个数解释成任意形状路径上的点，就能造出任何形状的轴。

> ⚠️ 官方这份 spec 同时也是本仓库的**反面教材**：它把自定义 signal 命名成 `width` / `height`
> 直接顶替内建信号，用 `width+1` / `width−1` 成对触发来强制重排，还用 `year(now())` 算定义域。
> 本例逐条改掉了这些写法 —— 见文末 [`## 与官方示例的差异`](#与官方示例的差异)。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/47-serpentine-timeline/
```

## 学习目标

1. 掌握**弧长参数化**这套通用手法：先用线性 scale 把数据值映射成「沿路径走了多少像素」
   （`sK = scale('sS1', v)`），再用取模/取整把弧长翻译成路径上的 `(x, y)`。
   同一套公式同时给蛇形线的 601 个顶点、21 个刻度、8 个里程碑、3 个方向箭头定位 ——
   **一条数据流服务五类构件**，靠 `category` 字段区分。
2. 会推导「直段 + 半圆弧」交替路径的每一个量：周期长度 `P = W + πsH/2`、
   段号 `i = floor(sK/P)`、段内位移 `r = sK mod P`、弧内圆心角 `α = (r−W)/(sH/2)`，
   以及直段/弧段的判定条件与两者在接缝处的连续性。
3. 理解 Vega **text mark 的 `angle` + `dx/dy` 是「先转再平移」**：
   导出的 SVG 是 `translate(x,y) rotate(angle) translate(dx,dy)`，
   所以 `dy` 走的是**旋转后**的法线方向 —— 这正是弧上标签能自动贴着曲线外侧的原因，
   也是那些 `α ≥ 90° ? -1 : 1.75` 符号翻转的由来。
4. 知道**数据变换里可以直接调 `scale()`**（`{"type":"formula","expr":"scale('sS1', datum.domain)"}`），
   以及为什么这里不会形成循环依赖。
5. 看清一个真实的架构选择：官方用 `width±1` 抖动去骗 Vega 重新布局，
   正确解法是 `"autosize": {"type": "pad", "resize": true}`。
   本 README 给出了两者的实测对照。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width` / `height` / `padding` | 声明画布 520×360，四向 padding | 弧会向左外凸 `sH/2`（默认 55px）+ 标签，实测探出 63px。`autosize: pad` **不会**裁掉它（把 `padding.left` 改成 0，SVG 从 708 缩到 628、外凸部分仍在，只是贴着边），`padding.left: 80` 决定的是留多少白 |
| `autosize` | `{"type":"pad","resize":true}` | **官方 `width±1` 抖动 hack 的正解**：`resize` 默认 `false`，视图尺寸只在首帧算一次；拖滑杆把蛇形撑大后会被 viewBox 裁掉 |
| `title` | 大标题 + `signal` 副标题 | 副标题实时报出定义域、路径总长、弧数、里程碑数 |
| `signals`（交互 11 个，全部 `bind`） | 6 个滑杆 `straightW` `sH` `sN` `tC` `mO` `sT` + 3 个复选框 + 2 个文本框 | 几何四要素（直段长度 / 弧直径 / 弧数 / 刻度数）与里程碑偏移、线宽各占一个滑杆，全部可拖 |
| `signals`（定义域 3 个） | `domainOverride` → `dataDomain` → `sDomain` | 三级兜底：手工指定（要求跨度非零）→ 数据极值（空表 / 零跨度兜底）→ 向外取整到十年 |
| `signals`（几何 5 个） | `sA` `sWsA` `sL` `sRange` `lineStep` | 全部是纯 `update` 派生量，没有一个魔数散落在 mark 里 |
| `signals`（其它 6 个） | `tLO` `sD` `lineSteps` `plotH` `annotations` `hoverFocus` | 共 25 个 signal。`plotH` 就是官方那个被命名成 `height` 的 signal，这里只用来摆脚注 |
| `scales: sS1` | 唯一的比例尺，`linear` | **range 不是像素坐标，而是「沿路径的弧长」`[0, sL]`**；`zero: false`（年份轴必须写，否则 domain 被拉到 0）；`reverse` 接 signal |
| `data: dataset` | 8 行里程碑（照抄官方） | `domain` = 年份，`label` = 事件名 |
| `data: serpentineDomain` | `sequence` + `flatten` | 601 个采样点，画蛇形线的折线顶点。**`sequence` 右开**，stop 要加半步才含末点 |
| `data: tickDomain` | `sequence` + `flatten` + `formula` + `project` | 序号 1..tC 线性插值成 domain 值再 `round`；首尾锚死到 `sDomain` 端点 |
| `data: componentEncodings` | **全图的几何流水线**：17 个 transform | 5 类构件 × 一套公式；下面「关键概念」逐步拆解 |
| `data: serpentine` / `ticks` / `milestones` / `domain_extent` / `segment_ends` | 从 `componentEncodings` 按 `category` 切出来 | 各自再补一点自己的编码字段（`dy` / `align` / `label`） |
| `marks: axis_group` | 内含 5 个子 mark：注记 / 蛇形线 / 箭头 / 刻度线 / 刻度标签 | group 没有 `from`、没有 `encode`，纯粹用来分组和控制绘制顺序 |
| `marks: milestone_*`（4 个） | 引线 / 标记点 / 标签白垫底 / 标签 | 「白垫底」= 同一段文字先用 7px 白 stroke 画一遍，压掉底下的虚线 |
| `marks: footnote` | 一行灰色说明 | 位置用 `plotH` 算，示范官方那个「从数据反算高度」的 signal 的正当用法 |

### 关键概念

#### 1）几何：把弧长展开成蛇形

先把路径定义清楚。记 `W = straightW`（直段长）、`H = sH`（弧的**直径**）、`N = sN`（弧数）：

```
   r=0                      r=W          r=W+A
i=0 ●──────── 直段 W ────────▶╮  弧：α 从 0 走到 π
    (0,0)              (W, 0) │   圆心 (W, 0·H + H/2)，半径 H/2
                              │   走完 y 正好下降 H
i=1 ╭──────── 直段 W ────────◀╯
    │ x 从 W 回到 0                       ← 奇数段向左走，弧向左凸
    ▼
i=2 ●──────── 直段 W ────────▶╮  …… 如此交替
```

于是：

| 量 | 表达式 | 含义 |
| --- | --- | --- |
| `sA` | `H·π/2` | 一段弧的**弧长**（半圆周长 = π·半径 = π·H/2） |
| `sWsA` | `W + sA` | 一个「直段 + 弧」周期的长度，记作 `P`。**这是整套几何的模数** |
| `sL` | `(N+1)·W + N·sA` | 路径总长：N 个弧把路径切成 N+1 段直段 |
| `sK` | `scale('sS1', v)` | 数据值 `v` 沿路径走过的弧长，`∈ [0, sL]` |
| `i` | `floor(sK / P)` | 第几个周期（0 起）。**偶数向右走，奇数向左走** |
| `r` | `sK % P` | 周期内位移，`∈ [0, P)` |
| `α` | `(r − W)/(H/2)` | 弧内圆心角。弧长 ÷ 半径 = 弧度，所以 `α ∈ (0, π]` |

> **`sN` 不是整数时到底走到哪里？** 这是 `sL = (N+1)·W + N·sA` 这个公式的一个副作用：
> 小数部分同时给直段和弧各加一份，合起来正好是**一个整周期的同比例**
> （`0.2·W + 0.2·sA = 0.2·P`）。所以 `sN = 2.2` 的含义是「2 个整弧之后再走 0.2 个周期」，
> 而 **0.2 个周期落在第三个弧的中段**，不是「第三个弧走 20%」：
> 默认参数下 `0.2·P = 114.56px`，减掉直段 `W = 400` 之外还剩 `114.56px`，
> 除以弧长 `sA = 172.79px` 得 **66.3%**（`α = 119.3°`）—— 图上「Today」那个注记就落在那儿。
> 想让末端停在弧的 20% 处，得解 `frac·P = W·0 + 0.2·sA`，即 `sN = 2 + 0.2·sA/P ≈ 2.06`。

**直段/弧段的判定**就一句话：`r ≤ W → 直段，否则 → 弧`。
（官方写成 `(((i+1)·P) − sA) ≥ sK ? 'straight' : 'arc'`，把左边展开：
`(i+1)·P − sA = i·P + W`，条件即 `i·P + W ≥ sK ⟺ W ≥ sK − i·P = r` —— 完全等价，
本例用了后者，少一层心算。注意 `r < W` 时 `α` 是负数，那是"用不到的垃圾值"，
所有引用 `α` 的地方都被 `type === 'straight'` 挡在前面。)

**坐标**：

```
xStraight = (i 偶) ? min(r, W) : max(W − r, 0)      // 直段部分；弧段上会被钉在端点
x         = 直段 ? xStraight
                 : xStraight ± sin(α)·H/2           // i 偶取 +（右凸），i 奇取 −（左凸）
y         = i·H + (直段 ? 0 : (1 − cos(α))·H/2)
```

`min`/`max` 那两个钳位是关键：进入弧段后 `r > W`，偶数段的 `min(r, W)` 把 x 钉在 `W`、
奇数段的 `max(W−r, 0)` 把 x 钉在 `0`，正好是弧的起点基准；弧的偏移量再叠加上去。

**接缝连续性验算**（这是判断公式对不对的最快办法）：

- `α → 0`（刚进弧）：`sin 0 = 0`、`cos 0 = 1` → `x = xStraight`、`y = i·H`，与直段末点重合 ✓
- `α = π/2`（弧的最外点）：`x = xStraight ± H/2`（外凸半个直径）、`y = i·H + H/2`（降了半个直径）✓
- `α = π`（弧走完）：`sin π = 0`、`cos π = −1` → `x = xStraight`、`y = i·H + H`。
  下一周期 `r' = 0`：偶数段末点 x=W → 奇数段起点 `max(W−0,0) = W` ✓，
  y 也正好等于 `(i+1)·H` ✓ —— 首尾严丝合缝。

所以 **`sH` 既是弧的直径，也是相邻两条直段的行距**：这不是巧合，是半圆的必然结果。
把「弧直径」滑杆拖大，图会同时变宽（外凸 `sH/2`）和变高（行距 `sH`）。

#### 2）方向与旋转：`labelAngle` 怎么来的

`direction`（给箭头用）分两步算：先按段号奇偶给直段定 `→`/`←`，
再对弧段按「凸向哪侧 × 上/下半圆」四象限改写：

| side（`i` 偶=right / 奇=left） | hemisphere（`α<90°`=top） | direction |
| --- | --- | --- |
| right | top | `→` |
| right | bottom | `←` |
| left | top | `←` |
| left | bottom | `→` |

`labelAngle`（给刻度线、刻度标签、里程碑标签用）：

```
labelAngle = 直段 ? 0
                  : (side==='left' ? −1 : 1)·α·(180/π) + (α < π/2 ? 0 : 180)
```

- 弧上任意一点的**切线**与水平方向的夹角正好等于 `α`（弧长参数化的性质），
  所以「文字沿路径转向」= 把 `angle` 设成 `α` 的度数。
- 左凸弧的转向相反，故乘 `−1`。
- 过了 90° 之后切线朝「回头」的方向，文字会整体倒过来；
  `+180` 把它转正 —— **代价是文字的阅读方向与路径行进方向相反**，这是取舍，不是 bug。

#### 3）`angle` + `dy`：Vega text mark 的局部坐标系

导出的 SVG 长这样（截取 1945 与 1950 两个刻度标签）：

```xml
<text transform="translate(414.85,2.04) rotate(15.66) translate(0,18.13)">1945</text>
<text transform="translate(453.77,66.56) rotate(282.13) translate(0,-13.5)">1950</text>
```

**`translate(x,y) → rotate(angle) → translate(dx,dy)`**：`dx/dy` 作用在**旋转之后**的轴上。
于是「把标签推到曲线外侧」这件事根本不用算法向量 —— 只要给一个 `dy`，
它自然沿着旋转后的法线走。这就是这张图不需要任何向量运算的原因。

但符号要人工照顾：`α` 过 90° 之后 `labelAngle` 被 `+180` 翻过来了，局部 y 轴也跟着反向，
所以所有 `dy` 都得配一次符号翻转：

```json
{ "expr": "!isValid(datum.side) ? (tLO + 3.5) : (round(datum.alpha * (180 / PI)) >= 90 ? -1 : 1.75) * (tLO + 3.5)", "as": "dy" }
```

其中 `1.75`、`3.5`、`−0.5` 这些系数是原作者手调的经验值（不是推导出来的），
作用是让直段标签、上半弧标签、下半弧标签的视觉间距看起来一致。

还有一个容易被忽略的细节：**`baseline` 也被烘进同一个 translate**。
`dy = 1.75×11.5 = 20.13`，SVG 里却是 `18.13` —— 差的 2px 是 `baseline: "bottom"` 的下沉量
（约 0.2em）；直段那边 `baseline: "top"` 则会 **加** 约 0.8em（`11.5 → 19.5`）。
所以 `dy` 不等于最终视觉偏移，调间距时别拿 SVG 里的数字反推。

#### 4）一条数据流喂五类构件

`componentEncodings` 的 `values` 只有 5 行，每行一个 `category`；
第一个 `formula` 按 category 取出各自的 domain 值数组，再 `flatten` 摊开：

```json
{ "expr": "datum.category === 'start' ? [sDomain[reverse ? 1 : 0]] : datum.category === 'serpentine' ? pluck(data('serpentineDomain'), 'domain') : …", "as": "domain" }
```

`pluck(data('x'), 'f')` 是从另一个数据集抓一列的标准写法。
摊开后 5 行变 632 行（1 + 601 + 8 + 21 + 1），后面还有 15 个 transform（1 个 `window` + 14 个 `formula`）
对这 632 行一视同仁地算几何，最后由 5 个下游数据集 `filter` 领走自己那部分。

好处：**几何公式只写一遍**。要是每类构件各写一条流水线，改一个 `min`/`max` 就得改五处。

两个细节：

- `{"type": "formula", "expr": "scale('sS1', datum.domain)", "as": "sK"}` ——
  **数据变换里可以调 `scale()`**（解析顺序是 initScale → parseData → parseScale）。
  这里不会循环依赖：`sS1` 的 domain 只依赖 signal，range 只依赖 signal，
  没有一头连回 `componentEncodings`。**但 scale 名写错不报错也不 WARN**，只返回 `undefined` → 全图 NaN。
- `window` 的 `row_number` 按 `domain` 排序、`groupby: ["category"]` 出组内序号 `id`。
  用 `row_number` 而不是 `rank` 是因为 `rank` 遇并列会多吐行；
  这个 `id` 后面被 `segment_ends` 用来找「每段的第一个顶点」。

#### 5）方向箭头：`joinaggregate` 找每段起点

```json
{ "type": "joinaggregate", "fields": ["id", "id"], "ops": ["min", "max"], "groupby": ["i"], "as": ["minId", "maxId"] },
{ "type": "filter", "expr": "datum.id === (reverse ? datum.maxId : datum.minId)" }
```

`joinaggregate` 把每段的 `min(id)` / `max(id)` **贴回每一行**（不像 `aggregate` 那样把行压掉），
于是一条 `filter` 就能挑出每段起点。同时算 min 和 max 是为了让 `reverse` 开关免费生效。

箭头本体是个 **text mark 写 `➤` 字形**，旋转直接交给 `angle`。
为什么不用 `symbol` 的 `shape: "triangle-right"`？因为 symbol 的旋转要走 `angle` + 面积换算
（`size` 是**外接正方形面积**，`r = sqrt(size)/2`），而字形只要给 `fontSize`，省心。

#### 6）里程碑：`lookup` 回连 + 双层文字描边

`milestones` 只保留 `category === 'milestone'` 的 8 行，再 `lookup` 回 `dataset` 取 `label`：

```json
{ "type": "lookup", "key": "domain", "from": "dataset", "fields": ["domain"], "values": ["label"] }
```

（几何流水线的 `project`/`flatten` 把 `label` 丢掉了，所以要接回来。
`lookup` 没写 `default`，未匹配就是 `undefined` —— 本例 domain 一定匹配，不需要兜底。）

标签的白色垫底是**同一段文字画两遍**：先画一遍 `stroke: "#fff", strokeWidth: 7` 的，
再画一遍 `fill: "firebrick"` 的。两个 mark 的定位表达式必须**逐字一致**，否则会露白边。
（Vega 没有 text 的 `background`/`halo` 通道，这是标准做法；
matplotlib 那边一行 `path_effects.withStroke` 就够了。）

hover 高亮走 signal 而不是 `hover` 编码集：

```json
{ "name": "hoverFocus", "value": null,
  "on": [ { "events": "@milestone_markers:mouseover", "update": "datum" },
          { "events": "@milestone_markers:mouseout",  "update": "null" } ] }
```

事件选择器 `@markName:type` 把监听范围钉死在标记点上；
其它四个 mark 都写了 `"interactive": false`，避免抢拾取（拾取是自上而下取第一个命中的 mark）。
四个 mark 的 `opacity` 都读同一个 `hoverFocus`，所以「只在 hover 时显示标签」这个开关
不需要任何额外状态。

#### 7）`autosize.resize`：官方 `width±1` 抖动的正解

官方 spec 里有 12 条这种触发器：

```json
{"events": [{"signal": "mO"}], "update": "width+1"},
{"events": [{"signal": "mO"}], "update": "width-1"}
```

——同一个事件先把 `width` 加 1 再减 1。这不是要改宽度，是要**骗 Vega 重新布局**。
根因是 Vega 的 `autosize` 默认 `{"type": "pad", "resize": false}`：
视图的外框尺寸只在首帧按场景包围盒算一次，之后拖滑杆把图形撑大也不会重算。
官方是靠改内建 `width` 信号（尺寸信号变化必然触发 resize）来强制刷新的 ——
代价是必须把自定义 signal 命名成 `width`，把内建信号顶掉。

而且**这对 ±1 并不互相抵消**。同一个事件触发的多条 `update` 里，只有**先声明的那条**会落到
信号上，于是每拖一次滑杆，`width`（在官方 spec 里就是直段长度）净涨 1px。实测官方那份 spec
（纯 Node，反复 `view.signal('mO', …)` 后读 `view.signal('width')`）：

```
拖 6 次「里程碑偏移」滑杆：width = 300 → 301 → 302 → 303 → 304 → 305 → 306
```

也就是说，官方图上的**直段会随着你玩滑杆越来越长**，而这个滑杆本该只改标签偏移量。
这不是审美问题，是正确性问题 —— 也是「自定义 signal 不要撞内建名」这条铁律的最佳例证。

还有一层更隐蔽的错：那 12 条触发器里有 4 条写的是 `"update": "height+1"` / `"height-1"`，
但它们**全都在 `width` 这个 signal 的 `on` 数组里** —— Vega 的语义是「`on` 的 `update` 赋给拥有它的
signal」，所以这 4 条其实是把 `width` 赋成 `height±1`，而不是去改 `height`。
把另外 8 条删掉只留这 4 条实测：一拖 `mO`，`width` 立刻从 300 跳到 313.2（= 当时的 `height` + 1），
直段长度被钉成了蛇形的高度。默认那份里它们没发作，只是因为先声明的 `width+1` 抢先落地。

正解是一行声明：

```json
"autosize": { "type": "pad", "resize": true }
```

实测（纯 Node，改完 signal 再 `toSVG()` 看根元素尺寸）：

| 设置 | 默认 `sN=2.2, sH=110` | 改成 `sN=5, sH=180` |
| --- | --- | --- |
| `resize: false`（Vega 默认） | 708×492 | **708×492（不变 → 蛇形被 viewBox 裁掉）** |
| `resize: true`（本例） | 708×492 | **791×1076（跟着长大）** |

顺带解释了为什么本例不需要那 12 条抖动触发器，也不需要顶替 `width`/`height`。

## 试一试

1. **把 `弧数` 拖到 5、`弧直径` 拖到 180**：画布会跟着长高到 1000px 以上（`autosize.resize` 的功劳）。
   然后把 spec 里 `"autosize"` 那行删掉再试一次 —— 蛇形会被切在画布底边，
   这就是官方非写 `width+1 / width-1` 不可的处境。
2. **把 `刻度数` 拖到 41，同时把 `直段长度` 拖到 120**：刻度标签开始在弧上叠字。
   这套几何**没有碰撞检测** —— 其实**默认参数下就已经能看到一处**：左侧弧上的刻度 `1985`
   和里程碑标签 `1990 - Major Event F` 贴在一起。想解决只能手动抽稀
   （在 `tickDomain` 里按 `sL/tC` 反算最小间距）或上 `label` 变换（本仓库禁用，它要真实 canvas 位图）；
   最省事的规避是把 `刻度数` 调到 11、或把 `里程碑偏移` 拖大到 45 以上。
3. **把 `type` 判定改回官方写法** `(((datum.i + 1) * sWsA) - sA) >= datum.sK ? 'straight' : 'arc'`，
   再 `node tools/validate.cjs 47` —— 两份 spec 导出的 SVG **逐字节相同**（已实测 24084 字节 vs 24084 字节，`cmp` 无差异），
   亲手验证一次代数等价，比信我这段话有用。
4. **删掉 `tick_labels` 的 `"angle": {"field": "labelAngle"}`**：弧上的年份会横躺在曲线上，
   还会互相压字。再把 `align`/`baseline` 也改掉试试，体会 AGENTS.md 里那句
   「`labelAngle` 不会自动推导对齐方式」。
5. **打开 `反向时间轴`**：`sS1` 的 `reverse` 一变，刻度顺序、首尾注记、
   箭头方向（`segment_ends` 里的 `reverse ? maxId : minId`）会整体翻转，
   而几何公式一个字没改 —— 时间方向是 scale 的事，不是几何的事。
6. **把 `lineSteps` 从 600 改成 30**：弧立刻露出折线棱角，直观看出「圆弧」是 601 个点连出来的假象。
   顺手把 `sequence(sDomain[0], sDomain[1] + lineStep / 2, lineStep)` 里的 `+ lineStep / 2` 删掉，
   顶点从 601 个变 600 个，末点停在 2019.83（sK 1657.4 / 总长 1660.1），线尾差 2.8px 没画到 ——
   `sequence` 右开区间的经典坑，官方那份就是这么短的。

## 与官方示例的差异

官方 spec：<https://vega.github.io/vega/examples/serpentine-timeline/>
（原文亦可从 `https://raw.githubusercontent.com/vega/vega/main/docs/examples/serpentine-timeline.vg.json` 取得）。
**几何公式与数据集照抄官方**，以下是全部改动：

### A. 触碰本仓库铁律，必须改

| # | 官方写法 | 本例写法 | 原因 |
| --- | --- | --- | --- |
| 1 | `{"name": "width", "init": "width", "bind": {…}}` | `straightW`（value 400，独立滑杆） | `width` 是 view 的**内建信号**，同名自定义会直接顶替内建定义。改名后画布尺寸与蛇形几何彻底解耦（官方是 `sW = sPct * width`，拖「直段长度」等于在改画布宽） |
| 2 | `{"name": "height", "update": "extent(pluck(data('serpentine'),'y'))[1]"}` | `plotH`，同一个表达式，只用来摆脚注 | 同上，`height` 也是内建信号 |
| 3 | 12 条 `{"events":[{"signal":"mO"}],"update":"width+1"}` / `"width-1"` 抖动 | 删除，改成顶层 `"autosize": {"type":"pad","resize":true}` | 抖动的真实目的是强制重新布局（`autosize.resize` 默认 `false`）。而且这对 ±1 **不互相抵消**：实测每拖一次滑杆 `width`（= 官方的直段长度）净涨 1px，拖 6 次从 300 变 305。声明式解法一行搞定，实测对照见上文第 7 节 |
| 4 | `{"name":"domain","init":"[year(now())-100, year(now())]"}` | `domainOverride`(null) → `dataDomain`（从数据算，带兜底）→ `sDomain`（向外取整到十年） | `now()` 不可复现：无头校验每年结果都不同。现在定义域恒为 `[1920, 2020]`，且仍保留「想手工指定就写 `domainOverride`」的能力 |
| 5 | `sDomain` 用 `init`（只算一次） | 改用 `update` | `init` 不会随数据/信号变化重算；改 `domainOverride` 时官方那份要刷新页面才生效 |
| 6 | `dataDomain` 直接 `extent(pluck(data('dataset'),'domain'))` | `span(extent(…)) > 0 ? extent(…) : [1920, 2020]`；`sDomain` 里对 `domainOverride` 也加了 `span(…) != 0` 的同款守卫 | 本仓库铁律：data 驱动的 domain 必须兜底，空集会退化成 `[NaN, NaN]`、单值会零跨度（校验器判失败）。手写的 `domainOverride` 同理：零跨度会让 `lineStep = span/600` 变 0，`sequence` 吐 0 行，`serpentineDomain` / `serpentine` / `segment_ends` 三个数据集一起塌成空表 |
| 7 | `footer` 数据集（3 条外部 URL：ourworldindata / fontawesome / linkedin）+ `footerY` 比例尺 | 删除 | 禁止引用外部资源。顺带说明：**官方 spec 里没有任何 mark 引用它们**，是死代码 |
| 8 | `componentEncodings` 里 `{"type":"formula","expr":"now()","as":"timestamp"}` | 删除 | 不可复现，且无人使用 |
| 9 | `segment_ends` 用 `filter includeArrows && …` 关箭头 | 保留 filter 只挑段起点，`includeArrows` 改成控制 mark 的 `opacity` | 关掉开关会让这个数据集变成 0 行；本仓库校验器要求每个数据集行数 > 0 |
| 10 | 数据 url | 无需改动 | 官方本例的数据本来就是内联的，没有 url。里程碑 8 行、字段 `domain`/`label` 全部照抄 |

### B. 官方的笔误、死代码、可化简处

| # | 官方写法 | 本例写法 | 原因 |
| --- | --- | --- | --- |
| 11 | `{"name":"sPct","value":1,"update":"sPct < 0.25 ? 0 : sPct < 0.75 ? 0.5 : 1"}` | 删除，`sW` 直接用 `straightW` | 这个 signal 的 `update` 引用自己，没有 `bind`、没有 `on`，永远算出 1 —— 等于一个写复杂了的常量 |
| 12 | `{"name":"hoverFocus","value":0}` | `"value": null` | `isValid(0)` 为**真**，官方初始态就已经算「有 hover 焦点」了（只是 `hoverFocus['domain']` 恰好 undefined 才没出错） |
| 13 | `isValid(datum) && isValid(isValid(datum['domain']))` | `isValid(datum) && isValid(datum.domain)` | 双层 `isValid` 是笔误（`isValid(boolean)` 恒为真） |
| 14 | `{"events": {"type": "mouseover"}}`（全局） | `"@milestone_markers:mouseover"` / `:mouseout` | 全局监听会把任何 mark 的 mouseover 都灌进来，靠表达式过滤；用事件选择器钉死 mark 更省也更准 |
| 15 | `annotations` mark 写 `"angle": {"field": "angle"}` | 删除该通道 | `domain_extent` 数据集里**没有 `angle` 字段**，是死通道 |
| 16 | `annotations` mark 写 `"on": [{"trigger":"annotations","modify":"annotations"}]` | 删除 | 属于第 3 条那套强制重绘 hack；`text` 已经是 signal 表达式，改文本框会自动更新 |
| 17 | `milestones` 里 `{"expr":"(isValid(hoverFocus) && …) ? 1 : 0.4","as":"fillOpacity"}` | 删除 | 没有任何 mark 用这个字段，却让整个数据集随每次 hover 重算 |
| 18 | `lookup` 的 `values: ["label", "color"]` | `values: ["label"]` | `dataset` 里没有 `color` 字段 |
| 19 | `type` 判定 `(((i+1)*sWsA) - sA) >= sK` | `r <= straightW` | 代数等价（推导见上文），少一层心算 |
| 20 | `ticks.dy`、`tick_marks.dy`、`milestones.dy` 三处都按 `side` 分两支，一支写 `>= 90`、一支写 `> 89` | 各自合并成一支 | `round(α°)` 是整数，`>= 90` 与 `> 89` 完全等价，两支代码逐字相同 |
| 21 | `domain_extent.dx` 把 `align` 的三层三元判断复制了一遍 | `(datum.align === 'right' ? -1 : 1) * (tLO + 5)` | 直接复用上一步算好的 `align`，不重复判据 |
| 22 | mark 名 `tick_labels_straight` | `tick_labels` | 这个 mark 同时画直段和弧上的标签，原名有误导 |
| 23 | `sequence(sDomain[0], sDomain[1], 0.1)` | `sequence(sDomain[0], sDomain[1] + lineStep/2, lineStep)`，`lineStep = span(sDomain)/600` | ① `sequence` 右开，官方那条线差最后 0.1 个 domain 单位没画到；② 固定步长 0.1 换成毫秒时间戳定义域会炸出上亿行 |
| 23a | `milestoneDomain` 数据集（`source: dataset` + `project: [domain]`） | 删除 | 和 `footer` 一样是死代码：`componentEncodings` 取里程碑用的是 `pluck(data('dataset'), 'domain')`，全 spec 里 `milestoneDomain` 只出现在它自己的定义处（grep 计数 1） |
| 23b | `tickDomain` 用两个 `formula` 算 `domain`：先 `id===1 ? …: id===tC ? … : null`，再 `round(isValid(domain) ? domain : 线性插值)` | 合成一个 `formula` | 第一步造 `null` 只是为了让第二步的 `isValid` 分流，等价于直接把三支写进一个三元表达式 |
| 23c | `milestone_markers` 的 `size`：`labelsOnHover && isValid(hoverFocus) && … ? 200 : 150` | 去掉 `labelsOnHover &&` | 官方只在「标签仅 hover 显示」打开时才放大标记点；关掉开关时 hover 完全没有视觉反馈，与 `cursor: pointer` 一起改掉（见第 28 条） |

### C. 为适配固定画布 / 教学而做的调整

| # | 官方 | 本例 | 原因 |
| --- | --- | --- | --- |
| 24 | `width: 300`、`padding: 15`，无 `height`（靠自定义 signal 顶替） | `width: 520`、`height: 360`、四向 padding（left 80） | 内建 `height` 不再被顶替，必须显式声明；`padding.left` 给弧向左外凸的 `sH/2` + 标签（实测 63px）留白 |
| 25 | 滑杆量程 `sN: 0..20`、`sH: 25..400`、`tC: 0..100` | `sN: 0..5`、`sH: 40..180`、`tC: 2..41` | 收窄到与固定画布相称的范围。`tC` 下限：`tC=0` 会让 `tickDomain` 变 0 行（校验器断言每个数据集行数 > 0），`tC=1` 只剩一个刻度、画不出轴。（顺便纠一个容易想当然的结论：`(tC-1)` 那个分母**不会**真的除到 0 —— `tC=1` 时只有 `id=1` 一行，被前面 `id === 1` 的分支挡住了，实测两份 spec 在 `tC=1` 下都只吐一个刻度、无 NaN） |
| 26 | `sR0P`（起点 x %）、`sLP`（长度 %）两个滑杆，`sRange = [sR0P*width, sL*sLP]` | 删除，`sRange = [0, sL]` | 这两个调的是「domain 映射到路径的哪一段」，与本 demo 要讲的几何无关，留着会分散注意力 |
| 27 | 无标题、无脚注 | 顶层 `title` + signal 副标题 + 一行灰色脚注 | 本仓库质量标准：图上要有说明文字，让人一眼看懂在看什么 |
| 28 | 无 `tooltip` / `cursor` 固定切换 | 标记点加 `tooltip`，`cursor` 恒为 `pointer` | 官方的 cursor 只在 `labelsOnHover` 打开时才变手型，容易让人以为不能交互 |
| 29 | 箭头 `fill: "#000"`、`sT: 5`、`annotationStart: ""` | 箭头 `#4c78a8`（tableau10 蓝）、`sT: 3`、`annotationStart: "起点"` | 前两条是配色/粗细的观感调整；空注记会渲染成一个空 `<text/>`，教学上看不出这个通道在做什么 |
| 29a | `sH` 默认 125；`mO` 滑杆 `0..50` step 0.5；`sN` step 0.01；`sH` step 1 | `sH` 默认 110；`mO` `10..60` step 1；`sN` step 0.05；`sH` step 5 | 默认值与步长跟着固定画布一起收：`sH=125` 时默认视图比 `110` 高出约 30px（实测 plotH 333 → 302）；`mO<10` 时标签压在蛇形线上，步长细到 0.01/0.5 在教学 demo 里只会让人拖不准 |
| 29b | `reverse` 只有 `value: false`，没有 `bind` | 加 `bind: {input: 'checkbox'}` | 官方把它留成「改 spec 才能试」的开关；本 demo 要讲「时间方向是 scale 的事、不是几何的事」，必须能当场拖 |
| 29c | 箭头 `fontSize: 18`；刻度线 / 刻度标签 `fill: "#000"`；首尾注记 `fill: "gray"` | 箭头 `16`；刻度 `#333`；注记 `#666` | 纯观感：`18px` 的 `➤` 在 520px 画布上比里程碑点还抢眼；纯黑刻度会把主角（firebrick 的里程碑）压下去 |
| 30 | signal 无 `bind.name`，`description` 为英文 | 全部补中文 `bind.name` 与 `description`；`data`/`marks` 上补 `comment` | 本仓库约定：文档与注释用中文，键值保持英文。`scales` 条目上**不能**放注释键（会触发 `Unsupported scale property` WARN），所以 `sS1` 的说明写在这里 |

## 参考

- **官方示例（本 demo 的底本）**：<https://vega.github.io/vega/examples/serpentine-timeline/>
- Signals（`init` vs `update` vs `on`、内建信号一览）：<https://vega.github.io/vega/docs/signals/>
- Event Streams（`@markName:type` 选择器）：<https://vega.github.io/vega/docs/event-streams/>
- Expressions（`pluck` / `extent` / `span` / `sequence` / `isValid` / `scale`）：<https://vega.github.io/vega/docs/expressions/>
- `formula` 变换：<https://vega.github.io/vega/docs/transforms/formula/>
- `flatten` 变换：<https://vega.github.io/vega/docs/transforms/flatten/>
- `window` 变换（`row_number` 与 `groupby`）：<https://vega.github.io/vega/docs/transforms/window/>
- `joinaggregate` 变换：<https://vega.github.io/vega/docs/transforms/joinaggregate/>
- `lookup` 变换：<https://vega.github.io/vega/docs/transforms/lookup/>
- `text` mark（`angle` / `dx` / `dy` / `baseline`）：<https://vega.github.io/vega/docs/marks/text/>
- `line` mark：<https://vega.github.io/vega/docs/marks/line/>
- Linear scale（`zero` / `reverse` / `range` 接 signal）：<https://vega.github.io/vega/docs/scales/#linear>
- `autosize`（`pad` / `resize`）：<https://vega.github.io/vega/docs/specification/#autosize>

## 与 matplotlib 的对照

**几何本身：matplotlib 更顺手。**
`sK → (x, y)` 这套公式在 numpy 里是六行向量化代码，读起来比 15 个嵌套三元的 `formula` 舒服得多：

```python
P = W + np.pi * H / 2
i = np.floor(sK / P);  r = sK % P
alpha = (r - W) / (H / 2)
straight = r <= W
xs = np.where(i % 2 == 0, np.minimum(r, W), np.maximum(W - r, 0))
x = np.where(straight, xs, xs + np.where(i % 2 == 0, 1, -1) * np.sin(alpha) * H / 2)
y = i * H + np.where(straight, 0, (1 - np.cos(alpha)) * H / 2)
```

Vega 这边的代价是 JSON 没有临时变量、没有向量化，只能一个 `formula` 写一个中间列
（`sK` → `i` → `r` → `alpha` → `type` → `xStraight` → `x` → `y`）。
好处是这些中间列**留在数据里可以被检视**（`node tools/inspect.cjs 47` 能直接看到每个刻度的
`alpha`/`side`/`labelAngle`），调试时反而比 numpy 的匿名中间量方便。

**旋转标签：Vega 明显省事。**
matplotlib 的 `ax.annotate(..., rotation=θ, textcoords='offset points', xytext=(0, dy))`
里的 offset 是**显示坐标系**的，**不跟着 `rotation` 转**。
要把标签推到曲线外侧，你得自己算法向量：

```python
nx, ny = -np.sin(np.radians(theta)), np.cos(np.radians(theta))   # 得自己来
ax.annotate(txt, xy=(x, y), xytext=(dy * nx, dy * ny), textcoords='offset points', rotation=theta, ...)
```

Vega 的 `translate → rotate → translate` 顺序等于免费给了你一个旋转局部坐标系，
一个 `dy` 就够（本 demo 的刻度线、刻度标签、里程碑引线、里程碑标签四处都吃这个红利）。

**其它逐项对照：**

| 需求 | Vega | matplotlib / seaborn |
| --- | --- | --- |
| 参数化的轴（弧数/直径/长度可调） | 6 个 `bind` 滑杆，改一个 signal 全图重算 | `matplotlib.widgets.Slider` + 回调里手工 `set_data` / `remove()` 重画每一组 artist；或直接 `cla()` 全画一遍 |
| hover 高亮 | `@mark:mouseover` → signal → 4 个 mark 的 `opacity` 读它 | `fig.canvas.mpl_connect('motion_notify_event')` + `artist.contains(event)` 命中测试 + 手工 `set_alpha` + `draw_idle()` |
| 文字白描边 | 同一段文字画两个 mark（无 halo 通道） | 一行 `path_effects=[withStroke(linewidth=7, foreground='w')]` —— **matplotlib 赢** |
| 标签防重叠 | 无解（`label` 变换要真实 canvas，本仓库禁用） | `adjustText` 之类第三方包能真正测量文字包围盒去迭代避让 —— **matplotlib 赢** |
| 「轴」这个概念 | `axes` 只能画直线轴；曲线轴只能自己用 mark 拼 | 同样只能自己拼（`ax.plot` + `ax.annotate`），`FixedLocator` 帮不上忙 |
| 导出 | 内建 `view.toSVG()` / `toCanvas()`，本仓库还有透明 PNG 断言 | `savefig` 成熟稳定，矢量/位图/PDF 都行 —— **打平偏 matplotlib** |
| 声明与数据的分离 | 一份 JSON 就是全部，可被程序生成/比对/校验 | 逻辑散在 Python 语句里，只能靠跑一遍看图 —— **Vega 赢** |

**一句话总结**：这张图的数学谁都能算，
Vega 真正省下来的是**「参数变了之后要重画什么」**这件事 ——
11 个控件、601 个折线顶点、21 个刻度、8 个里程碑、3 个箭头之间的依赖关系，
在 Vega 里由数据流自动推导，在 matplotlib 里是你自己写回调管理 artist 的生命周期。
反过来，一旦需求变成「标签不能重叠」「文字要有光晕」这类**依赖真实文字度量**的事，
matplotlib 的命令式 + 真实 canvas 反而更强。
