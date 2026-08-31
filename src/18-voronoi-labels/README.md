# 18 · Voronoi 拾取与标签防重叠

## 学习目标

在散点图上学两个高级技巧：

1. 用 `voronoi` 变换生成一层透明单元格来**高效拾取最近点**（鼠标落在哪个单元格，就选中哪个点），
   而不是给几百个点逐个挂事件监听；
2. 用 `label` 变换（vega-label）给少数重点散点**自动摆放互不重叠的文字标签**。

顺带会踩到三个「代码不报错、图却是错的」的坑，本 demo 把它们都摆在明面上：
`window` 的分区参数名、拾取层的 mark 顺序、text mark 上 fill 与 stroke 的绘制顺序。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/18-voronoi-labels/
```

## spec 逐段讲解

marks 的**声明顺序就是绘制顺序**，也倒过来决定拾取优先级，所以下表按 spec 里的真实顺序排：

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals.hovered` | 当前悬停的汽车记录 | 事件写法 `@cells:mouseover` 表示“监听名为 cells 的标记项”；`update: "datum"` 把该单元格对应的数据元组（即那辆车）写入 signal |
| `data.cars` | 原始数据 | 过滤掉 `Horsepower` / `Miles_per_Gallon` 为 null 的记录，剩 392 行 |
| `data.pts` | 像素坐标 + Voronoi | `formula` 用表达式函数 `scale('x', …)` 算出像素坐标 `px/py`；`voronoi` 以 `px/py` 为站点、以绘图区为 `extent`，把每个单元格的 SVG 路径字符串写入 `cell` 字段 |
| `data.labelcars` | 待打标签的 6 辆车 | `window` 变换按 `Origin` 分区、按 `Horsepower` 降序编号，`filter` 取每组前 2 名。分区参数名是 **`groupby`**；`ops` 用 **`row_number`** 而不是 `rank`（下面「两个静默失败的参数」有实测） |
| `data.hovercar` | 悬停点的派生数据 | `filter` 表达式引用 signal `hovered`；signal 一变，数据流自动重算，只剩悬停那辆车 |
| `scales.x / y / c` | 位置与配色 | 注意 domain 取自 `cars` 而非 `pts`：`pts` 的 formula 依赖比例尺，若比例尺 domain 又依赖 `pts` 会造成数据流环路。x/y 都写了 `"zero": false`——马力和油耗都不以 0 为基准 |
| `marks.points` | 散点（392 个） | `x/y` 直接绑 `px/py`（与 Voronoi 同一坐标来源，保证单元格与点严格对齐）；`update` 里用 signal 表达式做条件高亮：悬停点放大、描深色边，其余点变淡 |
| `marks.labelpoints` | 标签锚点（红圈） | 给 6 个重点车画空心红圈（每个产地 2 个）；它的真正作用是作为下方 text 标记的**数据源**提供位置 |
| `marks.labels` | 防重叠标签 | `from.data` 指向**另一个标记** `labelpoints`；`label` 变换读取这些锚点项的位置，按顺序试 `anchor` 列出的八个方位 × `offset` 里的四档偏移，把不重叠的位置写回 `x/y/opacity/align/baseline`；`avoidMarks: ["points"]` 声明还要避开散点云 |
| `marks.hovernamehalo` | 悬停车名的白色光环 | 只写 `stroke`、把 `fill` 显式设成 `null`，单独占一个 mark 并排在 `hovername` **之前** |
| `marks.hovername` | 悬停车名 | 只写 `fill`，画在光环之上。数据源 `hovercar` 只有 0 或 1 条记录，因此这段文字随鼠标移动而出现/消失 |
| `marks.cells` | 透明 Voronoi 拾取层 | **必须是最后一个 mark**。`path` 标记画 `cell` 字段，`fill: "transparent"` 不可见但仍可接收鼠标事件 |

### 两个静默失败的参数：`groupby` 与 `row_number`

`window` 变换的分区参数叫 **`groupby`**（见 `assets/vega.js` 里 `Window.Definition` 的 params 表）。
写成 SQL 味的 `partitionby` 不会报错、不会 WARN，只是被当作未知键丢掉 ——
于是 rank 变成**全局**排名，`datum.rank <= 2` 在 392 行里只留下马力最高的那几辆，
全是 USA 的车，「每个产地前 2 名」这个教学点整个失效。本 demo 实测过这个错法：

