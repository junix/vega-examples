# 44 · 官方 tree-layout 精读：直角坐标树与 linkpath 的四种 shape

对应官方示例：<https://vega.github.io/vega/examples/tree-layout/>

本仓库已经有 `demos/35-pack-dendrogram` 讲**径向**树（`orient: "radial"` + 手工极坐标换算）。
这一篇补上另一支：**直角坐标（Cartesian）树**，并且把 `linkpath` 的四种 `shape`
（`line` / `curve` / `diagonal` / `orthogonal`）一次讲完 —— 右面板用同一棵 8 节点小树
把四种形态并排画出来，左面板下拉框选中哪一种，右面板对应那一行就标红。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/44-tree-layout/
```

## 学习目标

读完这个 demo，你应该能回答：

1. `tree` 变换的四路输出到底是什么？为什么官方把 `as` 写成 `["y","x","depth","children"]`
   —— **把第一路命名成 `y`** —— 就完成了"纵向树 → 横向树"的转置？
2. `size: [a, b]` 里的 `a`、`b` 分别是哪个方向？`children` 那一路是子节点数组还是个数？
3. `tidy` 和 `cluster` 的区别在哪？`separation` 到底改的是什么（**不是**"按子树大小加权"）？
4. `treelinks` 产出的元组长什么样？为什么同一个数据源可以被四条数据流各跑一次 `treelinks` 而互不干扰？
5. `linkpath` 的 `shape` × `orient` 组合表里**哪些组合根本不存在**？
   为什么 `line` 和 `curve` 写了 `orient: "horizontal"` 也没用？四种 shape 的路径公式各是什么？
6. 为什么标签只用**一个** text mark 就能让内部节点向左写、叶子向右写？
7. 剪枝为什么必须"剪掉输入再重算布局"，而 `pack`（demo 35）可以"跑完整树只 filter 渲染"？

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` 前 5 条 | 官方那 4 个控件 + 本例新增的 `maxDepth` | `labels` / `layout` / `linkShape` / `separation` 与官方一一对应；官方把 shape 那个 signal 叫 `links`，和数据集 `links` 同名，本例改叫 `linkShape` |
| `signals` 布局组 | `bandTop` / `treeX0` / `labelPad` / `treeSpan` / `treeY0` / `treeHeight` | `autosize: "none"` 下所有面板原点都自己算；`treeSpan`、`treeHeight` 直接喂给 `tree` 的 `size` |
| `signals` 自适应组 | `leafN` / `leafGap` / `leafLabelSize` / `showLeafLabels` / `nodeSize` | 全部由 `length(data('leaves'))` 反算：叶子越多，字号和圆点越小；间距 < 5px 干脆不画叶子标签 |
| `signals` 兜底组 | `depthDomain` / `hasNodes` | 只有 `update` 的派生 signal，专门给 data 驱动的 domain 兜底（见下） |
| `data: flare` | 读 `../../assets/data/flare.json` | 这份文件本身就是**摊平的父子表** `{id, name, parent?, size?}`，252 行、220 个叶子，和官方示例用的是同一份、同一形态 |
| `data: depths` | `stratify` + `tree(size:[1,1])`，只取 `depth0` | 父子表里没有深度字段，而 `depth` **只有层级布局变换才会写出来**。这一趟的坐标 `b0`/`d0` 完全用不到 |
| `data: pruned` | `filter datum.depth0 <= maxDepth` | 剪的是**布局的输入**。父节点的 `depth0` 一定小于子节点，所以被保留的节点其父节点必然也在，`stratify` 不会断链 |
| `data: nodes` | `stratify` + `tree(method, size, separation, as)` | **本 demo 的核心**：`as: ["y","x","depth","children"]` 一步转置 |
| `data: leaves` | `filter !datum.children` | 只为给 `leafN` 计数；标签本身仍由 `nodes` 那一个 text mark 统一画 |
| `data: links` | `treelinks` + `linkpath(orient, shape)` | 因为上一步 `as` 已经把广度写进 `y`、深度写进 `x`，`linkpath` 的默认取值 `source.x` / `source.y` 正好对，一个参数都不用写 |
| `data: miniTree` | 8 节点内联小树 + `stratify` + `tree(cluster)`，`as: ["my","mx","mdepth","mkids"]` | 右面板的对照样本。字段改名成 `m*` 后，`linkpath` 的四个 `sourceX/sourceY/targetX/targetY` 就**必须显式写**了 |
| `data: linkLine / linkCurve / linkDiagonal / linkOrtho` | 四条独立数据流，各自 `treelinks` + `linkpath(shape: 写死)` + `formula row/shapeName` | `shape` 是**变换参数**，一次只能生成一种形状，所以四种形状只能开四条流 |
| `data: miniLinks` | `"source": ["linkLine", …]` | `data.source` 可以写成**数组**，把多条流并成一个数据集，于是四行只用一个 path mark + 两个 symbol mark 就画完 |
| `data: shapeRows` / `footnotes` | 右面板的行标题、说明与脚注 | 纯静态 `values`，非空，不会触发校验器的"空数据集"判定 |
| `scales: color` | `linear` + `{"scheme":"magma","extent":[0.12,0.78]}` | domain 来自 `depthDomain` signal 而不是直接写 `{data:…}` |
| `legends` | `type: "gradient"`，`values: {"signal":"sequence(0, maxDepth + 1)"}` | `sequence` 右开：`stop = maxDepth + 1` 才能取到 `maxDepth` 这一格 |
| `marks` 左面板 | path（连边）→ symbol（节点）→ text（标签） | 三个 mark 全靠 `x: treeX0 + datum.x` 平移到面板原点 |
| `marks` 右面板 | 行标题 / 说明 / path / 两个 symbol / 脚注 | 行偏移一律 `miniY0 + datum.row * miniRowH` |

