# 24 · 南丁格尔玫瑰图与径向堆叠柱

数据是 `assets/data/crimea.json` —— 南丁格尔 1858 年那份著名图表的原始数字：
1854-04 到 1856-03 共 24 个月，克里米亚战争中英军每月死于
**疾病（disease）/ 战伤（wounds）/ 其他（other）** 的人数。她想让议员一眼看到的结论是：
死于可预防疾病的人远多于死于敌人。

本 demo 用同一份数据、同一条 `fold` + `stack` 管线，在极坐标下画两张图：

- **左：南丁格尔玫瑰图**（polar area / coxcomb）。每月占满 1/24 圆，
  半径走 **`sqrt` 比例尺**，于是**扇形面积**正比于死亡人数 —— 这是玫瑰图的命门。
- **右：径向堆叠柱状图**（radial stacked bar）。角度编码月份、半径**线性**编码堆叠累计值，
  中心留白，柱与柱之间留角度缝。

Vega 里**没有极坐标系**：没有 polar projection、没有径向轴。
所有的圆心、半径、刻度环、环形排布的标签都得自己声明出来 ——
本文把这些几何公式全部讲开。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/24-radial-rose-stack/
```

## 学习目标

- 学会极坐标图的**两个自由度分工**：角度用 `band` 比例尺（值域写成 `[0, 2*PI]`），
  半径用普通的连续比例尺（`sqrt` / `linear`）；`arc` 标记的四个通道
  `startAngle / endAngle / innerRadius / outerRadius` 正好把它们接起来。
- 弄懂**玫瑰图为什么必须用 `sqrt`**：面积随半径平方增长，半径直接线性映射会把外圈夸大到失真；
  并能自己推一遍「环带面积 ∝ 数值」的证明。
- 掌握**环形 band 比例尺的 padding 陷阱**：`paddingOuter` 必须等于 `paddingInner / 2`，
  否则 24 格转一圈会超过 2π，最后一个月压到第一个月身上。
- 会用 `text` 标记的**极坐标通道** `radius` / `theta`（省掉手写 `cx + r*sin(θ)`），
  并用表达式让 `align` / `baseline` 随角度自动翻面。
- 会手工画**径向刻度**：`sequence` 变换生成刻度值 → `arc` 的 `innerRadius == outerRadius`
  退化成一条圆线 → `text` 标注数值。
- 学会两条小技巧：用 `data('peak')[0].maxTotal` 把**数据里的极值读进 signal**；
  用 `scale('rSqrt', v)` / `scale('rLinear', v)` 在 encode 里**按信号切换比例尺**
  （因为 scale 的 `type` 不能写成 signal）。
- 复习 `group` mark 做双面板：两个面板共用同一份 `stacked` 数据与同一套颜色 scale，
  内部坐标各自相对自身原点，于是 `cx / cy / maxR` 一套信号左右通用。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.radiusMode` | 玫瑰图半径映射方式 | `select` 绑定 `sqrt` / `linear`；scale 的 `type` **不能**是 signal，所以做法是声明两条比例尺，在 encode 里用 `scale('rSqrt', …)` / `scale('rLinear', …)` 二选一 |
