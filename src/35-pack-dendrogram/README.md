# 35 · 圆填充与径向树状图：同一棵树的两种布局

`assets/data/flare.json` 是一张摊平的父子表（`{id, name, parent?, size?}`，252 行、220 个叶子、最深 4 层）。
本例把它同时喂给两个层级布局：**左边 `pack`**（circle packing，用圆的**面积**表达 `size`），
**右边 `tree` + `treelinks` + `linkpath`**（径向树状图 / radial dendrogram，用**角度**表达叶子顺序）。
两图共享一套 `depth` 序数配色和一个图例。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/35-pack-dendrogram/
```

## 学习目标

1. 读懂 Vega 层级布局的统一套路：**`stratify` 建树 → 布局变换写坐标 → 普通 mark 画出来**。
   布局变换只是往 tuple 上写字段，画什么、画到第几层是 mark 和 `filter` 的事。
2. 记住 `symbol` mark 的 `size` 是**面积**（px²），而且 Vega 的口径是**外接正方形的面积**
   ——内建符号一律按 `r = sqrt(size) / 2` 作图。`pack` 给的是半径 `r`，所以必须写
   `size = pow(2 * r, 2)`；写成 `PI * r * r`（那是 d3 的口径）圆会小 11.4%、彼此不再相切，
   写成 `r` 或 `2r` 则连相对大小都全错（面积差被开平方压缩）。
3. 掌握**极坐标手工换算**：`tree` 本身只会输出直角坐标意义的 (广度, 深度) 两个数，
   径向效果完全靠你用 `as` 重命名 + 几个 `formula` 把它解释成 (角度, 半径) 再转回笛卡尔。
4. 掌握径向标签的**左右半圆翻转**规则：`angle` 落在 90°~270° 时文字要整体转 180° 并把
   `align` 从 `'left'` 改成 `'right'`，否则左半边的字全是倒的。
5. 理解一个容易踩空的区别：**改显示层数对两种布局的影响完全不同**。
   `pack` 的几何只由完整树决定，`maxDepth` 只是少画几圈；
   `tree` 的角度是按**叶子个数**均分的，叶子集合一变就必须重新布局。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `title` | 顶部大标题 + 副标题 | `autosize: "none"` 下标题画在 `y<0` 的画布外区域，不占 `height`；所以 `padding.top` 必须显式留够（本例标题组高 35px，给了 40），否则标题会被 SVG 视口裁掉、完全看不见 |
| `signals`（交互 5 个） | `maxDepth` / `packPadding` / `treeMethod` / `extent` / `rotate` | 全部 `bind`，右侧面板可直接拖 |
| `signals`（几何 11 个） | `bandTop`、`packSide/X0/Y0`、`radialX0/R0/Cx/Cy`、`labelPad`、`treeRadius`、`leafLabelSize` | 版面尺寸一律 `update` 推导，不在 mark 里散写魔数 |
| `data: flare` | 读 `../../assets/data/flare.json` | 已经是父子表，**不需要**摊平；JSON 无需 `format` |
| `data: packNodes` | `stratify` + `pack` | 跑在**完整树**上；`as: ["px","py","pr","pdepth","pchildren"]` |
| `data: packDraw` | `filter datum.pdepth <= maxDepth` | 只剪渲染、不剪布局 |
| `data: packLabels` | 2 个 `filter` + 3 个 `formula` | 字号不写死，按「圆能给多宽 ÷ 字数」反解出 `fs`；算不到 6px 就不标 |
| `data: pruned` | `filter datum.pdepth <= maxDepth` | 供右图**真剪枝**用（复用 pack 算好的 `pdepth`） |
| `data: treeNodes` | `stratify` + `tree` + 5 个 `formula` | `as: ["alpha","radius","tdepth","tchildren"]`，然后极坐标换算 |
| `data: treeLinks` | `treelinks` + `linkpath` | `shape:"diagonal"` + `orient:"radial"`，源/目标取**弧度**与**半径** |
| `data: treeLeafLabels` | `filter !datum.tchildren` | 剪枝后的叶子才写名字 |
| `data: panels` | 内联两行 + 两个 `formula` | 面板小标题的 x 与文案都由 signal 算（切 `treeMethod` / `maxDepth` 时标题跟着变） |
| `scales: depthColor` | `ordinal`，`domain: [0,1,2,3,4]` | **写死 domain**，这样切 `maxDepth` 时颜色不会整体位移 |
| `legends` | `orient:"none"` + `legendX/legendY` + `direction:"horizontal"` | 顶部横排一条，两图共用 |
| `marks`（6 个） | 面板标题 / pack 圆 / pack 标签 / 径向连边 / 径向节点 / 径向叶子标签 | 无 group mark，全用绝对坐标 |

### 关键概念

**1）`stratify`：从父子表到树**

```json
{ "type": "stratify", "key": "id", "parentKey": "parent" }
```

它不改 tuple，只是在数据源上挂一棵 `d3.hierarchy`（`pulse.source.root`）。
后面的 `pack` / `tree` / `treelinks` 都是从这棵 root 上取信息，所以**它们必须和 `stratify` 在同一条
transform 流水线里**（或者下游数据集通过 `source` 继承同一个 pulse）。

**2）`pack`：半径怎么来的，面积怎么给**

```json
{ "type": "pack", "field": "size",
  "sort": {"field": "size", "order": "descending"},
  "padding": {"signal": "packPadding"},
  "size": [{"signal": "packSide"}, {"signal": "packSide"}],
  "as": ["px", "py", "pr", "pdepth", "pchildren"] }
