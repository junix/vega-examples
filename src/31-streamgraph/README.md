# 31 · 流图：stack 的三种基线与 inside-out 排序

同一份「美国分行业失业人数」长表，同一套 spec，靠 `stack` 变换的 `offset` 参数在三种堆叠基线之间
切换：`zero`（普通堆叠面积）、`center`（流图 / streamgraph）、`normalize`（100% 堆叠）。
主图的基线绑在一个下拉框上可以当场切；下方三联图把三种基线并排画出来，方便对着看。

数据：`assets/data/unemployment-across-industries.json`，14 个行业 × 122 个月（2000-01 ~ 2010-02）
= 1708 行，`count` 与 `date` 均无缺失，所以本 demo 不需要 `filter` 去 null。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/31-streamgraph/
```

## 学习目标

1. 搞清 `stack` 变换 `offset` 的三种取值到底在算什么 —— 尤其是 `center` **不是**「以 y=0 为中轴」，
   而是「把每一列居中到全局最大总量里」，所以输出的 `y0/y1` 全是正数。
2. 学会把 `offset` 这种枚举型 transform 参数写成 `{"signal": ...}`，让整条数据流跟着控件重算。
3. 学会用 `window` + `rank` 造排序名次，再用一个 `formula` 把「排序策略」压成一个纯数值的
   `orderKey` 交给 `stack.sort` —— 包括流图的灵魂：**inside-out（帐篷形）排序**。
4. 学会让坐标轴的 `format` / `title` 也吃 signal：normalize 模式下纵轴自动变成百分比。
5. 记住两个真会踩的坑：
   - `area` / `line` 这类连线型 mark **必须先 `facet`**，一个序列一个 mark 实例；
   - group mark 内部的 scale 写 `"range": "width"/"height"` 时，解析的是**顶层**画布尺寸，
     除非这个 group 自己声明了同名的局部 signal。
6. 顺手认识 `utc` 比例尺为什么比 `time` 更适合带时区戳的数据。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width/height/padding` + `title` | 画布 640×540，标题带副标题 | 布局全靠 signal 算：`mainW=width`、`mainH=300`、`stripTop=392`、`miniGap=30`、`miniW=floor((width-2*miniGap)/3)=193`。改 `width` 三联图会自己重排 |
| `signals.stackOffset` | 下拉框绑 `zero` / `center` / `normalize` | 主角。它直接喂给 `stack` 变换的 `offset` 参数 |
| `signals.stackSort` | 下拉框绑 5 种堆叠顺序 | `inside-out` / `largest-bottom` / `peak-time` / `alphabetical` / `none` |
| `signals.curveType` | 下拉框绑 `area` 的 `interpolate` | `monotone`（不过冲）/ `basis`（最平滑、不过点）/ `linear` / `cardinal` / `step` |
| `signals.bandStroke` | 滑杆控制带间白描边宽度 | 拖到 0 就能体会 14 条带子为什么需要描边 |
| `signals.hoverSeries` | 由 mark 事件驱动的高亮态 | 监听 `@bands`（图上的带子）与 `@legendSymbol` / `@legendLabel`（图例），`pointerout` 复位为 `null` |
| `signals.yFormat` / `yTitle` | 派生 signal | `stackOffset === 'normalize' ? '.0%' : ',.0f'`，直接塞进纵轴的 `format` |
| `signals.seriesCount` | `length(data('series_stats'))` | tooltip 里写「7 / 14」时不要把 14 写死 |
| `data.raw` | 读 JSON，`parse` 出 `date` / `count` | 见下方「日期与时区」 |
| `data.series_stats` | `aggregate` → `formula` → `project` → 三次 `window` → `formula` | 一行一个行业，产出 `total` / `peak` / `peakDate` / `rankTotal` / `rankPeak` / `rankAlpha` / `insideOutKey` |
| `data.keyed` | `lookup` 把行业级名次回填到 1708 行，再 `formula` 折成 `orderKey` | `stack.sort` 只吃一个比较器，所以把「策略」编码成一个数值最省事 |
| `data.layout_main` | `stack`（`offset` 由 signal 驱动）+ `collect` | 主图布局。`collect` 按 `date` 排序，保证每个 facet 内的点是时间递增的 |
| `data.mini_zero/center/normalize` | 同一个 `keyed`，三份 `stack`，`offset` 分别写死 | 三联对照。共用 `orderKey`，所以三张图**只**差基线 |
| `data.strip_labels` | 3 行内联数据 | 用一个 text mark 画三个小标题，省得写三个 mark |
| `scales.color` | `ordinal` + `tableau20` | domain 取自 `series_stats` 的行序（总量降序），四个面板共用这一个顶层 scale，颜色天然一致 |
| `legends[0]` | 底部横排、3 列、可交互 | `encode.symbols/labels` 里给 mark 起名（`legendSymbol`/`legendLabel`）+ `interactive: true`，事件选择器才抓得到 |
| `marks[0]` mainPanel | group mark，自带 `signals`/`scales`/`axes` | **局部 `width`/`height` signal 是必须的**，否则内部 scale 会按 640×540 去画 |
| mainPanel 内的 facet group | `from.facet` 按 `series` 分面 | 14 个子 group，每个里面一个名为 `bands` 的 `area` mark |
| mainPanel 内两个 text mark | 参数回显 + 悬停行业名 | 纯 signal 表达式，没有数据源 |
| `marks` 后半 | 一个标题 text + 一个三小标题 text + 三个 mini group | mini 面板 x = `i * (miniW + miniGap)`，与小标题用同一个公式对齐 |

