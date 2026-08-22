# 42 · Job Voyager：argmax 整行元组 + facet 分组 + 用比例尺代替 if/else

对应官方示例：<https://vega.github.io/vega/examples/job-voyager/>
（原始 spec：<https://github.com/vega/vega/blob/main/docs/examples/job-voyager.vg.json>）

一张可搜索的堆叠面积图：横轴是 1850–2000 的 15 个美国人口普查年，纵轴是 255 个职业
（× men / women = 510 条序列）各自占当年全部就业人口的比例，纵向堆满 100%。
每条色带上写着职业名，而且**标签恰好落在这条序列自己的历史峰值那一年**。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/demos/42-job-voyager/
```

## 学习目标

官方那份 spec 只有 174 行 / 4449 字节，但里面塞了四个可以直接搬到别处用的手法：

1. **`aggregate` 的 `argmax` / `argmin` op 返回整行元组**，不是一个数值。
   于是 `datum.argmax.year`、`datum.argmax.perc`、`datum.argmax.y0`、`datum.argmax.y1`
   都能用 —— 这是「把每组的极值行整行取出来」的标准手法，一次 `aggregate` 就把
   「每条序列的峰值在哪一年、当时堆到了哪个高度」全算完了。
2. **group mark 的 `from` 同时给 `data` 和 `facet`**：外层由汇总表驱动（一组一行），
   内层 facet 的是明细表；子 mark 里用 `{"parent": "字段"}` 反向读外层那一行。
   这是 Vega 里画多序列 area / line 的唯一正路（`area`/`line` mark 没有 series 通道）。
3. **用比例尺代替 if/else 表达式**。标签该左对齐还是右对齐、该往哪边偏 6px、该不该显示，
   本来都是「写三个三元表达式」的活儿，官方把它们变成三个比例尺：两个 `quantize`
   （连续 → 离散档位）和一个 `quantile`（按分位数分桶）。声明式、可改、可讲。
4. **一个 signal 同时挂 `bind` 和 `on`**：`query` 既是文本框，也是「点色带填入 / 双击清空」
   的事件目标；过滤用 `test(regexp(query, 'i'), datum.job)` 做不区分大小写的正则搜索。

顺带练到的坑：连续比例尺与 `quantile` 比例尺**对 domain 的要求根本不同**、
拾取顺序与 `interactive: false`、以及交互过滤到 0 行时 data 驱动 domain 的退化。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals: sex` | radio 切 men / women / all | 只喂给 `filter`。`all` 时同一职业的男女各占一条带，性别构成直接肉眼可比 |
| `signals: query` | 搜索词 | **同时有 `bind`（文本框）和 `on`（`area:click!` → `datum.job`，`dblclick!` → `''`）**。`!` 后缀表示消费掉事件、不再冒泡触发第二次 |
| `signals: xDomain/yDomain/alphaDomain/peakExtent/peakSample` | 五个只有 `update` 的派生 signal | 本仓库加的空态兜底，官方直接写 `{"data": ..., "field": ...}`。见「与官方示例的差异」第 3 条 |
| `data: jobs` | 明细表 | `filter` →`stack`。`stack` 的 `groupby: ["year"]` 是「每年一根柱子」，`sort` 决定色带从下到上的顺序 |
| `data: series` | 汇总表，**一行 = 一条序列** | `groupby: ["job","sex"]`，`fields: ["perc","perc"]`、`ops: ["sum","argmax"]`。`sum` 是数值，`argmax` 是**整行** |
| `scales: x / y` | linear，`range: "width"/"height"` | `x` 写 `zero: false`（年份不能被 0 压扁），`y` 写 `zero: true`（比例必须从 0 起） |
| `scales: color` | ordinal，`["men","women"] → 蓝 / 红` | 只有两档，官方直接给两个色值；这里不用内置 scheme 是为了保住「蓝=男、红=女」的语义 |
| `scales: alpha` | linear → `[0.4, 0.8]` | 面积的填充不透明度按**整条序列的总份额**取值：大职业实、小职业虚 |
| `scales: font` | **sqrt** → `[0, 20]` | 字号按峰值份额开方，`fontSize` 再 `offset: 5` → 实际 5~25px。用 sqrt 而不是 linear，是因为份额跨了 5 个数量级（最小 1.2e-6，最大 0.447） |
| `scales: opacity` | **quantile**，range 10 档前 5 档是 0 | 「只给峰值份额排在后 50% 的序列显示标签」，实测 255/510 条可见、153 条不透明度 ≥ 0.4 |
| `scales: align / offset` | 两个 **quantize**，domain 都是 `[1730, 2130]` | 把峰值年份映射成 `left/center/right` 与 `dx = +6/0/-6`，让贴边的标签朝里写 |
| `axes` | 底部年份 + 右侧百分比 | 年份 `"format": "d"`（否则出 `1,850`）、`tickCount: 15`；右轴 `"format": "%"`、`grid: true`、`domain: false`、`tickSize: 12`（刻度线兼作短网格）。注意 x 是 **linear 而非 band**，`tickCount: 15` 落在 domain `[1850, 2000]` 上会生成 16 个每 10 年一个的刻度 —— 包括**数据里并不存在的 1890**（那一年美国普查资料在源数据里整体缺失） |
| `title` | 标题 + signal 副标题 | 本仓库加的。`title.subtitle` 支持 `{"signal": ...}`，于是把「当前性别 / 搜索词 / 命中多少条序列多少行」直接量在图上，过滤是否生效一眼可验 |
| `legends` | 性别色图例 | 官方没有；这里补一个，并用 `encode.labels.update.text` 把 `men`/`women` 显示成中文 |
| `marks[0]` group | 一条序列一个 group | `from.data = series` + `from.facet = {data: "jobs", groupby: ["job","sex"]}`；子 area 里 `{"parent": "sum"}` 取外层那一行 |
| `marks[1]` text | 510 个职业名标签 | 全部位置/大小/可见性都由上面那些比例尺算出；`interactive: false` |
| `marks[2]` text | 空态提示 | signal 驱动 `text`，非空时求值为 `''` |