### 关键概念一：`tree` 的 `as` 是一步完成的转置

`assets/vega.js` 里 `Tree` 的输出字段名写死为 `['x', 'y', 'depth', 'children']`，
写回元组的代码是：

```js
const Output$1$1 = ['x', 'y', 'depth', 'children'];   // fields
function setFields(node, fields, as) {
  const t = node.data, n = fields.length - 1;
  for (let i = 0; i < n; ++i) t[as[i]] = node[fields[i]];   // as[0]←node.x, as[1]←node.y, as[2]←node.depth
  t[as[n]] = node.children ? node.children.length : 0;      // as[3] ← 子节点【个数】
}
```

而底层是 d3-hierarchy 的 `tree()` / `cluster()`，它们的坐标约定是：

- `node.x` = **广度**方向（同一层里的位置），跨度由 `size[0]` 决定；
- `node.y` = **深度**方向（第几层），跨度由 `size[1]` 决定。

默认 `as` 是 `["x","y",…]`，于是 `x` 拿到广度、`y` 拿到深度 —— 画出来是**纵向**树（根在上）。
官方示例要横向树，于是写：

```json
"size": [{"signal": "treeHeight"}, {"signal": "treeSpan"}],
"as":   ["y", "x", "depth", "children"]
```

`as[0] = "y"` 接的是广度 → 屏幕纵坐标；`as[1] = "x"` 接的是深度 → 屏幕横坐标。
**一个 `as` 就完成了转置**，比事后写两个 `formula` 交换字段干净得多（也少写一个中间字段名，
更不会出现"交换到一半"的中间态）。同理，`size` 的第一项是广度尺寸（这里是画布高度），
第二项是深度尺寸（这里是画布宽度）—— 看起来"反了"，其实一致。

还有两个容易踩的点：

- `as` 的第四路（这里叫 `children`）**不是子节点数组，是子节点个数**（叶子为 `0`）。
  所以 `datum.children ? … : …` 能直接当布尔用，`datum.children.length` 反而会报错。
- **`as` 的长度写错不报错、只是静默出错。** `Tree.Definition` 里确实声明了
  `length: Output$1$1.length`（= 4），但 `vega.parse` 并不校验它。实测把 `as` 写成三个元素：
  `setFields` 的最后一行 `t[as[3]] = 子节点个数` 会往字面量键 `"undefined"` 上写
  （元组的键变成 `…,y,x,depth,undefined`），`children` 字段根本不存在 →
  `!datum.children` 对**所有**节点都成立、`leaves` 从 100 行变成全部 111 行、
  标签全部靠左。这比报错难查得多，写 `as` 时数一遍长度。

### 关键概念二：`tidy` vs `cluster`，以及 `separation` 到底改了什么

```js
const Layouts = { tidy: tree$1, cluster: cluster };     // d3.tree / d3.cluster
```

- **`tidy`**（Reingold–Tilford）：内部节点在广度方向落在其子树的中心，深度方向按层等分。
  紧凑，但叶子**不**对齐 —— 浅的分支的叶子停在中间层。
