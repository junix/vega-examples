# vega-examples 开发约定（供 agent 与人类共同遵守）

本目录是 Vega 可视化语法库的**教学 demo 集**：每个 demo 是一个独立小目录，
目标是让计算机 agent 通过阅读/运行/修改这些 demo 学会使用 Vega（JSON spec 语法 + JS 运行时 API）。

## 运行方式

```sh
./serve.sh            # = 在本目录起 python3 -m http.server 8000
# 打开 http://localhost:8000/
```

**零安装、零构建、可离线**：Vega UMD 库与数据集都内置于 `assets/` 目录：

| 资源 | 从 demo 目录（demos/NN-slug/）出发的相对路径 |
| --- | --- |
| Vega 库（UMD，含全部子包） | `../../assets/vega.min.js` |
| 共享助手 | `../../assets/demo.js` |
| 共享样式 | `../../assets/demo.css` |
| 数据集 | `../../assets/data/<file>`（见下方速查表） |

## 每个 demo 的目录契约

```
demos/NN-slug/
├── index.html     # 固定骨架（见 demos/01-bar-chart/）：DEMO_META + 容器 + 三个 <script>
├── spec.vg.json   # Vega spec（v6）。数据 url 一律写 ../../assets/data/...
├── main.js        # 入口。纯 spec demo 只有一行 renderDemo({spec: './spec.vg.json', ...})；
│                  # 运行时 API demo 在这里做 signal 监听、动态数据等
└── README.md      # 中文教学文档，固定四节：学习目标 / spec 逐段讲解（表格）/ 试一试 / 参考链接
```

- `window.DEMO_META = { slug, group, title, concepts: [...] }`：页头由 `assets/demo.js` 自动生成。
- 页面结构：`<main class="demo-main">` 内放 `.demo-view > #view` 与 `<aside id="signals">`；
  可选 `.demo-notes` 写操作提示，`.demo-controls` 放按钮。
- `renderDemo(options)`：`{spec, element='#view', renderer='canvas', signals='#signals', hover=true}`，
  返回 `Promise<View>`。它会自动把 spec 里声明的所有 signal 实时渲染到 `#signals` 面板。
- 文档与注释用**中文**；标识符、spec JSON 保持英文。

## 校验（必须全绿才算完成）

```sh
node tools/validate.cjs            # 全部 demo
node tools/validate.cjs 06 12      # 只校验 slug 含 06 / 12 的
```

校验器会：检查文件契约 → `vega.parse(spec)` → 用 `renderer:'none'` 的 View 无头跑数据流
（`data[].url` 自动改写为绝对路径走 fs）。需要浏览器 canvas 的 demo 列入
`tools/validate.cjs` 顶部的 `PARSE_ONLY` 集合（只 parse 不运行），目前只有 `17-wordcloud`。

## Node 脚本注意事项（demo 21 等）

Node 里 `require` UMD 的 `assets/vega.min.js`
不会得到导出对象，而是挂到 `globalThis.vega`。因此 Node 脚本一律：

```js
require('../../assets/vega.min.js');   // 路径按实际层级调整
const vega = globalThis.vega;
```

文件名用 `.cjs` 后缀，避免 ESM 语义差异。无头渲染用
`new vega.View(runtime, { renderer: 'none', loader: vega.loader({ mode: 'file' }) })`，
`await view.toSVG()` 导出 SVG；PNG 导出需要 node-canvas，本集不依赖。

## 常用数据集速查（assets/data/）

| 文件 | 字段 / 结构 |
| --- | --- |
| `cars.json` | Name, Miles_per_Gallon, Cylinders, Displacement, Horsepower, Weight_in_lbs, Acceleration, Year(如 "1970-01-01"), Origin(USA/Europe/Japan)；部分记录 Horsepower 为 null |
| `stocks.csv` | symbol, date("Jan 1 2000"), price |
| `flights-2k.json` | date("2001/01/01 06:55"), delay, distance, origin, destination |
| `population.json` | year, age, sex(1男/2女), people |
| `penguins.json` | Species, Island, "Beak Length (mm)", "Beak Depth (mm)", "Flipper Length (mm)", "Body Mass (g)", Sex；有缺失值 |
| `seattle-weather.csv` | date("2012-01-01"), precipitation, temp_max, temp_min, wind, weather(drizzle/rain/sun/snow/fog) |
| `miserables.json` | `{nodes:[{name,group,index}], links:[{source,target,value}]}`，link 用节点下标 |
| `flare.json` | 嵌套树 `{name, children:[...]}`，叶子有 size |
| `us-10m.json` | TopoJSON，`objects` 含 `states` / `counties` / `nation`；feature id 为 FIPS 码 |
| `unemployment.tsv` | id(县级 FIPS), rate |
| `lookup_people.csv` / `lookup_groups.csv` | name,age,height / group,person（person↔name 多对一） |
| `movies.json` | Title, "US Gross", "Worldwide Gross", "Production Budget", "Release Date", "Major Genre", "IMDB Rating", "Rotten Tomatoes Rating"；大量 null |
| `earthquakes.json` | GeoJSON FeatureCollection，properties.mag/place/time，geometry.coordinates=[lng,lat,depth] |

读取时注意：`format` 按需声明（csv/tsv 会自动按扩展名推断；json 数组/GeoJSON/TopoJSON 默认自动识别）。

## 禁止事项

- 不引用任何外部 CDN / 网络资源；不新增 npm 依赖。
- 不改动 `vega-examples/` 之外的任何文件。
- 不引入 vega-lite / vega-embed（本集聚焦 Vega 本体）。
