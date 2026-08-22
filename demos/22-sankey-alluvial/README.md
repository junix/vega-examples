# 22 · 桑基图 / 冲积图：多级流量分配

Vega 内置了 `treemap` / `pack` / `partition` / `force` / `tree`，**但没有 `sankey` 变换**。
所以这张图的全部布局都得自己算 —— 而"自己算"在 Vega 里依然是**声明式**的：
`aggregate` 求和、`window` 排序号、`stack` 堆叠、`lookup` 取回两端几何，
最后用 `path` mark 吃一段自己拼出来的 SVG 三次贝塞尔字符串。
整个 demo 的 `main.js` 只有一行。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/22-sankey-alluvial/
```

## 学习目标

1. **没有内置布局时怎么办**：把"图形算法"拆成一串标准变换（求和 → 排序号 → 堆叠 → 关联），
   而不是写一段命令式的布局代码。
2. **`stack` 用三次**：同一份流量表在不同 `groupby` 下堆叠三次 ——
   节点在层内堆叠、边在源节点内堆叠、边在目标节点内堆叠。
   这是桑基图"带子首尾都不重叠"的全部秘密。
3. **`window` + `rank`** 求出节点在层内的序号，用来累加节点间隙（第 k 个节点要让开 k−1 个间隙）。
4. **`lookup` 当"关系型 join"**：边表只有节点名，两次 `lookup` 把源/目标节点的像素几何取回来。
5. **`path` mark 与手工几何**：`path` 通道接受任意 SVG path 字符串，
   于是"教科书桑基的 S 形带子"可以用一个表达式表达出来，控制点位置还能挂在 signal 上实时拖。
6. **数据驱动的 signal**：`data('layer_max')[0].maxTotal` 把聚合结果读回 signal，
   再反过来决定比例尺的 `range` —— 布局参数自己从数据里长出来，换数据不用改 spec。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data: flows` | 边表，19 行 | 每行 `{source, target, value}`。数据守恒：每个中间节点入流之和 = 出流之和（`电力` 1360 进 1360 出） |
| `data: node_names` | 节点表，12 行 | **只声明 `layer`（第几层）和 `order`（层内自上而下的次序）**，不写任何尺寸 |
| `data: out_totals` / `in_totals` | `aggregate` 按 `source` / `target` 求 `sum(value)` | 得到每个节点的出流与入流合计 |
| `data: nodes` | 两次 `lookup` + `formula` + `window` + `stack` | `total = max(inTotal, outTotal)`（首层没入流、末层没出流，取 max 两头都对）；`window rank` → `slot`（层内第几个，从 1 起）；`stack groupby layer` → `v0/v1`（**数据单位**的层内堆叠区间） |
| `data: layer_stats` | `aggregate groupby layer` | 每层的 `layerTotal`（流量合计）与 `nodeCount`（节点数） |
| `data: layer_max` | 再聚合一次，得到单行 | `maxTotal` / `maxCount` / `layerCount`，供 signal 读取 |
| `scales: flow` | `linear`，domain = `layer_stats.layerTotal`（zero:true），range = `[0, plotH]` | **值 → 像素高度的唯一换算器**。节点高度、带子宽度、层内偏移全走它，所以三者必然对得上 |
| `data: node_geom` | `lookup layer_stats` + 5 个 `formula` | 把 `v0/v1` 换成像素 `ny0/ny1`，加上节点间隙与整层垂直居中偏移 |
| `data: links` | 两次 `lookup node_geom` + **两次 `stack`** + 6 个 `formula` | 源侧按目标次序堆叠得 `so0/so1`，目标侧按来源次序堆叠得 `ti0/ti1`，再各自加上节点顶部 `ny0` → 四条边界 `sy0/sy1/ty0/ty1` |
| `marks: path (ribbons)` | 连接带 | `path` 通道是一整段 `M…C…L…C…Z` 字符串，控制点横坐标由 `curvature` signal 决定；`hover` 编码集提亮并 `zindex:1` 抬到最上层 |
| `marks: rect (node_bars)` | 节点条 | `y=ny0, y2=ny1, width=nodeWidth`，高度直接就是流量 |
| `marks: text ×2` | 节点标签 + 列标题 | 第 0 层标签靠左（`align: right`），其余层靠右；桑基图没有连续坐标轴，列标题只能用 text mark 手放 |
| `signals` | 4 个可拖 + 5 个派生 | 可拖：`nodeWidth` / `nodeGap` / `ribbonOpacity` / `curvature`；派生：`maxLayerTotal` / `maxLayerCount` / `layerCount` / `layerStep` / `plotH` |

