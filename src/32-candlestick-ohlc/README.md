# 32 · K 线图：双面板共享 x 比例尺 + 十字光标

一份 OHLC 数据，上下两个面板：上面是价格 K 线（`rule` 影线 + `rect` 实体），
下面是派生指标柱状副图。两个面板**共用同一把 x 比例尺**，但 x 轴只画一次（在下面板）；
一条跟随鼠标的十字光标同时穿过两个面板，并在面板之间的空档里显示当日 OHLC 读数。

数据：`assets/data/ohlc.json`，44 个交易日（2009-06-01 ~ 2009-07-31），
字段 `date / open / high / low / close / signal / ret`。

## 运行

```sh
./serve.sh      # 在本项目根目录起静态服务器
# 浏览器打开 http://localhost:8000/src/32-candlestick-ohlc/
```

## 学习目标

1. **纵向多面板**：怎么用两个 `group` mark 把画布切成上下两块，并让它们精确对齐、不溢出。
2. **共享 scale、单独画轴**：x 比例尺定义在**顶层**，两个 group 都能直接引用（作用域向上查找）；
   x 轴只写在下面那个 group 的 `axes` 里，于是两个面板共用一套横坐标却只有一条轴。
3. **`group` 里必须遮蔽 `height` 信号**：group 的子作用域是用原型链继承父作用域的信号的，
   `width` / `height` 默认还是**整幅画布**的尺寸。子作用域里写 `"range": "height"` 的比例尺、
   以及 `orient: "bottom"` 的轴，都会按画布高度去算 —— 图糊成一团、轴跑到画布底边，
   而 parse 不报错、`toSVG` 也照样有输出。修法是在 group 上加 `"signals": [{"name": "height", ...}]`。
4. **band 比例尺当"交易日轴"**：K 线的横轴是"第几个交易日"而不是连续时间，
   用 band scale 天然跳过周末；实体宽度 `bandwidth('x') * bodyRatio`，一个像素常量都不用写。
5. **十字光标**：`mousemove` + `x()` 反算出band 序号 → `filter` 出恰好一行的 `cursor` 数据集
   → 用它驱动竖线 / 横线 / 高亮框 / 多行读数四组 mark。
6. **量纲与格式化**：价格用 `'$.2f'` / `'$.0f'`，比例用 `'.1%'` / `'+.1%'` / `'+.2%'`；
   轴的 `format` 也可以写成 `{"signal": ...}` 跟着信号切换；`null` 一律显式兜底成破折号。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `width/height/padding` | 画布尺寸 | `height: 470` 是**两个面板 + 空档**的总高；`autosize` 用默认的 `pad`，轴/图例/标题探出的部分由 padding 自动撑开（实测左 69、上 84、下 54px） |
| `title` | 标题 + 副标题 | `anchor: "start"` 左对齐，副标题写操作提示 |
| `signals`（布局） | `mainH` / `gap` / `subY` / `subH` | 只有 `mainH` 可拖；`subH = height - mainH - gap` 是**反推**出来的，所以拖动主图高度时两个面板之和恒等于画布高度，永远不会溢出 |
| `signals`（几何） | `bodyRatio` / `bodyW` / `minBodyH` | `bodyW = bandwidth('x') * bodyRatio`：实体宽度挂在比例尺带宽上，改 `width` 或数据行数都不用动这行 |
| `signals`（交互） | `n` / `step` / `hoverIdx` / `cursorIdx` | `hoverIdx` 是纯事件信号（`value: -1` + `on`），`cursorIdx` 是派生信号做兜底，见下文"为什么拆成两个信号" |
| `signals`（外观） | `convention` / `subMetric` + 3 个派生信号 | `convention` 切换涨红跌绿 / 涨绿跌红；`subMetric` 切换副图指标，并顺带切换副图的轴标题、格式串、读数里的短名 |
| `data: prices` | 载入 + 派生列 | `window` 出 `rank` / `prevClose`，`formula` 出 `idx / dir / bodyTop / bodyBottom / amp / retFrac / sub / subDir / chg` |
| `data: cursor` | `filter` 出光标那一行 | 永远恰好 1 行，四组 mark 都从它取数；`cursorIdx` 的兜底保证它不会为空 |
| `scales: x`（顶层） | band，域是 44 个交易日 | `paddingInner: 0.3`、`paddingOuter: 0.15`，**两个 group 共用这一把** |
| `scales: dirColor`（顶层） | ordinal，域 `["up","down"]` | `range` 写成 `{"signal": ...}`，配色约定切换即时生效 |
| `legends` | 涨跌图例 | `encode.labels.update.text` 把 `up`/`down` 改写成中文说明，图例因此能自解释 |
| `marks[0]` = `mainPanel` group | 价格面板 | 自带 `signals`（遮蔽 `height`）、`scales`（`price`）、`axes`（左轴）、6 个子 mark |
| `marks[1]` = 读数 text | 顶层 mark，画在面板空档里 | `text` 传**数组**即多行渲染，`lineHeight` 控行距 |
| `marks[2]` = `subPanel` group | 指标面板 | 自带 `signals`（遮蔽 `height`）、`scales`（`sub`）、`axes`（左轴 + **唯一的一条 x 轴**）、4 个子 mark |
| `config` | 字号统一 | 轴/图例字号收在一处 |

