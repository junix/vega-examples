# 20 · 自定义 Transform 与表达式函数：扩展 Vega 的两条正交途径

## 学习目标

Vega 的内置变换和表达式函数足够覆盖大多数场景，但当你需要自定义的数据处理逻辑
或数学运算时，有两条正交的扩展途径：

1. **自定义 Transform** —— 继承 `vega.Transform`，注册进 `vega.transforms` 注册表，
   spec 里就能写 `{ "type": "MovingAverage", ... }`。
2. **自定义表达式函数** —— `vega.expressionFunction(name, fn)`，
   spec 的任意表达式里就能调用 `pctChange(...)`。

铁律：**注册必须先于 `vega.parse`**——parse 阶段就要解析 transform 类型名、编译表达式。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/20-custom-transform-expr/
```

## spec 逐段讲解

`spec.vg.json` 只含**内置语法**（保证无头校验器也能解析），依赖扩展的片段在
`main.js` 里动态注入。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` | 加载 stocks.csv，过滤出 MSFT | `filter` + `collect` 排序是内置变换，不含自定义扩展 |
| `scales` | 时间 x 轴 + 线性 y 轴 | 与 demo 02 相同的 scale 写法；股价不以 0 为基准，y 轴显式 `"zero": false` |
| `marks[0]` | 灰色折线（原始收盘价） | 纯内置 mark，不依赖任何自定义扩展 |

### 先看清数据频率：`stocks.csv` 是**月频**

`assets/data/stocks.csv` 里 MSFT 共 **123 行**，覆盖 **2000-01 … 2010-03**，
每行的 `date` 都是**当月 1 日**（`Jan 1 2000`、`Feb 1 2000`…）——
它是月度收盘序列，不是日线。由此推出两条本 demo 必须守住的口径：

- `maWindow = 20` 是 **20 个月（≈1.7 年）**的长期均线，**不是** 20 个交易日；
  滑块拉到 `max = 60` 就是 **5 年**均线。图例文字因此写「N 个月滑动平均」。
- `latest` / `previous` 是**相邻两个月**，`pctChange` 算出来的是**月环比**，
  不是「较前一交易日」。注释文本因此写 `timeFormat(latest.date, '%Y-%m')` +「较上月」。

把月频数据按「日」口径叙述，是这类金融序列 demo 最容易犯的错——
先 `node tools/inspect.cjs 20 --rows 6` 看一眼真实日期，再动手写文案。

### main.js 注入的扩展片段

| 片段 | 注册方式 | 在 spec 中的作用 |
| --- | --- | --- |
| `MovingAverage` Transform | `vega.transforms.movingaverage = MovingAverage` | 在数据管线末尾计算滑动平均，写入 `ma` 字段 |
| `pctChange` 函数 | `vega.expressionFunction('pctChange', fn)` | 左上角注释文本里计算**月环比**涨跌幅百分比 |
| `maWindow` signal | `spec.signals.push(...)` | 滑块控制窗口大小，`{signal: 'maWindow'}` 触发 `_.modified()` 全量重算 |

### 自定义 Transform 的骨架

```
构造函数        → vega.Transform.call(this, null, params)
Definition      → 声明 type / metadata / params（类型名、参数表、是否修改元组）
inherits        → vega.inherits(MyTransform, vega.Transform, { transform(_, pulse) {...} })
注册            → vega.transforms[lowercaseName] = MyTransform
transform 方法  → pulse.visit(pulse.ADD, accumulate) + pulse.modifies(as)
```

关键 API：

| 方法 | 说明 |
| --- | --- |
| `pulse.visit(mode, fn)` | 遍历本次脉冲中的元组；`pulse.ADD` 只处理新增，`pulse.SOURCE` 全量 |
| `pulse.materialize().reflow(true)` | 参数变化时让所有现存元组重新流过 |
| `pulse.modifies(field)` | 声明写入了哪个字段，下游编码才能感知 |
| `_.modified()` | 参数是否变化（含 signal 引用变化、首次运行） |

### 坑一：窗口未填满的那一段不能给伪均值

最容易写错的一行是收尾的除法：

```js
if (w.length > n) w.shift();
for (i = 0; i < w.length; i++) sum += w[i];
t[as] = sum / w.length;      // ❌ 窗口只有 1 个值时，「均线」= 原始价本身
```