### 核心技巧一：`argmax` 返回的是整行元组

```json
{
  "type": "aggregate",
  "groupby": ["job", "sex"],
  "fields": ["perc", "perc"],
  "ops":    ["sum",  "argmax"],
  "as":     ["sum",  "argmax"]
}
```

同一个字段 `perc` 出现两次，配两个不同的 op —— `fields`/`ops`/`as` 是三条等长的平行数组，
按下标一一对应（顺带记住：`ops: ["count"]` 时 `fields` 对应位置要写 `null`，因为 count 不需要字段）。

`sum` 得到一个数；`argmax` 得到的是**该组内 `perc` 最大的那一整行数据对象**。
实测输出（本仓库数据，第一行）：

```json
{
  "job": "Accountant / Auditor",
  "sex": "men",
  "sum": 0.03870287290889381,
  "argmax": {
    "job": "Accountant / Auditor", "sex": "men",
    "year": 1990, "count": 814842, "perc": 0.00546412928032161,
    "y0": 0.9945358707196792, "y1": 1.0000000000000009
  }
}
```

关键在于 **`argmax` 里带着 `y0` / `y1`** —— 因为 `stack` 是在 `jobs` 上跑的，
`series` 以 `jobs` 为 `source`，所以聚合看到的行已经有堆叠坐标了。
于是标签的 y 位置可以一句话写完：

```json
"y": {"signal": "scale('y', 0.5 * (datum.argmax.y0 + datum.argmax.y1))"}
```

