# 26 · 六边形分箱 vs 矩阵热力图

同一份数据（`cars.json` 的马力 × 油耗）、同一条色标、两种二维密度画法并排：

- **左面板**：六边形分箱（hexbin）。Vega **没有** `hexbin` 变换，所以格心是用一串 `formula`
  在**像素空间**手算出来的（算法与 `d3-hexbin` 逐格一致），再用 `aggregate` 计数，
  最后靠 `symbol` mark 的**自定义 shape path** 把每个格子画成正六边形。
- **右面板**：矩阵热力图。两个维度各 `bin` 一次 + `aggregate` 计数 + `rect` 填色，
  全部是内置变换 —— 同一件事 Vega 原生只需三步。

两个面板由同一个 `resolution` signal 驱动（左边决定蜂巢格宽，右边决定 `bin.maxbins`），
共享一条 `viridis` 色标与一个渐变图例。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/26-hexbin-matrix/
```

无头校验：

```sh
node tools/validate.cjs 26
node tools/inspect.cjs 26 --rows 5
```

## 学习目标

1. **在 Vega 里手算蜂巢格心**：轴向归一化 → 奇偶行错位取整 → 尖角区域改判 → 复原像素格心，
   每一步都是一条 `formula`，整条链是纯声明式的、可被 signal 重算的。
2. **`symbol` 自定义 shape path 的缩放约定**：path 坐标被整体乘 `sqrt(size)/2`，
   所以"想要外接圆半径 r"要写 `size = 4r²` —— 这是本 demo 唯一一处必须知道渲染器实现的地方。
3. **在数据变换里调用比例尺**：`scale('hx', datum.Horsepower)` 把数据值换成像素，
   `invert('hx', px)` 反过来把像素换回数据值（tooltip 里用它报格心的真实马力/油耗）。
4. **内置的二维直方图写法**：`bin` × 2 + `aggregate`，bin 边界直接当 `rect` 的 `x/x2`、`y/y2`。
5. **`extent` 变换把数据范围导出成 signal** 再喂给 `bin.extent`，避免把 `[46, 230]` 写死。
6. **一条 scale domain 跨两个数据集取并集**（`domain.fields`）→ 两个面板共享色标与图例。
7. **Vega 核心 `linear` 比例尺的 `zero` 默认是 `true`** 这个坑，以及连续色标为什么逃过一劫。
8. **group mark 分层**：轴挂外层、几何放内层 `clip` 组，`clip` 才不会连轴标签一起裁掉。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width/height/padding` + `autosize: "pad"` | 画布 660×330 是**绘图内容框**，标题、轴标题、图例探出去的部分由 `pad` 自动撑开 | 所有面板位置都是手工算的绝对坐标，所以不能用 `autosize: "none"`（标题会被裁） |
| `title` | 主标题 + 副标题（写清数据来源与已剔除的缺失值） | `anchor: "start"` 左对齐，和左面板的 y 轴区对齐 |
| `signals` · 交互三件套 | `resolution`（6–26）、`minCount`（1–5）、`showCounts`（勾选框） | `resolution` **同时**决定左面板格宽与右面板 `maxbins` —— 这就是两个面板的联动点 |
| `signals` · 面板几何 | `panelW/panelH/panelTop/leftX/rightX` | 纯常量。改一处两个面板一起挪，不用在 mark 里找魔法数 |
| `signals` · 蜂巢几何 | `hexDx = panelW/resolution`、`hexRadius = hexDx/√3`、`hexDy = 1.5·hexRadius`、`hexSize = 4r²`、`hexShape` | 见下文「蜂巢坐标变换」与「size ↔ 半径」 |
| `data: cars` | 载入 + `filter` 掉 null + 两个 `extent` 导出 `hpExtent` / `mpgExtent` | 406 行里 Horsepower 有 6 个 null、MPG 有 8 个，两者任一为 null 的共 14 行，**剩 392 行** |
| `data: hexbins` | 12 条 `formula` 算格心 → `aggregate` 按格计数 → `filter` 掉稀疏格 | `groupby` 里带上 `hexX/hexY`：它们是 `(hexI,hexJ)` 的函数，不改变分组，只是把格心带进聚合结果 |
| `data: matrix` | `bin`(Horsepower) → `bin`(MPG) → `aggregate` → `filter` | 对照组：同一件事的内置写法，四行 |
| `data: matrixLabels` | 从 `matrix` 里筛出"该写数字"的格子 | 条件里用 `scale('mx', …)` 现算格子像素宽高：格子小于 19×12px 就不写字 |
| `data: panelHeads` | 两行内联数据（标签 + x 坐标） | 一个 `text` mark 画两段小标题，避免复制粘贴两个 mark |
| `scales: hx / hy` | 左面板位置比例尺，domain 取 `cars` 的真实范围 | `"zero": false` 必须显式写；`"padding": {"signal":"hexRadius"}` 是**像素**留白 |
| `scales: mx / my` | 右面板位置比例尺，domain 取 `matrix` 的 **bin 边界并集** | `domain.fields` 同时取 `hp0` 和 `hp1`，格子才能严丝合缝铺满 |
| `scales: count` | 共享计数色标，`range: {"scheme": "viridis"}` | `domain.fields` 取 `hexbins.count` ∪ `matrix.count` → 一条色标服务两个面板 |
| `legends` | `type: "gradient"`，`orient: "none"` + `legendX/legendY` 手工定位 | 手工布局的图必须自己定位图例，否则它会按顶层画布右侧摆放 |
| `marks[0]` · `text` | 两个面板的小标题 | 无 `from` 的 mark 只画一个 item；这里有 `from` 所以画两个 |
| `marks[1]` · group `hexPanel` | 外层：`axes` + 面板底色 | 轴**必须**在外层，见下文「为什么 clip 要分层」 |
| └ 内层 group `clip: true` | 只裁几何 | 边缘六边形最多探出 0.76r，裁掉比留 1.8r 的空白划算 |
| &nbsp;&nbsp;└ `symbol` | 每格一个六边形 | `x/y` 直接用像素格心（已经是绘图区坐标，**不再过比例尺**）；`size` 由 signal 给 |
| `marks[2]` · group `matrixPanel` | 外层：`axes` + 底色；内层 `rect` + 计数 `text` | `rect` 用 `x/x2/y/y2` 四个通道，宽高由 bin 边界决定，不需要 `width/height` |
| &nbsp;&nbsp;└ 计数 `text` | 亮格写深字、暗格写浅字 | 阈值 `0.55 * peek(domain('count'))` —— 直接问色标要 domain，不额外维护一个 signal |