### 关键概念一：垂直方向的像素预算

一层里既要放流量，又要放节点之间的空隙，所以先把空隙从画布高度里扣掉：

```
plotH = height − headerH − (maxLayerCount − 1) × nodeGap
      = 470   − 24      − (5 − 1) × 14
      = 390 px
```

`flow` 比例尺就是 `[0, 2450] → [0, 390]`，即 **1 PJ ≈ 0.1592 px**。
因为它的 domain 从 0 开始、range 也从 0 开始，所以 `scale('flow', v)` 既能当"绝对位置"用，
也能当"长度"用（`scale('flow', a+b) = scale('flow', a) + scale('flow', b)`）——
后面所有几何都吃这个性质。

节点数少的层用不满全部间隙，于是整层垂直居中：

```
layerH(l) = scale('flow', layerTotal_l) + (nodeCount_l − 1) × nodeGap
yTop(l)   = headerH + (height − headerH − layerH(l)) / 2
ny0       = yTop(l) + scale('flow', v0) + (slot − 1) × nodeGap
ny1       = yTop(l) + scale('flow', v1) + (slot − 1) × nodeGap
```

本例三层的 `layerTotal` 都是 2450（流量守恒），所以 `layerH` 分别是
446 / 418 / 432 px，`yTop` 分别是 24 / 38 / 31 px。

水平方向简单得多：`layerStep = (width − nodeWidth) / (layerCount − 1) = (860 − 16) / 2 = 422`，
节点左边缘 `nx = layer × layerStep`。

### 关键概念二：为什么 `stack` 要用三次

| 第几次 | 数据集 | `groupby` | `sort` | 产物 | 解决什么问题 |
| --- | --- | --- | --- | --- | --- |
| 1 | `nodes` | `layer` | `order` | `v0/v1` | 一层里的节点上下排开，不互相压 |
| 2 | `links` | `source` | `tgtLayer, tgtOrder` | `so0/so1` | **同一个节点流出的多条边，在它的右边缘依次错开** |
| 3 | `links` | `target` | `srcLayer, srcOrder` | `ti0/ti1` | **同一个节点流入的多条边，在它的左边缘依次错开** |

第 2、3 次是桑基图最容易写错的地方：一条边在**源侧的纵向偏移**和在**目标侧的纵向偏移**
是两个互不相干的量，必须分别累加。例如 `煤炭 → 电力`（620 PJ）：

- 在 `煤炭` 里它排第一 → `so0=0, so1=620`
- 在 `电力` 里它也排第一 → `ti0=0, ti1=620`

而 `煤炭 → 直接燃烧`（180 PJ）：

- 在 `煤炭` 里它排第二（前面已经流走 620）→ `so0=620, so1=800`
- 在 `直接燃烧` 里它排第一 → `ti0=0, ti1=180`

因为出流合计 = 节点 `total`，且用的是同一个 `flow` 比例尺，
所以一个节点右边缘上所有带子的高度之和**恰好等于**节点矩形的高度 —— 不留缝、不溢出。

### 关键概念三：一条带子的四个控制点是怎么算出来的

先把四条边界的像素坐标凑齐（`links` 里的 6 个 `formula`）：

```
x0  = srcX + nodeWidth        // 带子左端：源节点的右边缘
x1  = tgtX                    // 带子右端：目标节点的左边缘
sy0 = srcY0 + scale('flow', so0)   // 左端上边界
sy1 = srcY0 + scale('flow', so1)   // 左端下边界（sy1 − sy0 = 带宽）
ty0 = tgtY0 + scale('flow', ti0)   // 右端上边界
ty1 = tgtY0 + scale('flow', ti1)   // 右端下边界
```