= 「峰值那一年、这条色带上下沿的中点」。**顺序很重要**：`stack` 必须在 `aggregate` 之前，
否则 `argmax` 元组里没有 `y0`/`y1`，`0.5 * (undefined + undefined)` 求值为 `NaN`、
`scale('y', NaN)` 也是 `NaN`。实测后果（把 `jobs` 的 `stack` 删掉再跑）：
**Vega 不报错、不 WARN，`toSVG()` 照样产出**，场景图里 510 个 text item 的 `y` 变成 `undefined`
（不是 `NaN` —— encode 把非有限值丢掉了），`x` 仍然正常，于是 510 个标签沿绘图区顶边
`y ≈ 0` 排成一条黑字带（SVG 里是 `transform="translate(747,2)"` 这种）；
场景包围盒（`-16, -78, 861, 532`）和有 `stack` 时**一模一样**，
所以 `tools/validate.cjs` 的溢出检查也抓不到 —— 只能靠读 SVG 文字或看图。

换成不用 `argmax` 的写法：得先 `joinaggregate` 求每组 max、再 `filter` 出 `perc === maxPerc`、
还要处理并列 —— 三个变换换一个 op。

### 核心技巧二：group mark 的 `from` 同时给 `data` 和 `facet`

```json
"from": {
  "data": "series",
  "facet": {"name": "facet", "data": "jobs", "groupby": ["job", "sex"]}
}
```

两句话干了两件事：

- **`data: "series"`** → 「生成多少个 group、每个 group 的 `datum` 是什么」。
  一行一个 group，510 个 group，每个 group 的 datum 就是那条带 `sum` / `argmax` 的汇总行。
- **`facet: {...}`** → 「每个 group 内部能看到哪些明细行」。按 `["job","sex"]` 把 `jobs`
  的 7650 行切成 510 份，各自 15 行（一年一行）。子 mark 写 `"from": {"data": "facet"}` 就拿这 15 行。

子 mark 想读外层那一行时用 `{"parent": "字段"}`：

```json
"fillOpacity": {"scale": "alpha", "field": {"parent": "sum"}}
```

这就是「整条序列的总份额决定这条带的实虚」——一个跨层级的引用，
不需要把 `sum` 用 `joinaggregate` 广播回明细表的每一行。

为什么非得 group + facet？因为 **`area` 和 `line` mark 没有 series / detail 通道**：
一个 area mark 永远只产出一条路径。多序列在 Vega 里只有 facet 一条路。
（配套的正确性要求：facet 分组内**保留源数据顺序**，所以上游必须把点按 x 排好。
本例的 `jobs.json` 天然按 job → sex → year 有序（实测 510 个分组全部年份升序、且每组都齐 15 行），所以省了一步 `collect`；
数据顺序不确定时必须补 `{"type": "collect", "sort": {"field": "year"}}`，
否则面积会画成来回折的锯齿。）

### 核心技巧三：用比例尺代替 if/else

三个「本来该写表达式」的地方都被换成了比例尺。

**`align` / `offset` 是 `quantize`。** `quantize` 把连续 domain 均分成 `range.length` 段：

```
domain [1730, 2130]，range 3 档 → 分界点 1730 + 400/3 ≈ 1863.3、1730 + 800/3 ≈ 1996.7

  年份 ∈ [1730, 1863.3)  → "left",   dx = +6
  年份 ∈ [1863.3, 1996.7) → "center", dx =  0
  年份 ∈ [1996.7, 2130]   → "right",  dx = -6
```

数据里的年份只有 1850..2000，所以实际分档是：**1850/1860 左对齐**（42 条）、
**1870–1990 居中**（351 条）、**2000 右对齐**（117 条）。
效果是：峰值出现在图最左边的标签朝右写、最右边的朝左写，都不会被画布边缘切掉。

