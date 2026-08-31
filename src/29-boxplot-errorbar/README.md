# 29 · 箱线图与误差棒：手工拼出 Vega 没有的复合 mark

Vega **本体没有** `boxplot` / `errorbar` 这类复合 mark —— 那是 Vega-Lite 提供的语法糖
（`"mark": "boxplot"`）。在 Vega 里想画箱线图，只能自己把它拆回「统计变换 + 基础 mark」：

```
aggregate(q1/median/q3)  →  formula(IQR / Tukey 围栏)  →  lookup(围栏反连原始观测)
      ↓                              ↓                            ↓
   rect(盒) + rule(中位线)      rule(须 + 端帽)              symbol(离群点)
```

这正是本 demo 的教学价值：**一旦你会拆，Vega 就没有"画不出的图"**。同一份聚合结果换一套编码，
右边立刻变成误差棒面板。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/29-boxplot-errorbar/
```

## 学习目标

1. 用 `aggregate` 一次拿到 **五数概括**（`q1` / `median` / `q3` / `min` / `max`）和
   **一阶二阶矩**（`mean` / `stdev` / `stderr` / `count`）—— Vega 的 aggregate 内置了这些 op，
   不需要手写分位数算法。
2. 把 **Tukey 须** 算对：须端 **不是** `q1 - 1.5×IQR`，而是「1.5×IQR 围栏之内最远的那个**真实观测值**」。
   要做到这一点必须把每组的围栏 `lookup` 回到逐行原始数据上，再 filter + 二次 aggregate。
   这一步是本 demo 最值得抄走的套路。
3. 用 `lookup` 做**组级统计量 → 行级数据**的反向连接（和 demo 07 的维表连接方向相反）。
4. 用 `group` mark 建立**两个独立坐标系的面板**，并让它们**共享**分类比例尺 `xcat` 与配色 `species`。
5. 手工几何：盒宽、端帽宽度全部由 `bandwidth` 派生 —— 关键技巧是 **`band` 可以取信号值**
   （`"band": {"signal": "(1 - boxRatio) / 2"}`），于是几何参数可以拖着调。
6. 看清「标准误 / 95% 置信区间 / 标准差」三种误差棒的**宽度差一个数量级**，
   以及 95% CI 的 1.96 从哪来（`quantileNormal(0.975)`）。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals: iqrK / boxRatio / errMode / showOutliers` | 4 个可拖的教学旋钮 | `errMode` 用 `bind.labels` 给英文取值配中文标签；`showOutliers` 走**透明度**而不是 `filter`，保证数据集永远非空 |