再记跨度 `Δ = x1 − x0`、曲率 `c = curvature`，两个控制点的横坐标是：

```
cx0 = x0 + Δ·c        // 靠左那个控制点
cx1 = x1 − Δ·c        // 靠右那个控制点
```

**控制点的纵坐标与它所依附的端点完全相同**（第一个控制点用 `sy0`，第二个用 `ty0`）。
这一条是整个几何的关键：三次贝塞尔在起点处的切线方向指向第一个控制点，
既然二者 y 相同，切线就是**水平**的 —— 带子于是垂直地扎进节点边缘，不会出现折角，
上下两条边界也永远不会交叉。`c = 0.5` 时两个控制点重合于跨度中点，
得到左右对称的标准 S 形；`c = 0` 时退化成直线，带子变成梯形（拖滑块可以看到）。

带子是一条**闭合路径**：上边界一条贝塞尔（左 → 右），右端一条竖线，
下边界一条反向贝塞尔（右 → 左），`Z` 闭合。写成表达式就是 mark 里那一大串：

```
'M' + x0  + ',' + sy0                       // 起点：左端上边界
+ 'C' + cx0 + ',' + sy0                     //   控制点 1（与起点同 y）
      + ' ' + cx1 + ',' + ty0               //   控制点 2（与终点同 y）
      + ' ' + x1  + ',' + ty0               //   终点：右端上边界
+ 'L' + x1  + ',' + ty1                     // 右端竖线，长度 = 目标侧带宽
+ 'C' + cx1 + ',' + ty1
      + ' ' + cx0 + ',' + sy1
      + ' ' + x0  + ',' + sy1               // 回到左端下边界
+ 'Z'
```

每个数都过一遍 `format(v, '.1f')`，避免 `219.00000000000003` 这类浮点噪声进 path 字符串。
`煤炭 → 电力` 实际渲染出来是：

```
M16.0,24.0C219.0,24.0 219.0,38.0 422.0,38.0L422.0,136.7C219.0,136.7 219.0,122.7 16.0,122.7Z
```

对照着读：左端 (16, 24)→(16, 122.7) 高 98.7 px = 620 PJ × 0.1592；
右端 (422, 38)→(422, 136.7) 同样高 98.7 px。两端等宽，说明流量没被"算漏"。

> `path` mark 的坐标是**相对于 mark 自身的 `x`/`y`**，所以 `enter` 里显式写了
> `x: 0, y: 0`，路径里的数就是 group 坐标系里的绝对像素。

### 关键概念四：为什么这些 signal 拖起来是"活"的

`curvature` 只出现在 `marks.encode.update.path` 里，拖它只触发一次重编码（19 条 path 重算）。
`nodeGap` / `nodeWidth` 出现在 `node_geom` / `links` 的 `formula` 和 `plotH` 里，
拖它们会让 Vega 顺着依赖图重跑那几个 `formula` 算子和 `flow` 比例尺 ——
但 `aggregate` / `window` / `stack` 的结果没变，不会重算。
这种"只重算受影响的部分"是 Vega 数据流的默认行为，不需要你手写任何缓存。

## 试一试

1. **把 `curvature` 拖到 0**：带子变成直线梯形，就是最原始的"冲积图（alluvial）"画法；
   拖到 1 会让控制点跑到对端，带子出现明显的水平"平台"。
2. **把 `nodeGap` 拖到 40**：`plotH` 掉到 470−24−4×40 = 286 px，所有带子同比变窄，
   但每个节点右边缘上带子的总高仍严丝合缝等于节点高 —— 这就是"只有一个 `flow` 比例尺"的好处。
3. **改 `node_names` 里 `转换损耗` 的 `order` 为 3**（挪到最下面）：只改一个数字，
   节点位置、19 条带子在两侧的堆叠次序、贝塞尔控制点会一起重算。
   顺手观察交叉数量的变化 —— 手工调 `order` 就是在做人工的"减少交叉"。