- **`cluster`**（dendrogram）：所有**叶子**都推到最深那一层对齐，内部节点取子节点的中点。
  一眼能读出"谁是叶子"，代价是浅分支被拉长。

本例默认剪到 `depth ≤ 2`，此时留下的 100 个叶子恰好全在 depth 2，
所以 `tidy` 和 `cluster` 看起来几乎一样 —— 实测唯一的差别是**根节点的广度位置**
（`tidy` 取最外侧两个子节点的中点 `298.90`，`cluster` 取所有子节点的均值 `249.49`），
10 个内部节点和三列深度坐标完全相同。把 `maxDepth` 调到 3 或 4，差别立刻出来。

`separation` 的语义**不是**"按子树大小加权"。源码只有一行：

```js
const defaultSeparation = (a, b) => a.parent === b.parent ? 1 : 2;
...
layout.separation(_.separation !== false ? defaultSeparation : one$2);   // one$2 = () => 1
```

即：

| `separation` | 相邻节点的间距权重 | 视觉效果 |
| --- | --- | --- |
| `true`（Vega 默认） | 同父 = 1，跨父 = **2** | 子树之间出现明显的"缝"，一眼看得出分组 |
| `false`（官方示例显式设的值） | 一律 1 | 所有叶子严格等距，密度最大 |

注意布局最后会把总跨度归一化到 `size[0]`，所以 `separation: true` 并不会让图变高，
只是把间距从"缝"那边挪过来。归一化就在 `assets/vega.js` 的 `tree$1` 里：

```js
var s  = left === right ? 1 : separation(left, right) / 2,
    tx = s - left.x,
    kx = dx / (right.x + s + tx);      // = dx / ((right.x - left.x) + 2s)
```

- `separation: false` → `s = 0.5`，叶子的原始 x 就是 `0 … leafN-1`，分母正好等于 `leafN`，
  于是 **`kx = size[0] / leafN` 就是精确的叶间距**。本例 `610 / 100 = 6.1px`，
  最上面那个叶子落在 `kx/2 = 3.05`、最下面落在 `606.95`（实测值）。
  所以状态行里的 `叶间距` 写的是 `treeHeight / leafN` ——
  分母数的是 `leafN` 个**格子**，不是 `leafN - 1` 个**间隔**，写成后者会高估约 1%。
- `separation: true` → 本例 100 个叶子分在 10 个父节点下，99 个间隔里 90 个同父（权重 1）、
  9 个跨父（权重 2），分母变成 `108 + 2 = 110`，于是同父间距 `610/110 = 5.545`、
  跨父的缝 `11.09`（实测叶子从 5.55 排到 604.45）。这时状态行的 `叶间距` 只是个近似平均值。

### 关键概念三：`treelinks` 产出什么

```js
out.add.push(ingest$1({ source: p, target: t }));   // p、t 都是【节点元组本身】
```

- 每条边是一个**全新元组**，只有两个字段 `source` / `target`，值是对父/子节点元组的**引用**
  （不是拷贝）—— 所以 `datum.target.mx`、`datum.source.mdepth` 这类写法能直接用；
- 它从 `pulse.source.root` 取树，也就是**上游必须有 `stratify`**（或别的 `treesource` 变换）；
- 它的 metadata 是 `{tree, generates, changes}`：`generates` 意味着下游是新元组流，
  所以四条独立数据流各跑一次 `treelinks`，**四批元组互不干扰**，各自 `linkpath` 写自己的 `path`。
  如果偷懒改成"一条流跑一次 `treelinks`，再用四个 `formula` 各写一个 path 字段"，
  就得手写四遍贝塞尔公式 —— 这正是右面板开四条流的原因。

边数比节点数少 1（本例 `nodes` 111 行、`links` 110 行）：根节点没有入边。

### 关键概念四：`linkpath` 的 shape × orient 组合表（grep 出来的，不是猜的）

`linkpath` 的查表逻辑只有一行：

```js
path = Paths.get(shape + '-' + orient) || Paths.get(shape);
```

而 `Paths` 里实际注册了这些键：

| `shape` | 有 `-horizontal` | 有 `-vertical` | 有 `-radial` | 无后缀 |
| --- | --- | --- | --- | --- |
| `line` | ✗ | ✗ | ✓ | ✓ |
| `arc` | ✗ | ✗ | ✓ | ✓ |
| `curve` | ✗ | ✗ | ✓ | ✓ |
| `diagonal` | ✓ | ✓ | ✓ | ✗ |
| `orthogonal` | ✓ | ✓ | ✓ | ✗ |