| `signals.barPad` | 右图径向柱的角度缝 | 喂给 `angleBar` 的 `paddingInner`，同时 `paddingOuter` 取它的一半（见下文推导） |
| `signals.hole` | 右图中心留白半径 | 直接当 `rBar` 值域的下界：`"range": [{"signal":"hole"}, {"signal":"maxR"}]` |
| `signals.ringStep` | 刻度环间隔（人） | 喂给 `sequence` 变换的 `step`，环的**条数**由数据峰值决定，不写死 |
| `signals.panelW / cx / cy / maxR / labelR` | 几何派生量 | 全部从 `width / height` 推出来：`panelW = width/2`，`maxR = min(panelW/2 - 52, height/2 - 52)`（52px 留给外圈月份标签与脚注） |
| `signals.maxTotal` | 月度死亡合计的峰值 | `data('peak')[0].maxTotal` —— 信号表达式可以读数据集；这里得到 3168（1855-01：疾病 2761 + 战伤 83 + 其他 324） |
| `data.crimea` | 原始 24 行 | `"parse": {"date": "utc:'%Y-%m-%d'"}` 按 **UTC** 解析，否则东八区会把 `1854-04-01` 读成 3 月 31 日；`window` + `row_number` 给出行序 `monthNo`，`formula` 派生 `i`（0…23）与 `total` |
| `data.peak` | 单行极值表 | `aggregate` 求 `max(total)`；专门为上面那个 signal 服务 |
| `data.folded` | 宽表 → 长表 | `fold: ["disease","wounds","other"]` 把 24 行变 72 行，产出 `cause` / `value` 两列（`as` 改了默认名 `key` / `value`）；再派生排序键 `causeOrder` 与中文名 `causeLabel` |
| `data.stacked` | 按月堆叠 | `stack` 以 `groupby: ["i"]` 分月、`sort: {"field":"causeOrder"}` 定内外顺序，产出累计区间 `v0` / `v1` —— 它们之后被半径比例尺映射成 `innerRadius` / `outerRadius` |
| `data.rings` | 刻度环的值 | `sequence` 变换（**生成器**，不需要 `source`）：`start = ringStep`、`stop = maxTotal`（右开）、`step = ringStep`，默认输出字段名就叫 `data` |
| `scales.color` | 三种死因配色 | ordinal + `{"scheme": "tableau10"}`；两个面板共用，图例也挂在它上面 |
| `scales.rSqrt / rLinear` | 玫瑰图的两套半径 | 同一个 `domain`（`stacked.v1`，`zero: true` 保证 0 人 → 0 半径）、同一个 `range` `[0, maxR]`，只差 `type` |
| `scales.rBar` | 右图半径 | `linear`，值域下界是 `hole`，于是 0 人落在留白圈上而不是圆心 |
| `scales.angleFull` | 玫瑰图角度 | `band`，`domain` 取 `crimea.i`（0…23），`range: [0, {"signal": "2 * PI"}]`，无 padding → 24 格严丝合缝铺满整圈 |
| `scales.angleBar` | 右图角度 | 同上，但 `paddingInner = barPad`、`paddingOuter = barPad / 2` |
| `legends[0]` | 死因图例 | `orient: "none"` + `legendX / legendY` 手工摆到画布正下方居中；`encode.labels` 把 `disease` 之类的原始值换成中文 |
| `marks[0]`（rule） | 面板分隔线 | 一条竖线 `x = panelW` |
| `marks[1]`（group `rosePanel`） | 左面板容器 | `x = 0`、`width = panelW`；内部坐标相对自身原点，所以能和右面板共用 `cx / cy` |
| ↳ `arc`（花瓣） | 24×3 片扇环 | `startAngle` / `endAngle` 用 `{"scale":"angleFull","field":"i"}` 与同一句加 `"band": 1`（= 加一个 `bandwidth`）；半径由 `radiusMode` 选中的比例尺算 |
| ↳ `arc`（刻度环） | 同心圆 | `innerRadius == outerRadius` 时 `arc` 退化成一条圆线，只描边不填充；`strokeDash` 做虚线 |
| ↳ `text`（刻度值） | 环上的数字 | 固定 `theta: 0`（12 点方向，那儿正好是死亡数最少的 1854-04 / 1856-03，不挡花瓣），`baseline: "bottom"` + `dy: -2` 让数字压在环线上方 |
| ↳ `text`（月份标签） | 环形排布的 24 个标签 | 用极坐标通道 `radius` / `theta`，`align` / `baseline` 由 `sin` / `cos` 的符号决定 |
| ↳ `text`（面板标题 / 脚注） | 图上说明 | 脚注文字随 `radiusMode` 变化，把「线性半径会夸大外圈」这句话写在图上 |
| `marks[2]`（group `radialBarPanel`） | 右面板容器 | `x = panelW`；同一份 `stacked` 数据，只换角度 scale（带 padding）、半径 scale（线性 + 留白） |
| ↳ `arc`（径向柱） | 24×3 段柱 | `innerRadius`/`outerRadius` 直接绑 `{"scale":"rBar","field":"v0"/"v1"}`，不需要表达式 |
| ↳ `arc`（基线环） | 0 人的位置 | 没有 `from`，单个 mark 实例，半径 = `hole` |
| ↳ `text`（中心峰值） | 留白处的注释 | `opacity` 随 `hole >= 30` 开关 —— 留白太小就自动隐藏 |

