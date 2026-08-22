# 01 · 柱状图基础

## 学习目标

看懂一个最小但完整的 Vega spec 由哪几段组成，以及数据是如何一步步变成屏幕上的矩形的。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/demos/01-bar-chart/
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
2. 试 y 轴的 `nice` 与轴 `format`——先想清楚“为什么直接改没反应”：本例 uv 最大值 260
   恰好是默认刻度步长 20 的整数倍，`nice: true` 无事可做，去掉它 domain 仍是 `[0, 260]`；
   刻度又全是三位以内的整数，`"format": "d"` 与默认格式化输出一模一样。这两处改动
   **一个刻度标签都不会变**。想看出差别，试下面三种：
   - 把周六的 `uv` 改成 `263`：留着 `nice: true` 时 domain 被撑到 `[0, 280]`，多出一个 `280` 刻度；
     去掉 `nice` 则 domain 就是 `[0, 263]`，顶端刻度停在 `260`、轴线末端不再落在刻度上。
   - 把 `"nice": true` 改成 `"nice": 5`，再给左轴加 `"tickCount": 6`：domain 变成 `[0, 300]`，
     刻度从 `0,20,…,260` 变成 `0,50,…,300`（只改 `nice: 5` 不加 `tickCount`，domain 变了但步长仍是 20）。
   - 把 `"zero": true` 改成 `false`，并给左轴加 `"format": ",.1f"`：domain 变成 `[80, 260]`，
     刻度变成 `80.0 … 260.0`——基线起点与小数位的差别一次看全。
3. 新增一个 `hover` 属性，比如 `"fillOpacity": 0.6`。
4. 把 `values` 换成 `"url": "../../assets/data/cars.json"` 并把字段改成
   `Origin` / `Horsepower`（聚合见 demo 06）。

## 参考

- 官方文档：[Spec 概览](https://vega.github.io/vega/docs/specification/) ·
  [Scales](https://vega.github.io/vega/docs/scales/) ·
  [Axes](https://vega.github.io/vega/docs/axes/) ·
  [Marks](https://vega.github.io/vega/docs/marks/)