domain 为什么是 `[1730, 2130]` 这么个「怪」数字？倒推：想让第一档只覆盖 1850/1860、
第三档只覆盖 2000，就要让分界点落在 (1860, 1870] 和 (1990, 2000] 之间。
取 `[1730, 2130]`（数据范围 150 年向两侧各外扩 120 年、总跨度 400 年）刚好满足，
而且是个好记的整数。**这是「用 domain 编码业务阈值」**——想改「哪几年算贴边」，
调 domain 两个端点就行，不用碰任何表达式。

**`opacity` 是 `quantile`。** `quantile` 的 domain 不是 `[min, max]`，而是**整个样本数组**；
它按 `range` 的档数求分位点。range 给了 10 档 → 9 个十分位分界：

```json
"range": [0, 0, 0, 0, 0, 0.1, 0.2, 0.4, 0.7, 1.0]
```

前 5 档全是 0 → **峰值份额排在后 50% 的序列才有标签**（实测 255/510 条可见，
其中 153 条不透明度 ≥ 0.4，肉眼可辨的大约是最大的 30%）。
这就是「自动去拥挤」：不用 `label` 变换做碰撞检测（本仓库也禁用它），
直接按重要性排序取头部。想多显示一些，把某个 0 改成 0.05 即可。

**注意这两类比例尺对 domain 的要求完全相反**，本 demo 踩过：
`font` 是 sqrt（连续比例尺），domain 必须是 `[min, max]` 两个数；
`opacity` 是 quantile，domain 必须是全部 510 个值。
官方两处都写 `{"data": "series", "field": "argmax.perc"}` 是因为 Vega 会按比例尺类型
自动选「求 extent」还是「取全量」。**一旦改成 `{"signal": ...}` 就得自己分清**。
把 510 个值原样喂给 sqrt 比例尺会怎样？d3 的连续比例尺按
`n = min(domain.length, range.length)` 取端点 —— `range` 只有 2 个值，所以它只用 domain 的
**前两个**元素（不是首尾两个！`assets/vega.js` 里 `transformer$3` 的 `rescale()`），
后面 508 个值全被忽略，超出端点的值又因为默认不 clamp 而线性外推。
实测：`peakExtent` 换成 `peakSample` 后 domain 变成 `[0, 0.00724, ...]`（`zero: true` 补的 0 在最前），
于是 `0.00724 → 20px`，而真正的最大值 0.4469 外推到 **162px**（Farmer），
Farm Laborer 109px、Laborer 85px；仅 Farmer 一个标签就把场景包围盒往左顶到 `x1 = -416`
（远超 `tools/validate.cjs` 的溢出阈值）。这里最初就是这么错的。
所以本 demo 拆成 `peakExtent`（两元素 extent）和 `peakSample`（全量样本）两个 signal。

### 关键概念清单

- **`stack` 的 `sort` 是正确性而非美观**：`{"field": ["job","sex"], "order": ["descending","descending"]}`
  保证每年的色带顺序一致 —— 不排的话某职业某年缺行会让上方所有色带整体错位、面积扭成麻花。
- **`interactive: false` 与拾取顺序**：Vega 自上而下取第一个命中的 mark。标签层画在 area 之上，
  若可交互就会抢掉 `area:click`，「点色带填搜索框」直接失效。空态提示层同理。
- **`hover` 编码集必须配 `update`**：只写 `enter` + `hover` 时鼠标移出不会复位
  （leave 指令是 `['update','hover']`，缺 update encoder 会 StopPropagation）。本例的 area 有 `update`，没问题。
- **`test(regexp(query, 'i'), datum.job)`**：`regexp(模式, 标志)` 造正则、`test` 匹配。
  所以搜索框里能直接输 `^Teacher`、`nurse|midwife`、`engineer.*elec`。
  `!query ||` 那半句是空串短路，否则 `regexp('')` 匹配一切、结果一样但白跑 7650 次。
- **`format: "d"` 治年份**：默认数字格式会把 1850 印成 `1,850`。
- **`argmax` 的并列**：多年份 `perc` 完全相同时 `argmax` 只返回第一行（不像 `rank` 会多吐行）。
  本数据里是浮点比例，撞不上。