### 关键概念

**1. 角度当成一条 band 比例尺**

极坐标里「月份 → 角度」和笛卡尔里「月份 → x」是同一件事，只是值域从像素换成弧度：

```json
{ "name": "angleFull", "type": "band",
  "domain": { "data": "crimea", "field": "i" },
  "range": [0, { "signal": "2 * PI" }] }
```

于是扇形的两条边就是 `scale(i)` 和 `scale(i) + bandwidth()`，
后者在 spec 里写作 `{"scale": "angleFull", "field": "i", "band": 1}`
（值引用的 `band` 属性 = 在缩放结果上再加 `band × bandwidth`）。

Vega 的角度约定：**0 弧度在 12 点方向，顺时针为正，单位是弧度**。
`arc` 的 `startAngle` / `endAngle` 和 `text` 的 `theta` 用的是同一套约定
（`text` 内部换算成 `x += r·cos(θ-π/2)`、`y += r·sin(θ-π/2)`，正是「上北下南、顺时针」）。

**2. 环形 band 的 padding 陷阱：`paddingOuter` 必须等于 `paddingInner / 2`**

d3 / Vega 的 band 比例尺是这么排的（`n` 个格、值域跨度 `span`、`align = 0.5`）：

```
step      = span / (n - paddingInner + 2 × paddingOuter)
bandwidth = step × (1 - paddingInner)
起点偏移   = (span - step × (n - paddingInner)) × align
```

它是给**线段**设计的：两端的 `paddingOuter` 是「留白」。但圆是首尾相接的，
0 和 2π 是同一个位置，不该留白。若照默认写 `"padding": barPad`（= 内外都留），
或干脆只写 `paddingInner` 而把 `paddingOuter` 留成 0，就会得到

```
step = span / (n - p) > span / n   ⟹   n × step > 2π
```

24 格、`p = 0.18` 时超出 `24/23.82 - 1 ≈ 0.76%`（约 2.7°）—— 最后一个月**转过头**压到
第一个月身上，肉眼看到的是「1856-03 和 1854-04 叠在一起」。

取 `paddingOuter = paddingInner / 2` 时分母恰好等于 `n`：`step = 2π/24` 精确复原，
起点偏移 `= step·p/2`，于是第 `i` 格的**中心角**是 `(i + 0.5) × step` ——
与无 padding 的 `angleFull` **完全一致**（本 demo 实测两者中心角差 < 1e-15），
两个面板的月份标签因此能落在同样的方位上。

**3. 玫瑰图为什么必须 `sqrt`：面积的推导**

一片环带（角度跨度 `Δθ`、内外半径 `r0` / `r1`）的面积是

```
A = (Δθ / 2) × (r1² - r0²)
```

取 `sqrt` 比例尺，即 `r = k·√v`（`k = maxR / √maxTotal`），代入：

```
A = (Δθ / 2) × k² × (v1 - v0) = (Δθ·k² / 2) × value
```

**面积严格正比于该死因的人数**，比例常数与月份、与它堆在第几层都无关。
本 demo 的实际数字：`maxR = 183`、`maxTotal = 3168`、`Δθ = 2π/24 = 0.2618`，
于是 `Δθ·k²/2 = 183² × 0.2618 / (2 × 3168) ≈ 1.384 px²/人` ——
把任意一片扇环的面积除以它的人数，都得到 1.384（可自行在 `stacked` 上验算）。

