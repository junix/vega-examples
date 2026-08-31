# 36 · 自定义形状与渐变

## 学习目标

把 Vega 里「画任意形状」的几种手段一次看全，并搞清三个最容易踩的细节：

1. `symbol` 的 `shape` 通道**可以直接吃一整串 SVG path**（认不出的字符串就当 path 用），
   path 的坐标系**原点在图形中心**，Vega 按 `√size / 2` 等比缩放它。
2. `size` 是**面积**（准确说是外接正方形的面积）：`size` ×4，图形边长只 ×2。
3. `fill` 通道除了颜色字符串，还能给 `{"gradient": "linear" | "radial", "stops": [...]}`
   对象；线性渐变还能用表达式函数 `gradient(scaleName, p0, p1, count)`
   直接从内置配色 scheme 生成，省掉手写一堆十六进制。

顺带演示 `sequence` 变换凭空造数据、`trail` mark 的变宽线，以及 `group` mark 的
`clip: false` / `clip: {signal}` / `clip: {path}` 三种裁剪写法。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/36-custom-shapes-gradients/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals`（前 7 条） | 可拖的参数 | `shapeSize` / `curveKind` / `roseK` / `samples` / `trailMax` / `spiralTurns` / `clipOn`，全部 `bind` 出控件 |
| `signals`（`pw`…`rowC`） | 面板网格几何 | 面板宽高与行列原点都由 signal 算，改 `pw`/`ph` 整张图跟着重排 |
| `signals`（`tMax` / `curveEq` / `curveRange` / `dotStride`） | 派生量与说明文字 | 图上的方程文字是 signal 拼出来的字符串，不是写死的 |
| `data.panels` | 六个面板的骨架 | 只存 `col`/`row`，`px`/`py` 由 `formula` 从布局 signal 算出 |
| `data.shapes` | ① 的 8 个形状 | 4 条自定义 path + 4 个内置名；`window: row_number` 给行号，再用 `formula` 折成 4×2 网格 |
| `data.sizes` | ② 的 5 个 size | `formula` 算 `edge = sqrt(size)` —— 这正是 Vega 内部缩放因子 `√size/2` 的两倍 |
| `data.theta` / `data.curve` / `data.curve-dots` | ③ 的参数方程 | `sequence` 造 θ 序列 → `formula` 逐步算 `rr`→`ux/uy`→像素 `cx/cy` → `filter` 抽稀出采样点 |
| `data.wave` | ④ 的渐变 area | 同样是 `sequence` + `formula`，无外部文件 |
| `data.spiral` | ⑤ 的螺线 | `sequence` 造 θ，`w` 就是 trail 的线宽（px） |
| `data.points` / `walk` / `clipDots` | 唯一的外部数据 | `points.json`（100 个按角度排序的带噪声环形点）；`joinaggregate: count` 数出 `n`，避免把 100 写死 |
| `scales` | 配色与坐标映射 | 颜色一律 `{"scheme": ...}`（tableau10 / viridis / plasma / magma / blueorange）；`walkX/Y`、`clipX/Y` 是把数据坐标映到**面板局部像素**的 linear scale |
| `marks`（前 3 条） | 面板底板 + 标题 + 要点 | 都 `from: {data: "panels"}`，一条数据一个面板，零重复 |
| `marks`（6 个 `group`） | 六个面板 | group 的 `x`/`y` 决定子 mark 的坐标原点，所以面板内部一律写「面板局部坐标」 |

### 关键概念

**① `shape` 通道 = 形状名或 SVG path**

`symbol` mark 解析 `shape` 的逻辑就一句：认识的名字（`circle` `square` `cross`
`diamond` `triangle` `triangle-up/down/left/right` `arrow` `wedge` `stroke`）
走内置画法，**认不出的整串当 SVG path 交给 path 解析器**。所以：

```json
"shape": { "value": "M0,-1 L0.225,-0.309 L0.951,-0.309 … Z" }
```

- **原点在图形中心。** path 里的 `(0,0)` 就是 symbol 的 `x`/`y` 落点，
  没有任何自动居中/自动对齐包围盒的步骤 —— 你把星星画在 `(5,5)` 附近，
  它就会整体偏移 5px×`√size/2`。
- **写在 `[-1, 1]` 的方框里最省事。** Vega 渲染时执行
  `pathRender(ctx, parsedPath, 0, 0, √size / 2)`，即把 path 坐标乘 `√size/2`。
  所以 `[-1,1]` 的 path 在 `size` 下的实际边长恰好是 `√size` px，
  和内置形状的量级完全一致（内置 `circle` 的半径也是 `√size/2`）。
- **y 轴向下。** 屏幕坐标系，`y = -1` 是上方。本例的五角星尖朝上，
  所以第一个点写成 `M0.000,-1.000`。

本例的四条自定义 path（都是 `[-1,1]` 归一化的）：

| 形状 | 生成方式 |
| --- | --- |
| 五角星 | 10 个顶点交替取外半径 1、内半径 0.382，角度从 −90° 起每 36° 一个 |
| 心形 | 两段三次贝塞尔：`M0,0.95 C-1.05,0.15 -0.85,-0.95 0,-0.40 C0.85,-0.95 1.05,0.15 0,0.95 Z` |
| 雪花 | 12 个顶点交替取外半径 1、内半径 0.34（等于 12 角星） |
| 闪电 | 7 点折线多边形，手工给的坐标 |

**② `size` 是面积**

`size` 的语义是**外接正方形的面积**，边长 `= √size`：

| `size` | 100 | 225 | 400 | 900 | 1600 |
| --- | --- | --- | --- | --- | --- |
| 边长 (px) | 10 | 15 | 20 | 30 | 40 |

面板 ② 上每个图形都套了一个红色虚线框，边长就是 `√size`，
`size` 从 100 到 400（×4）时框只从 10px 变到 20px（×2）。
推论：**想让某个长度线性正比于数据，scale 要用 `sqrt` 或 `pow`**，
直接把数值喂给 `size` 得到的是「面积正比」。

注意 `trail` 是例外：`trail` 的 `size` 是**线宽（直径，px）**，不是面积。
面板 ⑤ 里 `w` 从 1 线性长到 `trailMax`，画出来就是从 1px 加宽到 `trailMax` px。

**③ `gradient` 的 stops 语法**

`fill` / `stroke` 可以给一个渐变对象（写在 `{"value": {...}}` 里）：

```json
"fill": { "value": {
  "gradient": "radial",
  "x1": 0.35, "y1": 0.32, "r1": 0.02,
  "x2": 0.5,  "y2": 0.5,  "r2": 0.55,
  "stops": [
    { "offset": 0,    "color": "#ffffff" },
    { "offset": 0.45, "color": "#e45756" },
    { "offset": 1,    "color": "#5c1616" }
  ]
} }
```

- `stops` 是**必填**的数组，每项 `{offset, color}`；`offset` ∈ [0, 1]，要单调递增。
- 几何参数全是 **0~1 的相对值，锚在这个 mark 自己的包围盒上**（不是画布，也不是 group）。
  所以一排 rect 里每根柱子都会得到一份独立的渐变，而不是共享一条横跨全图的渐变。
- `linear` 默认 `x1:0, y1:0, x2:1, y2:0`（水平，左→右）；
  写 `x1:0, y1:0, x2:0, y2:1` 就是竖直（上→下）。
- `radial` 默认 `x1:0.5, y1:0.5, r1:0, x2:0.5, y2:0.5, r2:0.5`
  （从包围盒中心向外）。把 `x1/y1` 偏一点、`r1` 给个很小的值，就是面板 ④ 右侧那种「高光球」。
- **线性渐变有捷径**：表达式函数 `gradient(scaleName, p0, p1, count)` 会拿指定 scale 的
  `domain` 采 `count` 个 tick，逐个求色，自动装成 `{gradient:"linear", stops:[...]}`。
  本例 ④ 的 area 用的是 `{"signal": "gradient('ramp', [0, 0], [0, 1], 8)"}`，
  配色直接来自 `viridis` scheme，spec 里一个十六进制都不用写。
  它**只能产出 linear**，径向渐变仍需手写 stops。

**④ `sequence` 变换 = 凭空造数据**

`{"type": "sequence", "start": 0, "stop": …, "step": …, "as": "t"}`
生成 `[start, stop)` 的等差数列，每个数一条记录（字段名由 `as` 给，默认 `data`）。
`stop` 是**开区间**，所以本例写 `stop = tMax + tMax/samples/2` 才能把 θ = tMax 那一点包进来。
三个参数都能接 signal，于是滑块一动，整条曲线的采样重算。

参数方程的算法就是「`sequence` 造参数 → `formula` 一步步推坐标 → `line` 串起来」：

```
rr = cos(roseK · θ)                     玫瑰线的极径（可为负，落在对侧）
ux = rr · cos θ,  uy = rr · sin θ       极坐标 → 单位圆坐标
cx = curveCx + curveR · ux              单位圆 → 面板局部像素
cy = curveCy + curveR · uy
```

利萨如曲线换成 `ux = sin(a θ)`、`uy = sin(b θ)`（本例 `b = a + 1`，与 `a` 必然互素）；
阿基米德螺线换成 `rr = θ / θmax` 并把 θ 上限放到 6π。
**同一个 `formula` 数组是顺序执行的**，所以后面的 `formula` 能直接用前面刚算出来的
`datum.rr`、`datum.ux`。

**⑤ `group` 的三种 `clip`**

面板 ⑥ 的三个子 group **尺寸、子 mark、数据全一样**，只有 `clip` 不同：

| 写法 | 效果 |
| --- | --- |
| `"clip": false`（默认） | 不裁。子 mark 画出 group 边界也照样显示，会压到邻居身上 |
| `"clip": {"signal": "clipOn"}` | 裁成 group 的 `width` × `height` 矩形；能用 signal 动态开关 |
| `"clip": {"path": "M62,-17 … Z"}` | 裁成**任意 SVG path**。坐标是该 group 的**局部坐标，不做归一化** |

灰色虚线框画的就是子 group 的 `width` × `height`，方便对照裁剪边界。
第三个 group 的 clip path 是一个五角星（外半径 74、内半径 74×0.382、圆心 (62, 57)），
注意它是**绝对的局部像素坐标**，跟 `symbol.shape` 那种 `[-1,1]` 归一化 path 是两套约定。

`clip` 还有 `{"sphere": "projName"}` 一种（裁到地理投影的球面轮廓，见地图类 demo）。

**关于 `image` mark：本例故意不演示。** `image` 的 `url` 必须指向一个真实的图片文件，
而本仓库的 `assets/data/` 只有数据集、没有位图资源，契约也不允许新增数据文件；
用 `data:` URI 内联一张图又会在纯 Node 校验器里走不通（`toSVG()` 拿不到图片尺寸）。
`image` 的用法本身很直白：`{"type": "image", "encode": {"update": {"url": …, "x": …, "y": …,
"width": …, "height": …, "aspect": …, "align": …, "baseline": …}}}`，
真要用时把 `url` 指向 demo 目录下的图片即可。

## 试一试

1. 把 `shapeSize` 从 100 拖到 1600，同时盯住面板 ② 的红色虚线框：
   `size` ×16，边长只 ×4。再把 ② 里 `sizes` 的 `100` 改成 `50`，看边长是不是变成 `√50 ≈ 7`
   （标签用的是 `format(datum.edge, 'd')`，会四舍五入成 `7`）。
2. 改 `data.shapes` 里心形那条的 path，把 `M0,0.95` 改成 `M0.5,0.95`：
   整个心形会向右偏 `0.5 × √size/2` px —— 这就是「path 原点即 symbol 落点」。
   顺手再加一条自己的 path（比如正六边形），会自动占到网格的第 9 格
   （`window: row_number` + `formula` 会替你排好位置）。
3. 把 ③ 的 `samples` 拖到 45，玫瑰线立刻变成有棱有角的折线 ——
   `line` mark 从来只会连直线段，「曲线」是采样密度带来的错觉。
   再把 `line` 的 `interpolate` 从 `"linear"` 改成 `"basis"` 或 `"catmull-rom"`，
   看它在稀疏采样下如何补平滑。
4. 把 ④ area 的 `gradient('ramp', [0, 0], [0, 1], 8)` 改成
   `gradient('ramp', [0, 0], [1, 0], 8)`（竖直改水平），或者把 `scales.ramp` 的
   `scheme` 换成 `"magma"` / `"blueorange"`。再把 count 从 `8` 改成 `2`，
   看 stops 变少后渐变怎么变生硬。
5. 把 ⑥ 第一个 group 的 `"clip": false` 改成 `true`，三块就一模一样了；
   再把第三个 group 的 clip path 换成一个圆形近似（或直接抄 ① 里雪花 path，
   记得先手工把它从 `[-1,1]` 放大平移到 `(62, 57)` 附近，否则会裁出个几乎全空的 group）。
6. 把 ⑤ 的 `trailMax` 拖到 30、`spiralTurns` 拖到 5，观察 `trail`
   在相邻采样点很近时如何用圆头拼接（实现是逐段画「梯形 + 两端半圆」）。

## 参考

- [Symbol mark](https://vega.github.io/vega/docs/marks/symbol/) —— `shape` 支持自定义 SVG path，`size` 的面积语义
- [Trail mark](https://vega.github.io/vega/docs/marks/trail/) —— `size` 是线宽
- [Path mark](https://vega.github.io/vega/docs/marks/path/) —— `path` / `scaleX` / `scaleY` / `angle`
- [Line mark](https://vega.github.io/vega/docs/marks/line/) · [Area mark](https://vega.github.io/vega/docs/marks/area/) · [Arc mark](https://vega.github.io/vega/docs/marks/arc/)
- [Group mark](https://vega.github.io/vega/docs/marks/group/) —— `clip` 的 `false` / `{signal}` / `{path}` / `{sphere}`
- [Mark 通用属性 · Gradients](https://vega.github.io/vega/docs/marks/#gradient) —— `linear` / `radial` 与 `stops`
- [Sequence 变换](https://vega.github.io/vega/docs/transforms/sequence/) · [Formula 变换](https://vega.github.io/vega/docs/transforms/formula/) · [Window 变换](https://vega.github.io/vega/docs/transforms/window/) · [JoinAggregate 变换](https://vega.github.io/vega/docs/transforms/joinaggregate/)
- [表达式函数 `gradient`](https://vega.github.io/vega/docs/expressions/#gradient) —— 从 scale 生成线性渐变
- [Scheme 配色](https://vega.github.io/vega/docs/schemes/)

## 与 matplotlib 的对照

**这张图在 Vega 里靠什么语法元素表达出来**

| 能力 | Vega 的表达 |
| --- | --- |
| 自定义图形 | `symbol` 的 `shape` 通道吃 SVG path 字符串；**可以逐条数据不同**（`{"field": "shape"}`） |
| 参数方程 | `sequence` 变换造参数 + `formula` 变换推坐标 + `line` mark，**全在 JSON 里** |
| 渐变 | `fill` 给 `{gradient, stops}` 对象；线性渐变可由 `gradient(scale, p0, p1)` 从 scheme 自动生成 |
| 变宽线 | `trail` mark，`size` 逐点绑数据 |
| 裁剪 | `group` 的 `clip: false / {signal} / {path}` |
| 交互 | `signals` + `bind`，7 个控件零 JS |

**换成 matplotlib / seaborn 要付什么代价**

- **自定义 marker：** matplotlib 的 `marker` 可以给 `Path` 对象或
  `(numsides, style, angle)` 元组，但**它不吃 SVG path 字符串** ——
  得先 `matplotlib.path.Path(vertices, codes)` 手工构造顶点数组与命令数组，
  或者装 `svgpath2mpl` 之类第三方包把 `d` 属性转成 `Path`（还要自己 `.transformed()` 居中、翻 y 轴）。
  而且 `plt.scatter` 的 `marker=` **只能给一个**，想让每个点形状不同必须**循环调用**
  `scatter`（或 `PathCollection` 手拼），Vega 这边只是 `"shape": {"field": "shape"}`。
- **`s` 也是面积（这一点两边一样）：** matplotlib `scatter(s=...)` 的单位是 points²，
  同样是面积语义，`s` ×4 时直径 ×2。**但边界不同**：matplotlib 的 `s` 是 points²（物理单位，
  受 DPI 影响），Vega 的 `size` 是外接正方形的 px²。跨 DPI 复现尺寸时 matplotlib 更麻烦。
- **渐变填充：matplotlib 没有「渐变填充」这个概念。** Patch 只有单色 `facecolor`。
  常见做法是：(a) 用 `imshow` 画一张渐变位图，再用 `set_clip_path(patch)` 裁成想要的形状；
  (b) 把区域切成几百条窄带、逐条上色；(c) 用 `LinearSegmentedColormap` +
  `LineCollection` 给折线分段上色。三种都是**手写十几行胶水**，且都是位图或分段近似，
  不像 SVG `<linearGradient>` 那样是矢量的一等公民。径向渐变更麻烦，通常要自己算距离场再 `imshow`。
- **变宽线：** matplotlib 的 `Line2D.set_linewidth` 是**整条线一个值**。
  沿线变宽只能用 `LineCollection`（把线拆成 N 段，每段给一个 `linewidth`）——
  段与段的接头处会露出台阶，除非再自己算法线、拼多边形。
  Vega 的 `trail` 直接就是「逐段梯形 + 两端半圆」的实现，接头是圆滑的。
- **裁剪：** 这一项 matplotlib 其实不弱：`artist.set_clip_path(path, transform)`
  就能裁到任意 `Path`，语义和 Vega 的 `clip: {path}` 对得上。
  差别在于 Vega 里裁剪是**声明在 group 上、对整棵子树生效**，
  matplotlib 要对**每个 artist 逐个** `set_clip_path`（或者靠 axes 的默认矩形裁剪）。
- **交互：** 7 个滑块/下拉/复选在 Vega 里是 7 段 `bind` JSON。
  matplotlib 要 `matplotlib.widgets.Slider` + 回调函数 + 手工 `set_offsets`/`set_data`/
  `fig.canvas.draw_idle()`，每个控件十几行；换到 notebook 还得改用 `ipywidgets`，
  换到网页则整套重写。
- **参数方程：** 这块 matplotlib 反而**更省事**：`t = np.linspace(0, 2*np.pi, 720)`、
  `plt.plot(np.cos(k*t)*np.cos(t), np.cos(k*t)*np.sin(t))` 两行完事，
  比本例的 `sequence` + 五个 `formula` 短得多，可读性也更好。
  Vega 绕这一大圈换来的是「参数从 UI 控件来、改一下整条数据流自动重算」。

**反过来，matplotlib 更省事的地方**

- 任何一次性、参数写死的图：NumPy 一行算完直接画，不用为「让读者能拖」付结构成本。
- 极坐标：`projection='polar'` 直接有，Vega 得像本例这样自己做极坐标→像素的换算。
- 数学排版：`$r=\cos(5\theta)$` 用内置 mathtext 就渲染成公式，Vega 的 `text`
  只能拼纯文本（本例的 `curveEq` 就只能写成 `r = cos(5 θ)`）。
- 多面板：`plt.subplots(3, 2)` 一行搞定，还自带 `tight_layout`。
  本例的 6 个面板要自己用 signal 算 `px`/`py` 网格，并手工保证不溢出。
- 输出到论文：`savefig('x.pdf')` 直接出矢量 PDF，字体嵌入、DPI、bbox 都有成熟开关。