## 试一试

1. **看清 `argmax` 到底是什么**：在浏览器 console 里跑
   `__vegaDemo.views[0].view.data('series')[0]` —— 直接看到嵌套的 `argmax` 对象。
   再把 `spec.vg.json` 里 `ops` 的 `"argmax"` 改成 `"max"`（其余一字不改），**整层 510 个标签会凭空消失**：
   `datum.argmax` 退化成一个数，`datum.argmax.year` / `.y0` / `.y1` 全是 `undefined`。
   实测渲染结果是每个标签都变成
   `<text transform="translate(0,0)" font-size="0px">Accountant / Auditor</text>` ——
   坐标塌到原点、字号为 0（场景图里 `x`/`y` 是 `undefined`、`fontSize` 是 `null`），
   所以字还在 SVG 里、肉眼一个都看不见。最阴的是
   **Vega 全程不报错、不 WARN、`toSVG()` 照样产出**，`node tools/validate.cjs 42` 依然 PASS
   （544 段文字、`path`/`line`/`text` 图元数一个都不少，只有 SVG 从 371988 字节掉到 360975 字节）——
   这就是「op 返回值不是整行」的后果，也是为什么必须 `node tools/inspect.cjs 42` 逐条读 SVG 文字、
   再 `--shots` 看一眼图。
2. **调「哪几年算贴边」**：把 `align` 与 `offset` 两个 quantize 比例尺的 domain
   从 `[1730, 2130]` 改成 `[1850, 2000]`。分界点变成 1900 / 1950，
   于是 1850–1880 左对齐、1900–1940 居中、1950–2000 右对齐 —— 峰值在 1950/1960 的一大批
   战后新兴职业本该居中，现在全被推成右对齐、往图内挤成一团；1880 的标签朝右写反而更容易越界。**改两个数就换一套排版规则，一行表达式都不用碰。**
3. **调标签密度**：把 `opacity` 的 range 前 5 个 0 改成 `[0, 0, 0, 0.05, 0.1, 0.1, 0.2, 0.4, 0.7, 1.0]`，
   可见标签从 255 条涨到 357 条（后 70%），马上能体会到为什么官方要砍掉一半。
   反向再试 `[0,0,0,0,0,0,0,0,0.4,1.0]`，只剩最大的 20%。
4. **验证 sqrt 是必要的**：把 `font` 比例尺的 `"type": "sqrt"` 改成 `"linear"`。
   份额跨 5 个数量级，线性映射下实测 **469/510 个标签被压到 5px**（`round: true` 把比例尺输出抹成 0，
   只剩 `offset: 5`），只有 Farmer 25px、Farm Laborer 14px、Laborer 10px 三个还看得出大小差别；
   连 Household Worker（峰值 7.3%）也只剩 8px。换回 sqrt 后分布是
   5px×168、6px×204、7px×79、8px×25、9px 以上 33 个 —— 层次感全靠这一个 `type`。
5. **踩一次空态**：搜索框输入 `zzzz`。有兜底时轴还在、中间出现一行提示；
   把 `x` 比例尺的 domain 从 `{"signal": "xDomain"}` 改回官方的
   `{"data": "jobs", "field": "year"}`，同样输 `zzzz` 就会看到 x 轴刻度全消失、SVG 里冒出 `NaN`。
   **注意此时 `node tools/validate.cjs 42` 仍然 PASS** —— 校验器只跑 signal 的**默认值**
   （`query` 默认是 `""`，7650 行齐全，什么都不会报）。这正是 `AGENTS.md`「校验器自己的盲点」
   那一节说的事。想让校验器抓到，得连 `query` 的 `"value"` 一起改成 `"zzzz"`，
   那时才会看到 `WARN Infinite extent for field "year": [Infinity, -Infinity]`
   加一条「比例尺 domain 退化：x domain 非有限 [NaN, NaN]」然后 FAIL。
   换句话说：**空态兜底属于「默认值下看不见」的那一类正确性，必须自己动手验**。