### 关键概念

**1. `offset` 三种取值的算法。** 设某个时间点上各行业的值为 $v_i$，该列总量 $S=\sum v_i$，
全表最大列总量 $S_{max}$：

- `zero`：`y0` 是前缀和，`y1 = y0 + v`，值域 `[0, S_max]`。
- `center`：先算 `y0_start = (S_max - S) / 2`，再在这个起点上做前缀和。
  于是**每一列都被居中到 `[0, S_max]` 这个固定区间里**，输出仍然全是正数
  （本例实测 `y0/y1 ∈ [0, 15125]`）。所以 `center` 模式下纵轴刻度读的是「堆叠位置」，
  不是「相对 0 的偏移」—— 有意义的只有带子的**厚度**，纵轴标题因此改成了「基线居中」。
  注意这和 matplotlib `stackplot(baseline='sym')` 不一样，后者是绕 y=0 对称、会出负值。
- `normalize`：`y0/y1` 各自除以该列的 $S$，值域 `[0, 1]`。若某列 $S=0$ 会除零得 `NaN`
  （本数据集每列都 > 0，不会踩到）。

**2. inside-out 排序键。** `stack.sort` 是个普通比较器，Vega 不内置 inside-out，所以自己造键：

```
rankTotal:    1（最大）… 14（最小）        ← window/rank，按 total 降序
insideOutKey: rank 为奇数取 -rank，偶数取 +rank
              1→-1  2→+2  3→-3  4→+4  5→-5 …
```

按 `insideOutKey` **升序**排，得到的顺序是 `… -13, -11, -9, -7, -5, -3, -1, 2, 4, 6, …`，
也就是名次序列 `13, 11, 9, 7, 5, 3, 1, 2, 4, 6, …` —— 一个「帐篷形」：
体量最大的两条（Wholesale and Retail Trade、Manufacturing）贴在正中间，
最小的（Agriculture、Mining and Extraction）被挤到最外沿。
这正是流图想要的效果：小序列放外圈，它们的抖动不会推着中间的大序列上下晃。

诚实地说一句：Byte & Wattenberg 原论文的 inside-out 是按**出现/起涨时间**排序再交错放置的，
本例的 `inside-out` 是同一个「交错放置」思路套在**体量名次**上（这份数据里 14 个行业全程都存在，
起涨时间意义不大）。想看按时间排的版本就切 `stackSort = peak-time`，它按各行业单月峰值出现的
月份升序排 —— 顺便能看到 `rank` 的并列语义：有 6 个行业都在 2010-01 见顶，
它们的 `rankPeak` 全是 6，并列部分退回输入顺序。想强行拆开并列就把 `rank` 换成 `row_number`。

