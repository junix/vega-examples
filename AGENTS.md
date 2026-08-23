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

`assets/` 里的三份 Vega 构建是同一个 v6.4.0：`vega.min.js`（浏览器用）、
`vega.js`（未压缩，**查变换参数表时读它**）、`vega-bundle.cjs`（CommonJS，给 `tools/` 下的脚本 require）。

## 每个 demo 的目录契约

```
demos/NN-slug/
├── index.html     # 固定骨架（见 demos/01-bar-chart/）：DEMO_META + 容器 + 三个 <script>
├── spec.vg.json   # Vega spec（v6）。数据 url 一律写 ../../assets/data/...
├── main.js        # 入口。纯 spec demo 只有一行 renderDemo({spec: './spec.vg.json', ...})；
│                  # 运行时 API demo 在这里做 signal 监听、动态数据等
└── README.md      # 中文教学文档，固定小节（见下）
```

- `window.DEMO_META = { slug, group, title, concepts: [...] }`：页头由 `assets/demo.js` 自动生成。
- 页面结构：`<main class="demo-main">` 内放 `.demo-view > #view` 与 `<aside id="signals">`；
  可选 `.demo-notes` 写操作提示，`.demo-controls` 放按钮。
- README 必须含四个二级标题：`## 学习目标`、`## spec 逐段讲解`、`## 试一试`、`## 参考`。
  **F 组（22 起，"稀有与复杂图形"）额外必须含 `## 与 matplotlib 的对照`** ——
  说明这张图在 Vega 里靠什么语法元素声明式表达出来、换命令式绘图库要付什么代价。
  校验器逐字检查这些标题。
- 文档与注释用**中文**；标识符、spec JSON 保持英文。
- 新增 demo 除了在 `index.html` 的 `GROUPS` 里登记，还要跑
  `node tools/thumbs.cjs <NN>` 生成首页缩略图 `thumbs/<slug>.png`（见下文）。

## 共享助手 API（assets/demo.js）

| 函数 | 作用 |
| --- | --- |
| `renderDemo(opts)` | `{spec, element='#view', renderer='canvas', signals='#signals', hover=true, name, export}`；返回 `Promise<View>`。自动渲染 signal 检视面板并**接入导出工具栏** |
| `registerDemoView(view, name)` | 手工构造 View 的 demo（19、20）在 `runAsync()` 之后调它，否则导出工具栏拿不到 View |
| `exportDemoImage(opts)` | `{format:'svg'\|'png', scale, transparent=true, index=0}` → `Promise<{filename,width,height,bytes,text\|dataUrl}>`。不下载，只返回数据 |
| `downloadDemoImage(opts)` | 同上并触发浏览器下载 |
| `showDemoError(err)` | 以醒目浮层展示错误（方便截图/读 DOM 诊断） |

**给无头驱动的钩子**（agent 用这些判断"图画好了没有"）：

| 全局 | 含义 |
| --- | --- |
| `window.__sceneReady` | 首个 View 渲染完成后置 `true` —— **截图/导出前先等它** |
| `window.__vegaDemo` | `{ slug, ready, views: [{name, view}], toolbar }` |
| `window.__vegaExport(opts)` | = `exportDemoImage`，供 CDP `Runtime.evaluate` 直接调 |

## 导出：每个 demo 都能出 SVG 与 PNG

`assets/demo.js` 会给**每个** demo 页面顶部自动插一条导出工具栏：
SVG / PNG 按钮 + PNG 倍数（1×~4×）+ **透明背景**开关（默认开）+ 多 View 时的 View 选择框。

两个 API 都与当前渲染器无关 —— 它们从**场景图**重新画一遍，所以 canvas 渲染的视图也能出矢量 SVG：

| API | 产物 |
| --- | --- |
| `view.toSVG(scale)` | SVG 字符串（矢量，含 `xmlns`，可单独打开） |
| `view.toCanvas(scale)` | 离屏 `HTMLCanvasElement`，再 `.toDataURL('image/png')` 出 PNG |