| 写法 | `labelcars` 行数 | 内容 |
| --- | --- | --- |
| `partitionby: ["Origin"]` + `ops: ["rank"]` | 4 | 全是 USA；其中两个锚点像素坐标完全相同、第三个只差 18px |
| `groupby: ["Origin"]` + `ops: ["rank"]` | 8 | 分区对了，但 USA 多吐 2 行 |
| `groupby: ["Origin"]` + `ops: ["row_number"]` | 6 | 每个产地正好 2 辆 |

第二行为什么会多吐？因为 **`rank` 给并列行同一个名次**：`cars.json` 里 USA 有三辆
225 马力的车（pontiac catalina、buick estate wagon (sw)、buick electra 225 custom）
并列第 2，`rank <= 2` 一次放出 4 条；更糟的是前两辆连 `Miles_per_Gallon` 都同为 14，
换算出**完全相同的像素坐标**，两条标签叠死在一个锚点上，`label` 变换必然隐藏其中一条。
想严格取「每组前 N」就用 `row_number`（它按行号计数，不认并列）。
换 op 之后 `as: ["rank"]` 要显式写上，否则输出字段名会变成 `row_number`。

### 拾取顺序：透明层必须放在最上面

Vega 的命中测试在 `pickVisit()` 里**逆序**遍历 mark（`for (i = items.length; --i >= 0;)`），
返回第一个命中者 —— 也就是「最后声明 = 画在最上面 = 优先拾取」。

如果把 `cells` 写在 `points` 前面（很自然的直觉：先声明拾取层），鼠标一靠近圆点就被
`points` 抢走 pick，`@cells` 收到 `mouseout` 把 `hovered` 复位；点缩回去以后
`cells` 又拿回 pick 触发 `mouseover`……效果是高亮随鼠标每一像素的移动开关闪烁。
用 CDP 逐像素喂 `mouseMoved` 实测（同一个点附近移动 1px）：

```
错的顺序（cells 在最前）      修好后（cells 在最后）
  near -> null                  d(6,6) -> chevrolet chevelle malibu
  on   -> chevrolet malibu…     d(2,2) -> chevrolet chevelle malibu
  on2  -> null                  d(0,0) -> chevrolet malibu classic (sw)
  on3  -> chevrolet malibu…     d(1,0) -> chevrolet malibu classic (sw)
  on4  -> null                  d(0,1) -> chevrolet malibu classic (sw)
```

顺手纠正一个常见误解：**canvas 的拾取不是颜色索引缓冲**。看 `assets/vega.js` 里
`hitPath()` 的实现，它是纯几何判定 —— `context.isPointInPath(x, y)` /
`context.isPointInStroke(x, y)`。所以透明单元格能被点到，恰恰是**因为它有 fill**：

```js
return path(context, o) ? false
  : fill && context.isPointInPath(x, y) || stroke && context.isPointInStroke(x, y);
```

`fill` 取的就是 `item.fill`。`"transparent"` 是一个 alpha 为 0 的颜色字符串，非空、判定为真，
于是「看不见但能点到」。在绘图区内均匀撒 54 个采样点、逐个喂 `mouseMoved` 实测三种写法：

| `cells` 的 `fill` | `item.fill` / `item.stroke` | 54 个采样点里拾取成功 | 后果 |
| --- | --- | --- | --- |
| `{"value": "transparent"}` | `"transparent"` / 无 | **54 / 54** | 正确：看不见、全区域可拾取 |
| `{"value": null}` | `null` / 无 | 0 / 54 | 整层变成死的，`hovered` 永远是 `null` |
| 不写 `fill` | 无 / `"#4c78a8"` | 4 / 54 | 更隐蔽：Vega 默认 mark 配置补上了**描边**，于是 Voronoi 网格线变成可见的蓝线，而且只有鼠标正好压在格子边界上才命中（`isPointInStroke` 生效、`isPointInPath` 不生效） |

最后一行是最容易误判的：图上多出一堆蓝线、拾取又时灵时不灵，很容易归因成「voronoi 算错了」。

