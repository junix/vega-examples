# 41 · 邻接矩阵：把网络画成 77×77 的格子

同一份《悲惨世界》共现网络，[14 力导向图](../14-force-directed-graph/) 把它画成一团会动的
节点与连线，本 demo 把它画成一张**矩阵**：行和列是同一批 77 个人物、同一个顺序，
第 *(i, j)* 格的颜色 = 人物 *i* 与 *j* 共同出场的章节数。

矩阵图的取舍很干脆：

* **它没有边交叉，也没有"跑一遍力学模拟"这种不可复现的东西。** 节点多到几百个时，
  力导向图糊成毛线球，矩阵仍然读得动。
* **代价是「路径」看不见了。** 力导向图上一眼能看出 A→B→C 的链路，矩阵上你只能看到
  A-B 有格子、B-C 有格子，要自己在脑子里接。
* **矩阵的一切都取决于行列顺序。** 同一份数据，换个排序键，
  它要么是一片毫无结构的噪点，要么是对角线上一串清晰的社群方块。
  本 demo 把排序键做成一个 `select` 控件，就是为了让这件事一目了然。

## 学习目标

读完这一个 demo，你应该能回答：

1. **怎么把边表变成对称矩阵**：`links-raw` 派生出 `edges-ab`（row=source）与
   `edges-ba`（row=target）两支，再用 `"source": ["edges-ab", "edges-ba"]`
   把两个数据集**并起来**。254 条无向边 → 508 个非空格子。
2. **`band` scale 的 domain 可以由 signal 给**：
   `{"signal": "pluck(data('nodes-ordered'), 'name')"}`。
   行列两把 scale 共用同一个表达式，所以换排序时行列**一起**动，矩阵始终对称。
3. **`collect` 的 `sort` 支持多级键，而且每一级都能接 signal**——
   但接法有个必须避开的写法（见「关键概念」）。
4. **度数和加权强度可以一次 `aggregate` 拿到**：在**对称**边表上按 `row` 分组，
   `ops: ["count", "sum"]` 分别是邻居个数与权重之和。
5. **十字高亮怎么做**：两个 `rect` 横竖各一条，`hoverRow`/`hoverCol` 两个 signal
   由 `@cells:mouseover` 之类事件写入；null 时把**尺寸收成 0**，
   而不是把它挪到画布外（后者会撑坏场景包围盒）。
6. **`sqrt` scale 的两种用法**：`weight` 用 `sqrt` 映射到色带（人眼对颜色深浅的
   感知接近平方根），`wSize` 用 `sqrt` 映射到边长比例（面积 ∝ 权重）。

## 数据来源

`../../assets/data/miserables.json` 是 Knuth《Stanford GraphBase》里的
《悲惨世界》人物共现网络（与 Vega / D3 官方示例同源）：
77 个人物、254 条无向边，边权 `value` = 两人共同出场的章节数（1–31），
每个节点带一个 `group`（0–10，Knuth 手工划的社群）。

| 数据集 | 来源 | 行数 | 说明 |
| --- | --- | --- | --- |
| `nodes-raw` | `miserables.json` · `format.property: "nodes"` | 77 | 人物表 |
| `links-raw` | 同一个 URL · `property: "links"` | 254 | 边表（`source`/`target` 是**下标**不是名字） |
| `edges-ab` / `edges-ba` | ← `links-raw` | 254 / 254 | 原方向 / 镜像方向 |
| `edges` | `source: [两个数据集]` | **508** | 对称矩阵的全部非空格 |
| `degree` | ← `edges` | 77 | 每人的 `degree`（count）与 `strength`（sum） |
| `nodes-ordered` | ← `nodes-raw` | 77 | **行列顺序的唯一真源**：lookup → collect（signal 驱动的三级排序）→ window(row_number) |
| `matrix` | ← `edges` | 508 | 两次 lookup 把下标换成名字与社群，再算 `sameGroup` |
| `labels` | ← `nodes-ordered` | 44（默认 `labelMinDegree: 4`） | 标签密度阀门 |
| `group-breaks` | ← `nodes-ordered` | 10 | `window(lag)` 找社群边界 |

