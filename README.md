# vega-examples

> 面向计算机 agent（也适合人类）的 **Vega 教学 demo 集**：47 个渐进式 demo，
> 覆盖 Vega 的 JSON spec 语法（数据、变换、比例尺、标记、信号、事件）、JS 运行时 API
> （View、动态数据、自定义变换、无头渲染），以及一整组**稀有与复杂图形**
> （桑基、弦图、玫瑰图、等值线、六边形分箱、蜂群、小提琴、平行坐标、流图、K 线、
> 日历热力图、矢量场、圆填充、径向树、瀑布、马赛克、Bump、甘特、邻接矩阵……）。

本目录**完全独立**：不安装依赖、不构建、可离线，所有页面直接引用项目自带的
`assets/vega.min.js`（v6.4.0，含 geo/force/hierarchy/wordcloud 等全部子包）与 `assets/data/` 数据集。

## 快速开始

```sh
./serve.sh
# 打开 http://localhost:8000/
```

首页是**带缩略图的画廊**：47 张小图（`thumbs/`，随仓库提交）一眼看完所有图形，
点进去就是可交互的完整 demo。缩略图不是截屏，而是从 demo 页里的 View
按比例重绘出来的，画的就是这个 demo 本身。

## 学习路径

| 分组 | Demo | 核心概念 |
| --- | --- | --- |
| A. Grammar 基础 | [01](src/01-bar-chart/) 柱状图 | data.values、band/linear scale、axis、rect/text mark、encode 集合 |
| | [02](src/02-line-area-timeseries/) 折线/面积 | time scale、多序列分组、line/area mark |
| | [03](src/03-scatter-regression/) 散点+回归 | symbol mark、regression transform |
| | [04](src/04-histogram-binning/) 直方图 | bin + aggregate 变换 |
| | [05](src/05-stacked-grouped-bar/) 堆叠/分组 | stack 变换、facet、group mark、**group 局部 width/height 信号** |
| B. 数据变换 | [06](src/06-data-pipeline/) 变换管线 | filter / formula / aggregate / window / sort |
| | [07](src/07-lookup-joins/) 表连接 | lookup 变换、多数据集、CSV 的 format.type |
| | [08](src/08-reshape-fold-pivot/) 宽长互转 | fold / pivot 变换、线性轴的 zero |
| | [09](src/09-crossfilter/) 联动过滤 | crossfilter 手法、多视图共享 signal |
| C. 交互 | [10](src/10-signals-bind/) 控件绑定 | signal、bind（滑杆/下拉/复选） |
| | [11](src/11-events-brush-zoom/) 刷选缩放 | 事件流语法、interval brush、pan/zoom |
| | [12](src/12-hover-tooltip-legend/) 提示与图例 | tooltip 通道、legend 交互过滤 |
| | [13](src/13-dynamic-data-runtime/) 动态数据 | view.insert/remove/change、signal()、runAsync |
| D. 高级布局 | [14](src/14-force-directed-graph/) 力导向图 | force 变换、节点拖拽 |
| | [15](src/15-hierarchies/) 层次布局 | treemap / partition、stratify |
| | [16](src/16-geo-choropleth/) 分级统计地图 | geo 投影、topojson、lookup 填色、domain 截断 |
| | [17](src/17-wordcloud/) 词云 | wordcloud 变换 |
| | [18](src/18-voronoi-labels/) 拾取与标签 | voronoi、label 防重叠 |
| E. 运行时 API | [19](src/19-runtime-api-tour/) View API 全览 | parse、View、监听器、toSVG 导出、resize |
| | [20](src/20-custom-transform-expr/) 自定义扩展 | 自定义 transform、表达式函数 |
| | [21](src/21-node-headless-render/) Node 无头渲染 | renderer:'none'、toSVG、fs loader |
| **F. 稀有与复杂图形** | [22](src/22-sankey-alluvial/) 桑基 / 冲积图 | stack ×3、手工三次贝塞尔 path |
| | [23](src/23-chord-arc-diagram/) 弦图 / 弧线邻接图 | pie、arc、二次贝塞尔 Q / 椭圆弧 A |
| | [24](src/24-radial-rose-stack/) 玫瑰图 / 径向堆叠柱 | 极坐标 arc、**sqrt scale（面积正比）** |
| | [25](src/25-contour-density2d/) 等值线 / 二维核密度 | isocontour、kde2d、grid 栅格对象 |
| | [26](src/26-hexbin-matrix/) 六边形分箱 / 矩阵热力图 | 手算蜂巢格心、自定义 symbol shape |
| | [27](src/27-beeswarm-dotplot/) 蜂群图 / Wilkinson 点图 | force collide（static）、dotbin |
| | [28](src/28-violin-ridgeline/) 小提琴图 / 山脊线图 | kde、对称 area、重叠行布局 |
| | [29](src/29-boxplot-errorbar/) 箱线图 / 误差棒 | aggregate 五数、Tukey 围栏、stderr |
| | [30](src/30-parallel-coordinates/) 平行坐标图 | fold、归一化、逐轴刻度反算 |
| | [31](src/31-streamgraph/) 流图 | stack 的 offset zero/center/normalize |
| | [32](src/32-candlestick-ohlc/) K 线图 | 双面板共享 x scale、window lag、十字光标 |
| | [33](src/33-calendar-heatmap/) 日历热力图 | 手算 周/星期、facet 分年、gradient 图例 |
| | [34](src/34-vector-field/) 矢量场 / 风场图 | 自定义箭头字形、angle、**pow(2) size** |
| | [35](src/35-pack-dendrogram/) 圆填充 / 径向树状图 | pack、tree、linkpath(orient: radial) |
| | [36](src/36-custom-shapes-gradients/) 自定义形状与渐变 | symbol path、gradient、trail、clip |
| | [37](src/37-geo-projections-arcs/) 投影画廊 / 大圆航线 | projection、graticule、geoshape |
| | [38](src/38-waterfall-marimekko/) 瀑布图 / 马赛克图 | window 累计和、两级 stack |
| | [39](src/39-bump-slope-chart/) Bump 图 / 斜率图 | window(rank)、point 反向轴 |
| | [40](src/40-gantt-timeline/) 甘特图 / 时间线 | 区间 rect、依赖折线、time + band |
| | [41](src/41-matrix-adjacency/) 邻接矩阵 | 镜像边表、scale.domain 用 signal |
| **G. 官方示例精读** | [42](src/42-job-voyager/) Job Voyager | aggregate 的 argmax 返回整行、from.data + from.facet |
| | [43](src/43-edge-bundling/) 层级边捆绑 | treePath、按数组字段 facet、interpolate: bundle |
| | [44](src/44-tree-layout/) 直角坐标树布局 | tree 用 as 重命名转置、linkpath 四种 shape |
| | [45](src/45-radar-chart/) 雷达图 | point 角度尺、pow 半径尺、linear-closed 闭合 |
| | [46](src/46-connected-scatter/) 连接散点图 | line 轨迹、ordinal 当查找表、collect 定顺序 |
| | [47](src/47-serpentine-timeline/) 蛇形时间线 | 直段+圆弧的几何参数化、formula 链 |

