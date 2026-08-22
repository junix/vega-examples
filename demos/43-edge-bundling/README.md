# 43 · 层级边捆绑：treePath + 按数组字段 facet + bundle 插值

对应官方示例 **[Edge Bundling](https://vega.github.io/vega/examples/edge-bundling/)**（G 组，官方示例精读）。

这是本仓库信息密度最高的一张图：`flare` 类库的 **220 个叶子类**沿一个圆环排成径向树状图，
**764 条 import 依赖**不走直弦，而是**沿着目录树的路径**从起点绕到终点，再被"捆"向两点连线。
于是同一个包内部的依赖收成一束、跨包的依赖穿过圆心 —— 网络的层级结构直接看得见。

数据：`../../assets/data/flare.json`（摊平的父子表 `{id, name, parent?, size?}`，252 行 / 220 叶子 / 最深 4 层）
+ `../../assets/data/flare-dependencies.json`（764 行 `{source, target}`，值是节点 `id`）。
约定是 **target 依赖 source**（`{source: 35, target: 4}` = `AgglomerativeCluster` import 了 `Transitioner`）。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/43-edge-bundling/
```

## 学习目标

1. 掌握表达式函数 **`treePath('tree', source, target)`**：给两个节点 id，返回它们在树上的
   **路径（节点元组数组）**。它是"边捆绑"能用声明式写出来的唯一原因 —— 没有它，你得自己在
   JS 里算最近公共祖先。同时理解为什么它必须配 **`"initonly": true`**：那不是性能优化，
   **不加会直接报 `PreFacet does not support field modification.`**（本文档下面有实测）。
2. 掌握 `from.facet` 的第二种、也是极少见的形态：**`{"field": "treepath"}`**。
   `groupby` 是"按键值分组"，`field` 是"这一行里已经躺着一个数组，把它摊成一个子数据集"。
   于是**每条依赖 = 一个子 group = 一条穿过树的折线**。
3. 掌握 `line` mark 的 **`interpolate: "bundle"` + `tension`**：把折线朝"起止两点的直线"收紧的
   插值曲线。`tension` 在 d3 里叫 `beta`，0 = 一把直弦，1 = 完全贴着树走。**这才是"边捆绑"的本体**，
   拖一次滑杆就明白了。
4. 掌握**极坐标手工换算**：`tree` 变换只会吐 `[广度, 深度]` 两个归一化数，径向效果全靠
   4 个 `formula`。搞懂 `(rotate + extent * alpha + 270) % 360` 里那个 **270 是干什么的**。
5. 掌握径向标签的**左右半圆翻转**三件套（`angle - 180` / `align` 反转 / `dx` 变号），
   以及 `indata()` 做 O(1) 反查高亮的写法。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| 顶层 `width`/`height`/`autosize` | 720×720 固定画布 | `autosize: "none"` ⇒ 画布尺寸不会为标题/标签自动膨胀，`padding` 必须**手工**留够（见下"padding 怎么算出来的"）。注意标题是放在**整组 mark 包围盒之上**的，所以 `padding.top` 要算上类名探出去的那 52px |
| `title` | 主标题 + signal 副标题 | `subtitle` 写成 `{"signal": ...}`，把当前 `layout` / `tension` / `radius` / `extent` / `rotate` 实时印在图上；数字一律 `format(...)`，不给浮点直出留口子 |
| `signals`（外观 7 个） | `tension` `radius` `extent` `rotate` `textSize` `textOffset` `layout` | 全部 `bind`，右侧面板可直接拖。**`extent` 这个名字盖住了同名的 `extent()` 表达式函数** —— 官方就这么命名，本 spec 因此任何地方都不能再调用 `extent(...)` |
| `signals`（配色 2 个） | `colorIn` `colorOut` | 只在 `mark` 与 `scale.range` 里被引用，改一处两边同时变色 |
| `signals`（几何 2 个） | `originX` `originY` | `width / 2`、`height / 2`；圆心不写死，改画布尺寸时自动跟随 |
| `signals`（交互 1 个） | `active` | 由 `@leafLabel:pointerover` 与 `pointerover[!event.item]` 驱动的当前高亮节点 id |
| `signals`（派生 2 个） | `activePath` `statusText` | `treeAncestors` 取祖先链拼全名；`statusText` 做**空态兜底**（`active` 为 null 时 `selected` 是 0 行，图上一根高亮都没有，得说一句话） |
| `data: tree` | `stratify` → `tree` → 4 个 `formula` | 布局与极坐标换算全在这里；`as: ["alpha","beta","depth","children"]` 把 `tree` 的 (x, y) 重命名成 (广度, 深度) |
| `data: leaves` | `filter !datum.children` | `tree` 变换往 `children` 写的是**子节点个数**（数字），叶子是 `0`（falsy）。220 行 |
| `data: dependencies` | `formula treePath(...)` + `initonly` | 764 行，每行多出一个 `treepath` 字段：从 source 到 target 的节点元组数组 |
| `data: selected` | `filter datum.source === active \|\| datum.target === active` | 与当前高亮节点相关的边（默认 46 行）。给 `indata()` 当索引用 |
| `scales: color` | `ordinal`，写死两项 domain | range 是两个 `{"signal": ...}`，和 mark 用的是同一份颜色 |
| `legends` | `stroke: "color"` + `symbolType: "stroke"` | 图例画成两段**线段**而不是色块 —— 因为图上被染色的就是线 |
| `marks[0]` `leafLabel` | 220 个类名，径向排布 | 左半圆翻转三件套 + `indata()` 决定 `fill` / `fontWeight` |
| `marks[1]` group（facet field） | **本例核心**：764 个子 group | 每个 group 里一条 `line`，`interpolate: "bundle"`，`tension` 由 signal 给；`parent.source` / `parent.target` 取的是**被 facet 的那一行依赖** |
| `marks[2]` `statusLabel` | 图下方的状态行 | 位置 `y = height + 40`（落在 `padding.bottom` 里）—— 左上角看着空，其实被 12 点钟方向那圈竖排类名穿过。`"interactive": false` 也不能省，否则它自己也是个 text mark，会抢 pointer 事件 |

### 关键概念 1：`treePath` 是怎么工作的，以及 `initonly` 为什么是必须的

```json
{ "name": "dependencies",
  "url": "../../assets/data/flare-dependencies.json",
  "transform": [
    { "type": "formula", "as": "treepath", "initonly": true,
      "expr": "treePath('tree', datum.source, datum.target)" }
  ] }
```

`assets/vega.js` 里的实现只有 5 行（搜 `function treePath`）：

```js
function treeNodes(name, context) {
  const tree = data(name, context);
  return tree.root && tree.root.lookup || {};   // stratify 挂上去的 id → 节点 映射
}
function treePath(name, source, target) {
  const nodes = treeNodes(name, this), s = nodes[source], t = nodes[target];
  return s && t ? s.path(t).map(d => d.data) : undefined;   // d3 的 node.path()
}
```

三件事值得记住：

- **它依赖 `stratify` 的产物。** `stratify` 不改 tuple，只在数据源上挂一棵 `d3.hierarchy`
  （`pulse.source.root`）以及一张 `lookup`（键就是 `stratify` 的 `key`，本例是 `id`）。
  所以 `treePath` 的第一个参数必须是**跑过 `stratify` 的那个数据集名**。
  写错名字时它返回 `undefined` —— 一句 WARN 都没有，只有整图空白。
- **返回的是元组本身，不是拷贝。** `s.path(t)` 是 d3 的"从 source 上溯到最近公共祖先、
  再下行到 target"，`.map(d => d.data)` 把 hierarchy 节点换回**原始 tuple 的引用**。
  这一点是后面一切能成立的关键：`radius` / `rotate` / `extent` / `layout` 变化时，
  `formula` 改写的是这些 tuple 的 `x` / `y` 字段，而 `treepath` 数组里装的正是同一批 tuple ——
  **路径本身不用重算，线自己就跟着动了**。
  第一条依赖 `{source: 35, target: 4}` 的路径长度是 6：
  `Transitioner → animate → flare → analytics → cluster → AgglomerativeCluster`。
- **`"initonly": true`：只在 ADD 时算一次。** 源码里就两行
  （`assets/vega.js` 的 Formula 算子）：`flag = _.initonly ? pulse.ADD : ...`，
  以及 `if (!_.initonly) { /* 声明 modifies(as) */ }`。
  也就是说加了它，`treepath` 字段**永远不会被标记为"改过"**。

  这不是省 CPU，**是正确性**。下游的 `PreFacet` 算子第一句就是：

  ```js
  if (_.modified('field') || field && pulse.modified(accessorFields(field)))
    error('PreFacet does not support field modification.');
  ```

  实测（把 `initonly` 删掉，其余不变，然后改一下 `rotate`）：

  ```
  initonly=true   初次渲染 logs=(无)    改 rotate 后 logs=(无)
  initonly=false  初次渲染 logs=(无)    改 rotate 后 logs=ERROR PreFacet does not support field modification.
  ```

  初次渲染两者都正常，**一动滑杆就炸**。这是"默认值下绿、拖到别处才崩"的典型，
  校验器只跑默认值，抓不到 —— 所以写出来放在这。

### 关键概念 2：`from.facet` 的 `field` 形态（PreFacet）

```json
{ "type": "group",
  "from": { "facet": { "name": "path", "data": "dependencies", "field": "treepath" } },
  "marks": [ { "type": "line", "from": {"data": "path"}, ... } ] }
```

`from.facet` 只有两种合法写法，解析代码（`assets/vega.js` 的 `parseFacet`）一目了然：

| 写法 | 生成的算子 | 语义 |
| --- | --- | --- |
| `"groupby": ["k"]` | `Facet` | 按键值把**一个**数据集切成 N 组，每组一个 group mark |
| `"field": "arr"` | `PreFacet` | 数据**已经预先分好组了**：每行的 `arr` 字段就是那一组的成员数组 |

`PreFacet` 的核心也只有三行：

```js
const subflow = t => this.subflow(tupleid(t), flow, pulse, t);  // 每行一个子流，键 = tuple id
pulse.visit(pulse.ADD, t => {
  const sf = subflow(t);
  field(t).forEach(_ => sf.add(ingest(_)));   // 把数组元素喂进这个子流
});
```

于是：**764 行依赖 → 764 个子数据集 → 764 个 group mark → 764 条 `line`**。
两个容易漏的点：

- **`parent` 指向被 facet 的那一行**（这里就是 `{source, target, treepath}`），
  所以子 mark 里能写 `parent.source === active` 判断这条边的方向。
  子 mark 自己的 `datum` 是路径上的**节点**，只有 `x` / `y` / `name` / `id`，没有 source/target。
- **不需要 `collect` 排序。** AGENTS.md 的坑清单里写着"`line` mark 没有 series 通道，
  多序列只能 facet，而 facet 分组内保留源数据顺序，所以上游必须先 `collect` 排好序"——
  本例是那条规则的**例外**：`treepath` 数组本身就是从 source 到 target 的正确顺序，
  `PreFacet` 按数组顺序 `forEach` 灌进子流，顺序天生就对。
- 顺带记一下渲染开销：**每个 group item 在 SVG 里都会多出 `background` + `foreground` 两个
  `<path>`**（即使没画底色也照样输出）。所以 764 条线对应 `764 × 3 = 2292` 个 `<path>`，
  再加上另外 6 个 group（根 frame、group mark 的两层容器、legend、legend-entry、title）
  各 2 个 = 12 个，以及图例那 2 个线段符号，最终 SVG 一共 **2306** 个 `<path>` ——
  `node tools/inspect.cjs 43` 的「SVG 图元统计」就是这么来的。
  节点标签 220 个 `<text>`，加标题/副标题/状态行/图例标题/图例两项标签 = 226 个 `<text>`。

### 关键概念 3：`interpolate: "bundle"` 与 `tension` 到底在算什么

`assets/vega.js` 的曲线查找表写得很清楚：

```js
'bundle': { curve: curveBundle, tension: 'beta', value: 0.85 }
```

`curves(type, orientation, tension)` 会执行 `curve[entry.tension](tension)`，
也就是 **`tension` 这个通道对 `bundle` 而言就是 d3 的 `curveBundle.beta(β)`**。
（同一个 `tension` 通道对 `cardinal` 是张力、对 `catmull-rom` 是 α —— 名字一样，含义按曲线类型换。）

β 的作用在 d3 的 `Bundle.lineEnd` 里（`assets/vega.js` 搜 `_basis.point(this._beta *`）：

```js
// (x0, y0) 是路径首点，(dx, dy) = 末点 - 首点，t = i / (n - 1)
this._basis.point(
  beta * x[i] + (1 - beta) * (x0 + t * dx),
  beta * y[i] + (1 - beta) * (y0 + t * dy)
);
```

翻译成一句话：**先把每个控制点按 β 在"它自己"和"首末连线上的等分点"之间做线性插值，
再把插值后的点串喂给 basis（三次 B 样条）**。所以

- **β = 0**：所有控制点被拉到首末直线上的等分点 → 画出来就是一条**直弦**（一根 hairball 毛线）。
- **β = 1**：控制点原样喂给 B 样条 → 曲线**紧贴树的路径**（沿着目录结构绕行）。
  注意 B 样条**不穿过**中间控制点，所以即使 β = 1，线也是光滑的、不会在每个包节点上打折 ——
  这正是"看起来像一束电缆"的原因。
- **0 < β < 1**（默认 0.85）：既保留层级走向，又把同一束边收紧到一起。

把 `tension` 拖到 0 再拖回 0.85，就能亲眼看到"边捆绑"这个技术在解决什么问题：
220 个点两两连 764 条直弦是一团毛线，沿层级绕行 + 捆紧之后，包与包之间的依赖关系才读得出来。

### 关键概念 4：极坐标手工换算 —— 那个 270 是什么

`tree` 变换本身**完全不懂极坐标**，它只会往 tuple 上写两个数：

```json
{ "type": "tree", "method": {"signal": "layout"}, "size": [1, 1],
  "as": ["alpha", "beta", "depth", "children"] }
```

`size: [1, 1]` 把布局归一化到单位正方形，于是
**`alpha` ∈ [0,1] 是"广度"位置**（`cluster` 下就是叶子的排序位次），
**`beta` ∈ [0,1] 是"深度"**（根 = 0；`cluster` 下所有叶子 = 1，`tidy` 下按层递增）。
径向效果由紧随其后的 4 个 `formula` 造出来：

```json
{ "expr": "(rotate + extent * datum.alpha + 270) % 360",                        "as": "angle" }
{ "expr": "inrange(datum.angle, [90, 270])",                                    "as": "leftside" }
{ "expr": "originX + radius * datum.beta * cos(PI * datum.angle / 180)",        "as": "x" }
{ "expr": "originY + radius * datum.beta * sin(PI * datum.angle / 180)",        "as": "y" }
```

- **`extent * alpha`**：把 [0,1] 的广度铺到 `extent` 度的圆心角上（默认 360° = 铺满整圈）。
- **`+ 270`**：Vega/canvas 的角度是"从 +x 轴起算、**y 轴朝下**为正方向"，所以 0° 指向**正右**。
  加 270 后，`alpha = 0` 落在 270°：`cos 270° = 0`、`sin 270° = -1`，`y` 减小 —— 也就是**正上方**。
  之后 `alpha` 增大，角度沿 270° → 0° → 90° → 180° 走，屏幕上是"上 → 右 → 下 → 左"，
  即**从 12 点钟方向顺时针**排列。
  为什么不写 `- 90`（数学上等价）？因为紧接着要 `% 360`，写 `+270` 能保证结果落在 `[0, 360)`，
  下一行 `inrange(datum.angle, [90, 270])` 才是个干净的"左半圆"判据；写 `-90` 会出现负角度，
  判据得写成两段。
- **`PI * angle / 180`**：Vega 表达式里的 `cos` / `sin` 吃**弧度**，`angle` 是**度**，必须换。
  （而 text mark 的 `angle` 通道吃的是**度**，所以下面标签那里不用换 —— 这两个单位不一致是常见的错源。）
- **`radius * beta`**：半径正比于深度。`cluster` 下所有叶子 `beta = 1`，全部落在 `radius` 那一圈；
  切成 `tidy` 后内部节点也按层摊开，叶子不再对齐（右侧 radio 一切就看出区别）。
- **`leftside`**：`angle ∈ [90, 270]` ⇔ `cos ≤ 0` ⇔ 点在圆心左侧。

**左右半圆标签翻转**（`leafLabel` mark 的三行）：

```json
"dx":    {"signal": "textOffset * (datum.leftside ? -1 : 1)"},
"angle": {"signal": "datum.leftside ? datum.angle - 180 : datum.angle"},
"align": {"signal": "datum.leftside ? 'right' : 'left'"}
```

右半圆：文字沿半径**向外**读，左对齐、`dx` 向右推开 2px。
左半圆：如果照抄右半圆的写法，文字会整体上下颠倒、并且从圆心往外"倒着"写。
所以整体转 **180°**，`align` 换成 `'right'`（这样文字的"末端"贴着圆环、"开头"在外侧），
`dx` **变号**让偏移仍然是"往外推"。三个改动缺一不可 —— 少了 `align` 就会跟圆环重叠，
少了 `dx` 变号就会往圆内挤 2px。

### 关键概念 5：`indata()` 高亮与 `@markname:` 事件选择器

```json
"fill": [
  {"test": "datum.id === active",                        "value": "black"},
  {"test": "indata('selected', 'source', datum.id)",     "signal": "colorIn"},
  {"test": "indata('selected', 'target', datum.id)",     "signal": "colorOut"},
  {"value": "#4a4a4a"}
]
```

- `indata(数据集, 字段, 值)` 会在该 (数据集, 字段) 上**建一张索引**再做集合查询（O(1)），
  不是每个标签扫一遍 46 行。它的 `indataVisitor` 同时把"这个数据集"和"这个字段"登记成依赖，
  所以 `selected` 一变（也就是 `active` 一变），220 个标签的 `update` 编码集自动重跑。
- 颜色的语义方向要对上：数据约定是 **target 依赖 source**。高亮节点 A 时，
  边 (S → A) 里的 `S` 是 **A 依赖的**东西（`indata('selected','source', …)` → `colorIn` 红），
  边 (A → T) 里的 `T` 是**依赖 A 的**东西（→ `colorOut` 绿）。
  线的着色恰好相反（`parent.source === active` → 绿），因为那是**边**的方向而不是**对端节点**的角色 ——
  官方 spec 这两处一红一绿地"交叉"写，第一次读很容易以为是笔误，其实是对的。
- `active` 的第一个事件源写成 **`@leafLabel:pointerover`**：`@` 前缀表示按 **mark 的 `name`** 过滤
  （`assets/vega.js` 的 `filterMark` 生成 `event.item.mark.name === 'leafLabel'`）。
  官方写的是 `text:pointerover`，那是按 **mark 类型**过滤（`event.item.mark.marktype === 'text'`）——
  会把图例标签、状态文字这些 text mark 一起命中。详见"与官方示例的差异"。
- 第二个事件源 `pointerover[!event.item]`：鼠标移到**没有图元**的地方就复位成 `null`。

### padding 怎么算出来的（以及标题是"浮"在 mark 上面的）

`autosize: "none"` 意味着"画布就是 720×720，谁都别想把它撑大"，于是标题和探到圈外的类名
只能靠 `padding` 让位。导出的 SVG 尺寸 = `left + width + right` × `top + height + bottom`，
**凡是超出 padding 的部分直接被 viewBox 裁掉**（不报错、不告警）。

先量：本 demo 默认参数下的场景包围盒是 `x ∈ [-20.8, 762.8]`、`y ∈ [-90.1, 771]`，
即对 720×720 的绘图区而言 **左超 21 / 右超 43 / 上超 91 / 下超 51**，
所以 padding 给到 `{"top": 100, "right": 100, "bottom": 76, "left": 100}`（四边都留了几像素余量）。
这些数是量出来的，不是猜的 —— 复现方式见下面的小脚本。

- **左右的超出**来自最长的类名（`DelimitedTextConverter`，22 字符）：半径 280 + `textOffset` 2 + 文字宽度。
- **下方的超出**是 6 点钟方向竖着朝下的类名，再加上图下方那行状态文字（放在 `y = height + 40`）。
- **上方的 91 是个容易踩空的坑**：`title` 不是钉在画布顶端的，Vega 的 `viewLayout` 把它放在
  **整组 mark 包围盒的上方**。12 点钟方向那个竖着朝上的类名已经探到 `y ≈ -52`，
  于是标题组被顶到 `y ∈ [-90.1, -58.1]`（标题 15px + `subtitlePadding` 6 + 副标题 11 = 32px 高，
  再减 `offset` 6）。**只按"标题 32px + 一点余量"给 `padding.top` 是不够的**，
  必须算上「mark 自己探出去多少」+「标题组高度」+「offset」。写 76 就会把标题顶上的 14px 削掉。
- 纯 Node 下文字宽度是**估算**的（`0.8 × 字数 × 字号`，见 AGENTS.md），CJK 与 Helvetica 都比浏览器里
  宽出约 40%，所以这套 padding 在浏览器里是宽裕的（上方会多出几十像素白边），
  在 Node 导出里刚好不裁 —— 按更保守的那一边取值。

自己量一遍（`node -` 粘进去即可）：

```js
const vega = require('./assets/vega-bundle.cjs');           // 在仓库根目录跑
vega.textMetrics.canvas(false);
const dir = './demos/43-edge-bundling/';
const loader = vega.loader({ mode: 'file', baseURL: dir });
loader.fileAccess = true;
loader.file = f => require('fs').promises.readFile(f, 'utf8');
const spec = JSON.parse(require('fs').readFileSync(dir + 'spec.vg.json', 'utf8'));
const view = new vega.View(vega.parse(spec), { renderer: 'none', loader });
view.runAsync().then(() => {
  const root = view.scenegraph().root;
  console.log(root.bounds);                                  // 整幅的包围盒
  root.items[0].items.forEach(m => console.log(m.role, m.name, m.bounds));  // 逐个 mark / 标题 / 图例
});
```

### 状态行为什么放在图的下方

`statusLabel` 的位置是 `x: 0` / `y: {"signal": "height + 40"}`，即**绘图区下沿再往下 40px**
（落在 `padding.bottom` 里）。第一版写的是 `(0, 0)`，看着是"左上角空白处"，其实不空：
12 点钟方向那一圈类名是**近乎竖直**的，包围盒从 `y ≈ -52` 一直伸到 `y ≈ 87`，
`y ∈ [0, 11]` 这条横带上有十几个类名穿过（`StackedAreaLayout`、`OperatorSequence`、
`TreeMapLayout` …），横排的中文状态文字会被它们扎成一片。
放到图下方还有一个附带好处：**它不会再参与标题的自动布局**（标题只往 mark 包围盒的**上方**放），
所以状态文字长短变化不会把标题推来推去。

## 试一试

1. **看清"捆绑"到底是什么**：把 `tension` 从 0.85 拖到 **0** —— 764 条边变成 764 根直弦，
   典型的"毛线球"；再拖到 **1**，边完全贴着目录树走，包与包之间只剩几条主干。
   0.85 是两者的折中：既能看出层级，又不至于所有边挤成一条。
2. **换布局**：`method` 从 `cluster` 切到 `tidy`。`cluster`（树状图）把所有叶子对齐到最外圈，
   所以类名排成整齐一圈；`tidy`（Reingold-Tilford）按层安置节点，叶子的 `beta` 不再都是 1，
   类名会内外错落 —— 谁的可读性更好，自己判断。
3. **把 `extent` 拖到 270、再把 `rotate` 拖到 90**：留出一个 90° 的缺口，图变成"C 形"。
   这是把"环形"改成"扇形"最省事的办法：一个 signal，不用动任何几何公式。
4. **把 `initonly` 删掉再拖任意滑杆**：控制台会立刻出现
   `PreFacet does not support field modification.`，图停止更新。
   这条实验值得亲手做一次 —— 它解释了为什么这个标志不是可选项。
5. **把 `radius` 拖到 400、`textSize` 拖到 20**：标签会探出画布（实测包围盒变成
   `x ∈ [-293, 1066]`、`y ∈ [-410, 1029]`，上方超出 410px），因为 `autosize: "none"` 不会
   替你把画布撑大。修法有两种：把 `padding` 加大，或者把顶层 `autosize` 换成 `"pad"`
   （后者会让画布尺寸随参数抖动，交互时更晃眼）。
6. **改颜色语义**：把 `colorIn` / `colorOut` 换成 `"#d62728"` / `"#2ca02c"`，
   注意图例、节点标签、连线三处会同时变 —— 因为它们引用的是同一对 signal，
   而不是各写一遍十六进制。

## 与官方示例的差异

结构与技术要点**完全忠于官方**（`stratify` → `tree` → 4 个 `formula`、`treePath` + `initonly`、
`facet.field` + `bundle`、`indata` 双色高亮一处未动）。为适配本仓库约定做了如下改动：

| # | 改动 | 官方写法 | 本例写法 | 原因 |
| --- | --- | --- | --- | --- |
| 1 | 数据路径 | `data/flare.json`、`data/flare-dependencies.json` | `../../assets/data/…` | 本仓库零外部依赖、数据自带 |
| 2 | **`active` 默认值** | `"value": null` | `"value": 35`（`flare.animate.Transitioner`，46 条相关依赖） | 官方默认 `null` 时派生数据集 `selected` 是 **0 行**，而本仓库校验器**把空数据集判为失败**（"数据没真的读进来？"）。给一个默认高亮节点同时也让首屏就展示出这张图的交互效果 |
| 3 | **事件选择器** | `"events": "text:pointerover"` | `"events": "@leafLabel:pointerover"`，并给叶子标签 mark 加了 `"name": "leafLabel"` | `text:` 是**按 mark 类型**过滤（`item.mark.marktype === 'text'`），会连图例标签、本例新增的状态文字一起命中，把 `active` 设成 `undefined`。`@name:` 是**按 mark 名**过滤，只认叶子标签。官方 spec 里恰好没有别的 text mark，所以不暴露这个问题 |
| 4 | 新增空态提示 | 无 | 新增 `activePath` / `statusText` 两个派生 signal + `statusLabel` text mark（`"interactive": false`，位置 `y = height + 40`，放在图下方而不是左上角，理由见上文） | G 组契约要求 data 驱动的交互给"无匹配"提示：鼠标移到空白处后 `selected` 变 0 行、整图无高亮，得有一句话说明这是正常状态而不是坏了。顺带演示了另一个树相关的表达式函数 `treeAncestors`（注意它在 id 不存在时返回 `undefined`，而 `pluck(undefined, 'name')` 会抛 TypeError，所以外面套了 `isArray(...)`） |
| 5 | 新增 `title` | 无标题 | 主标题 + `{"signal": ...}` 副标题（实时印出 `layout`/`tension`/`radius`/`extent`/`rotate`） | 通用契约要求顶层写 `title`；副标题顺便让"拖滑杆"这件事有读数 |
| 6 | `padding` | `5`（标量） | `{"top": 100, "right": 100, "bottom": 76, "left": 100}` | 通用契约要求布局不溢出。`autosize: "none"` 下 `padding` 不会为标题自动让位（AGENTS.md 坑清单），官方的 `5` 会把最长的类名和新加的标题裁掉。数值由实测包围盒反推（上超 91 / 下超 51 / 左超 21 / 右超 43），见上文"padding 怎么算出来的" |
| 7 | 图例与配色文案 | `title: "Dependencies"`，domain `["depends on", "imported by"]` | 标题 `"依赖方向（悬停某个类时）"`，domain `["当前节点依赖的", "依赖当前节点的"]`，并显式给了 `labelFontSize` / `titleFontSize` | 本仓库文档与图面文案用中文；CJK 在纯 Node 下宽度被低估，显式定字号便于估余量 |
| 8 | 非高亮标签颜色 | `{"value": "black"}` | `{"value": "#4a4a4a"}` | 220 个纯黑标签会盖过 `strokeOpacity: 0.2` 的连线；把"未选中"降成深灰、"选中节点自身"保持纯黑，层次才分得开。**仅此一处是纯观感调整** |
| 9 | `bind` 控件文案 | `{"input": "range", "min": 0, "max": 1, "step": 0.01}`（无 `name`，控件标签直接显示 signal 名） | 7 个 `bind` 都加了 `"name": "捆绑张力 tension："` 这类中文标签 | 本仓库 demo 的滑杆面板给人读，光看 `textOffset` / `extent` 猜不出是什么；`bind.name` 只影响控件上的文字，不改 signal 名，spec 语义一字未动 |
| 10 | 顶层 `description` | `"A network diagram of software dependencies, with edges grouped via hierarchical edge bundling."` | 中文一句话说明（附带点出本例四个技术要点） | 通用契约要求顶层 `description` 写一句话中文说明 |
| 11 | 注释 | 无 | 在 `data` / `signals` / `marks` 条目上加了 `description` | 这三类条目上的未知键 Vega 会忽略；**`scales` 上不行**（会触发 `Unsupported scale property` WARN，校验器判失败），所以 `scales` 里一个注释都没加 |

没有改动的项：`now()` / `Math.random()` 之类不可复现调用**官方本来就没有**；
`width` / `height` / `padding` 等内建 signal **官方也没有覆盖**（`extent` 虽然盖住了同名的
**表达式函数**，但那不是内建 signal，且官方语义正确，保留原名并在上文点明）；
`scales` 条目里官方也没有注释键。

## 与 matplotlib 的对照

**Vega 侧一共只用了 4 个语法元素**就把这张图说完了：
`treePath()` 表达式函数（求树上路径）、`from.facet.field`（数组 → 子数据集）、
`interpolate: "bundle"` + `tension`（捆绑曲线）、4 个 `formula`（极坐标换算）。
一份 JSON，没有一行绘图代码，而且 764 条边的交互高亮是"声明"出来的，不是"实现"出来的。

换成 matplotlib / seaborn，逐项要付的代价：

| 环节 | Vega | matplotlib 侧 |
| --- | --- | --- |
| 建树 | `stratify` 一行 | 自己从 `{id, parent}` 建邻接表；或装 `networkx` 用 `nx.DiGraph` |
| 求两点路径 | `treePath('tree', s, t)` | **没有内置**。得自己写"上溯到最近公共祖先再下行"，或 `networkx.shortest_path`（在树上等价，但 764 次调用要自己缓存） |
| 径向布局 | `tree` + `size: [1,1]` + 4 个 `formula` | `networkx` 没有 dendrogram 布局；要么自己按叶子序号均分角度（本例其实就是这么算的，可以照抄公式），要么用 `scipy.cluster.hierarchy.dendrogram` 再手工掰成极坐标 |
| 捆绑曲线 | `interpolate: "bundle"` + `tension` | **没有内置**。`matplotlib.path.Path` 只给你 `CURVE3` / `CURVE4`（二/三次贝塞尔）。要复刻得自己实现 B 样条 + β 混合：先算 `β·Pᵢ + (1-β)·(P₀ + tᵢ·ΔP)`，再用 `scipy.interpolate.BSpline`（k=3）采样成折线喂给 `Path`。约 20~30 行，且要自己处理端点重复节点 |
| 764 条边 | 764 个 group mark，引擎负责 | 强烈建议合成一个 `LineCollection`，否则 764 次 `ax.plot` 会明显卡；但 `LineCollection` 里再想"只把 46 条改色"就得重建整个 collection 的 `colors` 数组 |
| 标签翻转 | 3 行 `signal` 表达式 | `ax.text(..., rotation=deg, rotation_mode='anchor', ha=...)`，逻辑一样，但 220 次循环里手写 if/else；`rotation_mode='anchor'` 不写就会绕文字中心转（和 Vega 不写 `align` 的症状一模一样） |
| 悬停高亮 | `signal` + `indata()` + `test`，声明式 | 接 `fig.canvas.mpl_connect('motion_notify_event', …)`，自己做命中测试（220 个旋转文字的命中测试尤其烦）、自己重设 collection 的颜色数组、自己 `draw_idle()`。要在网页上给别人看还得再搭一层（mpld3 / Bokeh / Plotly） |
| 参数化调整 | 7 个 `bind` 滑杆，spec 内声明 | `matplotlib.widgets.Slider` + 回调；每个回调里自己决定"重算布局还是只重画" |

**反过来 matplotlib 更省事的地方**（诚实说）：

- **一次性出版级静态图**。要 300 dpi 的 PDF/EPS、要 LaTeX 数学字体、要精确的 mm 尺寸和
  `constrained_layout`，matplotlib 直接给；Vega 这边 `autosize: "none"` + 手算 `padding`
  （本 README 专门写了一节）就是在做 matplotlib 自动帮你做的事。
- **调试**。Python 里可以在算路径的循环里下断点、`print` 中间数组；
  Vega 的 `formula` 表达式写错数据集名时**既不报错也不 WARN**，只能靠
  `node tools/inspect.cjs 43` 去看字段到底有没有算出来。
- **只画一次、不要交互**时，命令式代码更直白：算好 764 条折线的坐标数组扔给 `LineCollection`，
  心智负担比理解 `PreFacet` / `initonly` / `pulse.modified` 这套数据流语义低得多。

一句话：**这张图正好落在 Vega 的甜区** —— 层级 + 路径 + 曲线 + 交互高亮，四件事都有现成语法，
而其中任意一件在 matplotlib 里都是"自己实现"。但如果需求退化成"出一张不动的图放进论文"，
matplotlib 的性价比反而更高。

## 参考

- 官方示例原文：<https://vega.github.io/vega/examples/edge-bundling/>
- 表达式函数（`treePath` / `treeAncestors` / `indata` / `isArray` / `pluck` / `reverse` / `join` / `inrange`）：
  <https://vega.github.io/vega/docs/expressions/>
- `stratify` 变换：<https://vega.github.io/vega/docs/transforms/stratify/>
- `tree` 变换（`method` 的 `tidy` / `cluster`、`size`、`as`）：<https://vega.github.io/vega/docs/transforms/tree/>
- `formula` 变换（`initonly`）：<https://vega.github.io/vega/docs/transforms/formula/>
- group mark 与 `from.facet`（`groupby` vs `field`）：<https://vega.github.io/vega/docs/marks/group/>
- `line` mark 与 `interpolate` / `tension`：<https://vega.github.io/vega/docs/marks/line/>
- 事件选择器语法（`@markname:event`、`[filter]`）：<https://vega.github.io/vega/docs/event-streams/>
- 图例（`stroke` 通道、`symbolType`）：<https://vega.github.io/vega/docs/legends/>
- `title` 的 `subtitle` 与 `autosize`：<https://vega.github.io/vega/docs/title/>、<https://vega.github.io/vega/docs/specification/>
- d3 的 `curveBundle`（β 的定义）：<https://d3js.org/d3-shape/curve#curveBundle>
- 方法出处：Danny Holten, *Hierarchical Edge Bundles: Visualization of Adjacency Relations in Hierarchical Data*, InfoVis 2006
- 本仓库相关 demo：`demos/35-pack-dendrogram/`（同一份 `flare.json`，讲 `pack` 与 `treelinks`+`linkpath` 版的径向树）、
  `demos/14-force-directed-graph/`（同一类网络数据的力导向画法）、
  `demos/10-signals-bind/`（data 驱动 domain 的空态兜底写法）