### 关键概念一：蜂巢坐标变换（本 demo 的核心）

**先约定几何。** 本例用「尖顶」正六边形，外接圆半径（格心到顶点）记作 `r`：

| 量 | 值 | 说明 |
| --- | --- | --- |
| 六边形宽（左右两条平行边间距） | `√3·r` | 也就是同一行相邻格心的水平间距 `dx` |
| 六边形高（上下两个顶点间距） | `2r` | 但**行距不是 2r** |
| 行距 `dy` | `1.5r` | 相邻两行要互相咬合，所以只错开 1.5r |
| 奇偶行水平错位 | `dx/2` | 奇数行整体右移半格 |
| 单个六边形面积 | `(3√3/2)·r² ≈ 2.598 r²` | 用来讨论两个面板的可比性 |

spec 里把这三条写成 signal：`hexDx = panelW / resolution`（先定"横向要几列"），
`hexRadius = hexDx / sqrt(3)`，`hexDy = hexRadius * 1.5`。

**再做归一化。** 把像素坐标除以格距，得到"以格为单位"的坐标 `u = px/dx`、`v = py/dy`。
在这套坐标里，全部格心都落在 `(i + (j mod 2)/2, j)` 这些点上（`i`、`j` 为整数）。
于是分箱问题变成：给定 `(u, v)`，求最近的格心 `(i, j)`。

**第一步：粗定位（把平面当成 dx × dy 的矩形格）。**

| 字段 | 表达式 | 含义 |
| --- | --- | --- |
| `fy` | `scale('hy', MPG) / hexDy` | 归一化行坐标 `v` |
| `j0` | `round(fy)` | 最近的行号 |
| `p0` | `j0 - 2*floor(j0/2)` | `j0` 的奇偶（0 或 1） |
| `fx` | `scale('hx', HP) / hexDx - p0/2` | 先减掉本行的错位量，再当成整数格用 |
| `i0` | `round(fx)` | 最近的列号 |