G 组（42 起）每个 demo 对应 [vega.github.io/vega/examples](https://vega.github.io/vega/examples/) 下的一个
官方示例，README 里除了讲解还必须有一节 **`## 与官方示例的差异`** ——
逐条列出为适配本仓库约定（本地数据路径、不覆盖内建 signal、去掉 `now()` 之类不可复现调用、
空态兜底……）做了哪些改动，读者一眼能分清哪部分是官方语法、哪部分是本仓库的取舍。

F 组起每个 demo 的 README 都带一节 **`## 与 matplotlib 的对照`**；
整体横向对比见 **[COMPARISON.md](COMPARISON.md)**（Vega 在哪些图形上更强、
在哪些上明显不如 matplotlib，逐项列表 + 诚实的短板清单）。

## 导出：每个 demo 都能出 SVG 与透明 PNG

每个 demo 页面顶部有统一的导出工具栏（`assets/demo.js` 自动注入）：

- **SVG** —— `view.toSVG(scale)`，从场景图重新生成的真矢量（canvas 渲染的视图也能出）。
- **PNG**，1×~4× 任选 —— `view.toCanvas(scale)` → `toDataURL('image/png')`。
- **透明背景**开关，默认开 —— 导出前把内建 `background` signal 临时置 `null`，
  所以透明这件事不依赖 spec 里怎么写；关掉则得到白底。

批量导出：

```sh
node tools/export.cjs                    # 全部 demo → out/，SVG + 透明 PNG(2×)
node tools/export.cjs 22 33 --scale 3    # 只导指定 demo，3 倍分辨率
node tools/export.cjs --opaque           # 白底对照
node tools/export.cjs --svg --no-browser # 只导 SVG，不用浏览器
```

导出器会**就地校验透明度**：解 PNG 头确认是 RGBA（colorType 6），
再采样统计全透明像素占比，写进 `out/manifest.json`。

### 首页缩略图 thumbs/

首页画廊每张卡片配一张 `thumbs/<slug>.png`，由 `tools/thumbs.cjs` 生成：

```sh
node tools/thumbs.cjs            # 只重生成过期/缺失的
node tools/thumbs.cjs --force    # 全部重生成
node tools/thumbs.cjs 22 33      # 只处理指定 demo
node tools/thumbs.cjs --check    # 不启浏览器，只报告缺失/过期
```

几点设计取舍：

- **重绘而非重采样**：先 `view.toCanvas(1)` 量出图表自然尺寸，再按
  `min(600/宽, 380/高)` 的比例 `view.toCanvas(scale)` 画第二遍。缩放发生在绘制阶段，
  文字与曲线是重新描边的，所以缩小后依然干净。
- **进版本库**：`out/` 是 gitignore 的成品图，`thumbs/` 则随仓库提交 ——
  clone 下来直接 `./serve.sh` 就有图，不必先装 Chromium 跑一遍。47 张共约 3.9 MB。
- **不裁切**：各 demo 画幅从 600×194 的宽条到 329×380 的竖幅都有，
  卡片上固定取景框、图片 contain 居中，只留白不裁切。
- **空白会报出来**：生成后解 PNG 采样统计"有内容的像素占比"，
  低于 1% 判为几乎空白并 WARN —— 等到了 `__sceneReady` 但图没画出来这种情况不会被静默写成白板。
- **过期判定**：缩略图 mtime 早于该 demo 的 `index.html` / `spec.vg.json` / `main.js`
  即为过期。`tools/validate.cjs` 全量跑时会检查缩略图**存在**，
  `thumbs.cjs --check` 进一步检查**新鲜度**。

## 给 agent 的使用说明

- **目录契约与开发规范见 [AGENTS.md](AGENTS.md)**：新增/修改 demo 前必读。
- 每个 demo 的 `README.md` 有 spec 逐段讲解和改练建议；`spec.vg.json` 可直接在
  [Vega Editor](https://vega.github.io/editor/) 中粘贴调试（注意把数据 url 换成线上地址）。
- 右侧的 **Signals 实时值面板**会显示 spec 中所有 signal 的当前值，交互时观察它是理解
  signal/事件机制最快的方式。
- 无头驱动页面时等 `window.__sceneReady === true` 再截图/导出；
  `window.__vegaDemo.views[i].view` 是 View 实例，`window.__vegaExport(opts)` 直接出图。

## 校验与调试

```sh
node tools/validate.cjs              # 纯 Node：契约 + parse + 真实数据流 + 布局溢出 + toSVG
node tools/validate.cjs 06 12        # 只校验 slug 含 06 / 12 的
node tools/inspect.cjs 22 --rows 6   # 打印数据样本(带类型)/比例尺 domain/SVG 里每段文字
node tools/validate-browser.cjs      # 真实 Chromium：console 无报错 + 导出可用 + PNG 透明
node tools/thumbs.cjs --check        # 首页缩略图是否齐全且不过期
```

任何 demo 改动后 `validate.cjs` 都应跑到全绿；改渲染或导出相关代码时再跑一遍
`validate-browser.cjs`。两者的分工与各自能抓什么，见 [AGENTS.md](AGENTS.md)。

`inspect.cjs` 是排查「数据格式化/渲染不对」的主要工具：它把每个数据集的样本行
（值带 `num` / `str` / `date` 类型前缀）、每个比例尺的真实 domain/range、
以及**最终 SVG 里按渲染顺序的每一段文字**全部打出来 ——
「本该是 9.7% 却显示 0.1」「该 parse 成数字却是字符串」这类问题不用开浏览器就能抓到。