**3. 为什么要 `project`。** `aggregate` 的 `argmax` 返回的是「取到最大值的那**一整行**」，
直接留着它，后面 `lookup` 会把一个嵌套对象贴到 1708 行上去。所以先 `formula` 取出
`datum.peakRow.date`，再用 `project` 只留 `series/total/peak/peakDate` 四个标量字段。

**4. 布局是怎么算出来的。** 全部靠 signal 表达式，没有一个写死的坐标：

```
mainW  = width                                  = 640
miniW  = floor((width - 2 * miniGap) / 3)       = floor((640-60)/3) = 193
第 i 个小面板:  x = i * (miniW + miniGap)        = 0, 223, 446   （446+193 = 639 ≤ 640）
小标题:        x = datum.i * (miniW + miniGap)  ← 和面板同一个公式，所以永远对齐
               y = stripTop - 5
```

**5. group mark 的局部 width/height（本项目最阴的坑）。** group mark 内部的 scale 写
`"range": "width"` 时，`width` 解析的是**顶层**画布宽度信号，不是这个 group 自己的
`encode.enter.width`。漏了就会画出「小面板按 640×540 去铺」的效果 —— parse 不报错、
数据流不报错、`toSVG` 也照样产出，只有 `tools/validate.cjs` 的包围盒检查和肉眼能发现。修法：

```json
{ "type": "group", "name": "miniZeroPanel",
  "encode": { "enter": { "width": {"signal": "miniW"}, "height": {"signal": "miniH"} } },
  "signals": [ {"name": "width", "update": "miniW"}, {"name": "height", "update": "miniH"} ],
  "scales": [ { "name": "xz", "range": "width" } ] }
```

**6. 日期与时区。** 原始 `date` 形如 `"2000-01-01T08:00:00.000Z"` —— 是美国太平洋时间月初
（冬季 -08:00、夏季 -07:00）换算成 UTC 的结果。`"parse": {"date": "date"}` 走的是
`Date.parse`，产出的是 **epoch 毫秒数**（所以 `tools/inspect.cjs` 里显示成 `num 946713600000`
而不是 `date ...`，这是 Vega 的正常行为）。

比例尺故意用 `"type": "utc"` 而不是 `"time"`：`time` 按**浏览器本地时区**格式化刻度，
一个 UTC-9 的读者会把 `2000-01-01T08:00Z` 看成 `1999-12-31 23:00`，年份刻度直接掉到 1999 去。
`utc` 则在任何机器上都渲染同一串标签，也让无头校验（Node，TZ 随环境变）和浏览器结果一致。

x 比例尺还加了 `"nice": {"interval": "month", "step": 1}`：数据最左点是 1 月 1 日 08:00Z，
比 `2000-01-01T00:00Z` 这个年刻度晚了 8 小时，不 nice 一下最左边的 `2000` 标签会被丢掉。

**7. `area` 必须先 facet。** `area`/`line` 是「一个 mark 实例连一串点」，14 个行业就得有 14 个
mark 实例，所以外面套一层 `from: {facet: {..., groupby: ["series"]}}`。facet 会保留源数据集
内部的相对行序，因此在 `stack` 之后加一个 `collect` 按 `date` 排序，就足以保证每条 area
的点是从左到右的。顺带一个验证手法：`node tools/inspect.cjs 31` 打印的图元统计里
`path: 242`，其中 14（主图带子）+ 42（3 个小面板 × 14）= 56 个是 area，
剩下 172 个是 86 个 group 的 background/foreground 各一条 —— 数字对得上，说明 facet 没漏。

## 试一试

1. **把 `stackSort` 切成 `none`**：堆叠顺序退回原始文件顺序，流图轮廓立刻变得毛糙、
   中间的大带子被小带子推着上下晃。再切回 `inside-out` 对比 —— 这就是那篇论文的价值。
2. **把 `bandStroke` 拖到 0**：14 条 `tableau20` 的带子会有几对邻色贴在一起分不开；
   拖到 2 又会让薄带子被描边吃掉。0.6 左右是这份数据的甜点。