```

- `field: "size"` 触发 `root.sum('size')`：**叶子取自己的 `size`，父节点自动等于子树之和**。
  半径与 `sqrt(value)` 成正比，于是「面积 ∝ size」在每一层都成立。
- `size: [S, S]` 指的是**外接盒**。d3 的 pack 会把根圆缩放到 `min(w,h)/2` 并放在盒中心，
  所以给非正方形的盒子等于白浪费长边 —— 本例直接给正方形 `packSide × packSide`。
- `padding` 是同层圆之间的像素间距（缩放前的量，视觉上会随根圆缩放略有折扣）。
- `sort` 排的是**兄弟顺序**（大圆先放，装得更紧）。注意 Vega 这里是
  `root.sort(compare(d => d.data))` —— 比的是**原始数据字段** `size`，而不是 `pack` 累加出来的
  `node.value`。本数据集只有叶子带 `size`，所以这条 `sort` 实际只对叶子生效，
  内部节点在比较结果为 `NaN` 时退回输入顺序（`stableCompare` 的 tuple id 兜底）。
  想严格按子树总量排序，得在数据端先把累加值算成一个真实字段。
- 输出 `px, py` 是**盒内局部坐标**（0~S）。本例不用 group mark，而是在 encode 里加偏移：
  `"x": {"signal": "packX0 + datum.px"}`。这样彻底绕开了「group 里的 scale 写
  `range: "width"` 却解析到顶层 width」那个经典陷阱。

**面积换算（本例最容易写错的一行）**：

```json
"size": { "signal": "pow(2 * datum.pr, 2)" }
```

`symbol` mark 的 `size` 通道语义是**面积**，单位 px²。但要小心 Vega 的口径：
它用的是**外接正方形的面积**，内建符号一律按

```
r = sqrt(size) / 2        ⟺        size = (2r)² = 4r²
```

作图（见 `assets/vega.js` 里 `Math.sqrt(size) / 2` 那十几处；实测 `size: 144`
渲染出的路径是 `A6,6`，半径正好 6）。

**这一点和 d3-shape 不同**：d3 的 `symbolCircle` 用 `r = sqrt(size / π)`，
也就是把 `size` 当**圆面积**。照 d3 的公式写 `size = π·r²`，
Vega 画出来的半径是 `sqrt(π·r²)/2 = 0.886·r` —— 每个圆都小 11.4%，
相对大小虽然还对（缩放因子一致），但**圆填充最核心的「彼此相切、填满外圈」这个性质没了**，
根圆也填不满分配给它的方框。本 demo 早期版本就踩了这个坑。

若误写 `size = datum.pr`，半径会变成 `sqrt(pr)/2` —— 大小关系被多开了一次平方根，
20 倍的差距会缩成 4.5 倍，图就废了。

**3）为什么 `as` 要加前缀**

层级布局的 metadata 是 `modifies: true`：它**直接改写 tuple 对象本身**。
`packNodes`、`pruned`、`treeNodes` 是 `source` 链下来的同一批对象，
若两个布局都用默认 `as`，`pack` 的 `x/y/children` 会和 `tree` 的 `x/y/children` 互相踩。
所以一边用 `p*`（`px/py/pr/pdepth/pchildren`），一边用语义名（`alpha/radius/tdepth/tchildren`）。
顺带一个好处：`pdepth` 和 `tdepth` 都在，读者能直接看出「pack 用的是完整树的 depth，
tree 用的是剪枝树的 depth」——本例里两者数值相同（剪枝不改变到根的距离），
但 `pchildren` 与 `tchildren` **不同**：`pchildren` 是完整树里的孩子数，
`tchildren` 是剪枝后的孩子数，所以「谁是叶子」的判定必须用 `tchildren`。

**4）`tree`：两路输出的真实含义**

```json
{ "type": "tree", "method": {"signal": "treeMethod"},
  "size": [1, {"signal": "treeRadius"}],
  "as": ["alpha", "radius", "tdepth", "tchildren"] }