`sum / w.length` 在窗口填满前算的是「前 k 期均值」（k < n），却和右半段共用同一条线、
同一条图例说明。`maWindow = 20` 时前 19/123 个点失真；拖到 60 时前 59/123（48%）
的红线根本不是 60 期均线，而读者完全看不出分界 —— 最左端第 1 个点甚至与灰线重合。

本 demo 的写法是**窗口未填满就写 `null`**（语义等同 pandas `rolling(n).mean()` 的 `NaN`），
再用 line mark 的 `defined` 通道把这段断开：

```js
if (w.length < n) { t[as] = null; return; }   // 未填满：不产出
t[as] = sum / n;                              // 填满后分母恒为 n
```

```js
update: {
  y: { scale: 'y', field: 'ma' },
  defined: { signal: 'isValid(datum.ma)' }    // false → 断线，不画
}
```

于是红线永远比灰线短 `maWindow - 1` 个点，「红线只画真正的 n 期均值」这件事在图上一眼可见。
`defined` 是 line / area mark 的内建属性（渲染器按 `item.defined === false` 断开线段），
`isValid(v)` 是 Vega 内建表达式函数（`v != null && v === v`）。

### 坑二：会变的属性必须写在 `update`，不能写在 `enter`

`enter` 每个图元**只跑一次**。`pulse.materialize().reflow(true)` 触发的是
**modify** 而不是 add，重编码时 Vega 只跑 `update`。所以把随 `maWindow` 变化的属性
（`y: {field: 'ma'}`、`defined`、图例里的 `maWindow`）写进 `enter` 的后果是：

- `view.data('msft')` 里的 `ma` **确实**重算了（signal 从 20 调到 60，
  下标 100 那条 2008-05 记录的 `ma` 由 `28.658` 变成 `24.960`）；
- 但场景图里的 `item.y` 与图例文字**一个都不变** —— 滑块拖到底画面纹丝不动。

改成 `update` 之后同一个点的 `item.y` 会随之从 `163.65` 走到 `203.10`，画面才真的动。

这类 bug 特别隐蔽：算子逻辑、`pulse.modifies` 全对，日志也没有任何 WARN，
只是编码阶段把值锁在了 `enter`。判断标准很简单：**这个属性会不会因为 signal
或上游字段变化而改变？会，就放 `update`。** 只有真正恒定的常量（颜色、线宽、字号、
静态定位）才留在 `enter`。

## 试一试（改练）

1. 把 `maWindow` 的 `max` 从 60 改为 120（= 10 年），拖到最大值：红线只剩最后 4 个点，
   灰线仍是完整 123 点 —— 窗口填不满就不画线的规则，在极端参数下变得格外直观。
2. 在 `MovingAverage.transform` 里加一行 `console.log(pulse.ADD, pulse.SOURCE)`，
   拖滑块时观察哪些模式被触发。
3. 新增一个自定义表达式函数 `clamp(val, lo, hi)`，在注释文本里用它限制百分比范围。
4. 把 `pulse.visit(pulse.ADD, accumulate)` 改成 `pulse.visit(pulse.SOURCE, accumulate)`
   （去掉 `if (mod)` 分支），拖滑块时观察性能差异。
5. 参考 `packages/vega-transforms/src/Formula.js`，给 `MovingAverage` 补上 `pulse.COUNT`
   增量路径（提示：维护一个累加和，ADD 时加、REM 时减）。
6. 复现「坑一」：把 `if (w.length < n) { t[as] = null; return; }` 删掉、除法改回
   `sum / w.length`，滑块拉到 60 —— 红线最左端会一路贴上灰线，凭肉眼分不出
   哪一段才是真正的 60 期均线。
7. 复现「坑二」：把红线 `update` 里的 `y` / `defined` 搬回 `enter`，
   再拖滑块 —— 控制台里 `__vegaDemo.views[0].view.data('msft')[100].ma` 会变（28.658 → 24.960），
   但图上的红线一动不动。这是「数据对了、画面没动」的经典现场。

## 参考

- 官方文档：[Custom Transforms](https://vega.github.io/vega/docs/api/extensibility/) ·
  [Expression Functions](https://vega.github.io/vega/docs/api/extensibility/#expression-functions)
- 源码：[packages/vega-transforms/src/Formula.js](../../../packages/vega-transforms/src/Formula.js)（自定义 Transform 的范本）
- 源码：[packages/vega-util/src/inherits.js](../../../packages/vega-util/src/inherits.js)
