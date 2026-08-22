# 34 · 矢量场 / 风场图（vector field + 风玫瑰）

一份 0.25° 分辨率的风场快照（80×60 = 4800 个格点，字段 `longitude,latitude,dir,dirCat,speed`），
左边画成矢量场，右边画成风玫瑰，两张图共用同一条风速色标。

## 学习目标

1. 用 **`symbol` mark + 自定义 SVG path** 造一个"字形"，再用 **`angle` 通道**把它旋转到数据给定的方向 ——
   这是 Vega 里表达"有向量的点"的通用手法（风场、洋流、梯度、光流、罗盘图都一样）。
2. 搞清 Vega 的两个容易踩的约定：
   - `angle` 的单位是**度**、**顺时针**、**0° 指正上（北）** —— 正好等于罗盘方位角，不用换算；
   - `size` 通道是**面积**不是长度，自定义 path 的渲染缩放系数是 `sqrt(size) / 2`。
     想让"箭头长度线性正比于风速"，就必须让 `size` 走 **`pow` 比例尺（`exponent: 2`）**。
3. 学会**在 spec 里抽稀**：把格点坐标反解成整数下标，再用 `filter` 取模，抽稀比例做成 signal。
4. 学会**手工极坐标几何**：`arc` mark 画风玫瑰，`sqrt` 半径比例尺让扇形面积正比于频率，
   辐条 / 网格圈 / 方位标签全部由 `rule` / `symbol` / `text` 手工摆位。
5. 掌握一个必踩的坑：**Vega 连续比例尺的 `zero` 默认是 `true`**，
   写死 `"domain": [44.6, 60.4]` 也会被悄悄拉成 `[0, 60.4]`，必须显式 `"zero": false`。
6. 学会 **嵌套 group + `clip`** 的正确姿势：外层 group 挂比例尺和坐标轴，内层 group 开 `clip` 只裁图元。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/34-vector-field/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `$schema` / `width` / `height` / `padding` / `autosize` | 画布 | `920×400`，`autosize: pad` 让轴标签、标题、底部注记自动撑开画布（实际 SVG 986×477） |
| `title` | 主标题 + 副标题 | `subtitle` 一句话交代两块面板分别在看什么 |
| `signals`（交互组） | `step` / `arrowScale` / `pointDownwind` / `arrowStyle` | 四个可拖可勾的参数：抽稀步长、箭头缩放、方向约定、箭头字形 |
| `signals`（几何组） | `vfW` / `vfH` / `pxPerDeg` / `cellPx` / `maxArrowPx` / `maxArrowArea` | 从"面板宽度 + 经纬跨度 + 抽稀步长"一路算到"最长箭头的 size 面积"，全是 signal，没有魔法数字散落各处 |
| `signals`（风玫瑰组） | `roseCx` / `roseCy` / `roseR` / `roseFracMax` / `sectorHalf` | 极坐标中心、半径、径向刻度上限、扇形半角（`dirCat` 是 15° 一档 ⇒ 半角 7.5°） |
| `data: wind` | 读 CSV | **必须写 `"format": {"type": "csv", "parse": {...}}`**：Vega 不按扩展名推断格式，5 个数值字段都要 `"number"`，否则 `dir` / `speed` 是字符串，`angle` 与比例尺全废 |
| `data: grid` | 抽稀 + 求朝向 | `formula` 反解格点下标 `col` / `row` → `filter` 取模抽稀 → `formula` 算 `heading` |
| `data: rose` | 风玫瑰统计 | `formula`（`dirCat % 360` 合并 0°/360°）→ `aggregate`（`count` + `mean speed`）→ `joinaggregate`（全局 `sum` 求总数）→ `formula` 求占比 |
| `data: roseRings` | 径向网格圈的刻度值 | `sequence` 生成器，`start`/`stop`/`step` 全走 signal，输出字段用 `as: "frac"` |
| `data: compass` / `refSpeeds` / `panelTitles` | 三个 inline 小表 | 八方位标签、参考箭头的风速档、两块面板的小标题 |
| `scales: x` / `y` | 等经纬度线性映射 | 域比数据范围各放宽 0.6°（给箭头留出半个身位），**都写了 `"zero": false`** |
| `scales: arrowSize` | 风速 → 箭头 size（面积） | `type: "pow"` + `exponent: 2`，`range: [0, maxArrowArea]`，这条是全图的核心 |
| `scales: speedColor` | 风速 → 颜色 | `linear` + `scheme: "viridis"`，`zero: true` 让 0 m/s 对齐配色起点；矢量场和风玫瑰共用 |
| `scales: roseRadius` | 频率 → 半径 | `type: "sqrt"` ⇒ 扇形**面积**正比于频率；`clamp: true` 保证超出 12.5% 也不会画到面板外 |
| `legends` | 渐变色图例 | `orient: "none"` + `legendX` / `legendY` 手工定位到中间那一列，`format: ".0f"` |
| `marks`（面板小标题） | `text` | 绑 `panelTitles` 两行数据，一次画出两块面板的标号 |
| `marks: vfPanel` | 外层 group | 只负责 `axes`（含 `encode.labels` 改写成 `10°W` / `55°N`）与浅底 `rect` |
| └ 内层 group（`clip: true`） | 裁剪层 | 300 个箭头画在这里；**clip 不能开在外层**，否则轴标签一起被裁掉 |
| └└ `symbol` mark | 箭头本体 | `shape` 吃 signal 给的 path 字符串，`angle` 吃 `heading`，`size` 走 `arrowSize`，`fill` 走 `speedColor`，`tooltip` 里连算出来的像素长度都写进去了 |
| `marks`（参考尺） | `text` + `symbol` + `text` | 手工画的"箭头长度 ∝ 风速"标尺：4 个风速档，全部朝正东（`angle: 90`），尾端对齐 |
| `marks: rosePanel` | 风玫瑰 group | `rule` 辐条 → `arc` 花瓣 → `symbol`(circle) 网格圈 → `rect` 白底衬 → `text` 刻度/方位标签 → `text` 脚注（**顺序即图层**） |
| `marks`（底部注记） | 无 `from` 的 `text` | 把当前 `step` / 方向约定 / 最长箭头像素数写在图上，signal 一变文字就跟着变 |
| `config.axis` | 轴的统一样式 | 字号、轴线/刻度颜色 |