| `signals: panelGap / panelTop / panelW / panelH` | 布局派生量 | `panelW = (width - panelGap) / 2`；`panelGap = 92` 是留给**右面板 y 轴**的宽度，不是纯留白 |
| `signals: errK / errName` | 误差棒倍数与图上文案 | `errK = errMode === 'ci95' ? quantileNormal(0.975) : 1`，SE 与 SD 都是 1 倍 |
| `data: penguins` | 原始 344 行（JSON，无需 `format`） | 若换成 CSV 必须显式写 `"format": {"type": "csv"}` |
| `data: obs` | 清洗 + 造分类键 | 先 `filter` 掉体重缺失（2 行）与性别未知（9 行）→ 333 行；字段名带空格，必须写 `datum['Body Mass (g)']`；`grp = Species + ' ♂/♀'` |
| `data: stats` | **一次 aggregate 供两个面板共用** | `groupby: [grp, Species, Sex]`，`ops: [q1, median, q3, mean, stdev, stderr, count]`；`count` 那一项的 `fields` 位置写 `null` |
| `data: stats` 的 3 个 formula | IQR 与 Tukey 围栏 | `iqr = q3 - q1`，`fenceLo = q1 - iqrK·iqr`，`fenceHi = q3 + iqrK·iqr`。**围栏只用来筛点，不直接画** |
| `data: obs-fenced` | `lookup` 把围栏发回每一行观测 | `{"type":"lookup","from":"stats","key":"grp","fields":["grp"],"values":["fenceLo","fenceHi"]}`；333 行每行都多了两列 |
| `data: outliers` | 围栏之外的点 | `filter: mass < fenceLo \|\| mass > fenceHi` → 默认 2 只（Chinstrap ♀ 2700 g、Chinstrap ♂ 4800 g） |
| `data: whiskers` | **须端 = 围栏内最远的真实观测** | 先 `filter` 出围栏内的点，再 `aggregate` 取 `min`/`max` → `whiskerLo` / `whiskerHi` |
| `data: boxes` | 第二次 `lookup` 把须端并回统计表 | 每组一行、画一个完整盒须图所需的全部数字都在这一行上 |
| `data: errorbars` | 区间随信号重算 | `err = errMode === 'sd' ? sd : se`；`lo = mean - errK·err`；`hi = mean + errK·err` |
| `data: overall` | **不带 `groupby` 的 aggregate = 全体总计** | 1 行（`n = 333`，`mean = 4207.06`），用来画总体均值参考线 |
| `scales: xcat` | 6 个分类共享的 band 尺 | `range: [0, {"signal": "panelW"}]`；`domain.sort: true` 让顺序变成 Adelie ♀ → Adelie ♂ → … （`♀` U+2640 < `♂` U+2642） |
| `scales: species` | 3 色 `tableau10`，两面板共用 | 同物种的雌雄共用一个颜色，成对出现；雌雄靠 x 轴标签区分 |
| `scales: yBox` | 箱线图纵轴 | domain 取 **3 个字段的并集**：`whiskerLo` + `whiskerHi` + `outliers.mass`，漏掉第三项离群点就会跑到画布外 |
| `scales: yErr` | 误差棒纵轴 | domain 取 `lo` / `hi` / `overall.mean`；因为 `lo`/`hi` 是信号驱动的，切 `errMode` 时**纵轴会自动变焦** |
| `legends` | 物种色图例 | `orient: "none"` + `legendX/legendY` 手工定位到标题下方的空条里，避免和面板抢版面 |
| `marks[0..2]` | 两个面板标题 + 样本量脚注 | 文案用 `signal` 拼，随旋钮变化；`n = 333` 从 `data('overall')` 读，不写死 |
| `marks[3]` | 面板一 `group` | `encode.update` 显式给 `x/y/width/height`；内部 `axes` 依据 **group 的 width/height** 定位 |
| `marks[3].marks` | 须 → 端帽 → 盒 → 中位线 → 离群点 | 顺序即 z 序：先画贯通的须线，再用盒子盖住中段 |
| `marks[4]` | 面板二 `group` | 参考线 → 竖线 → 端帽 → 均值点 → 数值标签 |

### 关键概念

**1. Tukey 须为什么必须"反连接"**

教科书定义是：

```
IQR    = Q3 − Q1
围栏    = [Q1 − k·IQR, Q3 + k·IQR]      (k = 1.5)
下须端  = min{ x ∈ 该组观测 : x ≥ Q1 − k·IQR }
上须端  = max{ x ∈ 该组观测 : x ≤ Q3 + k·IQR }
离群点  = 围栏之外的每一个观测
```

注意后三行都要求**回到逐行观测**。所以数据流必须是「聚合 → 反连接 → 再聚合」两趟：

| 组别 | Q1 | Q3 | IQR | 围栏 | 须端（真实观测） |
| --- | --- | --- | --- | --- | --- |
| Adelie ♀ | 3175 | 3550 | 375 | [2612.5, 4112.5] | 2850 / 3900 |
| Chinstrap ♂ | 3731.25 | 4100 | 368.75 | [3178.125, 4653.125] | 3250 / 4550（4800 成为离群点） |

如果偷懒直接画到 `fenceLo`/`fenceHi`，Adelie ♀ 的下须会画到 2612.5 —— 而那里根本没有企鹅。

顺带一个可以自己验证的性质：**`yBox` 的 domain 不随 `iqrK` 变化**（始终 2500–6500），
因为「围栏内的极值」∪「围栏外的离群点」恒等于全体观测，k 只决定这条线在哪里被切成"须"和"点"。

**2. 手工几何全部由 `bandwidth` 派生**

`xcat` 的 `bandwidth` 是唯一的长度基准，几何靠 `band` 偏移量表达（`band` 支持信号，这是关键）：

| 元素 | x 表达 | 说明 |
| --- | --- | --- |
| 盒左边 | `band = (1 - boxRatio) / 2` | 即 `scale(grp) + bandwidth·(1−r)/2` |
| 盒宽 | `{"scale":"xcat","band":{"signal":"boxRatio"}}` | 只给 `band` 不给 `field` ⇒ 纯 `bandwidth·r` |
| 中位线 | `band = (1 ± boxRatio) / 2` | 与盒左右边严格对齐 |
| 须 / 离群点 / 均值点 | `band = 0.5` | 带中心 |
| 须端帽 | `band = 0.5 ± boxRatio·0.32` | 端帽宽 = 盒宽的 64% |
| 误差棒端帽 | `band = 0.5 ± boxRatio·0.22` | 端帽宽 = 盒宽的 44%，比箱线图窄，视觉上不打架 |