### 关键概念

**① 面板几何是怎么算出来的**

```
mainPanel : y = 0,             height = mainH        (默认 300)
空档      : y = mainH,         height = gap          (40，放读数)
subPanel  : y = mainH + gap,   height = 470 - mainH - gap  (默认 130)
```

group mark 的 `x/y/width/height` 全写在 `encode.update` 里（而不是 `enter`），
这样拖动 `mainH` 时两个面板会重新布局。两个面板的 `x` 都是 0、`width` 都是 `width`，
所以顶层那把 x 比例尺算出来的像素坐标，在两个面板里都直接可用 —— 这就是"共享 x"的物理前提。

**② `group` 内部的 `height` 信号必须自己声明**

Vega 的 group mark 会 fork 出一个子作用域，但子作用域的信号表是 `Object.create(父作用域)`：
你**读**得到父作用域的 `width` / `height`，它们指的却是整幅画布。所以

```json
{ "type": "group", "name": "subPanel",
  "encode": { "update": { "y": {"signal": "subY"}, "height": {"signal": "subH"} } },
  "signals": [ { "name": "height", "update": "subH" } ],
  "scales": [ { "name": "sub", "range": "height", ... } ],
  "axes":   [ { "orient": "bottom", "scale": "x", ... } ] }
```

这句 `"signals": [{"name": "height", "update": "subH"}]` 是整张图的关键：

- 子作用域里 `"range": "height"` 于是等于 `[subH, 0]`，而不是 `[470, 0]`；
- `orient: "bottom"` 的轴画在 `y = subH`（面板底边），而不是 `y = 470`；
- 子 mark 里写 `{"signal": "height"}` 拿到的也是面板高度（本例的两条光标竖线就靠它）。

漏掉这一句的症状很典型：图元全挤在面板上半部、x 轴孤零零跑到画布最底下，而校验器只会
在"布局溢出"这一项上报警 —— `tools/validate.cjs` 专门量了场景包围盒来抓这个坑。

**③ band 比例尺的 step 公式，以及"鼠标 x → 第几根 K 线"**

d3/Vega 的 band 比例尺：

```
step      = width / (n - paddingInner + 2 * paddingOuter)
bandwidth = step * (1 - paddingInner)
第 i 格左边界 = paddingOuter * step + i * step
```

本例取 `paddingOuter = paddingInner / 2 = 0.15`，分母里 `-0.3 + 0.3` 正好抵消，于是

```
step = width / n = 780 / 44 = 17.727
bandwidth = 17.727 * 0.7 = 12.409
bodyW = bandwidth * 0.66 = 8.19
```

`step` 变成一个干净的 `width / n`，反算就成了一行表达式：

```json
{ "name": "hoverIdx", "value": -1,
  "on": [ { "events": "mousemove", "update": "clamp(floor(x() / step), 0, n - 1)" } ] }
```