6. **拾取顺序实验**：把标签 mark 的 `"interactive": false` 删掉，再点一条粗色带上的文字 ——
   搜索框不再被填入（点击被文字抢走了）。

## 与官方示例的差异

逐条列出对官方 spec 的改动及原因。**图形结构、变换链、全部 8 个比例尺的类型与 range
都与官方完全一致**，改动集中在数据路径、空态兜底和可读性补充。

| # | 改动 | 原因 |
| --- | --- | --- |
| 1 | 数据 url `data/jobs.json` → `../../assets/data/jobs.json` | 本仓库零外部依赖，数据集内置于 `assets/data/`（通用契约第 2 条） |
| 2 | 顶层加 `"title"`（含 signal 驱动的 `subtitle`） | 本仓库契约要求每个 spec 有 `title`；副标题顺便把「当前筛选 / 命中多少条序列多少行」量出来，方便肉眼验证过滤真的生效 |
| 3 | 5 个 data 驱动的 domain 换成派生 signal：`x`→`xDomain`、`y`→`yDomain`、`alpha`→`alphaDomain`、`font`→`peakExtent`、`opacity`→`peakSample` | **空态兜底**（G 组契约第 5 条）。官方没管「搜索无命中」：那时 `jobs` / `series` 变 0 行，表达式里的 `extent(...)` 返回 `[null, null]`，而比例尺侧会抛出**四条** `Infinite extent for field "…": [Infinity, -Infinity]` WARN（`year` / `y1` / `sum` / `argmax.perc` 各一条 —— `opacity` 是 quantile，不求 extent 所以不在其中），x 轴刻度全消失、SVG 里出现 `NaN`。本仓库校验器把这类 WARN 判为失败。写法沿用 `demos/10-signals-bind/`：只有 `update` 的派生 signal + `length(...)`/`span(...)>0` 判据。**注意 `font`(sqrt) 要 extent、`opacity`(quantile) 要全量样本，必须拆成两个 signal** —— 详见上文「核心技巧三」 |
| 4 | 加了 `marks[2]`：signal 驱动的空态提示文字 | 同上。刻意**不**新建一个默认为空的数据集来放提示 —— 校验器断言每个数据集行数 > 0，会判它失败 |
| 5 | 两条坐标轴加 `"title"`；底轴年份维持 `"format": "d"` | 官方两条轴都没标题，读者不知道纵轴是「占当年就业人口的比例」。契约要求坐标轴标题与单位 |
| 6 | 加了一个 `legends` 条目（性别色图例），用 `encode.labels.update.text` 把 `men`/`women` 标成中文 | 官方靠颜色约定俗成（蓝男红女），没有图例。契约要求「图上要有必要的说明文字，让人一眼看懂」 |
| 7 | area mark 加 `tooltip` 通道 | 官方没有。加了之后悬停能读到精确数值（`format(datum.perc, '.3%')`），把「肉眼看色带」升级成可查证 |
| 8 | 标签 mark 加 `"comment"` 键；`data` / `signals` 条目上加 `"comment"` | 教学注释。**只放在 `data` / `signals` / `marks` 上** —— `scales` 条目里放任何未知键都会触发 `Unsupported scale property` WARN，被校验器判失败（G 组契约第 4 条）。官方 spec 本来就没有注释键，所以这条只是「加东西时的落点选择」 |
| 9 | 三处三位十六进制写全成六位（同色，纯格式化）：`color` range 的 `#33f` / `#f33` → `#3355ff` / `#ff3333`；标签 `fill` 的 `#000` → `#000000`；右轴 grid/ticks 的 `#ccc` → `#cccccc`。另外 `filter` 表达式里 `regexp(query,'i')` 加了一个空格写成 `regexp(query, 'i')` | 纯格式化，语义完全等价。三位十六进制在少数工具链里会被误处理 |
| 10 | radio / text 控件补了 `name`（中文标签）与 `placeholder` 示例 | 官方 placeholder 只写 `search`；这里给出三个可直接粘的正则例子，降低「不知道能输什么」的门槛 |
| 11 | 顶层 `description` 从英文一句话（"A searchable, stacked area chart of U.S. occupations from 1850 to 2000."）改写成中文并点出核心技巧 | 通用契约第 4 条：文档与注释用中文。这是唯一一处改写官方**说明文字**的地方；另外被替换掉的官方值只有 `placeholder`（第 10 条）与三处十六进制色值 + 一个空格（第 9 条），其余改动（按叶子路径数 51 处）全是**新增键**，官方原有的键一个都没删 |