```

`tree` 的默认输出是 `['x','y','depth','children']`：
`x` 是**广度方向**（同层节点铺开的那一维），`y` 是**深度方向**（离根的距离）。
`size: [W, H]` 就是这两维各自的跨度。这里给 `[1, treeRadius]`：

- 广度跨度取 **1**，于是 `alpha ∈ [0, 1]` 是一个归一化的「角度位置」；
- 深度跨度取 **`treeRadius`** 像素，于是 `radius` 直接就是像素半径。

`method` 的两个值差别很大：

- `"cluster"`（d3.cluster）——**所有叶子对齐到最外圈**，内部节点摆在孩子的中间。
  这才是「树状图 / dendrogram」，一圈整齐的叶子标签就是靠它。
- `"tidy"`（d3.tree，Reingold-Tilford）——按层压紧，叶子**不**对齐，浅层的叶子会停在内圈。
  径向画出来像一朵毛边的花，能看出「哪些分支很深」。

**5）极坐标换算：五个 `formula`**

```json
{ "as": "angle",    "expr": "(rotate + extent * datum.alpha) % 360" }
{ "as": "radians",  "expr": "PI * datum.angle / 180" }
{ "as": "leftside", "expr": "inrange(datum.angle, [90, 270])" }
{ "as": "tx",       "expr": "radialCx + datum.radius * cos(datum.radians)" }
{ "as": "ty",       "expr": "radialCy + datum.radius * sin(datum.radians)" }
```

- `extent * alpha` 把 `[0,1]` 映射到想占的角度跨度（默认 360°，调小就留出缺口）。
- `+ rotate` 是整体旋转。为什么默认 **270**？屏幕坐标系 y 轴朝下，`(cos θ, sin θ)`
  在 θ=0° 指向**正右**、90° 指向**正下**、180° 正左、270° **正上**。
  所以 `rotate = 270` 让第一个叶子（`alpha = 0`）落在正上方，后续顺时针展开 —— 符合直觉。
- `% 360` 把角度收回 `[0, 360)`，这样下一步的 `inrange(angle, [90,270])` 判据才成立。
- `leftside`：`cos θ ≤ 0` 的那半圆，即 θ ∈ [90°, 270°]，就是**左半圆**。
- `tx/ty`：极坐标 →（画布绝对）笛卡尔。圆心 `radialCx/radialCy` 由 signal 算出。

**6）`treelinks` + `linkpath`：径向连边**

```json
{ "type": "treelinks" },
{ "type": "linkpath", "shape": "diagonal", "orient": "radial",
  "sourceX": "source.radians", "sourceY": "source.radius",
  "targetX": "target.radians", "targetY": "target.radius" }