**3. `group` mark 里的坐标系与两个陷阱**

- `group` mark 的 `axes` 由 Vega 的 ViewLayout 按**该 group 的 `width`/`height` 编码值**定位，
  所以两个面板的轴各自贴在自己的框上，不需要手算 translate。
- 陷阱一：group 内 scale 写 `"range": "width"` 会解析成**顶层**的 `width` 信号（子图按整幅画布画）。
  本例把 `xcat` / `yBox` / `yErr` 都放在顶层，range 显式写 `[0, {"signal":"panelW"}]`，从根上绕开。
- 陷阱二：**y 轴网格必须写 `"gridScale": "xcat"`**。不写的话网格线长度会退化成顶层 `width` 信号，
  横穿整幅画布、盖到另一个面板上。

**4. 三种误差棒差多少**

以 Adelie ♂（n = 73、mean = 4043.5 g、SD = 346.8 g、SE = 40.6 g）为例：

| 模式 | 半宽 | 区间 | 回答的问题 |
| --- | --- | --- | --- |
| ±1 SE | 40.6 g | 4002.9 – 4084.1 | 均值本身有多准 |
| ±1.96 SE（95% CI） | 79.6 g | 3963.9 – 4123.1 | 真实均值大概落在哪 |
| ±1 SD | 346.8 g | 3696.7 – 4390.3 | **个体**分散程度（≈ 箱线图那一列） |

SD 比 SE 宽 √n ≈ 8.5 倍。论文里只写 "mean ± error" 不说是哪一种，读者就无法判断结论强度 ——
这也是为什么本 demo 把模式名直接印在面板标题上。
（95% CI 严格该用 t 分布分位数 `t(0.975, n−1)`；Vega 表达式只有正态分位数 `quantileNormal`，
n ≥ 34 时 t ≈ 2.03 vs 正态 1.96，差 3%，本例按惯例用正态近似，README 里说明清楚就是诚实的做法。）

## 试一试

1. **把 `iqrK` 拖到 3.0**：两个离群点被须"吞"回去，`outliers` 数据集变成 0 行；再拖回 0.5，
   离群点暴增到 63 个。顺便验证上面说的「`yBox` 的 domain 一动不动」。
2. **把 `errMode` 切成「标准差 ±1 SD」**：误差棒瞬间变长 8 倍多，纵轴自动变焦到 3000–5800。
   对比左边同一物种的盒高（IQR）—— 二者量级相当，说明 SD 描述的是个体离散，不是均值精度。
3. **把 `boxRatio` 拉到 0.95 再拉到 0.2**：盒、中位线、端帽会同步缩放，因为它们全部由
   `bandwidth × band 偏移` 派生。若只改盒宽不改中位线，就会看到中位线探出盒外 —— 这就是
   手工几何最容易出的 bug。
4. **把 `whiskers` 里的 `filter` 删掉**：须端立刻退化成全体 min/max，离群点被须罩住 ——
   这就是"错的箱线图"长什么样，值得亲眼看一次。
5. **把 y 轴的 `gridScale: "xcat"` 删掉**：网格线会按顶层 `width`（900）画，横穿两个面板。
   删掉之后 `node tools/validate.cjs 29` 依然 PASS —— 布局 bug 校验器抓不到，只能靠眼睛。
6. **改成按 `Island` 分组**（把 `groupby` 与 `grp` 的 formula 里的 `Species/Sex` 换成 `Island`），
   看看 3 个岛的体重分布；记得配色 scale 的字段也要跟着换。

## 参考

- Aggregate 变换（含 `q1`/`median`/`q3`/`stderr`/`ci0`/`ci1` 全部 op 列表）：
  <https://vega.github.io/vega/docs/transforms/aggregate/>
- Lookup 变换：<https://vega.github.io/vega/docs/transforms/lookup/>
- Formula 变换：<https://vega.github.io/vega/docs/transforms/formula/>
- Filter 变换：<https://vega.github.io/vega/docs/transforms/filter/>
- Group mark（嵌套坐标系）：<https://vega.github.io/vega/docs/marks/group/>
- Rect / Rule / Symbol mark：<https://vega.github.io/vega/docs/marks/rect/> ·
  <https://vega.github.io/vega/docs/marks/rule/> · <https://vega.github.io/vega/docs/marks/symbol/>
