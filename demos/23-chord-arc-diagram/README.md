# 23 · 弦图与弧线邻接图：同一张网络的两种手工几何

《悲惨世界》人物共现网络（`miserables.json`，77 点 / 254 边）用两种画法并排展示：

- **左：弦图（chord diagram）** —— 每个角色占圆周上一段弧，弧长 ∝ 它在子图里的加权度数；
  每条边画成圆内的一条二次贝塞尔曲线（弦），起止点落在两端弧段内部各自的小格子里。
- **右：弧线邻接图（arc diagram）** —— 同一批角色等距排在一条水平线上，
  每条边画成基线上方的半椭圆弧，弧宽 = 两端点距离，弧高 = 半宽 × `arcRatio`。

两个面板共用一套颜色（社群 `group`）、一套次序（`nodeOrder`）和一个 `focus` 信号，
悬停任一面板的节点，两个面板同时只留下与它相连的边。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/23-chord-arc-diagram/
```

## 学习目标

1. **用 Vega 变换做"取子图"**：77 点 254 边直接画会糊成一团。子集不是在外部脚本里挑好再喂进来，
   而是全程用 `fold` → `aggregate` → `lookup` → `window` → `filter` 表达，
   于是 `topN` 可以做成一根滑杆，拖动即重算整张图。
2. **`fold` / `pivot` 是「边表 ⇄ 端点表」的一对逆变换**。图算法里最常见的需求是"按节点聚合边"，
   Vega 没有专门的图变换给你，但 `fold` 把每条边摊成两行端点后，它就退化成一次普通 `aggregate`；
   算完角度再用 `pivot` 把两行收回一行，一条边就重新有了"起点角 + 终点角"两个字段。
3. **`lookup` + `default: null` 当内连接（inner join）用**：查不到就填 `null`，紧跟一个 `filter`，
   就实现了"两端都必须在 topN 里"的边过滤。
4. **`pie` 变换 + 手工 padAngle**：`pie` 只按字段值把 `[0, 2π]` 连续切开，没有间隙参数；
   自己把每段两端各收缩 `padAngle/2`，就得到均匀的弧段间隙。
5. **`window` 的两种用法**：不分区时 `row_number` 用来做全局排名（切 topN）；
   按 `nodeIdx` 分区时 `sum` 变成**分区内累计和**，正是"把一段弧再细分给它的每条边"所需要的前缀和。
6. **`path` mark 手写 SVG 路径**：`Q`（二次贝塞尔）画弦，`A`（椭圆弧）画弧线图的边。
   Vega 不内置这两种图，但只要能把路径字符串算出来，`path` mark 就能画。
7. **`group` mark 当坐标容器**：两个面板各是一个 `group`，内部所有几何都相对面板左上角，
   于是"面板 2 整体右移 510px"只需要改 `arcX0` 一个信号。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
|------|------|----------|
| `signals` 前 6 个 | 可交互参数 | `topN` 取几个角色、`padAngle` 弧段间隙、`chordBundle` 弦的弯曲度、`arcRatio` 半椭圆纵横比、`linkOpacity` 非高亮边透明度、`nodeOrder` 圆周次序（group / strength） |
| `signals` 后半 | 派生的布局常量 | `panelW = (width - panelGap)/2`；`chordCx/chordCy/chordR/chordRi`；`arcX0 = panelW + panelGap`；`arcBaseY`。全部由 `width`/`height` 推出来，改画布尺寸不用逐个改数字 |
| `signals.focus` | 交互状态 | `@chordArc:mouseover` 与 `@arcDot:mouseover` 都写 `datum.index`，`mouseout` 写回 `null`。两个面板的节点 mark 更新同一个信号，于是高亮天然联动 |
| `data: nodes-all` / `links-all` | 一个文件读两次 | `"format": {"type":"json","property":"nodes"}` 与 `property:"links"`。`links-all` 顺手把 `value` 复制成 `weight`，后面所有聚合都用 `weight`，避免和 `pivot` 的 `value` 参数混淆 |
| `data: all-ends` | `fold` 摊端点 | `fields: ["source","target"]`、`as: ["role","nodeIdx"]`。一条边变两行：`role` 记住它原本是 `source` 还是 `target`（`fold` 的 key 就是**字段名**），`nodeIdx` 是节点下标。254 → 508 行 |
| `data: degree-all` | 全图度数 | `aggregate` groupby `nodeIdx`，`ops: ["sum","count"]` / `fields: ["weight", null]`（`count` 的 field 写 `null`）→ `strength`（加权度数）与 `degree` |
| `data: nodes-scored` | 度数贴回节点 + 排名 | `lookup` 把 `strength`/`degree` 写进节点表（`default: 0` 覆盖孤立点）；`window` 按 `strength` 降序取 `row_number` 当 `rank`。用 `row_number` 而不是 `rank`，是因为并列时 `rank` 会多给行，切不出恰好 topN 个 |
| `data: nodes-top` | 取子集 | `filter: datum.rank <= topN` |
| `data: links-sub` | 取子图的边 | 一次 `lookup`（`fields: ["source","target"]` × `values: ["name","group"]` × 4 个 `as`）+ 一次 `filter: datum.srcName != null && datum.tgtName != null`，等价于对 `nodes-top` 做内连接。再补 `endA`/`endB`/`linkId` 三个字段 |
| `data: sub-ends` / `sub-degree` | 子图内的度数 | 对 `links-sub` 再 `fold` 一次，聚合出 `subStrength`。**必须重算**：全图度数里含有指向被裁掉节点的边，用它分配角度会让弧长之和超过圆周 |
| `data: chord-nodes` | 弧段布局 | `lookup subStrength` → `filter > 0`（丢掉孤立点）→ `formula orderKey` → `collect` 定圆周次序 → `pie` 分配角度 → 三个 `formula` 收缩出 `a0`/`a1`/`aMid` |
| `data: chord-ends` | 弦的锚点角度 | `lookup` 取回所属弧段的 `a0`/`a1`/`subStrength` → `window`（`groupby: ["nodeIdx"]`，按 `weight` 降序）求分区累计和 `cum` → `formula` 算 `frac` 与 `ang` |
| `data: chord-links` | `pivot` 收回一行 | `pivot` 的 `field: "role"`（取值 `endA`/`endB`）变成两个新字段，`value: "ang"`。`groupby` 里必须列全后面还要用的字段（`weight`/`source`/`target`/`srcName`/`tgtName`/`srcGroup`），因为 `pivot` 本质是 `aggregate`，不在 `groupby` 里的字段会被丢掉 |
| `scales` | 4 把尺子 | `groupColor`（ordinal / `category10`）、`nodeX`（point，域取自 `chord-nodes.name`，**次序就是 `collect` 排好的次序**）、`nodeSize`（linear，符号面积）、`linkWidth`（sqrt，线宽） |
| `legends` | 三个 `orient: "none"` 图例 | 顶层图例默认贴在画布边缘会压住面板，所以改成 `orient: "none"` + `legendX`/`legendY` 手工摆到顶部空白带（`topBand`）。第三个用 `symbolType: "stroke"`，画出来是线段而不是圆点 |
| `marks[0]` | 面板小标题 | 一个 `text` mark 从 2 行的内联数据出，`x` 用 `datum.side === 'chord' ? 0 : arcX0` 选面板 |
| `marks[1]` `chordPanel` | 左面板 group | 画三层：`chordRibbon`（弦，在最底）→ `chordArc`（弧段）→ 径向标签 |
| `marks[2]` `arcPanel` | 右面板 group | 画四层：基线 `rule` → 边 `path` → 节点 `symbol` → 竖排标签 |

### 关键概念 1：弧段的角度是怎么算出来的

`pie` 变换做的事只有一句话：按数据当前顺序，把 `[startAngle, endAngle]` 这段角度
按字段值的比例连续切开。设排好序的节点为 $i = 0 \dots n-1$，强度为 $s_i$，$S = \sum s_i$，则

```
k        = 2π / S                       # 每单位强度对应的弧度
pieFrom_i = k · Σ_{j<i} s_j             # 前缀和
pieTo_i   = k · Σ_{j≤i} s_j
```

`pie` 没有 `padAngle`。间隙是自己加的 —— **两端各向内收缩 `padAngle/2`**：

```
a0_i  = pieFrom_i + padAngle/2
a1_i  = pieTo_i   − padAngle/2
aMid_i = (a0_i + a1_i) / 2
```

相邻两段之间因此空出 `padAngle`（前一段少了 `padAngle/2`，后一段也少了 `padAngle/2`），
而且间隙宽度处处相同、与弧长无关。代价是每段弧的角度都比"真实比例"少了 `padAngle`，
`padAngle` 拖大之后小弧段会被吃掉 —— 拖着看就明白为什么 `padAngle` 不能太大。

圆周次序由 `collect` 决定，`orderKey` 让它可切换：

```
orderKey = nodeOrder === 'group' ? datum.group : 0
collect sort: [orderKey 升, subStrength 降]
```

`nodeOrder = 'strength'` 时 `orderKey` 恒为 0，升序排序退化成空操作，于是纯按强度降序排；
`nodeOrder = 'group'` 时先按社群聚团、团内再按强度。

### 关键概念 2：弦的锚点落在弧段内部的哪里

一个节点的弧段要再分给它自己的每条边，否则该节点的所有弦都从同一个点射出，会挤成一束。
`chord-ends` 里每一行是"一条边的一个端点"，`window` 在 `nodeIdx` 分区内按 `weight` 降序做累计和：

```
cum   = Σ (本节点内，排在自己之前和自己) weight     # 前缀和，含自身
frac  = (cum − weight/2) / subStrength              # 自己那一小格的中点，∈ (0, 1)
ang   = a0 + frac · (a1 − a0)                       # 映射回该弧段的角度区间
```

因为 `subStrength` 就是"该节点所有端点行 `weight` 之和"（同一份 `sub-ends` 聚合出来的），
所以 `cum` 恰好从 `0` 走到 `subStrength`，`frac` 必然落在 `(0, 1)` 内，锚点不会跑出弧段。

### 关键概念 3：从角度到坐标，再到贝塞尔路径

**Vega 的 `arc` mark 用的是 d3 约定：角度 0 指向 12 点方向，顺时针为正。**
所以角度 θ、半径 r 处的点是

```
x = cx + r · sin(θ)
y = cy − r · cos(θ)        ← 注意是减，因为屏幕 y 轴朝下
```

弦画在弧段内圈 `chordRi = chordR − chordThickness` 上。控制点在**圆心**与**弦中点**之间插值：

```
Qx = cx + chordBundle · ((x1 + x2)/2 − cx)
Qy = cy + chordBundle · ((y1 + y2)/2 − cy)
path = "M x1,y1 Q Qx,Qy x2,y2"
```

- `chordBundle = 0` → 控制点就是圆心，曲线最弯，所有弦向中心收束（经典弦图观感）。
  二次贝塞尔在 $t=0.5$ 处的点是 $(P_1 + 2C + P_2)/4$，取 $C$ 为圆心时它离圆心只有 $|P_1+P_2|/4$，
  所以曲线**贴近**圆心但并不都穿过同一点。
- `chordBundle = 1` → 控制点落在弦中点，二次贝塞尔退化成直线段。
- 中间值就是"束紧程度"。

坐标 `x1/y1/x2/y2` 在 `formula` 里算好（它们只依赖静态布局信号），
路径字符串在 mark 的 `update` 里拼（它依赖可拖动的 `chordBundle`，放在 encode 里保证每次拖动都重算）。
拼串时一律 `format(v, '.1f')`，避免 `d` 属性里塞进 `322.23772741049896` 这种长浮点。

### 关键概念 4：弧线邻接图的椭圆弧

节点位置由 `point` 比例尺给出（`padding: 0.5` 让首尾各留半格），边的路径是：

```
xa = scale('nodeX', srcName)
xb = scale('nodeX', tgtName)
x0 = min(xa, xb)   x1 = max(xa, xb)
rx = (x1 − x0) / 2
ry = rx · arcRatio
path = "M x0,baseY A rx,ry 0 0 1 x1,baseY"
```

`A rx ry x-axis-rotation large-arc-flag sweep-flag x y`：

- `large-arc-flag = 0`：起点终点正好是椭圆的两个水平极点，取小弧（半个椭圆）。
- `sweep-flag = 1`：SVG 的"正角方向"在 y 轴朝下的屏幕坐标里是**顺时针**。
  从左极点（9 点位置）顺时针走，先经过 12 点再到 3 点 —— 于是弧凸在基线**上方**。
  把它改成 `0`，所有弧会翻到基线下面。
- 先 `min`/`max` 排好左右，就不用按方向去讨论 `sweep-flag` 该取 0 还是 1。

`arcRatio = 1` 是正半圆；小于 1 压扁（跨度大的边不会顶到画布外），大于 1 拉高。

### 关键概念 5：为什么两个面板天然同步

两个面板的节点 mark 都从**同一个** `chord-nodes` 出，边 mark 都携带同一对 `source`/`target` 下标：

```
strokeOpacity = focus == null
              ? linkOpacity
              : (datum.source === focus || datum.target === focus ? 0.95 : 0.05)
