# 04 · 直方图：bin 分箱变换

## 学习目标

- 理解 `bin` 变换如何把连续数值字段切成等宽区间，并为每条记录**追加两个新字段**
  `bin0`（区间下界，含）与 `bin1`（区间上界，不含）。
- 掌握直方图的标准流水线：`bin` → `aggregate`（按 `bin0/bin1` 分组数 count）→
  `rect` 标记用 `x = bin0`、`x2 = bin1` 画出无缝隙的柱子。
- 认识变换的 `"signal"` 产出：`bin` 变换把分箱参数（`start` / `stop` / `step`）写回信号，
  用它驱动坐标轴的 domain 与刻度，让坐标轴永远和分箱边界对齐。
- 用 `rule` + `text` 标记画统计参考线（这里是平均延误）。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals[maxbins]` | 声明交互信号 | `bind` 生成了一个下拉框；改它会自动重跑依赖它的数据流与编码 |
| `signals[binCount]` | 派生信号 | 从 `bins` 信号读出实际分箱数；初始分箱参数由 bin 变换写入 |
| `data[flights]` | 加载原始数据 | `url` 指向仓库自带数据集，2000 条航班记录，字段 `delay` 有正有负 |
| `data[in-range]` | 过滤到 extent 内 | **必须先过滤**：超出 extent 的值 `bin0` 会被写成 `-Infinity / +Infinity`（见 vega-transforms 的 Bin.js），直接分箱会污染聚合结果 |
| `data[binned]` 的 `bin` | 分箱 | `field` 指定分箱字段；`extent` 固定范围；`maxbins` 是**最大**箱数，实际步长由 Vega 自动选整齐值；`"signal": "bins"` 把分箱参数写回信号 |
| `data[binned]` 的 `aggregate` | 统计每箱频数 | `groupby: ["bin0", "bin1"]` 按区间分组；`count` 数出每箱记录数。**频数为 0 的箱没有记录**，图上会留真实空缺 |
| `data[stats]` | 统计均值 | 无 `groupby` 的 `aggregate` 产出单行结果，供 rule / text 标记使用 |
| `scales[xscale]` | x 比例尺 | domain 写成信号表达式 `[bins.start, bins.stop]`；`"bins": {"signal": "bins"}` 让刻度落在分箱边界上——`nice: true` 可能把起点外扩到整齐步长（如 maxbins=10 时起点为 -100），所以 domain 不写死 |
| `scales[yscale]` | y 比例尺 | domain 取自聚合结果 `count`，`zero + nice` 保证从 0 开始且刻度整齐 |
| `axes` | 坐标轴 | 左轴 `grid: true` 画网格；底轴 `labelOverlap: true` 在分箱细（maxbins=40）时自动隐藏重叠刻度 |
| `marks[rect]` | 直方图柱子 | `x = bin0`、`x2 = bin1`：用区间两端定义柱宽，**不加 offset 就是无缝直方图**；数据驱动通道放在 `update` 里，maxbins 变化时已有柱子才会跟着更新 |
| `marks[rule]` | 均值参考线 | `rule` 画线段：`x`/`x2` 同为均值 → 竖线；`y`/`y2` 从 0 到 `height` 贯穿绘图区 |
| `marks[text]` | 均值标注 | `text` 通道用信号表达式拼接 `format(datum.mean_delay, '.1f')`，随均值线偏移 6px |

## 试一试

1. 切换 `maxbins` 下拉框（10 / 20 / 40），观察 x 轴刻度始终贴在分箱边界上，Signals 面板里
   `binCount` 同步变化（注意它不一定等于 maxbins）。
2. 把 bin 变换里的 `"maxbins": {"signal": "maxbins"}` 换成 `"step": 10`（固定步长），
   会得到 26 个箱；再把 extent 改成 `[-60, 210]` 这类不能被 step 整除的范围，观察末端行为。
3. 把 extent 和 `in-range` 的过滤条件一起改成 `[-60, 400]`，将 4 条超长延误（最大 365 分钟）
   的航班也纳入统计，看分布右尾和均值线的变化。
4. 给 rect 的 `x2` 加 `"offset": -1`，柱间出现 1px 缝隙，直方图就变成了「条形图风格」——
   对比体会无缝设计的含义。
5. 把 `rule` 的 `strokeDash` 去掉、或给 `stats` 再加一个 `median` 聚合字段并画第二条参考线。

## 参考

- 官方示例：[Histogram](https://vega.github.io/vega/examples/histogram/) ·
  [Histogram with Null Values](https://vega.github.io/vega/examples/histogram-null-values/)
- 官方文档：[bin 变换](https://vega.github.io/vega/docs/transforms/bin/) ·
  [aggregate 变换](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [rule 标记](https://vega.github.io/vega/docs/marks/rule/) ·
  [Signals 与 bind](https://vega.github.io/vega/docs/signals/)