```

- `treelinks` 遍历 `stratify` 挂的 root，每条父子边产出一个 `{source, target}` tuple
  （两个字段都是**指向节点 tuple 的引用**，所以下游能用 `"source.radians"` 这种点号路径取值）。
- `linkpath` 的 `orient: "radial"` 会把 `sourceX/targetX` 解释为**弧度**、
  `sourceY/targetY` 解释为**半径**。`shape: "diagonal"` 生成的是一条三次 Bezier，
  控制点取在中间半径上（源码就是这么写的）：

  ```
  M  sr·cos(sa), sr·sin(sa)
  C  mr·cos(sa), mr·sin(sa)      // 控制点 1：源角度、中间半径
     mr·cos(ta), mr·sin(ta)      // 控制点 2：目标角度、中间半径
     tr·cos(ta), tr·sin(ta)      // 终点
  其中 mr = (sr + tr) / 2
  ```

  效果是「先沿半径出去一点，再横向拐到目标角度」，正是树状图连线的经典形状。
  （换 `shape: "orthogonal"` 会变成「圆弧 + 直线段」的直角折线；`"line"` 就是直连。）
- **关键**：`linkpath` 生成的 `path` 以**极点 (0,0)** 为原点。所以 `path` mark 必须用
  `x`/`y` 把整条路径平移到圆心：

  ```json
  { "type": "path", "encode": { "update": {
      "x": {"signal": "radialCx"}, "y": {"signal": "radialCy"},
      "path": {"field": "path"} } } }
  ```

  漏了这两行，整棵树会缩在画布左上角。

**7）径向叶子标签：角度 + 翻转**

```json
"dx":    { "signal": "datum.leftside ? -6 : 6" },
"angle": { "signal": "datum.leftside ? datum.angle - 180 : datum.angle" },
"align": { "signal": "datum.leftside ? 'right' : 'left'" }
```

Vega 的 `text` mark 里 `angle` 是**顺时针度数**，旋转中心是锚点（由 `align`/`baseline` 决定）。
规则拆开看：

- **右半圆**（`angle ∈ [0,90) ∪ (270,360)`）：文字沿半径朝外排，锚点在左端
  （`align:'left'`）、向外推 `dx = +6`、整体转 `angle` 度。文字自然是「头在内、尾在外」，正着读。
- **左半圆**（`angle ∈ [90,270]`）：如果照抄上面，文字会倒过来（因为它指向圆心的反方向）。
  修法是把文字**整体转 180°**（`angle - 180`），同时锚点换到右端（`align:'right'`）、
  向内推 `dx = -6`。这样字仍然「尾在外」，但字形朝上，可读。
- `baseline: 'middle'` 必须给，否则旋转中心在基线上，标签会离节点偏一行。

这三行的联动就是径向树最经典的细节；少任何一个都会露馅。

**8）标签怎么放得下：估算 + 反解字号 + `limit` 兜底**

Vega 表达式语言里**没有**测量文字宽度的函数，只能估。约定俗成的上界是
`宽度 ≈ length(name) * fontSize * 0.8`（0.8 正是 Vega 自己在无 canvas 环境下用的估算常数；
真实浏览器测量必然更窄，本数据集实测最宽约 0.585 × 字号/字符，所以 0.8 是安全侧）。

pack 这边的难点是圆的大小相差几十倍，一个统一字号必然要么大圆浪费、要么小圆爆框。
所以本例**把这条估算公式反解成字号**：

```json
{ "as": "labelWidth", "expr": "(datum.isParent ? 1.4 : 1.9) * datum.pr" },
{ "as": "fs",         "expr": "min(datum.isParent ? 11 : 9, datum.labelWidth / (0.8 * length(datum.name)))" },
{ "type": "filter",   "expr": "datum.fs >= 6" }
```

- `labelWidth` 是这个圆愿意给标签的横向预算：写在圆心的用 `1.9 r`（略小于直径 `2r`，留边）；
  写在上沿的（`isParent`）只用 `1.4 r`，因为那个高度上圆的弦比直径短。
- `fs = labelWidth / (0.8 * 字数)` 就是「刚好塞满」的字号，再与上限取 `min`。
- 最后一道 `filter`：连 6px 都塞不下的圆干脆不标。默认视图下 111 个圆里有 15 个拿到标签。

带子圆的节点（`isParent`）把名字放到**圆的上沿**而不是圆心：

```json
"y": { "signal": "packY0 + datum.py + (datum.isParent ? datum.fs - datum.pr : 0)" }
```

否则它会和自己子圆的标签在同一个位置打架。

两处 `limit` 是最后的硬保证 —— 估算只决定「要不要画」，`limit` 决定「画出来一定不超宽」
（超出自动截断并加省略号）：

- pack 标签：`"limit": {"field": "labelWidth"}`；
- 径向叶子标签：`"limit": {"signal": "labelPad - 10"}` —— 不超过预留的标签带。

**9）版面：为什么不用 group mark**

两个面板的坐标全部由顶层 signal 推导，mark 里写绝对坐标：

```
padding   = {left:5, top:40, right:5, bottom:5} // top 必须 ≥ 标题组高度 35，否则标题被裁
bandTop   = 58                                  // 画布内顶部留白：图例 + 面板小标题
packSide  = 440, packX0 = 12
packY0    = (bandTop + height)/2 - packSide/2    // = 159，方块垂直居中
radialX0  = packX0 + packSide + 24               // = 476
radialR0  = (width - 8 - radialX0)/2             // = 318，右图外接半径（含标签带）
radialCx  = radialX0 + radialR0                  // = 794
radialCy  = (bandTop + height)/2                 // = 379
labelPad  = 134                                  // 标签带宽度（19 字符 × 8px × 0.8 ≈ 122，留 12px 余量）
treeRadius= radialR0 - labelPad                  // = 184，喂给 tree 的深度跨度
```

好处有两个：一是省掉 group mark 里 `"range": "width"` 解析到**顶层** `width` 的著名陷阱；
二是右图的可用半径能显式扣掉标签带 —— `treeRadius = radialR0 - labelPad` 这一步
在 group 里是很难写清楚的。

顺手核对一下不会溢出：`radialCx + treeRadius + dx + limit = 794 + 184 + 6 + 124 = 1108 ≤ 1120`，
纵向 `379 ± 318 = 61 ~ 697`（在 `height = 700` 内），左图右边界 `12 + 440 = 452 < 476 = radialX0`，两图不打架。

标签的**角向**预算也要算：外圈周长 `2π × 184 ≈ 1156px`，默认 100 个叶子，
每个叶子摊到 `11.6px`，而 8px 字号的行高约 `8 × 1.2 = 9.6px` —— 刚好不挤。
这就是 `leafLabelSize`、`labelPad`、`maxDepth` 三个数必须一起定的原因。

## 试一试

1. **把面积换算写错**：把 pack 圆的 `"size": {"signal": "pow(2 * datum.pr, 2)"}`
   改成 `{"field": "pr"}`。半径退化成 `sqrt(pr)/2`：根圆从 220px 塌到 7.4px，
   最小的圆只剩 0.5px，半径差从 183 倍被压到 13 倍且全部小于 8px —— 直观感受
   「`size` 是面积」这件事有多要紧。再改成 `{"signal": "PI * datum.pr * datum.pr"}`
   （d3 的口径），会看到圆整体缩到 88.6%、相邻圆之间裂开缝隙。
2. **切 `treeMethod`**：从 `cluster` 切到 `tidy`。叶子不再对齐外圈，
   `analytics` 那些深到第 4 层的分支会明显伸得更远，浅分支停在内圈；
   同时观察外圈标签立刻变得参差不齐 —— 这就是为什么树状图（dendrogram）一定用 `cluster`。
3. **拉 `maxDepth` 到 4**：左图只是多长出两圈小圆、大格局不动（几何跑在完整树上）；
   右图叶子从 100 个涨到 220 个，角向预算被压到 `1156 / 220 ≈ 5.3px`，标签开始互相压叠，
   最长的四个名字（如 `AgglomerativeCluster`）还会被 `limit` 截成 `AgglomerativeClust…`。
   把 `leafLabelSize` 从 8 调到 5 能缓解 —— 体会「径向图的标签预算 = 外圈周长 ÷ 叶子数」。
4. **改 `extent` 到 260，再拖 `rotate`**：树只占一段扇形，缺口在哪由 `rotate` 决定。
   注意 `leftside` 的判据是对 `angle % 360` 做的，所以怎么转标签都不会倒。
5. **换连边形状**：把 `linkpath` 的 `"shape": "diagonal"` 改成 `"orthogonal"` 或 `"line"`。
   `orthogonal-radial` 走「圆弧 + 径向直线」（生物学画系统树的标准样式），`line` 是直连，
   一眼看出层级感被削弱了多少。
6. **`packPadding` 拖到 8**：同层圆被撑开，根圆缩放系数变大，所有圆按比例变小；
   注意面积的**相对**关系不变，只是整体缩了。

## 参考

- Transform 总览：<https://vega.github.io/vega/docs/transforms/>
- `stratify`：<https://vega.github.io/vega/docs/transforms/stratify/>
- `pack`：<https://vega.github.io/vega/docs/transforms/pack/>
- `tree`：<https://vega.github.io/vega/docs/transforms/tree/>
- `treelinks`：<https://vega.github.io/vega/docs/transforms/treelinks/>
- `linkpath`：<https://vega.github.io/vega/docs/transforms/linkpath/>
- `symbol` mark（`size` = 面积）：<https://vega.github.io/vega/docs/marks/symbol/>
- `path` mark：<https://vega.github.io/vega/docs/marks/path/>
- `text` mark（`angle` / `align` / `limit`）：<https://vega.github.io/vega/docs/marks/text/>
- 序数比例尺与配色 scheme：<https://vega.github.io/vega/docs/scales/> ·
  <https://vega.github.io/vega/docs/schemes/>
- 官方例子：Circle Packing <https://vega.github.io/vega/examples/circle-packing/> ·
  Radial Tree Layout <https://vega.github.io/vega/examples/radial-tree-layout/>

## 与 matplotlib 的对照

**Vega 这边用到的语法元素**：一条 `data` 流水线（`stratify` → `pack` / `tree` → `treelinks` →
`linkpath` → `formula`）把层级关系变成坐标字段，然后 `symbol` / `path` / `text` 三种通用 mark
按字段渲染；`signal` 让 `maxDepth`、`treeMethod`、`extent`、`rotate`、`packPadding`
成为可拖的参数，改一下整条流水线自动重跑。**布局算法是内置的、声明式的**，
JSON 里没有一行循环，也没有一处递归。

**换成 matplotlib / seaborn 要付什么代价**：

| 这件事 | Vega | matplotlib 生态 |
| --- | --- | --- |
| 圆填充布局 | `{"type": "pack"}` | **没有内置**。要么 `pip install circlify`（第三方，维护弱），要么自己实现 Welzl 最小包围圆 + front-chain 装箱（d3 的 `packSiblings` 约 150 行） |
| 圆的面积编码 | `size` 通道给面积（Vega 口径 = 外接正方形，`(2r)²`） | `ax.add_patch(Circle((x,y), r))` 直接给半径，反而不容易错；但 `ax.scatter(s=...)` 的 `s` 也是面积（pt²），且 pt 与 data 单位不一致，要自己换算，比 Vega 更绕 |
| 树状图布局 | `{"type": "tree", "method": "cluster"}` | `scipy.cluster.hierarchy.dendrogram` 只吃**linkage 矩阵**（聚类结果），不吃任意父子表；要画通用树只能自己写 Reingold-Tilford，或者 `networkx` + `graphviz_layout(prog="twopi")`（需系统装 Graphviz） |
| 径向坐标 | 5 行 `formula` | 也是手算，工作量相当。但 `projection='polar'` 的 Axes 又会把 `text` 的旋转基准也变成极坐标，反而更难控制，实践中多数人退回直角 Axes 手算 —— 和 Vega 一样 |
| 连边的径向 Bezier | `linkpath` 的 `diagonal-radial` | **没有内置**。要自己拼 `matplotlib.path.Path` 的 `CURVE4`，控制点公式（`mr = (sr+tr)/2`）得自己推 |
| 叶子标签左右翻转 | 三个 `signal` 表达式 | `for` 循环里逐个 `ax.text(..., rotation=deg, ha=...)`，还要自己判 `90 < deg < 270`。逻辑一样，但写成命令式代码后不可复用、改字号要重跑整段 |
| 交互参数（切算法/改层数） | `bind` 一个 signal，自动重算 | 要么每次改代码重跑，要么上 `ipywidgets` + `@interact` 手写重绘函数（并小心 `ax.clear()` 漏清） |
| 标签超宽截断 | `limit` 通道 | 没有对应通道。要自己 `renderer.get_text_width_height_descent()` 测量再手动切字符串 |
| 悬停 tooltip | `tooltip` 通道 | `mplcursors` 或手写 `motion_notify_event` 回调；静态导出（PNG/PDF）里根本没有 |

**反过来，matplotlib 更省事的地方**（诚实地说）：

- **算法可直接调库**。真要做统计意义上的层次聚类，`scipy.cluster.hierarchy` 的
  `linkage` + `dendrogram` 是一条命令，还顺带给你合并距离、`color_threshold`、
  按阈值切簇（`fcluster`）—— Vega 的 `tree` 只管画，不做聚类，聚类得在数据端先算好。
- **递归/自定义逻辑随手就写**。比如「只展开累计 size 占前 80% 的分支」这类带状态的剪枝，
  Python 里几行递归；Vega 表达式语言没有循环，要么在数据端预处理，要么写自定义 transform
  （见 demo 20）。本例的 `maxDepth` 剪枝就是因为够简单才能用 `filter` 表达。
- **导出与排版**。`bbox_inches='tight'`、`constrained_layout`、矢量 PDF 嵌字体、
  latex 数学标签，都是一行开关；Vega 这边版面得自己用 signal 算像素（本例那 10 个几何 signal
  就是这个税），跨面板对齐全靠手动核对边界。
- **不需要浏览器**。matplotlib 在无头机器上就是一个 `savefig`。Vega 要么起服务器看，
  要么走 `vega-cli` / 本项目 `tools/` 里的 Node 渲染链路（demo 21）。

一句话总结：**布局算法和坐标换算这类「有标准答案的几何」，Vega 用变换名字就能声明；
而「带状态的自定义逻辑」和「印刷级排版」，命令式的 Python 更顺手。**
