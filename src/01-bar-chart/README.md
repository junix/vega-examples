# 01 · 柱状图基础

## 学习目标

看懂一个最小但完整的 Vega spec 由哪几段组成，以及数据是如何一步步变成屏幕上的矩形的。
本集里它同时承担另一个角色：**全仓库最小的一份 spec**（115 行、2 个数据集、1 个变换链），
其余 46 个 demo 的 `index.html` 骨架都是从这里复制出去的。

## 数据来源

`../../assets/data/wheat.json` 是 **William Playfair《商业与政治图解集》（The Commercial
and Political Atlas，1821 年第三版）** 里那张著名图表的原始数据：1565–1820 年英格兰
每夸特（quarter）小麦的先令价，每 5 年一行，共 52 行。Playfair 那张图把小麦价柱状图与
周薪折线叠在一起，用来论证「工资涨得比粮价快」——本 demo 只画其中的柱状图部分，
`wages` 字段留给「试一试」。数据本身是真的，**图上没有一个数字是编的**。

注意两处真实数据才有的粗糙感，后面的练习都建立在它们上面：

- `year` 是**字符串**（`"1565"`），不是数字，所以它天然适合 band 比例尺；
- 最后两行（1815、1820）**根本没有 `wages` 键**——不是 `null`，是字段不存在。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/01-bar-chart/
```

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `$schema` | 声明 spec 遵循的 Vega 版本 | v6 |
| `width` / `height` / `padding` | 绘图区尺寸与内边距 | 坐标轴、标题在 padding 之外 |
| `title` | 图表标题 | `subtitle` 写成 `{"signal": ...}`，从 `peak` 数据集里读峰值 |
| `data[0]` | 外部数据集 | `"url": "../../assets/data/wheat.json"` —— 路径**相对 spec 文件**，全仓库统一这么写；JSON 不用写 `format` |
| `data[1]` | 派生数据集 `peak` | `source` 指向上游；`aggregate` 的 `argmax` 返回**整行对象**，所以后面两个 `formula` 把它摊平成标量 |
| `scales` | 数据域 → 视觉区间的映射 | `band`（离散分带，给 52 个年份字符串）与 `linear`（连续数值，`nice`+`zero`） |
| `axes` | 基于某个 scale 画坐标轴 | 底轴 `labelAngle: -90` 竖排，**必须同时写 `labelAlign`/`labelBaseline`**；左轴 `"format": "d"` |
| `marks[0]` | rect 柱子 | `from.data` 指定数据源；一条 datum 生成一个矩形 |
| `marks[1]` | text 峰值标注 | `from.data` 指向 `peak`，整个数据集只有 1 行，所以只画出 1 段文字 |
| `encode` | 图形属性的编码规则 | `enter` 创建时、`update` 数据/信号变化时、`hover` 悬停时 |

### 关键概念

- **视觉通道（visual channel）**：`x`、`y`、`width`、`fill` 等。每个通道要么写死
  `{ "value": ... }`，要么绑定数据 `{ "scale": "...", "field": "..." }`。
- **scale 引用**：`{ "scale": "x", "field": "year" }` 表示“用名为 x 的比例尺映射 year 字段”。
  band 比例尺还可以用 `"band": 0.5` 取带宽中点（见峰值标注的水平定位）。
- **range 的特殊值**：`"range": "width"` / `"height"` 表示跟随绘图区宽高，改 `width` 时图表自动伸缩。
- **encode 集合优先级**：`hover` > `update` > `enter`。hover 效果由页面里的
  `view.hover()`（见 `assets/demo.js`）驱动。
  注意本例的 `hover` 旁边**一定要有非空的 `update`**：Vega 的 leave 指令是
  `['update', 'hover']`，缺了 update 编码器它会直接 StopPropagation，
  鼠标移出后颜色**不会复位**。
- **`labelAngle` 不推导对齐方式**（这点和 Vega-Lite 不同）：只写 `labelAngle: -90`
  的话标签绕自身中心旋转，会往绘图区里倒。竖排年份的正确写法是
  `labelAngle: -90` + `labelAlign: "right"` + `labelBaseline: "middle"`。
- **数据派生出来的标量要走数据集，不要在 signal 里硬算。**
  `max(pluck(data('wheat'), 'wheat'))` 看着很顺手，实际求值为 `NaN`，
  副标题会渲染成「峰值 NaN 先令」，而 Vega **一条日志都不打**、
  `tools/validate.cjs` 照样 PASS。正确做法是本例这样用 `aggregate` + `argmax`
  落成一个数据集再读（或者退一步写 `extent(pluck(...))[1]`）。

## 试一试（改练）

1. 把 `"padding": 0.12` 改成 `0.5`，观察柱宽变化。52 根柱子留一半间距会细成一片竖线。
2. **把 y 轴的 `nice` / `zero` 拆开看。** 小麦价的极值是 `[26, 99]`，四种组合各不相同
   （用 `node tools/inspect.cjs 01` 读 domain 验证）：

   | `zero` | `nice` | y domain | 顶端刻度 |
   | --- | --- | --- | --- |
   | `true` | `true`（现状） | `[0, 100]` | 0,10,…,100 |
   | `true` | 去掉 | `[0, 99]` | 0,10,…,90（轴线末端不落在刻度上） |
   | `false` | `true` | `[20, 100]` | `nice` 把下端也向外取整到 20 |
   | `false` | 去掉 | `[26, 99]` | 真实极值，柱子被压成上半截 |

   最后一行正是「柱状图为什么必须 `zero: true`」的活例子：不从 0 起，1600 年的 27 先令
   看上去只有 1810 年 99 先令的**十几分之一**，而真实比例是 27:99。
3. 把左轴的 `"format": "d"` 去掉。本例的刻度全是整数，**看不出差别**；
   再把 `zero` 改成 `false` 并把 `nice` 去掉、给左轴加 `"tickCount": 7`，
   这时默认格式会吐出 `26.4` 这类小数——`format` 是在给这种情况兜底的。
4. 新增一个 `hover` 属性，比如 `"fillOpacity": 0.6`；再试着把整个 `update` 块删掉，
   看鼠标移出后颜色为什么卡在红色不复位。
5. **缺失字段练习（重要）。** 把 y 比例尺的 `field` 和 rect 的 `enter.y` 都改成
   `"wages"`（并暂时删掉 `peak` 数据集与那个 text 标记）：domain 变成 `[0, 30]`，
   而**最后两根柱子（1815、1820）直接消失**——因为这两行没有 `wages` 键，
   `scale('y', undefined)` 得到 `undefined`，矩形的 `height` 成了 `NaN`。
   关键在于：Vega **不报 WARN、不报 ERROR**，场景图里那两个 rect 项照样存在，
   只是画不出来。这就是 AGENTS.md 里「有缺失值的数据集要先 `filter` 掉 null」那条的由来，
   过滤写法见 [demo 03](../03-scatter-regression/)。
6. 把 `peak` 的 `argmax` 改成 `argmin`（`as` 改成同名即可），标注会跳到 1600 年 27 先令；
   再试着把两个 `formula` 删掉，直接在 text 的 `signal` 里写 `datum.top.year`——
   也能出图，但比例尺就没法用 `field` 引用了，这就是要摊平的原因。
7. 把 `"url"` 换成 `"../../assets/data/monarchs.json"`（字段名完全对不上）并跑
   `node tools/validate.cjs 01`：这次 Vega 会打出
   `WARN Infinite extent for field "wheat": [Infinity, -Infinity]`，校验器把它当失败拦下。
   和第 5 条对照着看——**整列缺失**有 WARN 兜底，**个别行缺字段**一声不吭，
   后者才是要靠 `filter` 自己防的。

## 参考

- 官方文档：[Spec 概览](https://vega.github.io/vega/docs/specification/) ·
  [Scales](https://vega.github.io/vega/docs/scales/) ·
  [Axes](https://vega.github.io/vega/docs/axes/) ·
  [Marks](https://vega.github.io/vega/docs/marks/) ·
  [aggregate 变换](https://vega.github.io/vega/docs/transforms/aggregate/)
- 数据出处：William Playfair, *The Commercial and Political Atlas*, 第三版, 1821
  （`assets/data/wheat.json`，与 Vega 官方示例库同源）