**填充率 508 / 77² = 8.6%** —— 图上那行说明文字就是现算出来的。
社会网络几乎总是这么稀疏，这也是矩阵图看起来"一片白"的正常状态。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals: orderBy` | 排序方案下拉框 | 5 个选项：字母序 / 社群 / 度数 / 加权强度 / 社群+度数。**本 demo 的技术核心** |
| `signals: colorBy` | 填色语义 | 连续的边权重 vs 离散的"是否同社群" |
| `signals: encodeSize` | 冗余编码开关 | 打开后格子边长也编码权重（面积 ∝ 权重） |
| `signals: labelMinDegree` | 标签阀门 | 77 个名字全写会糊成一团；默认只写度数 ≥ 4 的 44 个 |
| `signals: sortField1/2` + `sortOrder1/2` | 把 `orderBy` 翻译成比较键 | 四个派生 signal，喂给 `collect` / `window` 的 `sort` |
| `signals: stepSize` | 一格步长 | `width / nodeCount`；社群分块线用 `(rank - 1) * stepSize` 纯算术定位，不查 scale |
| `signals: labelFontSize` | 字号自适应 | `min(9, max(6, stepSize - 1.2))`，换数据集也不会字压字 |
| `signals: hoverRow/hoverCol` | 十字高亮状态 | 由 `@cells` / `@rowLabels` / `@colLabels` 三处 mouseover 写入，mouseout 清空 |
| `data: edges` | 镜像合并 | `"source"` 接**数组**就是并集；两个分支各自 derive，Vega 插入 Relay 复制元组，互不污染 |
| `data: nodes-ordered` | 顺序真源 | `lookup(default: 0)` → `collect`（真正重排）→ `window(row_number)` 记 1 基 `rank` |
| `data: group-breaks` | 社群边界 | `window` 的 `lag` 拿前一行的 `group`，变了就是一条分块线；`filter` 掉 `prevGroup == null`（第一行） |
| `scales: xNode` / `yNode` | 行列 band | `domain` 是 `{"signal": "pluck(...)"}`，两把共用同一个表达式 |
| `scales: weight` | 权重配色 | `sqrt` + `scheme: "blues"` + `extent: [0.3, 1]`（掐掉最浅的 30%，1 章共现也看得见）+ `zero: false` |
| `scales: wSize` | 权重边长 | `sqrt`，range `[0.3, 1]` 是**比例**不是像素，乘到 `bandwidth()` 上 |
| `legends` | 两个 | 权重色带（gradient）+ 社群方块（symbol，`format: "d"` 免得 group 号带小数） |
| `marks[0]` | 底板白框 | 没有边的格子留白，稀疏度一眼可见 |
| `marks[1..2]` | 十字高亮横/竖带 | null 时 `height`/`width` 收成 0 |
| `marks: diagonal` | 对角线 | 自环位置，恒为空，画成浅灰当"行 = 列"的参照 |
| `marks: cells` | 格子 | `x` 用**列名**、`y` 用**行名**；`fill` / `fillOpacity` / 尺寸全部由 signal 三元表达式切换 |
| `marks`（两条 rule） | 社群分块线 | 非社群排序时用 `strokeOpacity: 0` 隐藏，而不是让数据集变空 |
| `marks`（两条色带） | 左侧 / 上侧社群色带 | 覆盖**全部 77 行**，所以哪怕名字没写出来也看得到社群边界 |
| `marks: rowLabels` / `colLabels` | 行列标签 | 列标签 `angle: -90` + `align: "left"` + `baseline: "middle"` 竖排 |
| `marks`（两行说明） | 图下方文字 | 规模、填充率、当前排序、悬停读数，全部由 signal 现算 |

### 关键概念

- **`data.source` 可以是数组**：`{"name": "edges", "source": ["edges-ab", "edges-ba"]}`
  就是把两个数据集的元组并起来。这是把无向边镜像成对称矩阵最短的写法——
  比在一个 `formula` 里造数组再 `flatten` 干净得多。
- **两个分支从同一个上游 `derive` 不会互相污染。** `edges-ab` 和 `edges-ba` 都
  `source: "links-raw"` 并各自加 `row`/`col` 字段，Vega 会在分叉处插入 Relay
  复制元组，所以第二支的 `formula` 不会改掉第一支已经算好的值。
- **`collect` 的 `sort` 多级键，每个数组元素各自是一个 signal**：

  ```json
  "sort": {
    "field": [{ "signal": "sortField1" }, { "signal": "sortField2" }, "name"],
    "order": [{ "signal": "sortOrder1" }, { "signal": "sortOrder2" }, "ascending" ]
  }
  ```

  **不能**写成 `"field": {"signal": "[sortField1, sortField2, 'name']"}`
  —— 一个"值是数组"的 signal 不会被展开成多级键，排序会**静默出错**（不报任何日志）。
  最后一级固定用 `name`，保证同分时结果稳定唯一，换排序方案时矩阵不会随机抖动。
- **`band` scale 的 domain 用 signal 给**，就等于把"行列顺序"这件事外包给了一个数据集。
  `nodes-ordered` 是唯一真源：`collect` 真的重排了元组，`pluck` 按新顺序取名字。
  只 `window` 算个 `rank` 而不 `collect` 是不够的——`pluck` 拿到的是**元组顺序**。
- **`aggregate` 的 `fields` 可以重复**：`"fields": ["value", "value"], "ops": ["count", "sum"]`
  在同一列上同时求个数与求和。（`count` 其实忽略 field，写 `null` 也行，
  这里写 `"value"` 只是为了两个数组等长时读起来对齐。）
- **十字高亮为什么收尺寸而不是挪出画布**：把 `y` 设成 `-9999` 也能让高亮"消失"，
  但场景包围盒会被撑到 -9999，`autosize: "pad"` 于是给画布加上几千像素的留白，
  `tools/validate.cjs` 的布局溢出检查会直接 FAIL。**收成 0 是唯一干净的写法。**
- **`scale('yNode', null)` 是非法输入**：所以高亮带的 `y` 表达式必须先判
  `hoverRow === null`，短路掉 scale 调用。
- **`sqrt` 配色不是随便选的**：人眼对颜色深浅的感知大致按平方根走，
  权重 1–31 直接线性映射的话，大部分格子会挤在色带最浅的一端。
  `extent: [0.3, 1]` 再掐掉最浅的 30%，保证权重为 1 的格子也看得见。
- **`format: "d"` 用在社群图例上**：`group` 是 0–10 的整数，
  不写 `format` 的话 d3 默认会给出 `0`、`1`… 没问题，但一旦社群数超过一千就会出现
  `1,000`。图例的 `format` 是几乎零成本的保险。

## 试一试（改练）

1. **把 `orderBy` 从「字母序」切到「社群 group」——这是本 demo 的核心实验。**
   字母序下格子像随机噪点；按社群排序后对角线上立刻浮出一串方块，
   块内密、块间疏，Knuth 手工划的社群一眼可见。
   再切到「社群 + 度数」，每个块内部还会呈现出"核心人物在左上"的梯度。
2. **切到「度数（降序）」**：对角线附近浮出一个密集的三角区——
   这是网络里的"核心-边缘结构"（core-periphery）：高度数的人彼此也高度相连。
   同一份数据、同一张图，**换个顺序就换了一个论点**。
3. **把 `labelMinDegree` 拖到 0**：77 个名字全写出来，糊成一团；拖到 36，
   只剩 Valjean 一个。**这就是矩阵图规模上限的真实位置**——
   不是格子画不下，是标签写不下。
4. **打开 `encodeSize`**：格子边长也编码权重。冗余编码在小格子上帮助不大，
   但配合「是否同社群」着色时很有用（颜色管分类、大小管强度）。
5. **切 `colorBy` 到「是否同社群」**：同社群的格子按社群着色，跨社群的一律灰。
   配合排序切换，能直接看出哪些人是"桥"——他们所在的行里灰格子特别多。
6. **验证 `collect` 的排序陷阱。** 把 `nodes-ordered` 里 `collect` 的 sort 改成
   `"field": {"signal": "[sortField1, sortField2, 'name']"}`，
   跑 `node tools/validate.cjs 41`：**照样 PASS，一条 WARN 都没有**。
   但实测 `nodes-ordered` 的头五行会一直停在文件原序
   `Myriel, Napoleon, Mlle.Baptistine, Mme.Magloire, CountessdeLo`，
   把 `orderBy` 切成「度数降序」也纹丝不动（正确写法下这时应该是
   `Valjean, Gavroche, Marius, Javert, Thenardier`）。
   **排序被整个忽略了，而没有任何东西告诉你。** 这是本 demo 最值得亲手踩一次的坑。
7. **把十字高亮的 "收成 0" 改成 "挪到 -9999"**（`y` 写 `hoverRow === null ? -9999 : ...`），
   跑 `node tools/validate.cjs 41`：布局溢出检查会 FAIL 并告诉你探出了多少像素。
8. **把 `edges` 的 `source` 改成只留 `["edges-ab"]`**：矩阵只剩下三角形的一半。
   这在信息上是等价的（无向图），在可读性上是灾难——
   人眼沿行扫描时会漏掉一半的邻居。
9. **把 `weight` 的 `type` 从 `sqrt` 改成 `linear`**：权重 1–5 的格子几乎全变成同一种浅蓝。
   再把 `extent` 从 `[0.3, 1]` 改回默认 `[0, 1]`：权重为 1 的格子直接白得看不见。
10. **换一份网络**：把两处 URL 都换成 `../../assets/data/flare.json`
    （它是层级树，没有 `nodes`/`links` 两段）。实测会连吐三条 WARN——
    `Data ingestion failed … Cannot convert undefined or null to object` ×2
    加一条 `Infinite extent`，两个数据集各塌成 1 行，校验器 FAIL。
    先想清楚"邻接矩阵需要什么形状的数据"，再看
    [43 层级边捆绑](../43-edge-bundling/) 是怎么从 `flare-dependencies.json` 里取边的。

## 与 matplotlib 的对照

矩阵热力图是 matplotlib **最擅长**的图之一，所以这一节的结论和别的 F 组 demo 不同：

| 本 demo 的做法 | matplotlib / seaborn 的做法 | 差距在哪 |
| --- | --- | --- |
| `edges-ab` + `edges-ba` → `edges` | `A = np.zeros((77,77)); A[i,j] = A[j,i] = w` | **NumPy 更直接。** 稠密矩阵本来就是它的母语，两行搞定 |
| `rect` mark 逐格画 | `ax.imshow(A)` / `sns.heatmap(A)` | **matplotlib 更快也更省事。** 508 个 rect vs 一次位图上传 |
| `collect` + signal 驱动的多级排序 | `order = np.argsort(...)`; `A = A[order][:, order]` | 打平手。NumPy 的 fancy indexing 极其干净，Vega 胜在**排序键是控件** |
| `band` scale 的 domain 接 signal | `ax.set_xticks` + `set_xticklabels(names[order])` | 打平手 |
| `hoverRow`/`hoverCol` 十字高亮 | 要上 `mplcursors` 或自己接 `motion_notify_event` 回调 | **Vega 明显占优。** 交互是 spec 的一部分，不是额外的事件循环代码 |
| tooltip 显示行列名与共现次数 | 同上，得自己写回调拼字符串 | 同上 |
| 说明行里的填充率现算 | `f"{nnz/n**2:.1%}"` | 打平手 |
| 换 `orderBy` 整条数据流重算 | 重跑单元格（Jupyter 里其实也很快） | Vega 胜在**成品是一个可交互的 HTML**，而不是需要 Python 环境的 notebook |

诚实的结论：**如果你只要一张静态的排序好的矩阵热力图，`sns.heatmap` 是更好的工具**——
更短、更快、渲染质量也不差。本 demo 值得存在的理由只有两条，且都不在"画格子"上：

1. **排序是一个控件**。矩阵图的全部价值都在行列顺序上，
   而"能当场换五种顺序对比"和"改代码重跑五次"是完全不同的两种理解方式。
2. **十字高亮 + tooltip 让 77×77 可读**。没有它，读者根本无法在 5929 个格子里
   定位"Valjean 这一行"。matplotlib 侧要拿到同等体验，成本远高于画图本身。

## 参考

- 官方文档：[Data · source](https://vega.github.io/vega/docs/data/) ·
  [collect 变换](https://vega.github.io/vega/docs/transforms/collect/) ·
  [window 变换](https://vega.github.io/vega/docs/transforms/window/) ·
  [Scales · Band](https://vega.github.io/vega/docs/scales/#band) ·
  [Event streams](https://vega.github.io/vega/docs/event-streams/)
- 同集相关：[14 力导向图](../14-force-directed-graph/)（同一份 `miserables.json` 的另一种画法）、
  [26 六边形分箱 / 矩阵热力图](../26-hexbin-matrix/)（矩阵热力图的定量版本）、
  [43 层级边捆绑](../43-edge-bundling/)（边表的第三种画法）
- 矩阵排序（seriation）的经典综述：Behrisch et al., *Matrix Reordering Methods for
  Table and Network Visualization*, EuroVis STAR 2016 —— 本 demo 的 5 个排序方案
  只是其中最简单的几种
- 数据出处：Donald E. Knuth, *The Stanford GraphBase*, 1993
  （`miserables.json`，与 Vega / D3 官方示例库同源）