### 关键概念

#### 1. `size` 是面积，长度是 `√size` —— 所以要用 `pow(2)` 比例尺

Vega 渲染自定义 `shape` 时（`vega-scenegraph` 的 `customSymbol`）做的事只有一句：

```js
pathRender(context, parsedPath, 0, 0, Math.sqrt(size) / 2)
```

也就是把你的 path **以原点为中心、按 `√size / 2` 等比放大**。本例三条 path 的竖直跨度都刻意做成
`y ∈ [-1, 1]`（跨度 2），所以

```
箭头像素长度 L = 2 × √size / 2 = √size        ⇒        size = L²
```

想要 `L ∝ speed`，就得让 `size ∝ speed²`。`pow` 比例尺（指数 k）算的是

```
t = (x^k − d0^k) / (d1^k − d0^k)  ,  输出 = r0 + t · (r1 − r0)
```

取 `k = 2`、`domain = [0, sMax]`、`range = [0, A]`（`A = maxArrowPx²`）：

```
size = A · (speed / sMax)²        ⇒        L = √size = maxArrowPx · speed / sMax
```

长度对风速就是**严格线性**的。可以在图上悬停任一箭头验证：tooltip 里的「箭头长度」
= `24.4 px × speed / 12.18`（12.18 m/s 是本数据集的最大风速）。

> 如果偷懒用 `linear` 比例尺映射到 `size`，得到的是**面积**线性、长度按 `√speed` 增长 ——
> 弱风被夸大、强风被压缩，是矢量场里最常见的错。这也解释了本图另一个副作用：
> `pow(2)` 让 0 附近的箭头长度真正趋于 0，所以图上低风速区（左下、中部）几乎看不到箭头。
> 这是诚实的编码，不是 bug；想给个最小可见长度，把 `arrowSize` 的 `range` 起点从 `0` 改成 `9`（=3 px）即可。