**透明背景的机制**：背景色由 `view.background()` 决定（本质是名为 `background` 的内建 signal）。
`null` → SVG 不画底板 `<rect>`、PNG 的 alpha 通道为 0；`'#ffffff'` → 两者都带白底。
Vega 默认就是 `null`，但**如果 spec 里写了 `"background"`，会被继承到导出图里**，
所以 `exportDemoImage` 在导出前后显式改写并复原这个 signal ——
"透明"这件事不依赖 spec 怎么写。批量导出时 `tools/export.cjs` 会解 PNG 头验证
（colorType 6 = RGBA）并采样统计全透明像素占比，把结论量出来而不是声称。

## 首页缩略图：thumbs/<slug>.png

首页画廊每张卡片都要有缩略图，由 `tools/thumbs.cjs` 生成 —— 走的是和导出工具栏
同一条路（headless Chromium 打开 demo 页 → 等 `__sceneReady` → 拿页面里注册的 View →
`view.toCanvas(scale)`），**不是截屏**：先按 1× 量出图表自然尺寸，
再按 `min(600/宽, 380/高)` 重画一遍，缩放发生在绘制阶段，文字与曲线重新描边。

与 `tools/export.cjs` 的分工：

| | 输出 | 进版本库？ | 用途 |
| --- | --- | --- | --- |
| `export.cjs` | `exports/<slug>.{svg,png}` 原尺寸 | 否（`.gitignore`） | 拿出去用的成品图 |
| `thumbs.cjs` | `thumbs/<slug>.png` 适配卡片 | **是** | 首页画廊；clone 下来就有图 |

```sh
node tools/thumbs.cjs              # 只重生成过期/缺失的
node tools/thumbs.cjs --force      # 全部重生成
node tools/thumbs.cjs 42 43        # 只处理指定 demo（新增 demo 时用这个）
node tools/thumbs.cjs --check      # 不启浏览器，只报告缺失/过期
```

几条硬约定：

- **新增 demo 必须补一张缩略图**（`node tools/thumbs.cjs <NN>`），
  否则 `tools/validate.cjs` 的首页检查会 FAIL。
- **改了 spec 要重跑**。"过期"= 缩略图 mtime 早于该 demo 的
  `index.html` / `spec.vg.json` / `main.js`；`--check` 会点出来，
  默认（不带 `--force`）也只重生成这些。
- 生成后会解 PNG 采样统计"有内容的像素占比"，低于 1% 判为几乎空白并 WARN ——
  防止"等到了 `__sceneReady` 但图其实没画出来"被静默写成一张白板。
- 缩略图是透明底 PNG，卡片上用固定取景框 + `contain` 居中，**不裁切**；
  取景框比例（`assets/demo.css` 的 `.gallery-thumb`，30:19）与默认 `--box 600x380` 对齐。

## 工具箱（tools/，全部零依赖）

| 命令 | 用途 |
| --- | --- |
| `node tools/validate.cjs [slug片段…] [--verbose]` | **主校验器**。契约 + `$schema` + parse + 真实数据流 + `toSVG` |
| `node tools/inspect.cjs <slug片段> [--rows N] [--texts] [--data 名] [--svg 文件]` | **调试利器**。打印数据样本（值带 `num`/`str`/`date` 类型前缀）、比例尺真实 domain/range、以及**最终 SVG 里按渲染顺序的每一段文字** |
| `node tools/validate-browser.cjs [slug片段…] [--shots 目录]` | 浏览器端校验：console 无报错 + 画布非空 + SVG/PNG 导出可用 + **PNG 透明与白底成对断言** |
| `node tools/export.cjs [slug片段…] [--out 目录] [--svg\|--png] [--scale N] [--opaque]` | 批量导出 SVG + PNG（默认透明）到 `exports/`，附 `manifest.json` |
| `node tools/thumbs.cjs [slug片段…] [--force] [--check] [--box WxH]` | 生成首页画廊缩略图 `thumbs/<slug>.png`（**随仓库提交**）；`--check` 只查缺失/过期 |
| `node tools/cdp.cjs` | 库，不直接跑：极小 CDP 客户端 + 静态服务器 + PNG 解码器 |