结论：**`line` 和 `curve` 写 `orient: "horizontal"` 完全无效**，会静默回落到无后缀版本
（不报错、不 WARN）。只有 `diagonal` 和 `orthogonal` 真的分横竖。四种形状的公式：

| shape | 生成的 path | 形态 |
| --- | --- | --- |
| `line` | `M sx,sy L tx,ty` | 两点直线段，orient 被忽略 |
| `curve` | `M sx,sy C (sx+ix),(sy+iy) (tx+iy),(ty-ix) tx,ty`，其中 `ix = 0.2(dx+dy)`、`iy = 0.2(dy-dx)`，`dx = tx-sx`、`dy = ty-sy` | 把位移向量绕原点转 −45° 再缩放当控制点偏移（`(dx+dy)/√2`、`(dy-dx)/√2` 就是转过的分量，`0.2` 乘在未除 √2 的量上，等效缩放系数是 `0.2√2 ≈ 0.283`）—— 两端的偏移量不同，**对方向不对称**，所以横向树里看着像"歪的 S"，orient 也被忽略 |
| `diagonal`（horizontal） | `M sx,sy C m,sy m,ty tx,ty`，`m = (sx+tx)/2` | 控制点取横向中点、纵坐标各取两端 → **两端切线水平**，树状图最常用 |
| `orthogonal`（horizontal） | `M sx,sy V ty H tx` | 先竖后横的直角折线；换成 vertical 就是 `H tx V ty`（先横后竖） |

`arc` 是第五种合法取值（`M … A rr,rr ra 0 1 …`，一段半圆弧），官方 select 里没放它，
因为它在横向树里会画出夸张的大圆弧、并且没有 `-horizontal` 变体。

### 关键概念五：一个 text mark 管两种对齐

官方示例最漂亮的一手：

```json
"dx":      {"signal": "datum.children ? -7 : 7"},
"align":   {"signal": "datum.children ? 'right' : 'left'"}
```

`children` 是子节点**个数**，`0` 为假 → 叶子。于是：

- **内部节点**：`align: right` + `dx: -7`，名字写在节点**左侧**（往根的方向），不会压到自己的子树；
- **叶子**：`align: left` + `dx: 7`，名字写在节点**右侧**（往画布外的方向），占用预留的 `labelPad`。

本例在此之上加了三件事：`fontSize` 分内部/叶子两档（叶子随叶间距自适应）、
`limit` 硬截断（估算只决定要不要画，`limit` 决定画出来一定不越界）、
以及 `opacity` 双开关（`labels` 手动开关 + `showLeafLabels` 密度阈值）。

### 关键概念六：剪枝改的是布局的输入，不是渲染

这是本 demo 和 `demos/35-pack-dendrogram` 的对照点：

| | `pack`（demo 35 左图） | `tree`（本 demo） |
| --- | --- | --- |
| 剪枝方式 | 布局跑**完整树**，只在渲染前 `filter` | 先 `filter`，再 `stratify` + `tree` **重跑布局** |
| 原因 | 圆的面积 = 整棵子树 `size` 之和，剪掉渲染不影响几何，被剪节点的圆仍代表子树总量 | 广度方向的位置是按**叶子集合**均分/归一化的，叶子集合一变，所有坐标都得重算 |
| 如果反过来做 | —— | 会得到"叶子只占画布上半截、下半截空白"的错图 |

所以本例的数据流是"**两趟 `tree`**"：第一趟只为拿 `depth0`（父子表里没有深度字段，
而 `depth` 只有层级布局变换才写得出来），`size` 随便给 `[1, 1]`；
第二趟才是真布局，跑在 `pruned` 上。

### 关键概念七：data 驱动 domain 的兜底

官方直接写 `"domain": {"data": "tree", "field": "depth"}`。一旦上游被过滤到 0 行，
domain 会退化成空集 / 零跨度，图例刻度全消失，Vega 还会吐 `Infinite extent` 类 WARN
（本仓库校验器判失败）。本例照 `demos/10-signals-bind/` 的做法改成派生 signal：

```json
{ "name": "depthDomain",
  "update": "span(extent(pluck(data('nodes'), 'depth'))) > 0 ? extent(pluck(data('nodes'), 'depth')) : [0, 1]" }
```