- Band scale 与 `bandwidth`：<https://vega.github.io/vega/docs/scales/#band>
- 编码里的 `band` / `offset` 值引用：<https://vega.github.io/vega/docs/types/#Value>
- Axis 的 `gridScale`：<https://vega.github.io/vega/docs/axes/>
- 表达式函数 `quantileNormal` / `format`：<https://vega.github.io/vega/docs/expressions/>
- Vega-Lite 的 boxplot 糖（对照它省了哪些步骤）：<https://vega-lite.github.io/docs/boxplot.html>

## 与 matplotlib 的对照

**Vega 这边靠什么表达出来**

| 需求 | Vega 的语法元素 |
| --- | --- |
| 五数概括 | `transform: aggregate` 的 `q1`/`median`/`q3` op |
| Tukey 围栏 | `transform: formula`（表达式里直接引用 `iqrK` 信号） |
| 须端 = 围栏内最远真实观测 | `lookup` 反连 + `filter` + 第二次 `aggregate` |
| 盒 / 中位线 / 须 / 端帽 / 离群点 | `rect` / `rule` / `symbol` 五个基础 mark，几何用 `band` 偏移写死在 spec 里 |
| 双面板 + 共享比例尺 | 两个 `group` mark 引用同一批顶层 scale |
| 交互调参 | `signals` + `bind`，数据流自动重算，纵轴自动变焦，**零行 JS** |

**matplotlib / seaborn 要写什么**

- **箱线图本身反而更省事**：`ax.boxplot(data, whis=1.5, showfliers=True)` 一行就有 Tukey 须和离群点，
  分位数、围栏、须端筛选全在 C 层算好了。`seaborn.boxplot(x=..., y=..., hue=...)` 连分组都替你做。
  **这一局 matplotlib 赢**，而且赢得很干脆。
- **但"数据流"是不透明的**：`boxplot()` 吃的是 `list[array]`，你得先自己 `groupby` 把 6 个数组切出来
  （`df.dropna(subset=[...])` → `groupby(['Species','Sex'])['Body Mass (g)'].apply(list)`），
  并自己保证顺序和颜色列表一一对应。Vega 里这些是 `groupby` + `domain.sort` + ordinal scale 的职责，
  顺序错不了；matplotlib 里错位是最常见的 bug。
- **误差棒要自己算**：`ax.errorbar(x, mean, yerr=...)` 只画，不算。`yerr` 得自己算
  （`sem = df.groupby(...).sem()`，95% CI 还要 `scipy.stats.t.ppf(0.975, n-1) * sem`），
  切换 SE/CI/SD 就是重新算一遍数组再重画。Vega 里这是 3 个 `formula` + 1 个信号，
  纵轴 domain 也跟着自动更新。
- **交互几乎等于没有**：想要"拖动滑块改 k 值"，matplotlib 得上 `matplotlib.widgets.Slider` + 回调函数，
  在回调里重算分位数、`ax.clear()`、重画全部图元、`fig.canvas.draw_idle()` —— 几十行命令式代码，
  而且是"重画"而不是"增量更新"。Vega 的 `bind` 是 spec 里的 4 行 JSON，dataflow 只重算受影响的节点。
  想要悬停 tooltip 显示五数概括，matplotlib 要装 `mplcursors` 或自己接 `motion_notify_event`。
- **双面板共享分类尺**：`plt.subplots(1, 2)` 很容易，但两个 axes 的分类顺序、颜色映射是**两份独立状态**，
  靠你自己保持一致（典型做法是提前建一个 `dict` 颜色表到处传）。Vega 里 `xcat` / `species`
  是两个面板共同引用的**同一个对象**，不可能不一致。
- **图例**：`seaborn` 自动出，纯 matplotlib 要 `Patch(color=..., label=...)` 手搓 handles。

**结论**：单张标准箱线图，matplotlib 更快；一旦要**改定义**（非标准须、自定义围栏、
把须端换成 5%/95% 分位）、**联动多面板**、**加交互**、或者**把图当数据管道的一部分**（换个字段就重画），
Vega 的"拆到基础 mark"就从负担变成资产 —— 因为每一步统计与几何都是 spec 里可读、可改、可复用的一行，
而不是埋在库函数里的默认行为。
