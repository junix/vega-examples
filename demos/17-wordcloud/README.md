# 17 · 词云（Wordcloud）

## 学习目标

学会用 `wordcloud` 变换做文字云布局：inline 数据准备词表（词、权重、类别、旋转角、字重），
理解变换如何把布局结果（x/y/fontSize/angle 等）**回写到数据元组**上供 text 标记编码，
以及如何用 signal 实时驱动布局参数。

## 运行

```sh
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/17-wordcloud/
```

> **注意**：wordcloud 布局要用浏览器 canvas 测量每个词的像素包围盒，Node 无头环境没有 canvas，
> 因此本 demo 在 `tools/validate.cjs` 中登记为 **parse-only**（只校验 `vega.parse`，不无头运行），
> 想看效果请在浏览器中打开。

## spec 逐段讲解

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` | 交互参数 | `padding`、`maxFont` 都带 `bind` 滑杆；它们被 wordcloud 参数引用，拖动即触发整体重排 |
| `data.words.values` | 词表 | 38 条 inline 记录：`text` 词、`weight` 权重、`cat` 类别、`rot` 旋转角（0/90）、`fw` 字重（bold/normal） |
| `data.words.transform[0]` | 词云布局 | `wordcloud` 变换：`size` 取绘图区宽高（signal 引用）；`text` 指定词字段；`fontSize: {field: "weight"}` 声明“字号随权重变化” |
| （变换内部） | 权重→字号映射 | 当 `fontSize` 是字段引用时，变换内部用 `fontSizeRange` 建一个 **sqrt 比例尺**：权重越大字号越大，平方根让面积（而非字高）更接近线性感知 |
| `fontWeight` / `rotate` | 字重与旋转 | 都按字段逐词取值：`fw` 给 bold/normal，`rot` 给 0 或 90 度（竖排词用来填充空隙） |
| `padding`（变换参数） | 词间距 | 每个词的包围盒向外扩的像素数；这里绑到 signal 滑杆 |
| `scales.color` | 类别配色 | `ordinal` 比例尺把 5 个类别映射到 5 个颜色；domain 直接取数据的 `cat` 字段去重值 |
| `marks[0]` | 文字绘制 | `text` 标记；**布局结果的回写字段** `x` / `y` / `angle` / `fontSize` / `fontWeight` / `font` 都在 `update` 里按字段绑定 |

### 关键概念

- **变换回写约定**：`wordcloud` 默认把结果写到元组的 `x`、`y`、`font`、`fontSize`、`fontStyle`、
  `fontWeight`、`angle` 七个字段（可用变换的 `as` 改名）。标记端再用 `{ "field": "x" }` 等绑定这些字段——
  这是 vega 布局类变换（force、treemap、voronoi…）的统一套路。
- **字号不是线性映射**：变换内部用 sqrt 比例尺把 `[权重最小值, 权重最大值]` 映射到 `fontSizeRange`，
  避免大权重的词面积过大。想关掉这层映射就不要给 `fontSizeRange`（退化为直接使用字段值）。
- **为什么字段名不冲突**：输入字段叫 `weight` / `fw` / `rot`，输出字段叫 `fontSize` / `fontWeight` / `angle`，
  命名错开才互不覆盖。
- **放不下的词会被丢弃**：画布太小或 `padding` 太大时，布局会放弃排不下的词（其 `x`/`y` 为 NaN，
  不会被画出）。把 `maxFont` 调小可以看到更多词被排进来。

## 试一试（改练）

1. 把某个高频词的 `weight` 改成 300，观察 sqrt 映射下它并不会等比放大。
2. 把 `"rotate": { "field": "rot" }` 改成 `{ "value": 0 }`，所有词变横排，比较填充率变化。
3. 加一条 `"spiral": "rectangular"` 参数，比较两种螺旋放置策略的形状差异。
4. 把 `fontSizeRange` 下限从 14 调到 24，观察哪些词因为太大而被丢弃。

## 参考

- 官方示例：[Word Cloud](https://vega.github.io/vega/examples/word-cloud/)
- 官方文档：[wordcloud 变换](https://vega.github.io/vega/docs/transforms/wordcloud/) ·
  [text 标记](https://vega.github.io/vega/docs/marks/text/) ·
  [Signals 与 bind](https://vega.github.io/vega/docs/signals/)