**没有改的**（本来可能要改，检查后确认无需动）：

- **内建 signal 冲突**：官方只自定义了 `sex` 与 `query`，都不撞 `width`/`height`/`padding`/
  `background`/`autosize`/`cursor`，无需改名（G 组契约第 2 条）。
- **不可复现调用**：官方 spec 里没有 `now()` / `Math.random()`，也没有 `aggregate` 的
  `ci0`/`ci1`（那才是不可重现的重灾区），无需替换（第 3 条）。
- **`range: "width"/"height"` 的作用域**：本例的 group mark **不声明自己的 scale**，
  8 个比例尺全在顶层，所以不会踩「group 不重绑 width/height」的坑（第 6 条）。
- **`label` / `wordcloud` 变换**：官方本例没用（它靠 `quantile` 比例尺去拥挤），
  正好符合本仓库禁令。

## 与 matplotlib 的对照

| 这张图的哪一部分 | Vega 怎么表达 | matplotlib / seaborn 要付什么代价 |
| --- | --- | --- |
| 510 条序列堆叠 | `stack` 变换 + group/facet，声明式；长表直接喂进去 | `ax.stackplot(years, *arrays)` 要先把 7650 行长表 pivot 成 510×15 的稠密矩阵（pandas 一行 `pivot_table(index='job'/'sex', columns='year')`，本数据恰好无空洞，否则还得 `fillna(0)`），而且「哪一层在下面」由传入数组的顺序决定、得自己排 |
| 每条序列的峰值位置 | `aggregate` 的 `argmax` op，一次算完并带回 `y0`/`y1` | `df.loc[df.groupby(['job','sex']).perc.idxmax()]` 拿到峰值行，但**堆叠坐标是 stackplot 内部算的、不返回**。要标签落在色带中点，只能自己 `np.cumsum` 复算一遍堆叠边界，且必须保证累加顺序和 stackplot 内部完全一致 —— 这是最容易错的地方 |
| 标签的对齐 / 偏移 / 可见性 | 三个比例尺（2× `quantize` + 1× `quantile`），domain 一改规则就变 | 三段 Python 条件：`ha = 'left' if yr < 1863 else ...`、`dx = ...`、`if perc < np.quantile(peaks, 0.5): continue`。功能等价，但阈值散落在代码里，且改「显示多少标签」要动控制流 |
| 字号 ∝ √份额 | `"type": "sqrt"`、`"range": [0, 20]`，`fontSize` 再 `offset: 5` | `fontsize = 5 + 20 * np.sqrt(p / p_max)`，得自己写归一化并处理 `p_max` 变化 |
| 正则搜索过滤 | `filter` 变换 + `signal`，重算全流水线，无需重画代码 | matplotlib 静态图里**没有这个概念**。要交互得上 `ipywidgets`（只在 Notebook 里活）、`mpl_connect` 手写事件回调，或干脆换 Plotly/Bokeh。而且过滤后 stackplot 必须整幅 `ax.clear()` 重画，堆叠矩阵和 510 个标签全部重算 |
| 点色带 → 填入搜索框 | `{"events": "area:click!", "update": "datum.job"}`，一行 | `fig.canvas.mpl_connect('button_press_event', ...)`，回调里自己做点命中测试（stackplot 的 `PolyCollection` 要 `contains()` 逐个试），再自己找到对应的 job 名 |
| 悬停变色 | `encode.hover` | 手写 motion_notify 回调 + `set_alpha` + `draw_idle`，还要自己记住「上一个高亮的是谁」以便复位 |
| 空态兜底 | 派生 signal + `length(data(...))` 判据 | 过滤到空表时 `stackplot` 直接抛异常或画出空 Axes，得自己 `if df.empty:` 分支 |