### 校验分两层，两层都要绿

```sh
node tools/validate.cjs            # 纯 Node，快，每次改动都跑
node tools/validate-browser.cjs    # 真实 Chromium，改渲染/导出相关代码时跑
node tools/thumbs.cjs --check      # 纯 fs，查首页缩略图是否齐全且不过期
```

`validate.cjs` 会：查文件契约与 README 小节 → 查 `$schema` 是 v6 → `vega.parse` →
**用带 Node fs 访问的 loader 跑数据流**（`assets/vega-bundle.cjs` 是浏览器构建，
它自带的 `loader({mode:'file'})` 会直接 reject —— 历史上这个坑让校验器对所有带 url
的 demo 都假绿过）→ **逐个数据集断言行数 > 0** →
**把 Vega 的 ERROR 和"数据/比例尺坏了"类 WARN 一律当失败** → `await view.toSVG()`。

`wordcloud` 与 `label` 变换要真实 canvas 位图，纯 Node 跑不了，登记在 `validate.cjs`
顶部的 `NEEDS_CANVAS` 里只做 parse；它们的完整校验由 `validate-browser.cjs` 承担。
**新增 demo 不要用这两个变换。**

`validate-browser.cjs` / `export.cjs` 需要系统里有 Chromium/Chrome：
`apt install chromium`，或 `CHROME=/path/to/chrome`，或
`CDP_ENDPOINT=http://127.0.0.1:9222` 复用已有浏览器。

## 数据格式化的几个真实坑

1. **CSV / TSV 必须显式写 `"format": {"type": "csv"}`。** Vega **不**按扩展名推断，
   漏了就会被当 JSON 解析 → 整表报废（图上出现 `NaN` / `undefined`）。
   按需同时写 `"parse": {"字段": "number" | "date" | "date:'%Y/%m/%d %H:%M'"}`；
   写 `"parse": "auto"` 让它自动推断也可以。
2. **`scales` 条目里不能放 `description` / `comment` 之类注释键** ——
   Vega 会对每个未知键报 `Unsupported scale property` WARN（校验器视为失败）。
   注释放 `data` / `signals` / `marks` 条目里，或写进 README。
3. **有缺失值的数据集要先 `filter` 掉 null**（`cars.json` 的 Horsepower、
   `movies.json`、`penguins.json` 都有），否则比例尺 domain 被污染、聚合结果失真。
4. **数字与日期一律显式格式化**：轴用 `"format"`，标签文字用表达式里的
   `format(datum.x, '...')` / `timeFormat(...)`。禁止出现 `0.30000000000000004`
   这种直出。年份别用带千分位的格式（`1,565` 是典型错误，用 `"format": "d"`）。
5. **`size` 通道是面积不是长度**：symbol / arc 的半径 ∝ √size。想让长度线性正比于数值，
   scale 要用 `sqrt`/`pow`。玫瑰图、比例符号地图、矢量场都会踩这个。
6. 改完用 `node tools/inspect.cjs <slug>` **逐条读一遍 SVG 里的文字**再说自己做完了。

## Vega 的坑清单（都是本仓库实际踩出来的）

写新 demo 或改 spec 前扫一遍这张表，能省掉大半调试时间。

### 作用域与保留名

- **`range: "width"/"height"` 不跟随 group。** 它的含义是「取当前作用域里名为
  `width`/`height` 的信号」，group mark **不会**为自己重绑。子图要么在 group 上加
  `"signals": [{"name": "height", "update": "<该 group 的高度>"}]`，要么把 range 写成
  显式区间 `[0, {"signal": "panelH"}]`（后者更省心，还能绕开整个陷阱）。
  症状：子图按整幅画布尺寸铺开、溢出面板，而 parse / 数据流 / `toSVG` 全都不报错。
  `tools/validate.cjs` 的布局溢出检查专为它而设。详见 `demos/05-stacked-grouped-bar/README.md`
  的「作用域陷阱」一节。
