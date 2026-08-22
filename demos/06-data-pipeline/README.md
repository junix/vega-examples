# 06 · 数据变换管线：每个 Origin 功率重量比 Top-3

## 学习目标

看懂 Vega 的 `transform` 管线如何像流水线一样逐段加工数据：本 demo 用一条
`filter → formula → window → filter → collect` 的五段管线，从 cars.json 的 406 行原始记录
算出「每个 Origin（产地）功率重量比最高的 3 款车型」，并用 group mark + facet 分成三个面板展示；
另用一条旁路的 `aggregate` 数据给每组算出全体均值作脚注对照。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/06-data-pipeline/
```

## spec 逐段讲解

### data 段：管线是本 demo 的主角

| 数据集 / 变换 | 输入 | 输出（新增/保留字段） | 作用 |
| --- | --- | --- | --- |
| `cars_clean` → `filter` | cars.json 全部 406 行 | 原字段不变，剔除 Horsepower 或 Weight_in_lbs 为 null 的行 | 原始数据有空值，不算会污染下游 |
| `cars_clean` → `formula` | 上一步的行 | 新增 `power_ratio` = Horsepower / Weight_in_lbs | 派生指标：每磅重量分到多少马力 |
| `top3` → `window` | source: `cars_clean` | 新增 `rank`：按 Origin 分组、组内按 power_ratio 降序的名次 | `groupby` 让排名在各产地内独立进行 |
| `top3` → `filter` | 带 rank 的行 | 只留 `rank <= 3` 的 9 行（3 组 × 3 名） | Top-K 的「截断」步骤 |
| `top3` → `collect` | 上一步的行 | 字段不变，按 (Origin, rank) 升序落盘排序 | 决定下游 band 比例尺 domain 的出现顺序 |
| `origin_avg` → `aggregate` | source: `cars_clean` | 每组一行：`Origin` + `avg_ratio`（mean） | 旁路参考值：产地全体车型的平均功率重量比 |

要点：

- **`source` 派生**：`top3` 与 `origin_avg` 都以 `cars_clean` 为上游，清洗/派生只做一遍，
  下游各自接自己的变换。数据流是 DAG，不必串成一根独苗。
- **`window` ≠ `aggregate`**：aggregate 把分组折叠成一行；window 保留每一行、只追加窗口计算列
  （`rank`/`row_number`/`dense_rank` 等）。Top-K 要用 window 排名再 filter，而不是 aggregate。
- **`collect` 的意义**：Vega 的离散比例尺 domain 默认按数据出现顺序排列；想让面板/名次按
  固定顺序出现，就显式 `collect` 排序，不要依赖加载顺序。

### 其余段落

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` | 响应式变量 | `cellWidth` 用 `bandwidth('gpos')` 跟随画布宽度，改 `width` 面板自动伸缩 |
| `scales.gpos` | 顶层 band 比例尺 | 把三个 Origin 面板沿 x 方向排开 |
| `marks.cell`（group） | 分面容器 | `from.facet` 按 Origin 把 `top3` 切成 3 份子数据（命名为 `cells`），每份驱动一个 group 实例 |
| group 内 `scales`/`axes` | 面板局部坐标系 | group 内部可以有独立的 scale/axis；`range: "height"` 之类都相对该 group 的宽高 |
| group 内 `rect`/`text` | 面板内容 | 数据源是 facet 产物 `cells`；每条 datum 一根柱子 + 车型名 + 数值 |
| 顶层 text（from `cell`） | 面板标题 | `from.data` 指向**组 mark 的名字**时，datum 就是组图形项：`datum.x`/`datum.width` 可读，`datum.datum.Origin` 取回分组键 |
| 顶层 text（from `origin_avg`） | 均值脚注 | 与面板共用 `gpos` 比例尺对齐，`band: 0.5` 取带中点居中 |

## 试一试（改练）

1. 把 `window` 的 `"ops": ["rank"]` 改成 `["row_number"]` 或 `["dense_rank"]`，思考三者
   在并列（tie）时的差别（本数据浮点比率几乎不会并列）。
2. 把第二个 filter 的 `datum.rank <= 3` 改成 `<= 5`，面板会容纳更多柱子；注意
   `cellHeight` 不够时把 y 比例尺 range 上限调高。
3. 把 `collect` 的排序改成只按 `power_ratio` 降序，观察三个面板的排列顺序如何变化
   （`gpos` 的 domain 跟随数据顺序）。
4. 给 `top3` 再加一段 `lookup`（预习 demo 07）把 `origin_avg.avg_ratio` 拼回每行，
   然后在 group 里画一条 `rule` 参考线。
5. 把 `origin_avg` 的 `"ops": ["mean"]` 改成 `["mean", "count"]`（fields 对应写两个），
   在脚注文字里把样本数 `count` 也拼进去。

## 参考

- 本仓库官方示例：`docs/examples/top-k-plot.vg.json`、`top-k-plot-with-others.vg.json`
  （signal 驱动的 Top-K）与 `barley-trellis-plot.vg.json`（group + facet 分面）
- 官方文档：[Transforms 概览](https://vega.github.io/vega/docs/transforms/) ·
  [window](https://vega.github.io/vega/docs/transforms/window/) ·
  [aggregate](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [collect](https://vega.github.io/vega/docs/transforms/collect/) ·
  [facet](https://vega.github.io/vega/docs/marks/group/#facets)
