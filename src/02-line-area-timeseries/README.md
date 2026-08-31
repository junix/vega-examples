# 02 · 折线与面积：时间序列多序列图

## 学习目标

看懂时间序列图的三件套——`format.parse` 日期解析、`time` 比例尺、`from.facet` 多序列分组；
并学会在同一坐标系里叠加第二层数据（总量面积衬底）和给每条序列加末端文字标注。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/02-line-area-timeseries/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` stocks | 加载 CSV 原始数据 | `format.parse` 显式声明 `date` 按日期、`price` 按数字解析；不声明则整列按字符串读入，`date` 字段算不出 extent，x 比例尺 domain 退化成 `[Invalid Date, Invalid Date]`（实测见「试一试」第 1 条） |
| `data[1]` total | 派生数据集：按日期聚合 | `aggregate` 变换 `groupby: ["date"]`，`ops: ["sum", "count"]` 同时算出价格之和与**当期有数据的股票只数**，再用 `filter` 只保留 `n === 5` 的日期（123 → 68 行）。GOOG 2004-08 才上市（数据里 GOOG 只有 68 行，其余四只各 123 行），不过滤的话 2004-07 → 2004-08 的合计会因为分母里多一只股票从 158.66 跳到 258.40（+63%），把成分变化画成行情 |
| `data[2]` gate | 派生数据集：面积起点 | `aggregate` 不写 `groupby` 就是对整表聚合、只出 1 行；`min` 取出五只齐备的第一个日期（2004-08），给下面的注记线和注记文字定位——口径一改，注记自动跟着走 |
| `data[3]` endpoints | 派生数据集：每序列最后一点 | `aggregate` 的 `argmax` 取每个 symbol 日期最大的整条记录；`formula` 给末端价格几乎相同的两只股票（AMZN/IBM）算出相反的纵向偏移 `dy`，防止标签重叠。**方向必须跟真实高低一致**：AMZN 末端 128.82 高于 IBM 125.55（换算成像素只差不到 1px），所以 AMZN 取 `-8` 往上、IBM 取 `+8` 往下；写反了标签的上下顺序就跟折线相反 |
| `scales.x` | 时间 → 水平位置 | `type: "time"` 接受时间戳（epoch 毫秒）或 Date 对象，domain 直接取 `date` 字段；刻度与标签按**本地时区**生成（要 UTC 就用 `type: "utc"`） |
| `scales.y` | 价格 → 垂直位置 | domain 取的是**聚合后的** `total.total_price`（过滤后最大 1132.13，`nice` 后成 0–1200），保证所有折线都落在合计的高度之内 |
| `scales.color` | symbol → 颜色 | `ordinal` 比例尺 + 内置 `category` 配色方案 |
| `axes` | 坐标轴 | x 轴 `format: "%Y"` 用 d3 时间格式化只显示年份；y 轴 `grid: true` 画网格 |
| `legends` | 图例 | `{ "stroke": "color" }` 表示图例展示 color 比例尺的描边映射 |
| `marks[0]` area | 总量面积衬底 | 数据来自 `total`；`y` 画到总量、`y2` 固定到 0 基线；低 `fillOpacity` 让它退居背景。因为 `total` 已经过滤，衬底只覆盖 2004-08 之后五只齐备的 68 个日期（起点 x≈325px），左侧留白是数据完整性的直接体现，不是渲染缺陷 |
| `marks[1]` group | 多序列分组容器 | `from.facet` 按 `symbol` 把 stocks 切成 5 个子数据集 `series`，每条 datum 组生成一个 group 实例，组内的 line 只画本序列 |
| `marks[2]` text | 序列末端标注 | 数据来自 `endpoints`；`"field": "last.date"` 用点路径访问 argmax 记录里的字段；`dy` 通道应用避让偏移（实测 AMZN 上移到 y≈316.4、IBM 下移到 y≈333.3，与相邻的 AAPL 296.1 / MSFT 354.4 各留出约 20px） |
| `marks[3]` rule | 口径分界注记线 | 数据来自 `gate`（1 行）；`y: 0` + `y2: {"signal": "height"}` 画满整个绘图区高度，`strokeDash` 虚线弱化 |
| `marks[4]` text | 口径分界注记文字 | 同样来自 `gate`，把“面积为什么从中间才开始”写在图上，而不是只写在 README 里 |

### 关键概念

- **`format.parse`**：CSV 读入默认全是字符串。`"parse": {"date": "date"}` 告诉 Vega 用日期解析器
  把 `"Jan 1 2000"` 解析成**时间戳**——`Date.parse` 得到的 epoch 毫秒 number（按**本地时区**解释），
  可以直接喂给 `time` 比例尺，`year(datum.date)`、`timeFormat(datum.date, "%Y-%m-%d")`
  之类的表达式也才工作。注意数据层拿到的**不是 Date 对象**
  （`node ../../tools/inspect.cjs 02` 把它打印成 `num 946713600000`，真正的 Date 会打成 `date <ISO>`），
  所以 `datum.date.getFullYear()` 这类写法会报错；确实需要 Date 时用 `datetime(datum.date)`
  （`toDate()` 对已经是数字的值原样返回，起不到转换作用）。
- **`from.facet` 经典模式**：外层 `group` mark 负责“按 groupby 切分数据 + 每组一个实例”，
  内层 mark 用 `from: {"data": "series"}` 引用切好的子数据集。这是 Vega 画多序列/小倍数的标准写法。
- **线序即层序**：marks 数组靠后的画在上层，所以 area 写在最前面当背景，line 和 text 依次叠加。
- **argmax vs max**：`max` 只返回最大*值*，`argmax` 返回取到最大值的整条*记录*——
  标注需要同时拿到 date 和 price，所以用 argmax。
- **聚合的“分母”会随时间变化**：`aggregate` 只对每个分组里**实际存在的行**求和，不会替缺席的
  序列补零或补空。所以面板里凡是“横跨时间的合计/均值”，都要先问一句“每个时间点参与的序列一样多吗”。
  本例用 `count` 把只数算出来、`filter` 掉不齐的日期；另一种做法是先 `impute` 补齐再聚合。
- **text 的 `dy` 通道**：以像素为单位在渲染时平移文字（不改数据坐标）。
  本例只错开 AMZN/IBM 这一对，且偏移方向是按两者的真实末端价格定的——手写避让必须自己
  盯住“谁在上面”，数据一变（换数据集、换时间范围）就得跟着改；通用的标签自动防重叠要用
  `label` 变换（见后续 demo 18）。

## 试一试（改练）

1. 删掉 `format` 里的 `"parse"` 刷新页面：控制台只出现一条
   `Infinite extent for field "date": [Infinity, -Infinity]` 警告（**不是** NaN 警告）——
   字符串日期算不出 extent，x 比例尺 domain 退化成 `[Invalid Date, Invalid Date]`、`ticks()` 返回空数组，
   于是 x 轴 2000–2010 这 11 个年份刻度连标签带刻度线一起消失；折线、面积和末端标注也不是真的“不见”，
   而是所有点的 x 都退化成 0，整幅图被压成左边缘的一条竖线（末端标签也堆在 x=0）。
   注意 y 轴 0–1200 反而完全正常，因为 `aggregate` 的 `sum` 会把价格字符串隐式转成数字——
   “看上去还有图”比“整张空白”更难发现，这正是必须显式 `parse` 的原因。
2. 把 area 的 `fillOpacity` 改成 `0.6`，看衬底如何喧宾夺主，再改回来。
3. 把 `total` 的 `"ops": ["sum", "count"]` 改成 `["mean", "count"]`，面积就变成五只股票的均价。
   注意 y 比例尺 domain 仍取 `total.total_price`，均价只有百位以下，domain 会缩到 0–240（实测），
   于是 GOOG 那条冲到 707 美元的折线会直接冲出画布顶部——想看清就得把 y 的 domain 换成新口径的字段
   或另给一个比例尺。
4. 删掉 `endpoints` 里的 `formula` 变换和 text 里的 `"dy"` 通道，
   观察 AMZN 与 IBM 的末端标签几乎完全重叠（末端价格差 3.27 美元，换算到 0–1200 的 y 比例尺上
   只有 0.98px：AMZN y=321.35、IBM y=322.33）——体会为什么需要避让，
   再想想手动写死 symbol 名的局限（通用方案是 label 变换）。
5. 把 x 轴 `"format": "%Y"` 改成 `"%b %Y"` 或 `"%y/%m"`，对比刻度文字。
6. 删掉 `total` 里的 `{"type": "filter", "expr": "datum.n === 5"}` 刷新页面：面积一路铺到 2000 年，
   但 2004-07 → 2004-08 之间会出现一个 6px 宽、29.9px 高的台阶（158.66 → 258.40），
   而那个月四只老股其实是**下跌**的（158.66 → 156.03）。这就是“聚合分母随时间变化”的经典陷阱——
   注记线也会跟着跑到 2000-01（`gate` 是从 `total` 算出来的）。

## 参考

- 官方示例：[line-chart](https://vega.github.io/vega/examples/line-chart/) ·
  [stock-index-chart](https://vega.github.io/vega/examples/stock-index-chart/) ·
  [stacked-area-chart](https://vega.github.io/vega/examples/stacked-area-chart/)
- 官方文档：[Data / format.parse](https://vega.github.io/vega/docs/data/) ·
  [Scales（time / ordinal）](https://vega.github.io/vega/docs/scales/) ·
  [aggregate / window 变换](https://vega.github.io/vega/docs/transforms/) ·
  [facet 分组](https://vega.github.io/vega/docs/marks/group/)