4. **在 `flows` 里加一条 `{"source": "核能", "target": "直接燃烧", "value": 40}`**：
   `核能` 变成 200，`直接燃烧` 变成 610，第 2 层不再守恒（入 610 出 570），
   `total = max(in, out)` 会让节点按 610 画，`layer_stats` / `flow` 比例尺 domain 自动跟着变。
   这正好演示了"节点高度取入出流较大者"这条约定在数据不守恒时的表现。
5. **把 `stack` 第 3 次的 `sort` 改成 `{"field": "value", "order": "descending"}`**：
   目标侧改为"粗带子在上"，源侧不变。带子会出现更多交叉，直观说明两侧排序是独立自由度。
6. **把 `nodeColor` 的 `range.scheme` 换成 `"tableau10"`**：只有 10 色，12 个节点会出现循环用色；
   换成 `"category20b"` 或 `"observable10"` 对比一下可辨识度。

## 参考

- [transform: aggregate](https://vega.github.io/vega/docs/transforms/aggregate/) —— `groupby` + `ops: ["sum","count","max"]`
- [transform: window](https://vega.github.io/vega/docs/transforms/window/) —— `rank` / `row_number` / `dense_rank`
- [transform: stack](https://vega.github.io/vega/docs/transforms/stack/) —— `groupby` / `sort` / `offset` / `as`
- [transform: lookup](https://vega.github.io/vega/docs/transforms/lookup/) —— `from` / `key` / `fields` / `values` / `as` / `default`
- [transform: formula](https://vega.github.io/vega/docs/transforms/formula/)
- [mark: path](https://vega.github.io/vega/docs/marks/path/) —— `path` 通道接受 SVG path 字符串
- [Linear scale](https://vega.github.io/vega/docs/scales/#linear) 与 [scheme](https://vega.github.io/vega/docs/schemes/)
- [Signals](https://vega.github.io/vega/docs/signals/) 与 [Expressions](https://vega.github.io/vega/docs/expressions/)（`scale()`、`format()`、`data()`）
- [MDN: SVG 路径的三次贝塞尔曲线 `C`](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Attribute/d#%E4%B8%89%E6%AC%A1%E8%B4%9D%E5%A1%9E%E5%B0%94%E6%9B%B2%E7%BA%BF)
- 布局思路对照：[d3-sankey](https://github.com/d3/d3-sankey)（它比本例多一步迭代松弛，见下节）

## 与 matplotlib 的对照

**这张图在 Vega 里靠什么语法元素表达出来**

| 图形要素 | Vega 里的语法元素 |
| --- | --- |
| 节点高度 = 流经流量 | `aggregate(sum)` + 一个 `linear` 比例尺 |
| 层内节点上下排开 | `stack groupby: layer` |
| 层内节点间隙 | `window rank` → `(slot − 1) × nodeGap` |
| 每层垂直居中 | `aggregate` 出层高 + `formula` 求偏移 |
| 边在两端的错开 | `stack groupby: source` 与 `stack groupby: target` 各一次 |
| 边表 → 节点几何 | `lookup`（等价于 SQL 的两次 left join） |
| S 形带子 | `path` mark + 表达式拼 `M/C/L/C/Z` |
| 悬停高亮 + 明细 | `encode.hover` 编码集 + `tooltip` 通道 |
| 四个可调参数 | `signals` 的 `bind: {input: "range"}` |

**换成 matplotlib / seaborn 要付什么代价**

1. **没有可用的内置图**。`matplotlib.sankey.Sankey` 画的是工程流程图那种"单个汇聚点 + 带箭头的粗线"，
   不是多层节点 + 带子的桑基图，**做不出这张图**。真要在 Python 里画，路线是：
   装 `plotly`（`go.Sankey`，最省事，但输出是 plotly 的 HTML/JS）、装 `floweaver` / `pySankey`，
   或者用纯 matplotlib 手搓 —— 而"手搓"意味着下面第 2、3 条。
2. **布局要写成命令式代码**。大致是：
   `df.groupby('source').value.sum()` / `groupby('target')` 求节点总量 →
   自己维护 `{node: (layer, order)}` 字典 → 按 order 排序后 `np.cumsum` 求层内堆叠 →
   再对边表 `sort_values` 后按 `source` 分组 `cumsum` 求源侧偏移、按 `target` 分组 `cumsum` 求目标侧偏移。
   逻辑和 Vega 版一一对应，但这是一段有执行顺序的脚本，中间量全是你自己的局部变量；
   Vega 版则是 10 个命名数据集，`node_geom` / `links` 里每个中间量都能用
   `node tools/inspect.cjs 22 --data links` 单独打出来看。
3. **带子要自己攒 `Path`**。matplotlib 没有"给我一段 SVG path"的入口，得用
   `matplotlib.path.Path(verts, codes)`，`codes` 手写成
   `[MOVETO, CURVE4, CURVE4, CURVE4, LINETO, CURVE4, CURVE4, CURVE4, CLOSEPOLY]`，
   `verts` 就是本文那 9 个点（注意 CURVE4 是"两个控制点 + 一个终点"三个一组，
   顺序数错一个就画出乱麻），再 `ax.add_patch(PathPatch(path, facecolor=..., alpha=..., lw=0))`
   循环 19 次。另外 matplotlib 的 y 轴向上，所有 y 要么取负、要么 `ax.invert_yaxis()`。
   最后还要 `ax.set_xlim/set_ylim` + `ax.axis('off')`，因为这张图没有坐标轴可用。
4. **交互全部要自己接**。悬停高亮：`fig.canvas.mpl_connect('motion_notify_event', ...)`，
   自己遍历 patch 调 `patch.contains(event)` 做命中测试，改 alpha 后 `fig.canvas.draw_idle()`；
   提示框：`ax.annotate` 一个隐藏对象，手动改位置与文本。
   四个滑块：`matplotlib.widgets.Slider` × 4，每个回调里**把整段布局重算一遍**并重建全部 patch
   （没有依赖图，改 `curvature` 也得重跑聚合）。这一段在 Vega 里是 0 行代码 ——
   `bind` 生成控件，数据流决定重算范围。
   要放到网页上还得再选一条路：`mpld3`（功能受限）、导出静态 PNG（交互没了）、
   或干脆换 plotly / bokeh。
5. **配色**。Vega 写 `"scheme": "tableau20"` 一行；matplotlib 要
   `cmap = plt.get_cmap('tab20')` 再自己建 `{node_name: cmap(i)}` 字典并保证顺序稳定。

**反过来，matplotlib（Python 生态）在这几点更省事**

1. **需要"算法"的地方**。真正的 d3-sankey 布局会**迭代松弛**节点位置
   （反复把每个节点移到其相邻边的加权重心，再做防重叠推挤，默认 6 轮）以自动减少交叉。
   Vega 的数据流是 DAG，**没有循环 / 不动点迭代**，写不出来 ——
   本例只能把层内次序作为 `order` 字段**人工指定**，这是本 demo 相对 d3-sankey 的真实短板。
   在 Python 里这就是一个 `for _ in range(6):` 的普通循环。
   （Vega 里的替代方案：`force` 变换能做迭代模拟，但那是物理布局，不适合桑基；
   或者在 `main.js` 里用 JS 算好次序再 `view.data('node_names').insert(...)` —— 那就等于回到命令式。）
2. **调试与临时探索**。`print(df)` / `breakpoint()` 比在数据流里插数据集看得快；
   Vega 这边得靠 `tools/inspect.cjs` 这类外部检视器。
3. **导出与排版**。matplotlib 出 PDF / EPS、和 LaTeX 混排、拼多子图（`subplots`）更成熟；
   Vega 出 SVG / PNG（本项目 `tools/export.cjs`）够用，但 300 dpi 印刷向的细节控制不如前者。
4. **数据清洗**。真实数据先经 pandas 洗一遍几乎总是更舒服；Vega 的变换链适合"已经干净"的数据。

**一句话**：桑基图的"图形算法"部分（求和、排序号、双侧堆叠、join、贝塞尔）
恰好能被 Vega 的标准变换 + 表达式完整覆盖，所以它可以是纯声明式的一份 JSON，
而且免费获得交互与增量重算；代价是**凡是需要循环迭代的优化（自动减少交叉）就表达不了**，
只能把次序交给作者手工指定。