（实测：`x = 0 → 0`，`x = 21.3 → 1`，`x = 779.8 → 43`，与 band 的分格严格对齐。）

三个容易踩的点：

- `x()` **不带参数**时返回的是相对**顶层视图坐标系**（即去掉 padding 后的数据矩形原点）的坐标。
  两个面板的 `x` 都是 0，所以这个值直接就是面板内的横坐标；如果面板有 x 偏移，就得写 `x('mainPanel')`。
- 事件流写的是**不带 mark 选择器**的 `"mousemove"`。写成 `@mainPanel:mousemove` 反而收不全事件 ——
  鼠标压在 K 线上时 `event.item` 是那根 `rect`，不是面板 group，选择器就不匹配了。
- 光标位置**只由 x 决定**，鼠标在竖直方向的位置无关紧要，所以光标在两个面板里都能用。

**④ 为什么把光标拆成 `hoverIdx` + `cursorIdx` 两个信号**

`cursor` 数据集是 `filter` 出来的一行；如果初始状态没有任何一行匹配，它就是空的
（本项目的校验器会因此判失败，用户也会看到一张没有读数的图）。所以要有个"没动鼠标时看最后一天"的兜底。

兜底不能直接写成 `{"name": "hoverIdx", "update": "n - 1", "on": [...]}`：
带 `update` 表达式的信号在浏览器里确实能被事件覆盖（事件驱动的赋值走 `skip` 语义，
这一轮不重算 `update`），但你没法再用 `view.signal('hoverIdx', 3)` 从外部驱动它 ——
一旦通过 API 赋值，`update` 会立刻把它算回 `n - 1`。拆成

```json
{ "name": "hoverIdx",  "value": -1, "on": [ /* mousemove */ ] },
{ "name": "cursorIdx", "update": "hoverIdx < 0 ? n - 1 : hoverIdx" }
```

之后职责就干净了：`hoverIdx` 只管"鼠标说了什么"（-1 = 还没说话），
`cursorIdx` 只管"该显示哪一天"。前者可测、可脚本驱动，后者是纯派生量。

**⑤ 蜡烛的几何**

```
影线 rule : x = scale('x', date) + bandwidth/2   （即 "band": 0.5）
            y = price(high),  y2 = price(low)
实体 rect : xc = 同一个中心，width = bodyW
            y  = price(max(open, close))
            y2 = max( price(min(open,close)), price(max(open,close)) + minBodyH )
```

- `{"scale": "x", "field": "date", "band": 0.5}` 是"band 中心"的标准写法，比手写
  `scale('x', datum.date) + bandwidth('x')/2` 短，效果一样。
- 实体用 `xc` + `width`（中心 + 宽度）而不是 `x` + `x2`，居中逻辑交给 Vega。
- 数据里有 1 根 **doji**（2009-07-15，开盘 = 收盘），实体高度是 0 会整根消失。
  `y2` 那句 `max(..., ... + minBodyH)` 给它兜底 1.5px（用 `max` 是因为 y 轴向下增大）。
- 涨跌方向 `dir = close >= open ? 'up' : 'down'`，再喂给 `dirColor` 这把 ordinal 比例尺。
  颜色的语义写在图例里，图例文字又被 `encode.labels` 改写成了中文说明。

**⑥ 量纲与格式化**

| 字段 | 来源 | 量纲 | 显示格式 |
| --- | --- | --- | --- |
| `open/high/low/close` | 原始 | 美元 | 轴 `'$.0f'`，读数 `'$.2f'` |
| `amp` | `formula`：`(high-low)/open` | 比例（恒正） | `'.1%'` |
| `retFrac` | `formula`：`ret / 100` | 比例（可正可负） | `'+.1%'` |
| `chg` | `close / prevClose - 1` | 比例（首行为 `null`） | `'+.2%'`，`null` → `'—'` |