SVG 渲染器走浏览器自己的 DOM 命中测试，`fill="transparent"` 同样算「已绘制」而可命中 ——
本 demo 在 canvas 与 SVG 两种渲染器下都实测过，拾取行为一致。

### 文字光环：fill 先画、stroke 后画

Vega 画 text 的顺序是**先 `fillText` 再 `strokeText`**（`assets/vega.js` 的 `draw$5`）：

```js
if (item.fill && fill(context, item, opacity)) context.fillText(str, x, y);
if (item.stroke && stroke(context, item, opacity)) context.strokeText(str, x, y);
```

所以在**同一个** text mark 上写 `fill: "#222222"` + `stroke: "#ffffff"` + `strokeWidth: 3`
做“白色描边衬底”是行不通的：3px 描边居中压在字形轮廓上、向内吃掉 1.5px，
13px 粗体的笔画本来也就 2px 左右，字身被涂成白的，出来是白底白字。
把同一辆车（`chevrolet malibu classic (sw)`）的车名放在同一个 200×26 像素窗里采样，
两种写法一对一比：

| 写法 | 窗内不透明像素 | 亮度 < 100 的暗像素 | 最暗亮度 |
| --- | --- | --- | --- |
| 一个 mark：`fill` + 3px `stroke` | 3070 | **6** | 49 |
| 两个 mark：先描边、后填充 | 3070 | **615** | 34 |

6 个暗像素铺在 29 个字符的粗体字上，等于什么都没有 —— 屏幕上就是一片白。

正确写法就是本 demo 的两个 mark：`hovernamehalo` 只描边（`fill` 显式给 `null`）、
`hovername` 只填充，前者排在后者之前。SVG 有 `paint-order` 属性能一个元素搞定，
但 Vega 的 text mark 不暴露它，两个 mark 是通用解。

### 其他关键概念

- **为什么 Voronoi 拾取高效**：Delaunay/Voronoi 一次性把平面划分成“每个点独占的最近区域”，
  之后浏览器只需对少量单元格做命中测试；逐点监听则要求每个小圆点都被精确命中，体验差且事件多。
  单元格铺满整个 `extent`，所以只要鼠标在绘图区内就一定有选中项。
  注意 `mouseout` **不是**只在离开绘图区时才触发：跨格移动时 Vega 先发 `mouseout`（旧格）
  再发 `mouseover`（新格）。实测在绘图区内横向扫 31 个采样点，`@cells` 收到
  13 次 `mouseover` + 12 次 `mouseout`，严格交替。所以 `hovered` 每次跨格都会**瞬间过一次
  `null`** 再被写成新车 —— 因为两个事件在同一次鼠标移动里先后处理完，肉眼看不到闪。
  真正会闪的是拾取权被别的 mark 抢走的情况（见上一节）。
- **标记作为数据源（mark as data source）**：`from: { "data": "labelpoints" }` 让 text 标记的
  每条 datum 变成红圈标记的**图形项**。因此取原记录字段要多跳一级：`{ "field": "datum.Name" }`
  = 图形项的 `datum`（汽车元组）的 `Name`；同理 `datum.x`/`datum.y` 能拿到锚点的屏幕坐标。
- **`label` 变换的输出**：默认 `as: ["x", "y", "opacity", "align", "baseline"]`，直接改写在 text
  图形项上（找不到无重叠位置时 `opacity` 为 0、`x`/`y` 为 `null`，标签自动隐藏）。
- **`anchor` / `offset` 要给得够宽**：这是个贪心算法，候选位置 = 方位 × 偏移档位。
  392 个密集散点 + `avoidMarks: ["points"]` 的条件下实测（6 个锚点全程不变）：

  | `anchor` | `offset` | 可见标签 |
  | --- | --- | --- |
  | 上/下/左/右 | `[4]` | 2 / 6 |
  | 八方位 | `[4]` | 4 / 6 |
  | 八方位 | `[5, 11, 18, 26]` | **6 / 6** |
  | 上/下/左/右 | `[5, 11, 18, 26]` | 1 / 6 |

  注意最后一行：只加偏移档位、不给斜方位反而更差（1 / 6，比单档 offset 的 2 / 6 还低）。
  斜方位是能挤进密集散点的关键。
  另外 `anchor` 的**先后顺序**会影响贪心结果（换个顺序同样的参数只出 5 条），
  本 demo 用的就是 `label` 变换的默认顺序 `top-left, left, bottom-left, top, bottom,
  top-right, right, bottom-right`（直接省略 `anchor` 参数等效）。