```

`focus` 是一个普通信号，写它的事件来自两个面板；读它的表达式在两个面板里。
没有任何"联动代码" —— 联动是数据流的副产品。

## 试一试

1. **把 `padAngle` 拖到 0.08**：小弧段（Myriel 只有 5 的强度）会被间隙吃掉、几乎看不见。
   这说明"两端各收缩 `padAngle/2`"是**绝对**收缩量，节点越多、越不均匀就越危险。
   再把 `padAngle` 拖回 0，弧段首尾相接变成一整个圆环。
2. **把 `nodeOrder` 切成 `strength`**：圆周和直线上的次序都改成"纯按强度降序"，
   社群不再聚团 —— 对比一下哪种次序更容易看出"ABC 咖啡馆学生团（棕色）内部高度互连"。
   注意 `nodeX` 比例尺的 domain 也跟着变了，因为它取自 `chord-nodes` 而后者被 `collect` 重排过。
3. **把 `chordBundle` 从 0 拖到 1**：弦从"向圆心收束"一路变直，直到成为一堆直线段（此时更像 hive plot）。
   在 `spec.vg.json` 里把 `'Q'` 换成 `'L'` 并去掉控制点，效果就是 `chordBundle = 1` 的固定版。
4. **在 `arcPanel` 的边 mark 里把 `A ... 0 0 1` 的最后一位改成 `0`**：所有弧翻到基线下方。
   再把 `arcRatio` 拖到 1.2，看半椭圆被拉高到什么程度。
5. **把 `chord-ends` 的 `window.sort` 从 `{"field":"weight","order":"descending"}`
   改成 `{"field":"nodeIdx"}`**：每段弧内部的弦重新排序，粗弦不再优先靠一侧，
   交叉明显变多 —— 这就是弦图为什么要讲"弧内排序"。
6. **把 `nodes-scored` 的 `window` 里 `row_number` 换成 `rank`**：`topN = 18` 时行数可能变成 19、20，
   因为并列的 `strength` 拿到同一个 `rank`。副标题里的"子图 N 点"会跟着变。

## 参考

- Fold 变换：https://vega.github.io/vega/docs/transforms/fold/
- Pivot 变换：https://vega.github.io/vega/docs/transforms/pivot/
- Window 变换（含 `row_number` / 分区累计）：https://vega.github.io/vega/docs/transforms/window/
- Aggregate 变换：https://vega.github.io/vega/docs/transforms/aggregate/
- Lookup 变换（`default` 参数）：https://vega.github.io/vega/docs/transforms/lookup/
- Collect 变换：https://vega.github.io/vega/docs/transforms/collect/
- Pie 变换：https://vega.github.io/vega/docs/transforms/pie/
- Arc mark：https://vega.github.io/vega/docs/marks/arc/
- Path mark：https://vega.github.io/vega/docs/marks/path/
- Group mark：https://vega.github.io/vega/docs/marks/group/
- Point / Ordinal 比例尺：https://vega.github.io/vega/docs/scales/#point
- Legend（`orient: "none"` + `legendX`/`legendY`）：https://vega.github.io/vega/docs/legends/
- 表达式语言（`sin`/`cos`/`PI`/`format`/`scale`）：https://vega.github.io/vega/docs/expressions/
- SVG 椭圆弧命令 `A`：https://developer.mozilla.org/docs/Web/SVG/Attribute/d#elliptical_arc_curve
- 数据集出处：https://github.com/vega/vega-datasets（`miserables.json`，源自 Knuth 的《The Stanford GraphBase》）

## 与 matplotlib 的对照

**这张图在 Vega 里靠什么语法元素表达出来**

| 需求 | Vega 里的一句话 |
|------|-----------------|
| 按度数取子图 | `fold` + `aggregate` + `lookup(default:null)` + `window(row_number)` + `filter`，全部在 spec 里 |
| 角度分配 | `pie` 变换（唯一一个内置的"绕圈布局"） |
| 弧段 | `arc` mark，直接吃 `startAngle`/`endAngle`/`innerRadius`/`outerRadius` |
| 弧内细分 | `window` 分区累计和 |
| 边表 ⇄ 端点表 | `fold` / `pivot` 一对逆变换 |
| 曲线 | `path` mark + 一个字符串表达式 |
| 双面板 | 两个 `group` mark，共享顶层 data / scale / signal |
| 联动高亮 | 一个 `signal` + 两处 `on` 事件 + 两处读取 |
| 参数化 | 6 个 `bind` 信号，浏览器里自动出滑杆和下拉框 |

**换成 matplotlib / seaborn 要写什么**

- **没有弦图，也没有弧线邻接图。** matplotlib 里两者都得自己算几何：
  - 弧段：`matplotlib.patches.Wedge(center, r, theta1, theta2, width=...)`，
    角度得自己按累计比例算，而且 `Wedge` 的角度是**数学约定**（0 指向 3 点方向、逆时针为正、单位是度），
    和 d3/Vega 的"0 指 12 点、顺时针、弧度"差 90° 且方向相反 —— 转换公式必须自己写对：
    `theta_mpl = 90 − theta_vega·180/π`，而且 `theta1`/`theta2` 要交换。
  - 弦：`matplotlib.path.Path` + `Path.CURVE3`（二次贝塞尔）+ `patches.PathPatch`，
    控制点、锚点全部自己算，本 README 里的四个公式一个都省不掉。
  - 弧线图的边：`patches.Arc(center, width, height, theta1=0, theta2=180)`，
    center 得自己算成两点中点，`width = |x2−x1|`、`height = 2·ry`。
- **取子图要退回 pandas。** `df.melt()` 对应 `fold`，`groupby().agg()` 对应 `aggregate`，
  `merge(how='inner')` 对应 `lookup + filter`，`groupby().cumsum()` 对应分区 `window`，
  `pivot_table()` 对应 `pivot` —— 能力是等价的，但它变成了绘图之外的一段脚本：
  **参数一改就得整段重跑再重画**，而不是拖一根滑杆。
- **交互基本没有。** 联动高亮要么上 `mpl_connect('motion_notify_event', ...)` 自己写命中测试
  （曲线的命中测试尤其麻烦），要么换 `%matplotlib widget` / Bokeh / Plotly。
  Vega 这里只花了一个 `signal` 和两条 `on` 规则。
- **想省事就装包**：`mne.viz.plot_connectivity_circle`（专为脑连接组做的弦图）、
  `nxviz.CircosPlot` / `nxviz.ArcPlot`（正好就是这两张图）、`pycirclize`、`holoviews.Chord`。
  这些包一行就出图 —— 代价是配色、排序、间隙、标签这些细节要按各自的 API 调，
  跳出它预设的样式就很吃力；而本例每一个几何量都是自己写的公式，改哪都行。
- **导出与嵌入**：Vega 这份 spec 是一个 JSON，靠 `assets/vega.min.js` 在浏览器里跑，
  也能在 Node 里 `toSVG()`（本项目的 `tools/inspect.cjs` 就是这么截图的）。
  matplotlib 出的是静态 PNG/PDF/SVG，网页里要交互就得再套一层。

**反过来，matplotlib 更省事的地方（诚实版）**

- **想画什么就写什么。** 这张图里最难的部分是"把公式塞进声明式管道"：
  角度得用 `formula` 一步步派生，路径得拼成表达式字符串，
  中间结果只能靠 `tools/inspect.cjs` 打印数据集来 debug。
  matplotlib 里这些就是几行 Python，可以 `print`、可以下断点、可以用 numpy 向量化。
- **文本度量。** matplotlib 有 `get_window_extent()`，可以真正测出标签占多少像素再决定放不放、
  转多少度。Vega 的 `label` 变换要真实 canvas（本项目的校验器跑不了它），
  所以这里的径向标签只能靠"半径 + 6px、按 `aMid` 分左右半圈"这种规则摆，
  节点很多时（把 `topN` 拖到 30）标签会互相压。
- **数学排版。** 标题里要写 $\theta$、$\sum$、分式，matplotlib 直接内嵌 mathtext / LaTeX；
  Vega 的 `text` mark 只有纯文本，公式只能写进 README。
- **精确的物理尺寸与出版流程**：`figsize` + `dpi` + `constrained_layout`、
  矢量 PDF 字体嵌入、期刊要求的 300dpi TIFF —— 这些 matplotlib 是原生的，Vega 要绕。