用 `j0 - 2*floor(j0/2)` 而不是 `j0 % 2`：Vega 表达式的 `%` 沿用 JS 语义，对负数返回负值
（`-3 % 2 === -1`），而 floor 写法恒为 0/1。本例的 `j0` 恒 ≥ 0，但这个写法不会在别处咬人。

**第二步：尖角区域改判。** 矩形格中心 ≠ 蜂巢格心。看归一化的垂直偏移 `Δv = v − j0`：

- `|Δv| ≤ 1/3` 时**不用改**。因为六边形的两个"腰"（左右侧顶点）正好在 `y = ±r/2`，
  换成归一化就是 `Δv = ±(r/2)/(1.5r) = ±1/3`；在这条腰带里六边形是满宽 `√3r = dx`，
  和宽 `dx` 的矩形格完全重合，四舍五入的结果必然正确。
- `|Δv| > 1/3`（即 `abs(Δv)*3 > 1`）时六边形开始朝上/下顶点收窄，矩形格的两个角
  已经落到错行邻居的领地里，必须比一次真实距离：

| 字段 | 表达式 | 含义 |
| --- | --- | --- |
| `i2` | `i0 + (fx < i0 ? -1 : 1)/2` | 列号朝 `u` 偏离的方向挪**半格** |
| `j2` | `j0 + (fy < j0 ? -1 : 1)` | 行号朝 `v` 偏离的方向挪**一行** |
| `swap` | `abs(fy-j0)*3 > 1 && d²(i0,j0) > d²(i2,j2)` | 两个候选的欧氏距离平方谁小取谁 |
| `hexI` | `swap ? i2 + (p0 == 1 ? 1 : -1)/2 : i0` | 把半整数的 `i2` 拉回整数，并与**新行**的错位量对齐 |
| `hexJ` | `swap ? j2 : j0` | 新行号（奇偶性翻转了） |

**第三步：复原像素格心。**

| 字段 | 表达式 |
| --- | --- |
| `hexX` | `(hexI + (hexJ - 2*floor(hexJ/2))/2) * hexDx` |
| `hexY` | `hexJ * hexDy` |

注意错位量要用**改判后**的 `hexJ` 重新算奇偶 —— 这也是上一步里 `i2` 要加减半格的原因：
`i2 ± 1/2` 恰好把列号变回整数，正好抵消新行奇偶翻转带来的半格偏移。

这套算法就是 `d3-hexbin` 的原文实现。项目里用一个对照脚本把 392 个点逐点跑过一遍
`d3-hexbin` 的 JS 版，与本 spec 的输出**格号、格心、计数全部一致**（默认参数下 57 格、392 点）。

### 关键概念二：`size` ↔ 半径（自定义 shape 的换算）

`hexShape` 是一个半径 1 的单位六边形（顶点取 `k·60°` 上的 `(sin θ, −cos θ)`）：

```
M0,-1 L0.8660254,-0.5 L0.8660254,0.5 L0,1 L-0.8660254,0.5 L-0.8660254,-0.5 Z
```

`vega-scenegraph` 对自定义 shape 的处理是 `pathRender(context, parsed, 0, 0, Math.sqrt(size)/2)`
—— **path 里的坐标被整体乘 `√size / 2`**。所以：

- 单位 path 的渲染半径 = `√size / 2`；
- 想要半径 `r`，就取 `size = (2r)² = 4r²`（spec 里的 `hexSize`）。

实测：`resolution = 12` 时 `r = 11.9319`，`hexSize = 569.481`，`√569.481 / 2 = 11.9319` ✓。

顺带把内置 symbol 的约定也记住：`'circle'` 的半径同样是 `√size/2`，
所以 Vega 的 `size` 严格说是**外接正方形的面积**，不是圆面积（`πr² = 0.785·size`）。
任何时候想让**长度**线性正比于数值，比例尺都要用 `sqrt`/`pow`。

### 关键概念三：为什么必须在像素空间分箱

`scale('hx', datum.Horsepower)` 出现在 `formula` 里，是这份 spec 里最"绕"的一笔，但非做不可：
六边形只有在**等距的欧氏平面**上才是正六边形。马力（46–230）和油耗（9–46.6）量纲、跨度都不同，
在数据空间里按"格"切出来的形状投到屏幕上会被拉成不规则六边形。
先过比例尺换成像素、在像素空间分箱、格心直接就是绘图坐标 —— 所以 `symbol` 的 `x/y`
用的是 `{"field": "hexX"}` 而**不是** `{"scale": …, "field": …}`。

