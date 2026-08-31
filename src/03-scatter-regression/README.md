# 03 · 散点图与回归拟合

## 学习目标

学会散点图的标准画法（`symbol` mark + `ordinal` 着色），以及用 `regression` 变换在数据流里
直接算出分组拟合曲线：同一数据源派生出线性（实线）与二次（虚线）两组趋势曲线并叠加对比。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/03-scatter-regression/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` cars | 加载 JSON 并清洗 | cars.json 共 406 条，其中 6 条 `Horsepower` 为 null、8 条 `Miles_per_Gallon` 为 null（两者互不重叠）；`filter` 变换用表达式 `datum.Horsepower != null && datum.Miles_per_Gallon != null` 一共滤掉 14 条，剩 392 条。JSON 数组无需声明 `format`（对比 demo 02 的 CSV） |
| `data[1]` trendLinear | 派生：分组线性回归 | `regression` 变换按 `Origin` 分三组拟合 `v = a + b·u`；不写 `extent`，缺省行为是每条拟合线只覆盖本组数据的 x 范围 |
| `data[2]` trendQuad | 派生：分组二次拟合 | `method: "poly", order: 2` 拟合抛物线；同样不写 extent——高次曲线外推很容易飞出图表（见“试一试”3） |
| `scales.x / y` | 数值 → 位置 | 散点图两轴都是 `linear`；`"zero": false` 让 domain 紧贴数据范围（散点图惯例，与柱状图必须含零不同） |
| `scales.color` | Origin → 颜色 | `ordinal` + `category` 配色，与 demo 02 同一把比例尺类型 |
| `axes` | 坐标轴 | 两轴都带 `title` 与 `grid`，网格帮助读点的数值 |
| `legends` | 图例 | 散点用 `fill` 编码，所以图例写 `{ "fill": "color" }`（demo 02 的折线用 stroke，图例就写 `stroke`） |
| `marks[0]` symbol | 散点 | `symbol` mark 一条 datum 画一个符号；`size` 是像素²的面积不是半径；半透明 + hover 提亮缓解重叠 |
| `marks[1]` group | 线性拟合线 | 再次使用 demo 02 的 `from.facet` 模式：regression 输出的每条记录自带 `Origin` 字段（groupby 的字段名会保留），可按它 facet 后逐组画线 |
| `marks[2]` group | 二次拟合线 | 结构同上，加 `strokeDash: [6, 4]` 画虚线，与实线区分 |

### 关键概念

- **`regression` 变换参数**：`x`/`y` 指定自变量与因变量字段；`groupby` 分组各自拟合；
  `method` 可选 `linear` / `log` / `exp` / `pow` / `quad` / `poly`；`order` **只对 `poly` 生效**
  （`quad` 就是固定的二次，`method: "linear", order: 2` 里的 order 会被忽略）；
  `as: ["u", "v"]` 给输出的 x/y 列起名，避免覆盖原字段名。
- **`extent`**：拟合曲线采样/取端点的 x 区间。本例两组回归都不写它，缺省 = 每组用自己的数据范围；
  显式给出则所有组统一（线性外推是直线、相对可控，但端点仍可能越过 y 轴数据域；
  高次多项式外推可能剧烈发散，见“试一试”3）。
- **`params: true`**（本例未画出）：让变换不输出曲线点，而输出每组的
  `{ keys, coef, rSquared }`——系数向量与决定系数 R²，可在控制台用
  `view.data('trendLinear')` 的方式查看（把 `params` 加进某个 trend 数据集后试试）。
- **输出结构**：非 params 模式下每条输出记录 = groupby 字段 + `as` 起的两个字段；
  `linear` 只输出两个端点，`poly` 等非线性方法输出一串采样点（所以 poly 曲线天生平滑）。

## 试一试（改练）

1. 把 `trendLinear` 的 `method` 改成 `"log"` / `"exp"` / `"pow"`，观察曲线形状（log 要求 x > 0）。
2. 把 `trendQuad` 的 `order` 改成 `3` 或 `5`，看高次多项式在数据边缘的抖动。
3. 给 `trendQuad` 加上 `"extent": [45, 230]`：虚线外推到小组没有数据的区间，
   某些组会明显飞出合理范围——直观理解“为什么高次外推危险”（线性组也可以加，观察端点越过 y 轴数据域）。
4. 在 `trendLinear` 的 regression 里加 `"params": true`（此时 `as` 不起作用，可删），
   刷新后打开浏览器控制台执行 `view.data('trendLinear')`，查看每组的 `coef` 与 `rSquared`。
   （`renderDemo` 返回的 Promise 里有 view；也可在 main.js 里 `.then(view => window.view = view)`。）
5. 删掉 `filter` 变换：null 马力或 null 油耗记录（共 14 条）会产生 NaN 坐标并在控制台报警告，回归结果也会被污染。

## 参考

- 官方示例：[regression](https://vega.github.io/vega/examples/regression/) ·
  [loess-regression](https://vega.github.io/vega/examples/loess-regression/)
- 官方文档：[regression 变换](https://vega.github.io/vega/docs/transforms/regression/) ·
  [filter 变换](https://vega.github.io/vega/docs/transforms/filter/) ·
  [symbol mark](https://vega.github.io/vega/docs/marks/symbol/) ·
  [Legends](https://vega.github.io/vega/docs/legends/)
