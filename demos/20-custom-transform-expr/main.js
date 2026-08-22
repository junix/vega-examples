/* demo 20 入口：自定义 Transform 与表达式函数。
 *
 * Vega 的两条正交扩展途径：
 *   1. 自定义 Transform —— 继承 vega.Transform，注册进 vega.transforms 注册表，
 *      之后 spec 里就能写 { "type": "MovingAverage", ... }；
 *   2. 自定义表达式函数 —— vega.expressionFunction(name, fn)，
 *      之后 spec 的表达式（signal / encode / format 等）里就能调用 pctChange(...)。
 *
 * 铁律：注册必须先于 vega.parse —— parse 阶段就要解析 transform 类型名、
 * 编译表达式。反过来，一份引用了未注册扩展的 spec 会在 parse 时直接报错。
 */
(function () {
  'use strict';

  /* ================= 第 1 步：定义自定义 Transform =================
   * 写法照搬 packages/vega-transforms/src/Formula.js（改动字段的最小范例）：
   * 构造函数调 vega.Transform.call → 类上挂 Definition → vega.inherits 挂 transform 方法。
   */
  function MovingAverage(params) {
    vega.Transform.call(this, null, params);
    this._win = [];   // 滑动窗口：最近 N 个字段值
  }

  /* Definition 告诉解析器：类型名、元数据、参数表。
   * - metadata.modifies：本算子会给现有元组写入新字段；
   * - 'type': 'field' 的参数会在 parse 时被编译成字段访问器函数；
   * - 'type': 'number'/'string' 的参数允许写成 {signal: ...} 引用（本例用它做窗口滑块）。 */
  MovingAverage.Definition = {
    'type': 'MovingAverage',
    'metadata': { 'modifies': true },
    'params': [
      { 'name': 'field',  'type': 'field',  'required': true },
      { 'name': 'window', 'type': 'number', 'default': 20 },
      { 'name': 'as',     'type': 'string', 'default': 'ma' }
    ]
  };

  vega.inherits(MovingAverage, vega.Transform, {
    /* _(参数值) 已按 Definition 解析完毕；pulse 是本次数据流脉冲。
     * 返回值是要传给下游的脉冲；返回 falsy 则原脉冲直通。 */
    transform: function (_, pulse) {
      var self  = this,
          field = _.field,                 // 访问器函数：field(datum) → 值
          as    = _.as || 'ma',
          n     = Math.max(1, _.window || 20),
          mod   = _.modified();            // 参数是否变化（含 signal 引用变化、首次运行）

      if (mod) {
        /* 参数变了（含首次运行、拖动 maWindow 滑块）：
         * 清空窗口，让数据流里现存的全部元组重新流过本算子，按 SOURCE 全量重算。
         * materialize().reflow(true) 的惯用法同样来自 Formula。 */
        self._win = [];
        pulse = pulse.materialize().reflow(true);
        pulse.visit(pulse.SOURCE, accumulate);
      } else {
        /* 常规情况只处理新增元组（ADD）。
         * 教学简化：未实现 REM 的增量移除（静态数据用不到）；
         * 数据频繁增删的生产实现应像 Aggregate 那样维护窗口与缓存。 */
        pulse.visit(pulse.ADD, accumulate);
      }

      /* 声明本算子写入了 as 字段，下游编码才会感知这次修改 */
      pulse.modifies(as);
      return pulse;

      function accumulate(t) {
        var w = self._win, sum = 0, i;
        w.push(+field(t));
        if (w.length > n) w.shift();
        for (i = 0; i < w.length; i++) sum += w[i];
        t[as] = sum / w.length;
      }
    }
  });

  /* 注册进 transforms 注册表。键名是小写类型名：
   * parse 时按 spec 里 type 的小写形式（'MovingAverage' → 'movingaverage'）查找。 */
  vega.transforms.movingaverage = MovingAverage;

  /* ================= 第 2 步：注册自定义表达式函数 =================
   * 纯函数、不需要访问场景图/比例尺，所以不需要第三个参数 visitor。
   * 之后任意表达式（signal、encode、format…）都能调用 pctChange(cur, prev)。 */
  vega.expressionFunction('pctChange', function (cur, prev) {
    return (prev == null || prev === 0) ? null : (cur - prev) / prev * 100;
  });

  /* ================= 第 3 步：加载 spec 并注入依赖扩展的片段 ==========
   * spec.vg.json 只含内置语法（保证无头校验器/其他工具用原装 vega 也能解析）；
   * 凡是依赖自定义扩展的片段都在这里注入 —— 注入发生在 parse 之前，顺序不能反。 */
  fetch('./spec.vg.json')
    .then(function (res) {
      if (!res.ok) throw new Error('加载 spec 失败: HTTP ' + res.status);
      return res.json();
    })
    .then(function (spec) {
      /* 3a. 注入信号：窗口大小滑块 + 供 pctChange 注释取数的两个信号 */
      spec.signals = (spec.signals || []).concat([
        { name: 'maWindow', value: 20, bind: { input: 'range', min: 2, max: 60, step: 1 } },
        { name: 'latest',   update: "peek(data('msft'))" },
        { name: 'previous', update: "data('msft')[length(data('msft')) - 2]" }
      ]);

      /* 3b. 在数据管线末尾注入自定义 transform。
       * window 写成 signal 引用 → 拖滑块会触发 _.modified() → 全量重算。 */
      spec.data[0].transform.push({
        type: 'MovingAverage', field: 'price', as: 'ma',
        window: { signal: 'maWindow' }
      });

      /* 3c. 注入依赖扩展的图形：滑动平均线 + 图例文字 + pctChange 注释 */
      spec.marks.push(
        {
          type: 'line',
          from: { data: 'msft' },
          encode: {
            enter: {
              x: { scale: 'x', field: 'date' },
              y: { scale: 'y', field: 'ma' },   // ma 是 MovingAverage 写出的字段
              stroke: { value: '#e45756' },
              strokeWidth: { value: 2 }
            }
          }
        },
        {
          type: 'text',
          encode: {
            enter: {
              x: { signal: 'width - 8' }, y: { value: 6 },
              align: { value: 'right' }, baseline: { value: 'top' },
              fontSize: { value: 12 },
              text: { signal: "'灰线 原始收盘价　红线 ' + maWindow + ' 日滑动平均'" },
              fill: { value: '#57606a' }
            }
          }
        },
        {
          type: 'text',
          encode: {
            enter: {
              x: { value: 8 }, y: { value: 6 },
              align: { value: 'left' }, baseline: { value: 'top' },
              fontSize: { value: 13 }, fill: { value: '#24292f' }
            },
            update: {
              text: {
                signal: "'MSFT 最新收盘 $' + format(latest.price, '.2f')"
                      + " + '（较前一交易日 ' + format(pctChange(latest.price, previous.price), '+.1f') + '%）'"
              }
            }
          }
        }
      );

      /* 第 4 步：注册与注入都完成后才 parse → 渲染 */
      var view = new vega.View(vega.parse(spec), { renderer: 'canvas', logLevel: vega.Warn })
        .initialize(document.querySelector('#view'))
        .hover();

      /* 右侧信号面板：显示 maWindow 实时值 */
      var cell = document.querySelector('#signals .v');
      view.addSignalListener('maWindow', function (name, value) {
        cell.textContent = JSON.stringify(value);
      });

      return view.runAsync().then(function () {
        cell.textContent = JSON.stringify(view.signal('maWindow'));
      });
    })
    .catch(function (err) { showDemoError(err); });
})();