`extent([])` 在表达式语言里是 `[null, null]`、`span` 为 0，所以 `span(...) > 0`
一个条件同时挡掉"空集"和"只剩一个值"两种退化。配套的 `hasNodes` 驱动一段提示文字
（用 signal 驱动 text mark 的 `text`，**不是**新建一个默认为空的数据集）。
实测：用运行时 API 把 `maxDepth` 推到 `-1`（控件给不出这个值）时，
`nodes` 变成 0 行、`depthDomain` 回落到 `[0, 1]`、状态行变成"当前剪枝没有留下任何节点"，SVG 里没有 `NaN`。

### 关键概念八：三个小陷阱

- **`symbol` 的 `size` 是外接正方形的面积**，Vega 按 `r = sqrt(size)/2` 作图。
  官方写死 `size: 100`（半径 5px）；本例默认 100 个叶子、叶间距 6.1px，
  写死 100 会糊成一条黑带，所以改成 `pow(0.7 * leafGap, 2)`（直径 ≈ 0.7 倍叶间距），
  并夹在 `[9, 100]` 之间。
- **`data.source` 写成数组**时，`parseData` 走的是
  `array(data.source).map(d => ref(scope.getData(d).output))`，装配出**一个 `Relay` + 一个 `collect`**。
  这里容易想歪：`Relay` 的 `derive` 只在**上游变换 modifies 元组**时才为真
  （`Relay({derive: modify, pulse: upstream})`，`modify` 由该数据集自己的 transform 列表决定），
  多上游本身**不会**触发派生 —— 它只额外插一个 `collect` 把多路 pulse 收拢。
  所以 `miniLinks` 拿到的就是四条流的**原元组**，实测
  `data('miniLinks')[0] === data('linkLine')[0]` 为 `true`，
  `datum.source` 也还是 `miniTree` 里那个节点元组本身。
- **`tooltip` 要写在 `update` 里，不能写 `enter`。** `enter` 只对**新增**的 mark item 跑一次；
  改 `maxDepth` 时存活下来的元组走 MOD 通道，只跑 `update`。
  实测把 tooltip 放 `enter`：`cluster` 这个节点在 `maxDepth` 2 → 3 后 `datum.children`
  已经从 `0` 变成 `4`，tooltip 却还停在"叶子"上。本例因此把 `tooltip` 放进了 `update`。

## 试一试

1. **把 `as` 改回默认**：删掉 `data: nodes` 里的 `"as"`（或改成 `["x","y","depth","children"]`），
   同时把 `size` 换成 `[{"signal":"treeSpan"}, {"signal":"treeHeight"}]`。
   mark 那边一个字都不用改（还是 `x: treeX0 + datum.x` / `y: treeY0 + datum.y`），
   却立刻变成一棵**纵向**树：根在上、叶子在下。
   —— 说明"转置"这件事**全部发生在 `as` 上**。顺手能看到副作用：标签的
   `align`/`dx` 还是按横向树写的（内部节点向左、叶子向右），在纵向树里就全挤在节点两侧了，
   要跟着改成 `baseline`/`dy` 才对。
2. **把 `maxDepth` 调到 3 或 4**：叶子从 100 变成 193 / 220，`leafGap` 掉到 3.2 / 2.8px，
   `showLeafLabels` 自动变 `false`（叶子标签整体消失），`nodeSize` 触到下限 9（半径 1.5px）。
   同时切 `tidy` ↔ `cluster`，这时两者的差别最明显（`tidy` 的浅分支叶子停在中间层）。
3. **勾上 `separation`**：叶子总跨度不变，但子树之间出现"缝"。
   把 `defaultSeparation` 的语义记牢：只区分"同父 / 不同父"，与子树大小无关。
4. **给 `linkShape` 加上 `"arc"`**（改 `bind.options`）：会画出一串大半圆。
   再把 `data: links` 里的 `orient` 从 `"horizontal"` 改成 `"vertical"`：
   `line` / `curve` 两档**毫无变化**（`Paths` 里没有它们的 `-horizontal`/`-vertical` 变体），
   `diagonal` / `orthogonal` 则立刻从"水平切线 / 先竖后横"变成"垂直切线 / 先横后竖"。
5. **把 `labelPad` 从 130 调到 40**：叶子标签被 `limit` 硬截断（末尾出现省略号），
   但**不会**越出画布 —— 这就是 `limit` 存在的意义。再把 `limit` 那一行删掉，
   长名字会直接捅到右面板里去。

## 参考