依赖方向是 `hexbins` → `scale hx/hy` → `data cars`，没有环，Vega 的数据流会自动排好次序：
比例尺 domain 先算好，`formula` 再跑。反过来若把 `hx` 的 domain 建在 `hexbins` 上就会成环。

tooltip 里的 `invert('hx', datum.hexX)` 是同一件事的逆运算：把像素格心换回马力/油耗，
所以悬停能看到"格心 ≈ 138 hp / 19.07 mpg · 8 辆"这种人能读的说明。

### 关键概念四：右面板为什么这么省事

```json
{"type": "bin",       "field": "Horsepower",       "extent": {"signal": "hpExtent"},  "maxbins": {"signal": "resolution"}, "as": ["hp0", "hp1"]},
{"type": "bin",       "field": "Miles_per_Gallon", "extent": {"signal": "mpgExtent"}, "maxbins": {"signal": "resolution"}, "as": ["mpg0", "mpg1"]},
{"type": "aggregate", "groupby": ["hp0", "hp1", "mpg0", "mpg1"], "ops": ["count"], "as": ["count"]}
```

三条变换就是完整的二维直方图。要点：

- `bin` 是**必填 `extent`** 的（参数表见 `assets/vega.js` 里的 `Bin.Definition`），
  所以先用 `extent` 变换把范围导出成 signal，别写死。
- `bin` 默认 `nice: true`，会把步长调成 10/20/5 这类整数：马力 `[46,230]` → 步长 20、从 40 起；
  油耗 `[9,46.6]` → 步长 5、从 5 起。因此**格数不等于 `maxbins`**（`maxbins` 是上限）。
  `resolution` 拖到 20 以上时右面板会停在 112 格不再变细 —— 就是 nice 步长在挡着。
- 正因为 bin 边界不是 `maxbins` 能算出来的，`mx/my` 的 domain 直接取 `hp0/hp1`、`mpg0/mpg1`
  的**并集**（`domain.fields`），格子才能刚好铺满绘图区、不留半格空隙。
- `rect` 用 `x/x2/y/y2` 四通道，宽高由数据决定。注意 y 是**反向**的：
  `y` 接 `mpg1`（上边界）、`y2` 接 `mpg0`（下边界）。

### 关键概念五：`zero` 默认为真的坑

Vega 核心的 `configureDomain()` 里有这么一句：

```js
zero = _.zero || _.zero === undefined && includeZero(scale)
// includeZero: !scale.bins && (type === Linear || Pow || Sqrt)
```

也就是说 **`linear` 比例尺不写 `zero` 时默认把 0 塞进 domain**。本例两个维度（马力、油耗）
都不该从 0 起：不写 `"zero": false` 时实测 `hx` 的 domain 变成 `[-20, 260]`、
`hy` 变成 `[-5, 50]` —— 出现了负马力、负油耗的刻度，绘图区还白白浪费一大块。

有意思的是 `count` 色标同样是 `"type": "linear"` 却没被塞 0（domain 实测 `[1, 40]`）：
因为它带 `scheme`，`scaleKey()` 把实际比例尺类型换成了 `sequential-linear`，
`includeZero` 认不出来。**位置比例尺要显式关 zero，连续色标不用管** —— 这个不对称很容易咬人。

顺便：色标 domain 从 1 起（而不是 0）恰好也是我们想要的 —— 计数为 1 的格子直接落在
viridis 最暗端，整条色带都用来区分真实存在的密度差；这和 matplotlib `hexbin` 默认
`vmin = 1` 的效果一致。

### 关键概念六：为什么 clip 要分层

`hx/hy` 上的 `"padding": {"signal": "hexRadius"}` 是**像素**留白：Vega 的 `padDomain()`
会把它换算成 domain 的扩张量，于是最边缘的数据点离绘图区边界至少 `r` 像素。