#### 2. `angle` 的约定，以及 `dir + 180` 到底该不该加

`symbol` mark 的 `angle` 单位是**度**，正值**顺时针**，`0°` 时字形指**正上方**。
SVG 里就是一句 `transform="translate(x,y) rotate(angle)"`（y 轴向下 ⇒ 正角度顺时针）。
所以只要把 path 画成"指向正上（北）"，`angle` 就可以**直接填罗盘方位角**，一次换算都不用。

真正要想清楚的是数据侧：`windvectors.csv` 的 `dir` 是**气象风向**，即"风从哪个方向来"
（`dir = 225` = 西南风 = 风从西南来）。于是有两种都合法、但语义相反的画法：

| `pointDownwind` | `angle` | 箭头含义 | 用在哪 |
| --- | --- | --- | --- |
| `true`（本例默认） | `(dir + 180) % 360` | 指向风**吹去**的方向 = 真正的速度矢量 v | 矢量场、流线、示踪物输运 |
| `false` | `dir` | 指回风的**来向** | 类似风向标 / 风羽（wind barb）的读法 |

本例把它做成一个 checkbox signal，勾掉就能立刻看到整片箭头翻转 180°；底部注记会同步显示
当前用的是哪条公式。**默认加 180°** 的理由：一是这样画出来的才是物理上的速度矢量，
矢量场的惯例是箭头顺着流动方向；二是官方 Vega-Lite 图库里同一份数据的
"Wind Vector Map" 例子也是把 `dir` 映射到 `[180, 540]`（即 `+180`）。
数据文件本身没有附带元数据，所以这个开关同时也是"请自己核对约定"的提醒。

风玫瑰那一侧用的是**未加 180 的 `dirCat`**：风玫瑰的行业惯例就是画"来向"的频率分布，
花瓣朝西南长，读作"西南风最多"。两块面板方向约定不同，这点已经写进各自的标题与脚注里了。

#### 3. 在 spec 里抽稀：把坐标反解成整数下标

网格是 `0.25°` 等间距、原点 `(-9.875, 45.125)`，所以

```
col = round((longitude + 9.875) / 0.25) = round((longitude + 9.875) × 4)     // 0…79
row = round((latitude  − 45.125) / 0.25) = round((latitude  − 45.125) × 4)   // 0…59
```

再 `filter: datum.col % step === 0 && datum.row % step === 0`。
`step = 4` 时留下 `20 × 15 = 300` 个箭头（可在 inspect 输出里核对 `grid: 300 行`）。

抽稀步长同时喂给箭头尺寸：`cellPx = step × 0.25 × pxPerDeg`，`maxArrowPx = cellPx × arrowScale`。
这样箭头永远和"抽稀后的格距"成比例 —— 把 `step` 拖到 1（4800 个箭头）时箭头自动变细小，
拖到 8 时自动变长，不需要再手调 `arrowScale`。`arrowScale > 1` 就表示相邻箭头会互相搭接。

#### 4. 风玫瑰的极坐标几何

- `arc` mark 的角度单位是**弧度**（注意和 `symbol.angle` 的度不一样！），
  `0` 同样指正上方、顺时针增大。所以 `startAngle = (sector − 7.5) × π/180`、
  `endAngle = (sector + 7.5) × π/180`。
- 半径用 **`sqrt` 比例尺**：`r = R · √(frac / fracMax)`，于是扇形面积
  `½ · Δθ · r² ∝ frac` —— **面积**正比于频率，避免高频方位被半径线性放大而视觉夸张。
- 径向刻度固定到 `roseFracMax = 12.5%`（不跟数据自动伸缩），这样多张风玫瑰能直接叠着比。
  `clamp: true` 兜底：万一某方位超过 12.5%，画到 12.5% 就停，不会戳出面板。
- 网格圈用 `symbol` + `shape: "circle"`。**内置 `circle` 的半径也是 `√size / 2`**，
  所以要画半径 `r` 的圈就写 `size = (2r)²`：

  ```json
  "size": { "signal": "pow(2 * scale('roseRadius', datum.frac), 2)" }
  ```

  这条和第 1 点是同一条规则，正好互相印证。