- **画布依赖警告**：`label` 变换的碰撞检测要把避让对象渲染到离屏 canvas 做位图运算，
  Node 无头环境没有 canvas，`markBitmaps()` 会抛
  `TypeError: Cannot read properties of null (reading 'getContext')`。
  所以本 demo 登记在 `tools/validate.cjs` 的 `NEEDS_CANVAS` 里，
  纯 Node 校验**只做文件契约 + `$schema` + `vega.parse` + 数据文件就位检查**，不跑数据流；
  渲染、标签摆放、拾取、导出这些都由 `tools/validate-browser.cjs`（真实 Chromium）覆盖。

## 试一试（改练）

1. 把 `datum.rank <= 2` 改成 `<= 5`：锚点从 6 个变 15 个（3 个产地 × 5），
   实测只摆得下 9 条，其余 6 条 `opacity` 变 0。被放弃的位置一半一半：3 条在右侧
   USA 高马力簇（buick estate wagon (sw) / buick electra 225 custom / pontiac grand prix，
   锚点全挤在 x = 592~608 的窄带里），3 条在左中部散点最密的区域
   （mazda rx-4 / volvo 264gl / datsun 810 maxima）。可见「锚点自己挤成一团」和
   「周围散点太密」都会让标签被丢掉。
2. 把 `ops` 从 `["row_number"]` 换回 `["rank"]`：`labelcars` 从 6 行变 8 行
   （USA 4 / Japan 2 / Europe 2），标签从 6 / 6 掉到 6 / 8。被隐藏的两条里，
   `buick estate wagon (sw)` 是因为它和 `pontiac catalina` 落在**完全相同的像素** (592, 320)：
   同一个锚点上永远只放得下一条标签。
3. 把 `anchor` 里四个斜方位删掉，只留上下左右：六条标签会掉到只剩一条。
   这条是本 demo 里最容易「看起来在用 label 变换、其实全被隐藏了」的坑。
4. 把 `cells` 这个 mark 从 marks 数组末尾挪到最前面（`points` 之前），
   然后在图上慢慢移动鼠标：高亮会开始闪烁，右侧 Signals 面板里 `hovered` 在
   `null` 和车名之间来回跳。这就是拾取顺序被搞错的样子。
5. 给 `cells` 标记加 `"stroke": { "value": "#cccccc" }`，把 Voronoi 网格可视化出来，
   理解拾取区域形状。
6. 把 `hovernamehalo` 和 `hovername` 合成一个 mark（fill 和 stroke 写在一起），
   看白底白字的效果；或者只把 `hovernamehalo` 在 marks 数组里挪到 `hovername` **之后** ——
   实测退化成一模一样的结果（采样窗里 6 个暗像素、最暗亮度 49），因为白描边又盖回字身上了。
7. 把 `labels` 的 `avoidMarks` 删掉：仍然是 6 / 6，但 6 条里有 4 条落回**最小偏移档**
   （相对锚点 −14, −14，也就是紧贴红圈左上），只有 2 条被别的标签挤开；
   代价是它们直接压在散点上。比较一下「离得远」和「压住点」哪个更可读。

## 参考

- 官方示例：[Labeled Scatter Plot](https://vega.github.io/vega/examples/labeled-scatter-plot/) ·
  [Airport Connections（Voronoi 拾取）](https://vega.github.io/vega/examples/airport-connections/)
- 官方文档：[voronoi 变换](https://vega.github.io/vega/docs/transforms/voronoi/) ·
  [label 变换](https://vega.github.io/vega/docs/transforms/label/) ·
  [window 变换](https://vega.github.io/vega/docs/transforms/window/) ·
  [事件流语法](https://vega.github.io/vega/docs/event-streams/)
- 源码定位（都在未压缩构建 `assets/vega.js` 里）：
  `Window.Definition` 的 params 表 · `pickVisit()` 的逆序遍历 ·
  `hitPath()` 的 `isPointInPath` 判定 · text 的 `draw$5()` 先 fill 后 stroke