两个派生指标都是**派生量、不是成交量** —— 这份数据里没有 volume 字段，
副图画的是"当日振幅"或"当日收益率"，README 和轴标题都如实写明。
`ret` 字段的原值是百分数数值（`-10.84` 表示 −10.84%），不除以 100 直接套 `'%'`
会显示成 −1084%，这是最容易漏的量纲错误。

副图的轴 `format` 写成了 `{"signal": "subFormat"}` —— 轴的 `format` / `title` 都接受信号，
所以切换指标时轴标题和小数位一起变（振幅用 `.1%`，收益率用 `+.1%` 带正负号）。

**⑦ 别的一些细节**

- `"parse": {"date": "date:'%Y-%m-%d'"}` 而不是 `"date"`：后者走 `Date.parse`，
  纯日期串按 ISO 规范被当成 **UTC 午夜**，在 UTC−7 的机器上会显示成前一天。
  显式给格式串走的是本地时间解析，`timeFormat` 再打印出来就和数据里一模一样。
- x 轴 44 个标签一定挤，`labelAngle: -45` + `labelOverlap: "parity"`：
  Vega 递归地隔一个隐一个（把 `opacity` 设成 0），最后留下 22 个不重叠的标签。
- 价格比例尺 `"padding": 10`：把 domain 沿 y 方向各扩 10px 的余量，
  最低价那根影线就不会贴着面板底边（配合 `nice: true`，domain 最终是整美元的 22~34）。
- 副图读数标签用 `clamp` / `max` / `min` 把 x、y 都夹在面板内，
  正负柱子再用 `baseline` 的规则数组（`[{"test": ...}, {...}]`）翻转基线。
- 所有 `description` 键都写在 `data` / `signals` / `marks` 条目里。**不要**写进 `scales` 条目：
  Vega 会对比例尺的未知属性报 `Unsupported scale property`，本项目的校验器把这条 WARN 当失败。

## 试一试

1. 把 `subPanel` 的 `"signals": [{"name": "height", "update": "subH"}]` **删掉**再刷新：
   指标柱会按 470px 高度去画（全挤在面板顶部）、x 轴掉到画布最底下。
   这是本 demo 最值得亲手复现的一个坑；`node tools/validate.cjs 32` 会直接报"布局溢出"。
2. 右侧把 `subMetric` 切到 `ret`：副图变成有正负的收益率柱，0 线跑到面板中间，
   轴标签从 `5.0%` 变成 `+5.0%` / `−10.0%`，柱色改按指标自身正负着色，读数里的短名也跟着变。
   再把 `convention` 切到 `us` 看涨绿跌红。
3. 把 `bodyRatio` 拖到 1：实体顶满带宽，蜡烛之间只剩 `paddingInner` 的缝；拖到 0.2 就成了 OHLC 竹签。
   然后把顶层 `width` 改成 480 再刷新 —— 实体自动变窄，因为宽度是从 `bandwidth('x')` 推出来的。
4. 把 x 比例尺的 `paddingOuter` 从 `0.15` 改成 `0`：`step` 不再等于 `width / n`，
   十字光标会与蜡烛错开小半格（尤其是最右边几根）。想保留任意 padding 又要精确命中，
   就得把 `step` 改成 `(width - 2 * paddingOuter * step)` 的形式解出来 —— 或者干脆用
   `invert` 思路：给每根蜡烛加一层透明的 `rect` 命中区，用 `@hit:mouseover` 直接取 `datum`。
5. 想加第三个面板（比如 20 日均线偏离度）：复制 `subPanel`，把 `subY` 改成累加式
   （`mainH + gap`、`mainH + gap + subH1 + gap` …），x 轴只保留在最下面那个 group 里。
   注意每个 group 都要自己声明 `height` 信号。

## 参考

