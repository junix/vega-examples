# 05 · 堆叠与分组柱状图

## 学习目标

- 用 `stack` 变换把同一类目下的多段数值「叠」起来：它按 `groupby` 分组、按 `sort`
  决定堆叠顺序，并为每条记录产出 `y0`（段起点）/ `y1`（段终点）两个新字段。
- 在**一个 spec 里放多个 `group` 标记当面板**：用 `encode.enter` 的 `x / y / width / height`
  给每个面板定位（本例下面板靠 `"y": {"signal": "panelGap"}` 垂直偏移），面板内部的
  比例尺、坐标轴、标记都写在 group 的子级里。
- **弄清 `range: "width" / "height"` 到底解析成什么** —— 这是 Vega 里最容易踩、
  而且踩了不报错的一个坑，本 demo 专门把它讲透（见下面「作用域陷阱」一节）。
- 掌握分组柱状图的经典模式：面板内再放一个 `from.facet` 的 group 标记，按 `age`
  拆成 19 个子分组，每个子分组内部定义自己的嵌套 band 比例尺（`x-sex`）来并排两根柱子。
- 用 `legend.encode.labels` 把图例里的原始值 `1 / 2` 改写成 `男 / 女`。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[population]` | 公共数据 | `filter` 保留 year 为 2000 的记录，再按 `(age, sex)` 聚合 `sum(people)`；两个面板共用这份结果 |
| `data[stacked]` | 堆叠专用数据 | `stack`：`groupby: ["age"]` 表示每个年龄独立成柱；`sort: {"field": "sex"}` 让 sex=1（男）在底部；产出字段显式命名为 `y0 / y1` |
| `scales[color]` | 共享颜色比例尺 | 顶层定义、两个面板共用，保证同色同义；domain 显式写 `[1, 2]` 固定顺序 |
| `legends` | 图例 | `fill: "color"` 生成符号图例；`encode.labels.update.text` 用信号表达式按 `datum.value` 改写显示文本 |
| `signals` | 面板几何 | `panelHeight` / `panelGap` 抽成信号，供 group 的 encode 与**局部 height 信号**共用一个数字 |
| `marks[stacked-panel]` | 上面板容器 | `group` 标记本身可被编码：灰色 `stroke` 描出面板范围；`width` 跟随视图、`height` 取 `panelHeight` |
| `marks[stacked-panel].signals` | **局部 height 信号** | `{"name": "height", "update": "panelHeight"}` —— 少了这一条，面板内 `y-stack` 的 `range: "height"` 会拿到顶层的 510 |
| 面板内 `scales / axes` | 面板局部比例尺与坐标轴 | 写在 group 子级 → 只作用于本面板；`y-stack` 的 domain 取堆叠终点 `y1`（即每柱总高） |
| 面板内 `marks[rect]` | 堆叠柱 | 一根柱子的每段：`y = y0`、`y2 = y1` 直接绑定 stack 产出字段，无需手算累加 |
| 面板内 `marks[text]` | 面板标题 | 不带 `from` 的标记只生成一个图形实例；`x` 取面板 `width` 信号右对齐 |
| `marks[grouped-panel]` | 下面板容器 | 结构同上面板，`y` 偏移 `panelGap`(290) 腾出上面板（`panelHeight`=220 高）加其 x 轴的空间；同样要声明局部 `height` 信号 |
| 面板内 `marks[age-group]` | 按年龄分面 | `from.facet`：`groupby: "age"` 为每个年龄生成一个子 group，facet 数据命名为 `by-age`；子组 `x` 用面板的 band 比例尺定位、`width` 取 `bandwidth('x-age-gr')` |
| `marks[age-group].signals` | **局部 width 信号** | `{"name": "width", "update": "bandwidth('x-age-gr')"}` —— 这正是官方 Grouped Bar Chart 例子里那句 signals 的作用 |
| 子组内 `scales[x-sex]` | 嵌套 band 比例尺 | 每个子组独立拥有一份；`range: "width"` 解析的是**上一行那条局部信号**，即这一格的带宽；domain 取自本组 facet 数据 `by-age` 的 `sex` 字段 |
| 子组内 `marks[rect]` | 分组柱 | `x = x-sex(sex)` 并排两根柱；`y / y2` 用的是**面板的** `y-group` 比例尺——子组坐标原点与面板对齐，所以数值坐标一致 |

### 作用域陷阱：`range: "width" / "height"` 不会自动跟随 group

`range: "width"` 的含义是「取当前作用域里名为 `width` 的信号」，
**不是**「取这个 group 的宽度」。而 group mark 默认**不会**为自己重新绑定 `width` / `height`
信号 —— 它继承外层的。所以：

```jsonc
// 错的：面板只有 220 高，但 y 轴按 510（顶层 height）铺开，柱子直接冲出面板
{
  "type": "group",
  "encode": { "enter": { "height": { "value": 220 } } },
  "scales": [{ "name": "y", "type": "linear", "range": "height", ... }]
}