但 `padding = r` **不足以**保证六边形完全落在框内：格心与数据点最多相差水平 `dx/2 = 0.87r`、
垂直 `dy/2 = 0.75r`，所以最坏情况六边形会探出约 `0.87r`。要完全放得下得留 `1.8r`，
那样 248px 宽的面板要拿 34% 出来做空白。本例的选择是 **留 `r` + `clip` 裁掉**：
把 `resolution` 从 6 扫到 26 实测，最多只有 1 个格子被裁、最深探出 `0.76r`。

`clip: true` 放在**内层** group 上，`axes` 挂在外层 group：
group 的 clip 会裁掉该 group 的全部内容，而轴标签、轴标题都在 `y > panelH` / `x < 0` 的位置，
挂在同一个 clip 组里会被一起裁掉。**几何和坐标轴要分两层**。

### 关键概念七：共享色标的可比性（诚实提醒）

```json
"domain": { "fields": [
  { "data": "hexbins", "field": "count" },
  { "data": "matrix",  "field": "count" }
] }
```

一条 domain 取两个数据集的并集，两个面板共享同一条 `viridis` 与同一个图例 —— 这是声明式的好处。
但**颜色相同不等于密度相同**：默认参数下六边形面积 `2.598 r² ≈ 370 px²`，
矩阵格子 `24.8 × 28.0 ≈ 694 px²`，后者是前者的 1.88 倍。
所以右面板的计数天然更大（实测最大值 40 vs 30、均值 11.2 vs 6.9）。
要严格对比两种分箱，得比"密度"（`count / 格面积`）而不是 `count`。
本 demo 保留共享色标是为了让两个面板的**图例只有一个**、读者的注意力放在形状差异上，
这个取舍要说清楚，不能默认读者知道。

## 试一试

1. **删掉改判那一步**：把 `hexI` 的表达式换成 `datum.i0`、`hexJ` 换成 `datum.j0`（即忽略 `swap`）。
   图会退化成"在矩形格中心画六边形"：格子不再咬合、上下尖角处的点被分错格，
   密集区能看出规则的条纹和缝隙。这一步直观说明为什么 `1/3` 那个判据不能省。
2. **换个 shape**：把 `hexShape` 改成正方形 `"M-1,-1L1,-1L1,1L-1,1Z"`。
   会看到格子互相重叠 —— 因为 `size = 4r²` 给的是"外接半径 r"，而正方形的外接半径对应的边长
   是 `√2 r`，比格距宽。想画**平顶**六边形则要把 `hexDx` 与 `hexDy` 的角色互换。
3. **体会 `zero` 的坑**：删掉 `hx` / `hy` 上的 `"zero": false`，再跑
   `node tools/inspect.cjs 26`，看 domain 怎么被拉到 `[-20, 260]` / `[-5, 50]`。
4. **关掉裁剪**：把内层 group 的 `"clip"` 改成 `false`，然后把 `resolution` 拖到 7 或 24，
   边缘会有六边形探进坐标轴区域。再把 `padding` 从 `hexRadius` 改成 `hexRadius * 1.8`，
   探出消失，但绘图区明显变小 —— 这就是本例做的取舍。
5. **改色标语义**：把 `count` 色标加上 `"type": "sqrt"`，或把 range 换成
   `{"scheme": "magma", "extent": [1, 0]}`（反向，暗 = 多）。长尾计数的可读性变化很明显。
   顺手把 `minCount` 拖到 5，注意色标 domain 会跟着收窄成 `[5, 40]` ——
   因为 domain 是从**过滤之后**的数据集算的。

## 参考