- Group marks（嵌套作用域、子 scale / 子 axis）：<https://vega.github.io/vega/docs/marks/group/>
- Rect mark（`x/x2/xc/width` 的三选二规则）：<https://vega.github.io/vega/docs/marks/rect/>
- Rule mark：<https://vega.github.io/vega/docs/marks/rule/>
- Text mark（`text` 传数组即多行、`lineHeight`）：<https://vega.github.io/vega/docs/marks/text/>
- Band scale（`step` / `bandwidth` / `paddingInner` / `paddingOuter`）：<https://vega.github.io/vega/docs/scales/#band>
- Scale 的 `padding` / `nice`：<https://vega.github.io/vega/docs/scales/#properties>
- Axes（`format` / `formatType` / `labelAngle` / `labelOverlap`，均可接受信号）：<https://vega.github.io/vega/docs/axes/>
- Legends 的 `encode.labels`：<https://vega.github.io/vega/docs/legends/>
- Window transform（`row_number` / `lag`）：<https://vega.github.io/vega/docs/transforms/window/>
- Formula transform：<https://vega.github.io/vega/docs/transforms/formula/>
- Filter transform：<https://vega.github.io/vega/docs/transforms/filter/>
- Signals 与事件流（`on` / `events` / `x()`）：<https://vega.github.io/vega/docs/signals/> 、
  <https://vega.github.io/vega/docs/event-streams/>
- 表达式函数 `format` / `timeFormat` / `bandwidth` / `scale` / `clamp`：<https://vega.github.io/vega/docs/expressions/>
- 数据格式与 `parse`（`date:'%Y-%m-%d'`）：<https://vega.github.io/vega/docs/data/#format>

## 与 matplotlib 的对照

先说结论：**这张图里"画"的部分两边都不难，难的是"联动"和"复用"，那部分 Vega 便宜得多；
而"派生列"和"分面板"这两件事，matplotlib + pandas 反而更省事。**

**1. 蜡烛本体：两边都得手工拼，工作量相当**

matplotlib 从 3.0 起就把 `matplotlib.finance` 移出去了（先是 `mpl_finance`，现在是第三方
`mplfinance`）。不装额外包的话，标准做法是两条命令式调用：

```python
up = df.close >= df.open
ax.vlines(df.idx, df.low, df.high, color=np.where(up, 'r', 'g'), linewidth=1)
ax.bar(df.idx, (df.close - df.open).abs().clip(lower=0.02),
       bottom=df[['open', 'close']].min(axis=1),
       width=0.66, color=np.where(up, 'r', 'g'))
```

对应 Vega 的 `rule` + `rect` 两个 mark，行数上不吃亏。但注意两处差别：

- `width=0.66` 是**数据单位**（这里是"0.66 个索引"），只有把横轴做成整数索引才好用；
  Vega 的 `bodyW = bandwidth('x') * bodyRatio` 是**像素**，且带宽由比例尺按 `width` 和数据行数
  自动算出 —— 改画布宽度、改数据量都不用碰这一行。
- doji 的兜底，matplotlib 里得写在**数据**上（`.clip(lower=0.02)`，单位是美元，换个标的就得重调）；
  Vega 写在**编码**上（`+ minBodyH`，单位是像素，与标的价格无关）。
- 颜色，matplotlib 要自己 `np.where` 生成一条颜色数组；Vega 是一把 ordinal 比例尺。
  而且 `ax.bar` 这样上色**不会**产生图例，matplotlib 得手工造 proxy artist
  （`Patch(color='r', label='涨')`）；Vega 的 `legends: [{"fill": "dirColor"}]` 一行搞定，
  连图例文字都能用 `encode.labels` 重写。

**2. 跳过周末：这是 band scale 的主场**

真实日期轴会在周末留下 44 个空隙。matplotlib 的通行解法是"用整数索引当 x，再改刻度标签"：

```python
ax.set_xticks(df.idx[::2])
ax.set_xticklabels(df.date.dt.strftime('%m/%d')[::2], rotation=45, ha='right')
```

这正好是 band scale 的语义（离散域 + 均分带宽），Vega 里换一个 `"type": "band"` 就完事，
而且标签密度交给 `labelOverlap: "parity"` 自己收敛，不用手写 `[::2]` 这种试出来的步长。

**3. 两个面板：matplotlib 明显更省事，这点必须承认**

```python
fig, (ax1, ax2) = plt.subplots(2, 1, sharex=True,
                               gridspec_kw={'height_ratios': [3, 1], 'hspace': 0.12})
```