**反过来说，matplotlib 更省事的地方**（诚实版）：

- **不需要 pivot 的那半句其实是 Vega 的功劳，但「长表→稠密矩阵」在 pandas 里是一行**，
  而在 Vega 里若真有空洞（某职业某年缺行），得额外上 `impute` 变换补 0 ——
  官方本例没写，因为这份数据每个序列都齐 15 行（1890 年是整份数据都没有，属于普查年份本身缺失；
  x 是 linear 而非 band，所以面积在 1880→1900 之间直连，不影响正确性）。
  真有空洞而不 impute，`stack` 会让上方所有色带在那一年整体错位。
- **文字排版**。matplotlib 的 `adjustText` 之类能做真正的迭代避让；Vega 的 `label` 变换要
  真实 canvas 位图，纯 Node 校验跑不了，本仓库直接禁用 —— 官方本例只能用「按分位数砍掉一半」这种粗办法。
- **导出到 LaTeX / PDF 的排版质量**：matplotlib 的 PGF backend、字体嵌入、
  与论文正文一致的数学字体，都是成熟的；Vega 出 SVG 之后还得再处理一遍。
- **调试**。Python 里可以在算堆叠边界的那一行下断点打印数组；
  Vega 的数据流只能靠 `view.data('series')` 或 `node tools/inspect.cjs` 在外面看，
  变换链中间态没有断点。
- 本例这种「面积图 + 峰值标注」若只需**一张静态图**、且不需要搜索交互，
  matplotlib 大约 40 行能出，比官方那份 174 行 JSON（本 demo 加上注释与兜底是 266 行）短得多。
  Vega 的价值在于交互与可重构（改比例尺 domain 就换排版规则），而不是行数。

## 参考

- 官方示例：<https://vega.github.io/vega/examples/job-voyager/>
- `aggregate` 变换（含 `argmax` / `argmin` 返回整行的说明）：<https://vega.github.io/vega/docs/transforms/aggregate/>
- `stack` 变换：<https://vega.github.io/vega/docs/transforms/stack/>
- `filter` 变换：<https://vega.github.io/vega/docs/transforms/filter/>
- group mark 与 `from.facet`：<https://vega.github.io/vega/docs/marks/group/>
- mark 的 `from` / `facet` / `{"parent": ...}` 引用：<https://vega.github.io/vega/docs/marks/>
- `area` mark：<https://vega.github.io/vega/docs/marks/area/>
- `text` mark（`align` / `baseline` / `dx` / `fontSize`）：<https://vega.github.io/vega/docs/marks/text/>
- Quantize / Quantile / Threshold 比例尺：<https://vega.github.io/vega/docs/scales/#quantize>
- 连续比例尺（`sqrt` 是 `pow` exponent 0.5）：<https://vega.github.io/vega/docs/scales/#linear>
- Signals 与 `bind` / `on`：<https://vega.github.io/vega/docs/signals/>
- 事件流选择器（`area:click!` 里的 `!`）：<https://vega.github.io/vega/docs/event-streams/>
- 表达式函数 `regexp` / `test` / `extent` / `pluck` / `span` / `format`：<https://vega.github.io/vega/docs/expressions/>