反过来，若半径线性映射（`r = c·v`），面积就 `∝ v²`：把 `radiusMode` 切到 `linear`，
1854-07（382 人）与 1855-01（3168 人）的**面积比**从真实的 0.121 掉到 0.0146 ——
小月份被压掉 8 倍，视觉上「疫情只在 1855 年初爆发过一次」，
而 `sqrt` 下能看出 1854 年秋冬就已经很严重了。半径刻度环也同步变形：
`sqrt` 下 1000 人在 `r = 102.8`，`linear` 下只有 `r = 57.8`。

> 顺带一提：`stack` 的输出是**累计值** `v0/v1`，所以 `sqrt` 半径下每一段的内外半径
> 都不是等差的（外层越薄），但每段的**面积**依然精确正比于它自己的人数 —— 见上面的推导。

**4. 用信号切换比例尺**

`scales` 条目里的 `type` 只能是字面量，不能写 `{"signal": …}`。想让读者现场对比 `sqrt` 与
`linear`，就声明两条 scale，在 encode 里用表达式函数选：

```json
"outerRadius": { "signal": "radiusMode === 'sqrt' ? scale('rSqrt', datum.v1) : scale('rLinear', datum.v1)" }
```

`scale(name, value)` / `bandwidth(name)` 都是表达式里可用的函数，
Vega 会自动登记依赖：改 `radiusMode` 只重算受影响的编码，不重跑数据流。

**5. 手工画径向刻度**

三步，全部声明式：

1. `sequence` 变换生成刻度值（`start`/`stop`/`step` 都接 signal，所以环的数量随数据峰值和
   `ringStep` 自适应，不用手写 `[1000, 2000, 3000]`）；
2. `arc` mark，`startAngle: 0` / `endAngle: 2π` 且 **`innerRadius == outerRadius`** ——
   零厚度的环，只剩一条描边圆线；
3. `text` mark 标数值，用 `format(datum.data, ',d')` 输出 `1,000` 这样的千分位整数
   （直出 `1000` 也行，但四位以上的数值加千分位更易读）。

**6. 环形标签的对齐翻面**

标签在圆的右半边要左对齐、左半边要右对齐，顶端要 `baseline: bottom`、底端要 `top`，
否则文字会压到图上。用中心角的三角函数符号判断即可（`0.08` 是「接近正上/正下」的容差）：

```
align    = |sin θ| < 0.08 ? center : (sin θ > 0 ? left : right)
baseline = cos θ > 0.08 ? bottom  : (cos θ < -0.08 ? top : middle)
```

**7. 日期格式化**

`crimea.json` 的 `date` 是字符串，必须 `parse` 成日期才能用时间函数；用 `utc:` 前缀避免时区偏移。
标签文字里 `utcFormat(datum.date, '%Y年')` 只在 1 月（和第一个月）出现，其余只写
`(utcmonth(datum.date) + 1) + '月'` —— d3-time-format **不支持** `%-m` 这种去零填充的写法，
想要「4月」而不是「04月」就得自己拼。

## 试一试

1. **把 `radiusMode` 切到 `linear`**：对照左右两图，看 1854 年秋冬（7–12 月）那几片花瓣怎样
   缩成看不见的一小撮。再把它切回 `sqrt`，脚注文字也会跟着变。
2. **亲手踩一次 padding 坑**：把 `scales.angleBar` 的 `"paddingOuter": {"signal": "barPad / 2"}`
   改成 `0`，然后把 `barPad` 拖到 0.6。12 点附近的第一根柱子会被最后一根压住 ——
   这就是上面 `n × step > 2π` 的后果。
3. **改成比例玫瑰图**：给 `data.stacked` 的 `stack` 加 `"offset": "normalize"`，
   再把 `rSqrt` / `rLinear` / `rBar` 的 `domain` 换成 `[0, 1]`。此时每片花瓣都是满半径，
   看的是「当月死因构成比」，疾病占比常年 80% 以上的事实会跳出来。
4. **按人数排序的玫瑰图**：把 `angleFull` / `angleBar` 的 `domain` 换成
   `{"data": "crimea", "field": "i", "sort": {"field": "total", "op": "max", "order": "descending"}}`，
   月份就按死亡数从多到少绕圈排列 —— 好读，但丢掉了时间顺序，是个值得权衡的取舍。