一行 `sharex=True` 就把"共享 x 轴、只在下面画刻度"办了，而 Vega 要：顶层留出总高 → 两个 group
的 `y/height` 手算 → 每个 group 里补一句 `"signals": [{"name": "height", ...}]` → x 轴只写在下面那个
group 里。这四步里第三步还是个不写就静默错的坑。matplotlib 的 `GridSpec` 在这件事上完胜；
Vega 的补偿是布局参数（`mainH`）本身也能被信号绑定，拖一下滑块就重排 —— 但代价是你得自己反推
`subH`，不像 `height_ratios` 那样天然守恒。

**4. 十字光标：Vega 声明式，matplotlib 得写回调**

Vega 版本是"一个事件信号 + 一个 `filter` 出来的单行数据集 + 四个 mark 从它取数"，
全部躺在 JSON 里，随 spec 一起被发布、被别人 fork。matplotlib 的等价物是命令式回调：

```python
cursor = MultiCursor(fig.canvas, (ax1, ax2), color='gray', lw=1, horizOn=True)

def on_move(event):
    if event.inaxes is None: return
    i = int(np.clip(round(event.xdata), 0, len(df) - 1))
    row = df.iloc[i]
    txt.set_text(f"{row.date:%Y-%m-%d}  开 ${row.open:.2f} …")
    fig.canvas.draw_idle()
fig.canvas.mpl_connect('motion_notify_event', on_move)
```

三点实质差别：

- `MultiCursor` 只能画线，"读数文字 + 高亮当日蜡烛 + 收盘价标签"还是得自己在回调里
  逐个 `set_*` + `draw_idle`，状态由你手动同步；Vega 里这些都是同一个 `cursor` 数据集的下游，
  改一处信号，四组 mark 一起重算。
- matplotlib 的交互**只在带 GUI 的后端里存在**：存成 PNG / PDF 就只剩静态图，
  notebook 里还得 `%matplotlib widget`（装 ipympl）。Vega 的 spec 丢到任何网页里都还是活的。
- 反过来说，如果目标本来就是一张进论文的静态图，这一整节的对比对 matplotlib 毫无意义 ——
  它不需要交互，也就不需要为交互付任何代价。

**5. 派生列与"可切换指标"：pandas 更好读，但换指标要重跑**

`df['amp'] = (df.high - df.low) / df.open`、`df.close.shift(1)` 显然比一串 `formula` 变换和
`window` + `lag` 更紧凑好读 —— 数据整形是 pandas 的主场，Vega 的变换链只是"能做"。
但"下拉框切换副图指标、切换涨跌配色"这件事，Vega 是 `bind: {"input": "select"}` 三行，
派生列 `sub` / `subDir` 直接引用信号、自动重算；matplotlib 要么重跑脚本，
要么上 `ipywidgets` 自己接 `observe` 回调重画。

**6. 格式化与导出：平手**

`'$.2f'` / `'+.1%'` 对应 `StrMethodFormatter('${x:,.2f}')` / `PercentFormatter(xmax=1)`，
表达力相当（d3 的格式串更短，matplotlib 的更显式）。导出上 matplotlib 的 PDF/EPS 与
LaTeX 排版链更成熟；Vega 给的是 SVG/Canvas + 交互，`tools/export.cjs` 那条无头导出链是补齐静态产物的。

**7. 什么时候别自己拼**

如果只是想要一张标准 K 线图，`mplfinance` 一行就够：

```python
mpf.plot(df.set_index('date'), type='candle', volume=True, mav=(5, 20), style='yahoo')
```

它连成交量副图、均线、周末间隙都替你处理好了 —— 前提是你接受它的设计。一旦要改到它 API 之外
（比如把副图换成自定义指标、加一个自定义联动光标），就得掉回裸 matplotlib，
也就回到上面第 1、3、4 节的工作量。Vega 这边没有"K 线图"这个现成图类型，
但它的语法元素（band scale、group mark、rule/rect、事件信号）足够正交，
拼出来的东西改起来是连续的、不存在"越过封装边界就重写"的断层。