- **自定义 signal 不要撞内建名。** `width` / `height` / `padding` / `background` /
  `autosize` / `cursor` 都是 view 的内建信号，同名自定义会**直接顶替**内建定义
  （例如把「词间距」滑杆命名成 `padding`，拖动时整张图的外边距跟着变）。
- **`scales` 条目里放任何未知键**（`description`/`comment`/`_note`…）都会触发
  `Unsupported scale property` WARN。注释放 `data`/`signals`/`marks` 条目上，或写进 README。

### 比例尺与编码

- **线性/pow/sqrt 比例尺默认把 0 并入 domain。** 画金额、计数时对（柱状图必须从 0 起），
  画年份、温度、pH 时必须显式 `"zero": false`，否则数据被压成边缘一条线。
- **`size` 是面积，不是长度。** 而且 Vega 的口径是**外接正方形的面积**，不是圆面积：
  内建符号一律按 `r = sqrt(size) / 2` 作图（`assets/vega.js` 里 `Math.sqrt(size) / 2` 那十几处）。
  这一点**和 d3-shape 不同**（d3 的 `symbolCircle` 用 `sqrt(size / π)`），别照搬 d3 的公式。
  所以：
  - 想让视觉半径等于 `r` 像素 → `size = pow(2 * r, 2)`（实测 `size: 144` 渲染出 `A6,6`，半径正好 6）。
  - `size = 2*r*r` 只能得到 `0.707r`，`size = PI*r*r` 得到 `0.886r` —— 都是常见的写错。
  - 想让**长度**线性正比于数值 → scale 用 `pow` exponent 2（值→面积），或 `sqrt`（面积→值）。
  玫瑰图（`demos/24`）、矢量场（`demos/34`）、比例符号地图（`demos/37`）、
  圆填充（`demos/35`）、力导向图（`demos/14`）都在这条上栽过。
  自定义 `shape` 的 SVG path 同理：Vega 把它按 `sqrt(size)/2` 等比缩放到 `[-1,1]` 的框里。
- **`encode` 的 `band` 可以取信号**：`{"scale": "x", "field": "g", "band": {"signal": "(1-w)/2"}}`
  合法，比在 encode 里手拼 `scale()+bandwidth()` 表达式干净。
- **`title.subtitle` 可以写成 `{"signal": ...}`**，适合把从数据算出的合计塞进副标题。

### 变换

- **`sequence`（以及表达式里的 `sequence()`）是右开区间**：`stop` 取不到。
  要包含末点得写 `sequence(0, 1.0000001, step)`。
- **`line` mark 没有 series/detail 通道**：一个 line mark 永远只出一条路径，
  多序列只能 `group` + `from.facet`。而 facet 分组内**保留源数据顺序**，
  所以上游必须先 `collect` 排好序 —— 这是正确性问题，不是美观问题。
- **`aggregate` 的 `ci0`/`ci1` 是 bootstrap 重采样，结果不可重现**（每次渲染都不同）。
  要确定性的 95% CI 用 `stderr` × `quantileNormal(0.975)`。
- **`aggregate` 的 `ops: ["count"]` 在 `fields` 里对应位置写 `null`。**
- **`window` 的 `rank` 遇并列会多吐行**，想严格取前 N 用 `row_number`。
  分区参数名是 **`groupby`**，写成 `partitionby` 会被静默忽略、退化成全局排名。
- **`lookup` 的 `default: null` 当外连接**，判空要用 `!= null`（Vega 表达式是 JS 松散相等），
  否则取值为 `0` 的字段会被误判成未匹配。
- **`pivot` 本质是 aggregate**：不在 `groupby` 里的字段会被丢掉；输出列名就是被 pivot
  字段的**取值**，会和同名原字段撞车。
