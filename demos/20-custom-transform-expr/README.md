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
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/20-custom-transform-expr/
```

## spec 逐段讲解

`spec.vg.json` 只含**内置语法**（保证无头校验器也能解析），依赖扩展的片段在
`main.js` 里动态注入。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `data[0]` | 加载 stocks.csv，过滤出 MSFT | `filter` + `collect` 排序是内置变换，不含自定义扩展 |
| `scales` | 时间 x 轴 + 线性 y 轴 | 与 demo 02 相同的 scale 写法 |
| `marks[0]` | 灰色折线（原始收盘价） | 纯内置 mark，不依赖任何自定义扩展 |

### main.js 注入的扩展片段

| 片段 | 注册方式 | 在 spec 中的作用 |
| --- | --- | --- |
| `MovingAverage` Transform | `vega.transforms.movingaverage = MovingAverage` | 在数据管线末尾计算滑动平均，写入 `ma` 字段 |
| `pctChange` 函数 | `vega.expressionFunction('pctChange', fn)` | 左上角注释文本里计算涨跌幅百分比 |
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

## 试一试（改练）

1. 把 `maWindow` 的 `max` 从 60 改为 120，拖到最大值，观察红线变得多么平滑。
2. 在 `MovingAverage.transform` 里加一行 `console.log(pulse.ADD, pulse.SOURCE)`，
   拖滑块时观察哪些模式被触发。
3. 新增一个自定义表达式函数 `clamp(val, lo, hi)`，在注释文本里用它限制百分比范围。
4. 把 `pulse.visit(pulse.ADD, accumulate)` 改成 `pulse.visit(pulse.SOURCE, accumulate)`
   （去掉 `if (mod)` 分支），拖滑块时观察性能差异。
5. 参考 `packages/vega-transforms/src/Formula.js`，给 `MovingAverage` 补上 `pulse.COUNT`
   增量路径（提示：维护一个累加和，ADD 时加、REM 时减）。

## 参考

- 官方文档：[Custom Transforms](https://vega.github.io/vega/docs/api/extensibility/) ·
  [Expression Functions](https://vega.github.io/vega/docs/api/extensibility/#expression-functions)
- 源码：[packages/vega-transforms/src/Formula.js](../../../packages/vega-transforms/src/Formula.js)（自定义 Transform 的范本）
- 源码：[packages/vega-util/src/inherits.js](../../../packages/vega-util/src/inherits.js)