3. **把主图 `yMain` 的 `"nice"` 从 `false` 改成 `true`**：domain 从 `[0, 15125]` 被撑到
   `[0, 16000]`，于是 `center` 模式下的流图**不再垂直居中**（它只居中于真实的 15125）。
   这解释了为什么这里刻意关掉 `nice` —— d3 的 tick 本来就取整数，关掉 nice 并不会让标签变丑。
4. **把 `xMain` 的 `"nice"` 整段删掉**：最左边的 `2000` 刻度会消失（数据起点比年刻度晚 8 小时）。
   再把 `type` 从 `utc` 改成 `time`，用 `TZ=Pacific/Gambier node tools/inspect.cjs 31` 跑一遍，
   看第一个刻度标签怎么变成 `1999`。
5. **把 `data.mini_center` 的 `"offset": "center"` 改成 `"sym"`**：Vega 会报
   `Unrecognized`/enum 校验失败 —— `stack` 只有 `zero`/`center`/`normalize` 三种，
   没有 matplotlib 的 `wiggle` / `weighted_wiggle`。想要真正的 wiggle 基线只能自己写
   `formula`/自定义 transform（可参考 demo 20）。
6. **把 `series_stats` 里 `rankPeak` 那次 `window` 的 `"ops": ["rank"]` 改成 `["row_number"]`**：
   `peak-time` 排序里那 6 个并列 2010-01 见顶的行业会被强行拆成 6 个不同名次。

## 参考

- `stack` 变换（`offset` / `sort` / `as`）：<https://vega.github.io/vega/docs/transforms/stack/>
- `window` 变换与 `rank` / `dense_rank` / `row_number`：<https://vega.github.io/vega/docs/transforms/window/>
- `aggregate` 变换（含 `argmax`）：<https://vega.github.io/vega/docs/transforms/aggregate/>
- `lookup` 变换：<https://vega.github.io/vega/docs/transforms/lookup/>
- `project` 变换：<https://vega.github.io/vega/docs/transforms/project/>
- `collect` 变换：<https://vega.github.io/vega/docs/transforms/collect/>
- `area` mark 与 `interpolate` 曲线类型：<https://vega.github.io/vega/docs/marks/area/>
- `group` mark 与 `from.facet`：<https://vega.github.io/vega/docs/marks/group/>
- 时间比例尺 `time` / `utc` 与 `nice` 的时间间隔写法：<https://vega.github.io/vega/docs/scales/#time>
- 坐标轴 `format` / `tickCount` 的时间间隔对象：<https://vega.github.io/vega/docs/axes/>
- 图例的 `encode` 与可交互图例：<https://vega.github.io/vega/docs/legends/>
- 配色方案 `tableau20`：<https://vega.github.io/vega/docs/schemes/#tableau20>
- 事件选择器 `@markname:event`：<https://vega.github.io/vega/docs/event-streams/>
- 数值/时间格式串（d3-format / d3-time-format）：<https://vega.github.io/vega/docs/types/#format>
- Byte & Wattenberg, *Stacked Graphs – Geometry & Aesthetics*, IEEE InfoVis 2008：
  <https://www.leebyron.com/streamgraph/>

## 与 matplotlib 的对照

这一节的重点不是「谁强」，而是：**Vega 把「基线算法」做成了数据变换的一个枚举参数，
matplotlib 把它做成了绘图函数的一个关键字参数。** 这一个差别决定了后面所有的差别。

**matplotlib 反而更强的地方（先说这个，因为很多人以为流图 matplotlib 做不了）**

`matplotlib.pyplot.stackplot` 内置了 **4 种**基线，比 Vega 还多：

```python
ax.stackplot(x, Y, baseline='zero')            # = Vega offset zero
ax.stackplot(x, Y, baseline='sym')             # 绕 y=0 对称（注意：不等于 Vega 的 center）
ax.stackplot(x, Y, baseline='wiggle')          # 最小化各层斜率平方和
ax.stackplot(x, Y, baseline='weighted_wiggle') # Byte & Wattenberg 的 ThemeRiver 改进版
```