- **数据变换里可以用 `scale('name', v)`**（解析顺序是 initScale → parseData → parseScale）。
  但 scale 名写错**不报错也不 WARN**，只是返回 `undefined` → 全图 NaN。小心拼写，
  也小心循环依赖（别让某个 scale 的 domain 依赖一个用了该 scale 的数据集）。

### 渲染与文字

- **`labelAngle` 不会自动推导对齐方式**（这点和 Vega-Lite 不同）：旋转刻度标签必须同时写
  `labelAlign` / `labelBaseline`，否则标签绕自身中心转、往图里倾倒。
- **纯 Node 下文字宽度是估算的**（`0.8 × 字数 × 字号`，见下节的 `textMetrics.canvas(false)`），
  CJK 会被显著低估。长中文图例/标题在无头导出的 SVG 里可能贴边或越界，要留余量。
- **hover 编码集需要配 `update`**：只写 `enter` + `hover` 时，Vega 的 leave 指令
  `['update','hover']` 因为缺 update encoder 会直接 StopPropagation，
  hover 的效果（如 `fillOpacity`）在鼠标移出后**不会复位**。
- **拾取是自上而下取第一个命中的 mark**，而且几何拾取依赖 `fill` 非空。
  透明拾取层要放在被拾取目标**之上**，否则会被下层 mark 抢走。
- **拼 path 字符串时把数字 `format(v, '.1f')`**，否则 `d` 属性里全是 17 位浮点。
- **`autosize: "none"` 时 padding 不会自动为标题让位**：写了 `title` 就要显式给
  `"padding": {"top": 46, ...}`，否则标题被 viewBox 裁掉。

### 校验器自己的盲点（别以为绿了就万事大吉）

- 布局溢出检查量的是场景图包围盒，而 Vega 的 `axisLayout` 会把 **grid 线排除在 axis
  分组包围盒之外**。所以「`gridScale` 写错导致网格线横穿整幅画布」这类 bug
  **抓不到**，只能靠 `validate-browser.cjs --shots` 看图。
- 校验器只跑 signal 的**默认值**。默认值下正常、拖到极端参数才崩的情况抓不到；
  这类边界要在 README 的「试一试」里写清楚。

## Node 脚本注意事项（demo 21、tools/ 等）

Node 里 `require` UMD 的 `assets/vega.min.js` 不会得到导出对象，而是挂到 `globalThis.vega`。
所以浏览器脚本用 `assets/vega.min.js`，**Node 脚本一律 require `assets/vega-bundle.cjs`**
（CommonJS 构建，`module.exports` 正常）。文件名用 `.cjs` 后缀。

无头渲染的两处必备设置：

```js
const vega = require('../../assets/vega-bundle.cjs');

// 1. Node 无 DOM canvas，文字测量退化为估算；不切换的话依赖 textMetrics 的变换拿到 0 宽度
vega.textMetrics.canvas(false);

// 2. 浏览器构建的 file loader 直接 reject，得注入 Node fs
const loader = vega.loader({ mode: 'file' });
loader.fileAccess = true;
loader.file = f => require('fs').promises.readFile(f, 'utf8');

const view = new vega.View(vega.parse(spec), { renderer: 'none', loader });
await view.runAsync();
const svg = await view.toSVG();     // PNG 需要真实浏览器，见 tools/export.cjs
```

## 查变换参数表的最快办法

不要猜参数名。每个变换的 `Definition` 就在未压缩构建里：

```sh
grep -n "'type': 'kde2d'" -A 30 assets/vega.js
grep -n "'type': 'isocontour'" -A 40 assets/vega.js
```

本地 v6.4.0 共 80 个变换全部可用：
`aggregate axisticks bin bound collect compare contour countpattern cross crossfilter datajoin
density dotbin encode expression extent facet field filter flatten fold force formula generate
geojson geopath geopoint geoshape graticule heatmap identifier impute isocontour joinaggregate
kde kde2d key label legendentries linkpath load loess lookup mark multiextent multivalues nest
overlap pack params partition pie pivot prefacet project projection proxy quantile regression
relay render resolvefilter sample scale sequence sieve sortitems stack stratify subflow timeunit
tree treelinks treemap tupleindex values viewlayout voronoi window wordcloud`