- 刻度标签压在花瓣上会看不清，所以在文字下面先画一层 `rect` 白色底衬
  （`fillOpacity: 0.85`）。`marks` 数组的顺序就是图层顺序：辐条 → 花瓣 → 网格圈 → 底衬 → 文字。

#### 5. 参考尺：`symbol` 的 `x` 是中心，不是尾端

参考箭头全部朝正东（`angle: 90`），要让**尾端**对齐在 `refX`，就得把中心右移半个长度：

```json
"x": { "signal": "refX + sqrt(scale('arrowSize', datum.speed)) / 2" }
```

表达式里可以直接调 `scale('名字', 值)`，所以"长度 = √size"这条公式在 spec 里也是显式可读的。
文字标签放在 `refX + maxArrowPx + 8`，跟着最长箭头走，拖 `step`/`arrowScale` 时不会被压住。

#### 6. 两个必踩的坑

- **`zero` 默认 `true`。** 写 `"domain": [44.6, 60.4]` 的 `linear` 比例尺，实际域是 `[0, 60.4]`——
  Vega 对连续比例尺的 `zero` 默认取 `true`。纬度轴会画出 `0°N / 20°N / 40°N / 60°N`，
  整张图被压到上面 1/4。必须显式写 `"zero": false`。（`x` 轴的域跨过 0，所以症状被掩盖了；
  这也是为什么两条都要显式写。）
- **`clip` 不要开在带 `axes` 的 group 上。** 坐标轴在 Vega 里就是该 group 的子 mark，
  轴标签、轴标题本来就长在 group 矩形之外，group 一开 `clip` 它们全被裁掉。
  正确做法是再套一层内层 group 专门开 `clip`：内层继承外层的比例尺，只裁真正要裁的图元。
- 顺带一个小坑：想"藏掉"多余的 mark 实例时，用 `opacity: 0` 是没用的 ——
  图元照样进 SVG（`inspect.cjs` 会把那段文字打印两遍）。要么用 `filter` 少给一行数据，
  要么干脆写一个**不带 `from`** 的 mark（只生成一个实例），本例的面板脚注和参考尺标题就是这么做的。

#### 7. 为什么用线性经纬度而不是 `projection`

Vega 有完整的 `projections`（见 demo 16 的 choropleth），但矢量场用投影会多出一个麻烦：
投影会**形变方向**。同一个"正北"，在 Mercator 上还是正北，在 Albers / Orthographic 上
就随位置歪掉了，正确画法要按投影的雅可比在每个点上把方位角旋转一个局部角度 ——
而 Vega 的 `angle` 通道拿不到投影的导数，只能自己在 `formula` 里近似（例如
`atan2` 两个邻近点的投影坐标差）。教学上先用等经纬度线性映射（Plate Carrée）最干净：
方位角就是方位角，`angle` 直接填。

代价是**纬向被拉长**：在 45°–60°N，1° 经度的地面距离只有 1° 纬度的 `cos(lat) ≈ 0.50–0.71` 倍，
本图却把它们画成一样长，所以东西方向在视觉上被拉宽了约 1.4–2 倍。
想按面积正确一点，把 `latSpan` 改成 `15.8 / cos(52.5° × π/180) ≈ 25.9`（面板变矮变宽）即可 ——
但方向角还是会因此不再等角。这就是"要方向对"还是"要距离对"的经典取舍。

## 试一试

1. **验证"长度 ∝ 风速"**：把 `arrowSize` 的 `"exponent": 2` 改成 `1`（等价于普通 `linear`）。
   弱风箭头会明显变长、强风箭头相对变短 —— 因为此时是**面积**线性。悬停对照 tooltip 里的
   「箭头长度」是不是还等于 `24.4 × speed / 12.18`。
2. **翻转方向约定**：取消勾选 `pointDownwind`。整片箭头旋转 180°，底部注记会从
   `angle = dir + 180°` 变成 `angle = dir`。顺手把风玫瑰的 `sector` 也改成 `(datum.dirCat + 180) % 360`，
   看两张图是否重新一致。