5. **半圆版**：把两条角度 scale 的 `range` 改成 `[0, {"signal": "PI"}]`，
   并把 `cy` 改成 `height - 60`，得到南丁格尔原图那种「半圆两张并置」的排法
   （她本人是把 24 个月拆成两张 12 个月的整圆图）。
6. **调刻度密度**：把 `ringStep` 拖到 500（12 条环）和 2000（1 条环），
   体会 `sequence` 的 `stop` 是**右开**区间 —— 3000 会出现，4000 不会。

## 参考

- [`arc` 标记](https://vega.github.io/vega/docs/marks/arc/) —— `startAngle` / `endAngle` / `innerRadius` / `outerRadius` / `cornerRadius`
- [`text` 标记](https://vega.github.io/vega/docs/marks/text/) —— 极坐标通道 `radius` / `theta`，以及 `align` / `baseline` / `dx` / `dy`
- [`group` 标记](https://vega.github.io/vega/docs/marks/group/) —— 面板容器与相对坐标
- [`fold` 变换](https://vega.github.io/vega/docs/transforms/fold/) · [`stack` 变换](https://vega.github.io/vega/docs/transforms/stack/) · [`sequence` 变换](https://vega.github.io/vega/docs/transforms/sequence/) · [`window` 变换](https://vega.github.io/vega/docs/transforms/window/) · [`aggregate` 变换](https://vega.github.io/vega/docs/transforms/aggregate/)
- [Band 比例尺](https://vega.github.io/vega/docs/scales/#band) —— `step` / `bandwidth` / `paddingInner` / `paddingOuter` / `align` 的确切公式
- [连续比例尺](https://vega.github.io/vega/docs/scales/#quantitative) —— `sqrt` 是 `exponent = 0.5` 的 `pow`
- [值引用与 `band` 属性](https://vega.github.io/vega/docs/types/#Value) · [编码指令](https://vega.github.io/vega/docs/marks/#encode)
- [表达式语言](https://vega.github.io/vega/docs/expressions/) —— `scale` / `bandwidth` / `data` / `utcFormat` / `utcmonth` / `format`
- [图例](https://vega.github.io/vega/docs/legends/) —— `orient: "none"` + `legendX` / `legendY` 手工定位
- 官方例子：[Radial Plot](https://vega.github.io/vega/examples/radial-plot/)（同样是 `arc` + 半径 scale 的极坐标图）

## 与 matplotlib 的对照

**这张图在 Vega 里靠什么语法元素表达出来**

| 图上的东西 | Vega 里的表达 |
| --- | --- |
| 月份 → 角度 | `band` 比例尺，`range: [0, 2*PI]`；`arc` 的 `startAngle` / `endAngle` + 值引用的 `"band": 1` |
| 人数 → 半径 | 普通连续比例尺（`sqrt` / `linear`），`range: [0, maxR]` 或 `[hole, maxR]` |
| 堆叠 | `fold` + `stack` 产出的 `v0` / `v1`，直接接 `innerRadius` / `outerRadius` |
| 刻度环 | `sequence` 变换 + 零厚度 `arc` + `text` |
| 环形标签 | `text` 的 `radius` / `theta` 通道 + 三角函数决定 `align` / `baseline` |
| 交互 | `signals` 的 `bind`（下拉框 / 滑杆）、`tooltip` 通道、`hover` 编码集 |

**换成 matplotlib 要写什么**

老实说：**径向堆叠柱在 matplotlib 里比 Vega 省事**。matplotlib 有真正的极坐标投影，
`ax = plt.subplot(projection='polar')` 之后，`ax.bar(theta, height, width=…, bottom=…)`
画出来就是扇环，堆叠只要把 `bottom` 换成 `numpy.cumsum` 的上一层，
`ax.set_theta_zero_location('N')` + `ax.set_theta_direction(-1)` 一行搞定「12 点起、顺时针」，
而**径向网格线、径向刻度标签、外圈的 θ 刻度标签**（`set_rgrids`、`set_xticks` / `set_xticklabels`）
全都是投影自带的 —— 本 demo 花了三个 mark（约 40 行 JSON）手画的刻度环，
matplotlib 一句 `ax.set_rgrids([1000, 2000, 3000])` 就有了，还自带 `rlabel_position`
可以把刻度数字旋到不挡数据的方位。这一局 matplotlib 赢，因为 **Vega 根本没有极坐标系**，
所有「坐标系自带的东西」都得当成普通 mark 从零声明。

真正麻烦的是**玫瑰图的面积语义**：

- matplotlib 的极坐标 Axes 默认 r 是线性的。想让面积正比于数值，
  要么 `ax.set_yscale('function', functions=(np.sqrt, np.square))`（3.1+ 的 `FuncScale`，
  但极坐标下的 r 轴用非线性 scale 有不少边角坑，且 `bar` 的 `bottom + height` 语义要重新想清楚），
  要么老实自己算 `r = np.sqrt(v) * k`、用线性 r 画，然后**手工把刻度标签改回原始人数**
  （`ax.set_yticks(np.sqrt(ticks) * k)` + `ax.set_yticklabels([f'{t:,}' for t in ticks])`）。
  Vega 这边就是把 scale 的 `type` 从 `linear` 写成 `sqrt` —— 刻度值经由 `sequence` 生成、
  半径经由同一条 scale 映射，两边**不可能对不上**，因为它们是同一个 scale 对象。
- 想像本 demo 那样**现场切换 sqrt / linear 对比**：Vega 是一个 `select` 绑一个 signal，
  几何自动重算；matplotlib 要重画整张图（或者接 `ipywidgets` 写回调函数 + `fig.canvas.draw_idle()`），
  在静态 PNG 里则只能并排贴两张图。
- **悬停看数值**：matplotlib 没有内置 tooltip，得装 `mplcursors` 或自己接 `motion_notify_event`
  做命中测试（极坐标下还要把鼠标的 (x, y) 反算成 (θ, r) 再去查是哪一片扇环）。
  Vega 的 `tooltip` 通道是一行表达式，`hover` 编码集另给一行描边高亮。
- **图例**：极坐标 `bar` 按类别分三次画，`label=` 只在每组第一根柱上给，
  或者干脆用 `Patch` 代理艺术家拼 `ax.legend(handles=…)`；Vega 是 `legends: [{"fill": "color"}]`，
  文字还能用 `encode.labels` 改写成中文。
- **宽表转长表 + 累计**：pandas 一行 `melt` 加一行 `groupby(...).cumsum()`，
  和 `fold` + `stack` 打平手，pandas 甚至更短。
- **环形标签的对齐翻面**：matplotlib 也一样得手写循环（`for lbl, ang in zip(...): lbl.set_ha(...)`），
  两边都没有内置的「自动翻面」，这一项是平手。（Vega 有 `label` 变换做防重叠，
  但它需要真实 canvas 位图，纯 Node 校验器跑不了，本项目不用它。）

**结论（诚实版）**：单看「画出这张静态图」，matplotlib 的极坐标投影更省事，代码也更短
（大约 30 行 Python 对本 demo 的 530 行 JSON）。Vega 的价值在另外三件事上：
① 图是**数据 + 声明**，`ringStep` / `barPad` / `hole` / `radiusMode` 全是 signal，
拖动即重排，导出 SVG / PNG 也现成；② 角度和半径都是**一等公民的 scale**，
可被别的 mark 复用（两个面板共用 `stacked` 与 `color`，月份标签用同一条角度 scale 定位）
且能被工具检视（`node tools/inspect.cjs 24` 会打印出每条 scale 的真实 domain/range）；
③ 交互（tooltip / hover / 控件）零成本。
如果目标是论文里的一张定稿图，matplotlib 更快；如果目标是一个能让人拖着理解
「为什么玫瑰图不能用线性半径」的教学页面，Vega 这边的 530 行 JSON 是值的。