## 常用数据集速查（assets/data/）

| 文件 | 字段 / 结构 |
| --- | --- |
| `cars.json` | Name, Miles_per_Gallon, Cylinders, Displacement, Horsepower, Weight_in_lbs, Acceleration, Year(如 "1970-01-01"), Origin(USA/Europe/Japan)；部分记录 Horsepower 为 null |
| `stocks.csv` | symbol, date("Jan 1 2000"), price |
| `ohlc.json` | date("2009-06-01"), open, high, low, close, signal, ret |
| `flights-2k.json` | date("2001/01/01 06:55"), delay, distance, origin, destination |
| `population.json` | year, age, sex(1男/2女), people |
| `penguins.json` | Species, Island, "Beak Length (mm)", "Beak Depth (mm)", "Flipper Length (mm)", "Body Mass (g)", Sex；有缺失值 |
| `seattle-weather.csv` | date("2012-01-01"), precipitation, temp_max, temp_min, wind, weather(drizzle/rain/sun/snow/fog)；4 年 1461 行 |
| `seattle-weather-hourly-normals.csv` | date("2010-01-01T01:00:00"), pressure, temperature, wind |
| `crimea.json` | date("1854-04-01"), wounds, other, disease, army_size；南丁格尔玫瑰图原始数据，24 个月 |
| `volcano.json` | 规则网格 `{width:87, height:61, values:[…]}`，等值线/热力图用 |
| `windvectors.csv` | longitude, latitude, dir(度), dirCat, speed(m/s) |
| `unemployment-across-industries.json` | series, year, month, count, rate, date(ISO 带时区) |
| `iowa-electricity.csv` | year("2001-01-01"), source, net_generation |
| `monarchs.json` | name, start(年), end(年), index；部分带 commonwealth:true |
| `population_engineers_hurricanes.csv` | state, id, population, engineers, hurricanes |
| `miserables.json` | `{nodes:[{name,group,index}], links:[{source,target,value}]}`，link 用节点下标；77 点 254 边 |
| `flare.json` | 嵌套树 `{name, children:[...]}`，叶子有 size |
| `us-10m.json` | TopoJSON，`objects` 含 `states` / `counties` / `nation`；feature id 为 FIPS 码 |
| `world-110m.json` | TopoJSON，`objects.countries` |
| `unemployment.tsv` | id(县级 FIPS), rate |
| `airports.csv` | iata, name, city, state, country, latitude, longitude |
| `flights-airport.csv` | origin, destination, count |
| `lookup_people.csv` / `lookup_groups.csv` | name,age,height / group,person（person↔name 多对一） |
| `movies.json` | Title, "US Gross", "Worldwide Gross", "Production Budget", "Release Date", "Major Genre", "IMDB Rating", "Rotten Tomatoes Rating"；大量 null |
| `earthquakes.json` | GeoJSON FeatureCollection，properties.mag/place/time，geometry.coordinates=[lng,lat,depth] |
| `barley.json` | yield, variety, year, site |
| `disasters.csv` | Entity, Year, Deaths |
| `points.json` | x, y（单位方形内的散点） |

## 禁止事项

- 不引用任何外部 CDN / 网络资源；不新增 npm 依赖（`tools/` 也不许 —— 需要浏览器能力就走 `tools/cdp.cjs`）。
- 不改动 `vega-examples/` 之外的任何文件。
- 不引入 vega-lite / vega-embed（本集聚焦 Vega 本体）。
- 新增 demo 不要用 `label` / `wordcloud` 变换（要真实 canvas 位图，纯 Node 校验跑不了）。
- 改一个 demo 时不要顺手"优化"别的 demo；新增 demo 时不要动共享文件
  （`index.html` 画廊、根 `README.md`、`assets/**`、`tools/**`）——这些统一维护。