`weighted_wiggle` 就是那篇论文里最优的那条基线，**Vega 没有**（`stack.offset` 只有
`zero`/`center`/`normalize`）。想在 Vega 里要 wiggle，只能自己写自定义 transform 或在
数据流外面预处理 —— 这是 Vega 实打实的短板。此外 `Y` 就是一个 numpy 数组，
你想自己实现任何基线算法都是十几行的事。加上成熟的 DPI / 字体 / 矢量导出，
出静态图这一路 matplotlib 更省心。

**换成 matplotlib 要多写的东西**

| 这张图里的东西 | Vega 里怎么写 | matplotlib 要怎么补 |
| --- | --- | --- |
| 长表直接堆叠 | `stack` 的 `groupby: ["date"]` 直接吃 1708 行长表 | `stackplot` 只吃 `(n_series, n_time)` 的宽矩阵：先 `df.pivot_table(index='date', columns='series', values='count')`，还得 `reindex` 补齐缺月、`fillna(0)`，否则某个序列少一个月整张图就错位 |
| 100% 堆叠 | `offset: "normalize"` | 没有对应 baseline，自己 `Y = Y / Y.sum(axis=0)` |
| inside-out 排序 | 一个 `window/rank` + 一个 `formula` + `stack.sort` | 自己算 total、`argsort`、再写交错重排的列顺序，然后按新顺序重建矩阵和 `labels`、`colors` |
| 下拉框当场切基线 | `offset: {"signal": "stackOffset"}` + `bind.input: "select"` | 没有。要么 `ipywidgets.interact` + 整张图重画，要么换 plotly / bokeh。`stackplot` 每次重画都要 `ax.cla()` 并重设标题、格式化器、图例 |
| 纵轴在 normalize 下自动变百分号 | `"format": {"signal": "stackOffset === 'normalize' ? '.0%' : ',.0f'"}` | 每次重画时 `ax.yaxis.set_major_formatter(PercentFormatter(1.0) if mode=='normalize' else StrMethodFormatter('{x:,.0f}'))`，外加同步改 ylabel |
| 三种基线并排、颜色一致 | 三个 group mark 共用一个顶层 `ordinal` color scale | `fig, axes = plt.subplots(1, 3)` 三次 `stackplot`，并手动传同一份 `colors=` 列表，否则三张图的颜色循环各自起算 |
| 悬停高亮某个行业、图例联动 | 一个 `hoverSeries` signal + `@bands`/`@legendSymbol` 事件 + `fillOpacity` 表达式 | 没有。要 `mplcursors` 或自己接 `motion_notify_event`，再逐个 `PolyCollection.set_alpha()` 并 `fig.canvas.draw_idle()`；图例联动要自己维护 legend handle 到 collection 的映射 |
| tooltip | `encode.enter.tooltip` 一个表达式 | `mplcursors` / `mpld3`，或者自己画 annotation |
| 时间轴按年打标签 | `type: "utc"` + `format: "%Y"` + `tickCount: {"interval": "year"}` | `mdates.YearLocator()` + `mdates.DateFormatter('%Y')` 两件套，且要注意时区（matplotlib 默认用 naive datetime，pandas 的 tz-aware 列还得先 `dt.tz_convert('UTC')`） |
| 布局随画布尺寸自适应 | `miniW = floor((width - 2*miniGap)/3)` 这类 signal | `gridspec` / `subplots_adjust` 手调，或 `constrained_layout=True` 交给它猜 |

**一句话总结**

- 出**一张**静态流图：matplotlib 更快，而且 `baseline='weighted_wiggle'` 的效果比 Vega 的
  `center` 更好看。
- 出一张**能让读者自己切基线、切排序、切插值、悬停高亮**，并且三种基线还能并排对照的教学图：
  Vega 把这些全部收敛成「几个 signal + 一个枚举参数」，matplotlib 则需要外接一整套交互框架，
  且每次交互都是「清空重画 + 重设所有格式化器」。
- 更根本的差别：Vega 的 `stack` 是**数据变换**，产物是 `y0/y1` 两个字段，谁都能拿去画
  `area`、`rect`、`arc`（demo 24 的南丁格尔玫瑰就是把同一个 `stack` 接到 `arc` 上）；
  matplotlib 的 `stackplot` 是**绘图函数**，基线算完就直接进了 `PolyCollection`，
  想换成极坐标堆叠得从头再写一遍。
