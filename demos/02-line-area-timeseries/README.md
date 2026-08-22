# 02 · 折线与面积：时间序列多序列图

## 学习目标

看懂时间序列图的三件套——`format.parse` 日期解析、`time` 比例尺、`from.facet` 多序列分组；
并学会在同一坐标系里叠加第二层数据（总量面积衬底）和给每条序列加末端文字标注。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/02-line-area-timeseries/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` stocks | 加载 CSV 原始数据 | `format.parse` 显式声明 `date` 按日期、`price` 按数字解析；不声明则全部按字符串读入，time 比例尺会得到 NaN |
| `data[1]` total | 派生数据集：按日期聚合 | `aggregate` 变换 `groupby: ["date"]`、`ops: ["sum"]`，算出每个日期五只股票的价格之和 |
| `data[2]` endpoints | 派生数据集：每序列最后一点 | `aggregate` 的 `argmax` 取每个 symbol 日期最大的整条记录；`formula` 给末端价格几乎相同的两只股票（IBM/AMZN）算出相反的纵向偏移 `dy`，防止标签重叠 |
| `scales.x` | 时间 → 水平位置 | `type: "time"` 专门映射 Date 对象，domain 直接取 `date` 字段 |
| `scales.y` | 价格 → 垂直位置 | domain 取的是**聚合后的** `total.total_price`，保证所有折线都落在面积之下 |
| `scales.color` | symbol → 颜色 | `ordinal` 比例尺 + 内置 `category` 配色方案 |
| `axes` | 坐标轴 | x 轴 `format: "%Y"` 用 d3 时间格式化只显示年份；y 轴 `grid: true` 画网格 |
| `legends` | 图例 | `{ "stroke": "color" }` 表示图例展示 color 比例尺的描边映射 |
| `marks[0]` area | 总量面积衬底 | 数据来自 `total`；`y` 画到总量、`y2` 固定到 0 基线；低 `fillOpacity` 让它退居背景 |
| `marks[1]` group | 多序列分组容器 | `from.facet` 按 `symbol` 把 stocks 切成 5 个子数据集 `series`，每条 datum 组生成一个 group 实例，组内的 line 只画本序列 |
| `marks[2]` text | 序列末端标注 | 数据来自 `endpoints`；`"field": "last.date"` 用点路径访问 argmax 记录里的字段；`dy` 通道应用避让偏移 |

### 关键概念

- **`format.parse`**：CSV 读入默认全是字符串。`"parse": {"date": "date"}` 告诉 Vega 用日期解析器
  把 `"Jan 1 2000"` 转成 Date 对象，`time` 比例尺和 `year(datum.date)` 之类的表达式才工作。
- **`from.facet` 经典模式**：外层 `group` mark 负责“按 groupby 切分数据 + 每组一个实例”，
  内层 mark 用 `from: {"data": "series"}` 引用切好的子数据集。这是 Vega 画多序列/小倍数的标准写法。
- **线序即层序**：marks 数组靠后的画在上层，所以 area 写在最前面当背景，line 和 text 依次叠加。
- **argmax vs max**：`max` 只返回最大*值*，`argmax` 返回取到最大值的整条*记录*——
  标注需要同时拿到 date 和 price，所以用 argmax。
- **text 的 `dy` 通道**：以像素为单位在渲染时平移文字（不改数据坐标）。
  本例只错开 IBM/AMZN 这一对；通用的标签自动防重叠要用 `label` 变换（见后续 demo 18）。

## 试一试（改练）

1. 删掉 `format` 里的 `"parse"` 刷新页面：折线消失，控制台出现 NaN 警告——体会 `format.parse` 的必要性。
2. 把 area 的 `fillOpacity` 改成 `0.6`，看衬底如何喧宾夺主，再改回来。
3. 把 `total` 的 `"ops": ["sum"]` 改成 `["mean"]`、`"as": ["total_price"]` 相应改名，面积变成五股均价。
4. 删掉 `endpoints` 里的 `formula` 变换和 text 里的 `"dy"` 通道，
   观察 IBM 与 AMZN 的末端标签几乎完全重叠（两股末端价格仅差 3 美元）——
   体会为什么需要避让，再想想手动写死 symbol 名的局限（通用方案是 label 变换）。
5. 把 x 轴 `"format": "%Y"` 改成 `"%b %Y"` 或 `"%y/%m"`，对比刻度文字。

## 参考

- 官方示例：[line-chart](https://vega.github.io/vega/examples/line-chart/) ·
  [stock-index-chart](https://vega.github.io/vega/examples/stock-index-chart/) ·
  [stacked-area-chart](https://vega.github.io/vega/examples/stacked-area-chart/)
- 官方文档：[Data / format.parse](https://vega.github.io/vega/docs/data/) ·
  [Scales（time / ordinal）](https://vega.github.io/vega/docs/scales/) ·
  [aggregate / window 变换](https://vega.github.io/vega/docs/transforms/) ·
  [facet 分组](https://vega.github.io/vega/docs/marks/group/)
