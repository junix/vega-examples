# vega-examples

> 面向计算机 agent（也适合人类）的 **Vega 教学 demo 集**：21 个渐进式 demo，
> 覆盖 Vega 的 JSON spec 语法（数据、变换、比例尺、标记、信号、事件）与 JS 运行时 API
> （View、动态数据、自定义变换、无头渲染）。

本目录属于 vega monorepo 的一部分，但**完全独立**：不安装依赖、不构建、可离线，
所有页面直接引用仓库自带的 `docs/vega.min.js`（v6.4.0，含 geo/force/hierarchy/wordcloud 等全部子包）
与 `docs/data/` 数据集。

## 快速开始

```sh
./serve.sh
# 打开 http://localhost:8000/vega-examples/
```

## 学习路径

| 分组 | Demo | 核心概念 |
| --- | --- | --- |
| A. Grammar 基础 | [01](demos/01-bar-chart/) 柱状图 | data.values、band/linear scale、axis、rect/text mark、encode 集合 |
| | [02](demos/02-line-area-timeseries/) 折线/面积 | time scale、多序列分组、line/area mark |
| | [03](demos/03-scatter-regression/) 散点+回归 | symbol mark、regression transform |
| | [04](demos/04-histogram-binning/) 直方图 | bin + aggregate 变换 |
| | [05](demos/05-stacked-grouped-bar/) 堆叠/分组 | stack 变换、facet、group mark |
| B. 数据变换 | [06](demos/06-data-pipeline/) 变换管线 | filter / formula / aggregate / window / sort |
| | [07](demos/07-lookup-joins/) 表连接 | lookup 变换、多数据集 |
| | [08](demos/08-reshape-fold-pivot/) 宽长互转 | fold / pivot 变换 |
| | [09](demos/09-crossfilter/) 联动过滤 | crossfilter 手法、多视图共享 signal |
| C. 交互 | [10](demos/10-signals-bind/) 控件绑定 | signal、bind（滑杆/下拉/复选） |
| | [11](demos/11-events-brush-zoom/) 刷选缩放 | 事件流语法、interval brush、pan/zoom |
| | [12](demos/12-hover-tooltip-legend/) 提示与图例 | tooltip 通道、legend 交互过滤 |
| | [13](demos/13-dynamic-data-runtime/) 动态数据 | view.insert/remove/change、signal()、runAsync |
| D. 高级布局 | [14](demos/14-force-directed-graph/) 力导向图 | force 变换、节点拖拽 |
| | [15](demos/15-hierarchies/) 层次布局 | treemap / partition、stratify |
| | [16](demos/16-geo-choropleth/) 分级统计地图 | geo 投影、topojson、lookup 填色 |
| | [17](demos/17-wordcloud/) 词云 | wordcloud 变换 |
| | [18](demos/18-voronoi-labels/) 拾取与标签 | voronoi、label 防重叠 |
| E. 运行时 API | [19](demos/19-runtime-api-tour/) View API 全览 | parse、View、监听器、toSVG 导出、resize |
| | [20](demos/20-custom-transform-expr/) 自定义扩展 | 自定义 transform、表达式函数 |
| | [21](demos/21-node-headless-render/) Node 无头渲染 | renderer:'none'、toSVG、file loader |

## 给 agent 的使用说明

- **目录契约与开发规范见 [AGENTS.md](AGENTS.md)**：新增/修改 demo 前必读。
- 每个 demo 的 `README.md` 有 spec 逐段讲解和改练建议；`spec.vg.json` 可直接在
  [Vega Editor](https://vega.github.io/editor/) 中粘贴调试（注意把数据 url 换成线上地址）。
- 右侧的 **Signals 实时值面板**会显示 spec 中所有 signal 的当前值，交互时观察它是理解
  signal/事件机制最快的方式。

## 校验

```sh
node tools/validate.cjs        # 解析 + 无头运行全部 demo 的 spec
```

任何 demo 改动后都应跑到全绿。浏览器限定项（目前仅词云）只做 parse 校验。