// 对的：显式声明这个作用域里的 height 是多少
{
  "type": "group",
  "encode": { "enter": { "height": { "signal": "panelHeight" } } },
  "signals": [{ "name": "height", "update": "panelHeight" }],
  "scales": [{ "name": "y", "type": "linear", "range": "height", ... }]
}
```

facet 子组同理，而且更隐蔽：`x-sex` 的 `range: "width"` 如果拿到顶层的 640，
每个年龄格里的两根柱子都会有 640px 宽，19 格互相重叠成一片色块。修法是
`"signals": [{"name": "width", "update": "bandwidth('x-age-gr')"}]`。

**为什么必须靠肉眼或工具去抓**：这个错误不会让 `vega.parse` 报错、不会让数据流报错、
`view.toSVG()` 也照样吐出一张"有内容"的 SVG。本项目的 `node tools/validate.cjs`
因此专门加了一条布局溢出检查 —— 量场景图的实际包围盒，探出声明尺寸太多就判失败。

## 试一试

1. 把 `filter` 的 `2000` 改成 `1990` 或 `1850`，两个面板会一起换数据（它们共用 `population`）。
2. 把 `stack` 的 `sort` 改成 `{"field": "sex", "order": "descending"}`，男女色块上下互换。
3. 改顶层的 `panelHeight` / `panelGap` 信号，观察面板布局如何完全由这两个数值控制
   （注意：因为局部 height 信号引用的就是 `panelHeight`，改一处两边同时跟随）。
4. **把 `marks[age-group].signals` 整段删掉再刷新** —— 复现上面讲的作用域陷阱，
   看柱子怎么糊成一片；然后 `node tools/validate.cjs 05` 会报「布局溢出」。
   再把 `marks[stacked-panel].signals` 也删掉，看上面板怎么冲出边框。
5. 把嵌套比例尺 `x-sex` 的 `padding` 从 `0.12` 调到 `0.5`，组内两根柱变瘦；再给外层
   `x-age-gr` 的 `padding` 调到 `0.4`，组与组之间拉开。
6. 给下面板的 rect 去掉 `hover` 编码集，对比上下两个面板的悬停体验。
7. 进阶：给堆叠柱的每段加 `text` 标记显示数值（`y` 取 `y0` 与 `y1` 的中点需要信号表达式，
   想想怎么写）。

## 参考

- 官方示例：[Stacked Bar Chart](https://vega.github.io/vega/examples/stacked-bar-chart/) ·
  [Grouped Bar Chart](https://vega.github.io/vega/examples/grouped-bar-chart/) ·
  [Nested Bar Chart](https://vega.github.io/vega/examples/nested-bar-chart/)
- 官方文档：[stack 变换](https://vega.github.io/vega/docs/transforms/stack/) ·
  [group 标记](https://vega.github.io/vega/docs/marks/group/) ·
  [Legends（encode 段落）](https://vega.github.io/vega/docs/legends/)
