# 01 · 柱状图基础

## 学习目标

看懂一个最小但完整的 Vega spec 由哪几段组成，以及数据是如何一步步变成屏幕上的矩形的。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/01-bar-chart/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `$schema` | 声明 spec 遵循的 Vega 版本 | v6 |
| `width` / `height` / `padding` | 绘图区尺寸与内边距 | 坐标轴、标题在 padding 之外 |
| `title` | 图表标题 | 也可以是 signal 表达式 |
| `data` | 数据集定义 | `values` 表示 inline 数据；`url` 可加载外部文件 |
| `scales` | 数据域 → 视觉区间的映射 | `band`（离散分带，给类目）与 `linear`（连续数值） |
| `axes` | 基于某个 scale 画坐标轴 | `orient` 方位；`grid: true` 画网格线 |
| `marks` | 真正画出来的图形元素 | `from.data` 指定数据源；一条 datum 生成一个图形实例 |
| `encode` | 图形属性的编码规则 | `enter` 创建时、`update` 数据/信号变化时、`hover` 悬停时 |

### 关键概念

- **视觉通道（visual channel）**：`x`、`y`、`width`、`fill` 等。每个通道要么写死
  `{ "value": ... }`，要么绑定数据 `{ "scale": "...", "field": "..." }`。
- **scale 引用**：`{ "scale": "x", "field": "day" }` 表示“用名为 x 的比例尺映射 day 字段”。
  band 比例尺还可以用 `"band": 0.5` 取带宽中点（见 text 标记的水平居中）。
- **range 的特殊值**：`"range": "width"` / `"height"` 表示跟随绘图区宽高，改 `width` 时图表自动伸缩。
- **encode 集合优先级**：`hover` > `update` > `enter`。hover 效果由页面里的
  `view.hover()`（见 `assets/demo.js`）驱动。

## 试一试（改练）

1. 把 `"padding": 0.15` 改成 `0.5`，观察柱宽变化。
2. 给 y 轴加 `"format": "d"` 或把 `nice` 去掉，看刻度差异。
3. 新增一个 `hover` 属性，比如 `"fillOpacity": 0.6`。
4. 把 `values` 换成 `"url": "../../../docs/data/cars.json"` 并把字段改成
   `Origin` / `Horsepower`（聚合见 demo 06）。

## 参考

- 官方文档：[Spec 概览](https://vega.github.io/vega/docs/specification/) ·
  [Scales](https://vega.github.io/vega/docs/scales/) ·
  [Axes](https://vega.github.io/vega/docs/axes/) ·
  [Marks](https://vega.github.io/vega/docs/marks/)