- 官方示例原文：<https://vega.github.io/vega/examples/tree-layout/>
- `tree` 变换：<https://vega.github.io/vega/docs/transforms/tree/>
- `stratify` 变换：<https://vega.github.io/vega/docs/transforms/stratify/>
- `treelinks` 变换：<https://vega.github.io/vega/docs/transforms/treelinks/>
- `linkpath` 变换：<https://vega.github.io/vega/docs/transforms/linkpath/>
- `path` mark：<https://vega.github.io/vega/docs/marks/path/>
- `symbol` mark（`size` 是面积）：<https://vega.github.io/vega/docs/marks/symbol/>
- 数据集定义（`source` 可以是数组）：<https://vega.github.io/vega/docs/data/>
- 底层算法：d3-hierarchy 的 [`tree`](https://d3js.org/d3-hierarchy/tree) 与 [`cluster`](https://d3js.org/d3-hierarchy/cluster)
- 本地参数表随时可查：`grep -n "Tree.Definition" -A 45 assets/vega.js`、`grep -n "const Paths = fastmap" -B 40 assets/vega.js`

## 与 matplotlib 的对照

这张图在 Vega 里是**一条声明式数据流**：
`stratify`（父子表 → 树）→ `tree`（树 → 坐标）→ `treelinks`（树 → 边表）→
`linkpath`（边表 → SVG path 字符串），四个变换都是内置的，
布局参数（`tidy`/`cluster`、`separation`、`size`）和连线形态（`shape`/`orient`）
全都能挂 signal，于是"换布局""换连线形态""换剪枝深度"都只是改一个值，整条流自动重算。

换到 matplotlib / seaborn：

- **没有树布局**。matplotlib 本体不提供 Reingold–Tilford 或 dendrogram 布局。可选路子：
  - `scipy.cluster.hierarchy.dendrogram()` —— 但它只吃**层次聚类的 linkage 矩阵**（`(n-1)×4`，
    带合并距离），不是任意的 `{id, parent}` 父子表；要用它得先把父子表伪造成 linkage 矩阵，
    而且它画出来的一定是"等高线式"的方角树状图，`tidy` 那种紧凑布局它压根不做。
  - `networkx` + `graphviz_layout(G, prog="dot")` —— 布局质量最接近 `tidy`，
    但要额外装 Graphviz **系统包** + `pygraphviz`（编译扩展，常见的装不上来源）。
    纯 Python 的 `nx.nx_agraph` 替代品 `nx.multipartite_layout` 只按层分列，
    同层节点等距排布，没有"父节点居中于子树"这一步，宽树会互相穿插。
  - 自己写：叶子按顺序均分广度、内部节点取子树重心，递归一趟即可 —— 30 行左右，
    但 `separation`（跨父加倍）、`cluster`（叶子对齐）这些开关都得自己实现。
- **没有 `linkpath`**。四种连线形态得手写：
  直线 `plot([x0,x1],[y0,y1])`；直角折线要么 `plot` 三点、要么 `step`（但 `step`
  只做单调阶梯，父子树的折线方向不固定，一般还是手写三点）；
  贝塞尔要上 `matplotlib.path.Path` + `PathPatch`，自己算 `CURVE4` 的控制点
  （也就是把上面表格里的公式抄成 Python）。切换形态意味着**换一段绘图代码**，
  不是换一个字符串。
- **交互基本没有**。`maxDepth` / `tidy↔cluster` / `separation` / `shape` 这四个控件，
  在 matplotlib 里要么用 `ipywidgets`（只在 Notebook 里活）+ 每次全量重绘，
  要么用 `matplotlib.widgets` 手接回调。而且"改 `maxDepth` → 重新剪枝 → 重跑布局 →
  重算全部边"这条链得自己重新跑一遍，Vega 是数据流自动推的。
- **标签的左右分流**要手写循环：`ha = "right" if node.children else "left"`，
  再逐个 `ax.text(...)`。matplotlib 有 `clip_on`，但**没有 `limit`（按像素截断字符串）**，
  长名字要自己按字宽截。自适应字号（按叶间距反算）也得自己算。
- **`size` 的口径**反而是 matplotlib 更直白：`scatter` 的 `s` 是"点面积（pt²）"，
  Vega 的 `size` 是**外接正方形**面积（`r = sqrt(size)/2`），比 d3 的 `symbolCircle`
  （`sqrt(size/π)`）又差一个常数。两边都得查文档，谁也没赢。

反过来，matplotlib 更省事的地方也很实在：

- **树高不受版心限制**。官方那张 600×1600 的长条图，matplotlib 直接
  `figsize=(6, 16)` + `savefig` 输出一张长图就完事，不用像本例这样为了塞进版心去做深度剪枝。
- **`scipy` 的 dendrogram 是一行**：如果你的数据本来就是层次聚类的结果
  （linkage 矩阵），`dendrogram(Z, orientation="left", labels=names)` 一行出图，
  还自带阈值配色、叶子重排、截断（`truncate_mode="lastp"`）这些聚类专用功能，
  Vega 里全得自己拼。
- **打印级排版**：矢量 PDF、LaTeX 数学标签、精确到点的字号控制，matplotlib 更顺手。

一句话：**布局算法 + 连线形态 + 参数化交互**是 Vega 的主场；
**超长画布输出 + 聚类专用 dendrogram**是 matplotlib 的主场。

## 与官方示例的差异

逐条列出对官方 spec 的每一处改动及原因。

| # | 改动 | 原因 |
| --- | --- | --- |
| 1 | 数据 url `data/flare.json` → `../../assets/data/flare.json` | 本仓库约定：零外部依赖，数据一律走 `assets/data/`。文件内容与形态和官方一致（摊平父子表，252 行） |
| 2 | `$schema` 固定 `https://vega.github.io/schema/vega/v6.json` | 本仓库铁律（官方页面现在给的也是 v6） |
| 3 | signal `links` → **`linkShape`** | 官方 spec 里同时存在名为 `links` 的 signal 和名为 `links` 的数据集。Vega 的两个命名空间不冲突（能跑），但读 spec 的人会当场卡住 —— 改名纯为可读性 |
| 3b | 数据集 `tree` → **`nodes`**，并拆成 `flare` → `depths` → `pruned` → `nodes` 四段，另新增 `leaves` | 官方那个数据集叫 `tree`，和 `tree` **变换**同名，`{"data":"tree"}` 读起来像"引用了那个变换"。改叫 `nodes`（它就是节点表），拆段之后每段只做一件事。`leaves` 只服务于 `leafN` 计数与字号/圆点自适应 |
| 4 | 新增 signal **`maxDepth`**（select，默认 2）+ `data: depths` / `data: pruned` 两段 | 官方画布 600×1600、252 个节点 / 220 个叶子全画；本仓库版心是 1120×700，放不下 1600px 的长条。所以按深度剪枝。**注意剪枝对 `tree` 的影响**：广度方向的位置是按叶子集合均分并归一化到 `size[0]` 的，叶子集合一变全部坐标重算 —— 所以必须"先 filter 再 `stratify` + `tree`"，不能像 `pack`（demo 35）那样"跑完整树、只 filter 渲染"。为了拿到剪枝判据 `depth0`，多跑了一趟 `size: [1,1]` 的 `tree`（父子表里没有深度字段，只有层级布局变换会写 `depth`） |
| 5 | `width`/`height` 从 `600 × 1600` 改成 `1120 × 700`；`padding` 从 `5` 改成 `{"left":6,"top":50,"right":6,"bottom":6}`；新增 `autosize: "none"` 与 `title`；顶层 `description` 换成中文一句话 | 适配本仓库版心与统一页头；`autosize: "none"` 时 padding 不会自动为 `title` 让位，所以显式给了 `padding.top: 50`（实测 title + subtitle 向上探出 37px）。顶层 `description` 是本仓库契约要求的中文说明 |
| 6 | `tree` 的 `size` 从 `[{"signal":"height"}, {"signal":"width - 100"}]` 改成 `[{"signal":"treeHeight"}, {"signal":"treeSpan"}]`，mark 上加 `x: treeX0 + datum.x` / `y: treeY0 + datum.y` 平移 | 官方靠默认 `autosize: "pad"` 自动扩边（根标签探出画布也没事）、`width - 100` 那 100px 留给叶子标签。本例是多面板布局，面板原点必须自己算；`treeSpan = mainRight - treeX0 - labelPad` 就是官方 `width - 100` 的显式版 |
| 7 | scale `color` 的 `domain` 从 `{"data":"tree","field":"depth"}` 改成 `{"signal":"depthDomain"}` | 官方没管"过滤到 0 行"的情况，那时 domain 退化成空集/零跨度，图例刻度全消失并触发 `Infinite extent` WARN（本仓库校验器判失败）。改成只有 `update` 的派生 signal 兜底，配套 `hasNodes` 驱动一段"当前剪枝没有留下任何节点"的提示文字（用 signal 驱动 text mark，**不是**新建一个默认为空的数据集） |
| 8 | scale `color` 的 `range` 从 `{"scheme":"magma"}` 改成 `{"scheme":"magma","extent":[0.12,0.78]}` | `magma` 的高端接近浅黄，在白底上几乎看不见。domain 被剪枝压缩到 `[0, 2]` 后这个问题更明显，所以掐掉两端 |
| 9 | 新增 `legends`（depth 渐变图例，`values: {"signal":"sequence(0, maxDepth + 1)"}`） | 官方没有图例，读者看不出颜色代表什么。`sequence` 右开区间，`stop` 要写 `maxDepth + 1` 才取到 `maxDepth` |
| 10 | symbol 的 `size` 从写死 `100` 改成 `min(100, max(9, pow(0.7 * leafGap, 2)))` | `size` 是外接正方形面积（`r = sqrt(size)/2`）。官方 220 个叶子挤在 1600px 里（叶间距 7.3px）、半径 5px 已经在糊边；本例默认 100 个叶子挤在 610px 里（叶间距 6.1px），写死 100 会糊成一条黑带 |
| 11 | text 的 `fontSize` 从写死 `9` 改成"内部节点 9 / 叶子 `leafLabelSize`"，并加 `limit` 与密度阈值 `showLeafLabels` | 剪枝深度可调 → 叶间距在 2.8px（`maxDepth = 4`，220 个叶子）~ 61px（`maxDepth = 1`，10 个叶子）之间变化，写死字号在两端都不合适。`limit` 是硬保证：字号自适应只决定要不要画，`limit` 决定画出来一定不越界（`maxDepth ≤ 2` 时最长叶子名 19 字符） |
| 12 | 新增右面板：`miniTree` + `linkLine`/`linkCurve`/`linkDiagonal`/`linkOrtho` + `miniLinks` + `shapeRows` + 相关 mark | 官方只能靠下拉框逐个切 shape 看差别。本例用同一棵 8 节点小树把四种形态**并排**画出来，选中的那一行标红，一眼可比。这部分是纯新增，不改动官方那一支的语义 |
| 12b | mark 上的其它增补：左面板的 path 与 text、以及右面板全部说明性 mark 都加了 `interactive: false`（只有节点 symbol 保持可拾取）；path 的 `stroke` 从 `update` 挪到 `enter` 并补 `fill: null` + 自适应 `strokeWidth`；symbol 补 `shape: "circle"`（本来就是默认值，写出来只为可读）、自适应 `strokeWidth`、`tooltip` 与一整套 `hover` 编码集（含 `zindex`）；text 补显式 `fill` | 只有 symbol 需要拾取（tooltip / hover），其余 mark 关掉 `interactive` 免得抢拾取。`hover` 编码集必须配 `update` 才会在鼠标移出后复位（本仓库坑清单里的一条），本例三者齐备。**`tooltip` 刻意放在 `update` 而不是 `enter`**：`enter` 只对新增 item 跑一次，改 `maxDepth` 时存活元组走 MOD 通道、只跑 `update`，放 `enter` 会让 tooltip 停在旧的 `depth`/`children` 上（实测 `cluster` 节点 `children` 已从 0 变 4，tooltip 仍说"叶子"） |
| 13 | 顶层键顺序与官方一致（`signals` → `data` → `scales` → `marks`），未做调整 | 列在这里只为说明：**官方 spec 的 `scales` 条目里没有任何注释键**（只有 `name`/`type`/`range`/`domain`/`zero`），所以本仓库常见的"把 `description` 从 `scales` 搬走"这项适配，本例不需要做 |
| 14 | 全部注释写进 `data` / `signals` / `marks` 条目的 `description` 字段 | 本仓库铁律：`scales` 条目里放未知键会触发 `Unsupported scale property` WARN。`data` / `signals` / `marks` 上的 `description` 是合法的 |

**没有改的地方**：官方示例里不存在 `now()` / `Math.random()` 之类不可复现的调用，
也没有覆盖 `width` / `height` / `padding` / `background` / `autosize` / `cursor`
这些内建 signal（它的四个 signal 是 `labels` / `layout` / `links` / `separation`），
所以"去掉不可复现调用""内建 signal 改名"这两类适配本例都不需要做。
官方那四个控件的**默认值**（`labels: true`、`layout: "tidy"`、`links/linkShape: "diagonal"`、
`separation: false`）也全部保留。