3. **抽稀与缩放的相互作用**：把 `step` 拖到 `1`（4800 个箭头，`cellPx ≈ 5.5 px`）再把
   `arrowScale` 拖到 `1.6`。图元统计会从 `path: 358` 涨到 `path: 4858`，箭头开始互相搭接、
   出现摩尔纹 —— 这正是矢量场必须抽稀的理由。
4. **换字形**：`arrowStyle` 选 `wedge` / `triangle`。要加自己的字形，就在 `arrowPath` signal 里
   多写一个分支，**唯一的硬约束是 path 的竖直跨度必须是 2**（`y` 从 `-1` 到 `1`），
   否则第 1 点的长度公式失效。试试把箭尾放在原点（`M0,0L…L0,-2Z`）——
   箭头会变成"从格点长出去"而不是"以格点为中心"。
5. **让风玫瑰跟着抽稀走**：把 `data: rose` 的 `"source": "wind"` 改成 `"source": "grid"`。
   拖 `step` 时花瓣会跟着抖 —— 这就是"抽稀只该影响画图、不该影响统计"的现场演示。
6. **给箭头一个最小可见长度**：`arrowSize` 的 `"range"` 起点从 `0` 改成 `9`（√9 = 3 px）。
   低风速区重新可见，但长度不再严格正比于风速（变成 `√(9 + (A−9)·(s/sMax)²)`）——
   自己判断这笔交易值不值。

## 参考