- [`bin` 变换](https://vega.github.io/vega/docs/transforms/bin/) — `extent` 必填、`nice`、`maxbins` 是上限
- [`aggregate` 变换](https://vega.github.io/vega/docs/transforms/aggregate/) — `groupby` / `ops` / `as`
- [`extent` 变换](https://vega.github.io/vega/docs/transforms/extent/) — 把数据范围导出成 signal
- [`formula` 变换](https://vega.github.io/vega/docs/transforms/formula/)
- [`filter` 变换](https://vega.github.io/vega/docs/transforms/filter/)
- [`symbol` mark](https://vega.github.io/vega/docs/marks/symbol/) — `shape` 支持 SVG path 字符串，`size` 的含义
- [`rect` mark](https://vega.github.io/vega/docs/marks/rect/) — `x/x2/y/y2` 四通道
- [`group` mark](https://vega.github.io/vega/docs/marks/group/) — 嵌套、`clip`、`axes`
- [Scales](https://vega.github.io/vega/docs/scales/) — `domain.fields`、`zero`、`padding`、`range.scheme`
- [Legends](https://vega.github.io/vega/docs/legends/) — `type: "gradient"`、`orient: "none"` + `legendX/legendY`
- [Expressions](https://vega.github.io/vega/docs/expressions/) — `scale()` / `invert()` / `domain()` / `peek()` / `format()`
- [d3-hexbin](https://github.com/d3/d3-hexbin) — 本例格心算法的出处
- 想查任何变换的完整参数表，直接读未压缩构建：`grep -n "Bin.Definition = {" -A 60 assets/vega.js`

## 与 matplotlib 的对照

**先说结论：单看"画出这两张图"，matplotlib 完胜。**

```python
# 右面板
plt.hist2d(hp, mpg, bins=(10, 9), cmap="viridis")
# 左面板
plt.hexbin(hp, mpg, gridsize=12, cmap="viridis", mincnt=1)
plt.colorbar()
```

各一行。`hexbin` 是 matplotlib 的内置方法，`gridsize` / `extent` / `mincnt` /
`C` + `reduce_C_function` / `bins="log"` 全都是关键字参数；本 demo 花了 12 条 `formula`
才补上的蜂巢分箱，那边根本不用你知道 `dx = √3 r` 是怎么来的。
`size = 4r²` 这种"要懂渲染器实现"的换算也不存在。所以：

- **纯出图**：matplotlib 一行，Vega 半个 spec。不要为了用 Vega 而用 Vega。
- **统计变体**：中位数着色、对数色标、`mincnt`，matplotlib 都是加个参数；
  Vega 要换 `aggregate` 的 `ops`、换 scale `type`，能做但要动结构。
- **边界细节**：matplotlib 的 hexbin 按 `extent` 自己铺满，不用你操心格子探出画布；
  本 demo 得自己算探出量、自己决定 `clip` 还是加 `padding`。
- **论文出图**：PDF/EPS、LaTeX 字体、期刊模板，matplotlib 生态成熟得多。

**那这份 spec 换来了什么？**

1. **交互是声明出来的，不是补出来的。** `resolution` 一个 signal 同时驱动
   左面板的 `hexDx`（→ `hexRadius` → `hexSize` → 整条 `formula` 链）和右面板的 `bin.maxbins`；
   拖动滑块，两个面板、色标 domain、图例刻度、格内数字的显隐**一起**重算。
   matplotlib 要 `matplotlib.widgets.Slider` 加回调、回调里 `ax.clear()` 重画，
   或者上 ipywidgets（那就绑死 Jupyter，离线 HTML 没了）。tooltip 更要额外装
   `mplcursors` / `mpld3`，而这里就是 `encode.update.tooltip` 一行表达式。
2. **跨面板一致性由数据流保证。** 共享色标是**声明**的：
   `domain: {fields: [两个数据集的 count]}`。matplotlib 要自己
   `vmin, vmax = 1, max(h1.max(), h2.max())` 并手动传给两个 artist ——
   忘记同步 `vmin/vmax` 导致两张子图颜色含义不同，是这类并排图最经典的错误。
   同理 `minCount` 一动，两个 `filter`、色标 domain、图例刻度自动一致；
   命令式代码里这些是散落的中间变量，改一处得人工保证别处跟上。
3. **"格子的意义"写在 spec 里，可被读。** 蜂巢的三条几何关系是 5 个具名 signal
   （`hexDx / hexRadius / hexDy / hexSize / hexShape`），页面右侧的 Signals 面板直接显示实时值；
   matplotlib 里它们藏在 `hexbin()` 的 C 实现中，你只能相信 `gridsize`。
   反过来说，本 demo 因此**是一份可执行的教材**：想知道蜂巢分箱到底怎么算的，读 spec 就够了。
4. **产物是数据 + 一份 JSON。** 换数据集只改 `data[0].url` 和两个字段名；
   把 `resolution` 的 `bind` 删掉就变成静态图；交给另一个 agent 改就是改 JSON。
   matplotlib 的产物是像素/矢量文件，参数藏在脚本里。

**一句话**：选 Vega 的理由不是"画得出来"，而是"画出来之后还能拖、能联动、能被别人读懂并改"。
只要一张静态图交差，`plt.hexbin` 一行就够了。