- [Symbol mark](https://vega.github.io/vega/docs/marks/symbol/) —— `shape` 可以直接吃 SVG path 字符串；`angle`、`size` 通道的定义
- [Arc mark](https://vega.github.io/vega/docs/marks/arc/) —— `startAngle` / `endAngle`（弧度）/ `innerRadius` / `outerRadius`
- [Rule mark](https://vega.github.io/vega/docs/marks/rule/) · [Group mark](https://vega.github.io/vega/docs/marks/group/)（`clip` 与嵌套作用域）
- [Scales](https://vega.github.io/vega/docs/scales/) —— [`pow`](https://vega.github.io/vega/docs/scales/#pow) · [`sqrt`](https://vega.github.io/vega/docs/scales/#sqrt) · `zero` / `clamp` 的默认值
- [Filter](https://vega.github.io/vega/docs/transforms/filter/) · [Formula](https://vega.github.io/vega/docs/transforms/formula/) · [Aggregate](https://vega.github.io/vega/docs/transforms/aggregate/) · [JoinAggregate](https://vega.github.io/vega/docs/transforms/joinaggregate/) · [Sequence](https://vega.github.io/vega/docs/transforms/sequence/)
- [Legends](https://vega.github.io/vega/docs/legends/) —— `orient: "none"` + `legendX` / `legendY` 手工定位
- [Axes](https://vega.github.io/vega/docs/axes/) —— `encode.labels` 改写刻度文字
- [Signals](https://vega.github.io/vega/docs/signals/) · [Expressions](https://vega.github.io/vega/docs/expressions/)（`scale()`、`format()`、`length(data(...))`）
- [Projections](https://vega.github.io/vega/docs/projections/) —— 想换成真投影时看这里
- 同数据的官方 Vega-Lite 例子：[Wind Vector Map](https://vega.github.io/vega-lite/examples/point_angle_windvector.html)（它把 `dir` 映射到 `[180, 540]`）

## 与 matplotlib 的对照

这一节要诚实：**画一张普通风场图，matplotlib 比 Vega 省事。** 但把"交互 + 统计 + 可分发"一起算进来，
账就翻过来了。

### matplotlib 明显更省事的地方

- **`quiver` 是内置的**，而且专门为矢量场做过优化：

  ```python
  u = -speed * np.sin(np.deg2rad(dir))   # "来向" → 速度分量，负号就是那个 180°
  v = -speed * np.cos(np.deg2rad(dir))
  q = ax.quiver(lon[::4, ::4], lat[::4, ::4], u[::4, ::4], v[::4, ::4],
                speed[::4, ::4], cmap='viridis', angles='xy', pivot='mid')
  ax.quiverkey(q, 0.9, 1.02, 10, '10 m/s')     # ← 参考尺，一行
  ```

  Vega 这边：箭头字形要自己写 path，参考尺要自己摆 `symbol` + `text`（本例约 40 行 JSON），
  抽稀要自己反解格点下标（numpy 直接 `[::4, ::4]` 切片）。
- **`barbs`（风羽）Vega 完全没有**。气象上标准的"长羽 = 10 kt、短羽 = 5 kt、三角 = 50 kt"
  在 matplotlib 里是 `ax.barbs(...)` 一行；在 Vega 里得按风速动态拼 path 字符串，非常难写。
- **`streamplot`（流线）Vega 也没有**。流线要沿场做数值积分，那是计算而不是编码，
  Vega 的变换库里没有对应件。
- **真投影 + 向量旋转**：cartopy 里 `ax.quiver(..., transform=ccrs.PlateCarree())`
  会自动把向量按投影旋转到正确方位。Vega 的 `projection` 只搬点位，不管方向 ——
  这就是本例宁可用线性经纬度的原因（见上文第 7 点）。
- **向量运算**：算涡度、散度、插值到新网格，numpy/xarray 顺手；Vega 的变换语言里做不了。

### Vega 明显更省事的地方

- **"角度"和"长度"是声明式的视觉通道，不是先算好的 u/v。**
  Vega 直接 `angle ← dir`、`size ← speed`；matplotlib 必须先把极坐标转成 `u/v` 笛卡尔分量，
  那个 `180°` 约定就藏在两个负号里 —— 一旦写错，图上没有任何提示。
  本例把它做成一个**带标签的 checkbox**，翻转前后一眼对照，还会把当前公式写在图上。
- **交互几乎免费。** `step` / `arrowScale` / `pointDownwind` / `arrowStyle` 四个控件，
  在 Vega 里就是 4 个带 `bind` 的 signal（约 20 行 JSON），改动会沿数据流自动重算
  抽稀 → 尺寸 → 图元。matplotlib 要 `matplotlib.widgets.Slider` + 回调里手动
  `q.set_UVC(...)` / `fig.canvas.draw_idle()`，而且**存成图片就全没了**；
  想上网页得整套换成 ipywidgets/Bokeh/Plotly。
- **悬停 tooltip**：Vega 是 `symbol` 上的一个 `tooltip` 属性；matplotlib 要装 `mplcursors`
  或自己接 `motion_notify_event` 做最近邻查找。
- **风玫瑰**：matplotlib 没有内置。要么装第三方 `windrose` 包，要么手搓
  `subplot(projection='polar')` + `set_theta_zero_location('N')` + `set_theta_direction(-1)` + `ax.bar`，
  还得自己 `groupby` 分箱统计。Vega 用 `arc` + `sqrt` 比例尺 + `aggregate`/`joinaggregate`
  在**同一份 spec** 里搞定，零外部依赖，而且和左图共用同一条色标 —— 这种"多面板共享比例尺"
  在 matplotlib 里要手动传 `norm` / `cmap` 保证一致。
- **统计写在图里。** `aggregate` + `joinaggregate` + `sequence` 让"分组计数 → 求总数 → 算占比 →
  生成网格圈刻度"全在 spec 中；matplotlib 侧这些都是绘图前的 pandas 代码，
  图和统计逻辑分居两处，容易漂移。
- **spec 是可分发、可校验的产物。** 一份 JSON 就能被浏览器、Node（本项目的
  `tools/validate.cjs` 就在无头 Node 里跑完整数据流并 `toSVG`）、Python（altair）复用；
  matplotlib 的产物是图片，逻辑锁在 Python 进程里。

### 一句话结论

**静态气象制图（尤其要真投影、风羽、流线）继续用 matplotlib + cartopy；
要"读者能自己拖着看、且能塞进网页/报告里"的矢量场，Vega 这套
`symbol + 自定义 path + angle + pow(2) size` 的写法值得记住。**
代价就是必须记牢两条约定：`angle` 是度、顺时针、0°=北；`size` 是面积、长度 = `√size`。
