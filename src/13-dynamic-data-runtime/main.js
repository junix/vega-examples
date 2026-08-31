/* demo 13 入口：本 demo 的主角是 main.js——spec 只搭空架子，数据全部在运行时推入。
 *
 * 核心流程：
 *   1. renderDemo 渲染 spec（data "live" 初始 values 为空），返回 Promise<View>；
 *   2. 拿到 view 后用 vega.changeset() 组装一次增量变更，
 *      通过 view.change('live', changeset).runAsync() 推入数据流。
 *
 * changeset（vega-runtime 的 ChangeSet）语义：
 *   .insert(tuples)    插入元组，传单个对象或对象数组均可；
 *   .remove(pred)      传函数 → 谓词：删除数据集中所有令 pred(datum) 为真的已有元组；
 *                      传元组/数组 → 按引用删除指定元组；
 *   .modify(t, field, value)  修改已有元组的字段（本例未用）；
 *   .reflow()          强制下游算子全量重算（本例未用）。
 *   注意区分：spec 侧 data 的 on-trigger 里还有一个 toggle 指令（存在则删、不在则插），
 *   JS 侧的 ChangeSet 没有 toggle 方法；demo 12 用 signal 表达式实现了等价的切换。
 *
 * runAsync 与节流：view.change() 只是把变更登记到指定数据集，runAsync() 才异步驱动
 * 数据流重算（返回 Promise）。Vega 的重绘随动画帧合帧，高频调用 runAsync 不会每调用
 * 一次就重绘一次；数据流本身每次都会跑，但 500ms 一个点的频率对它毫无压力。
 */
renderDemo({ spec: './spec.vg.json', element: '#view', signals: '#signals' })
  .then(function (view) {
    var t = 0;        // 采样序号，单调递增，作为每个点的 x
    var v = 0;        // 随机游走的当前值
    var timer = null; // setInterval 句柄；null 表示处于暂停状态

    var btnToggle = document.querySelector('#btn-toggle');
    var btnStep = document.querySelector('#btn-step');
    var btnClear = document.querySelector('#btn-clear');

    /* 生成下一个随机游走点：每步在 ±2 之间均匀抖动，保留两位小数 */
    function nextPoint() {
      v += (Math.random() - 0.5) * 4;
      t += 1;
      return { t: t, v: Math.round(v * 100) / 100 };
    }

    /* 把一批新点推入数据集，同时剔除滑出窗口的旧点。
     * 保留条件：d.t > 当前最大 t - window，即恰好保留最近 window 个点。
     * points 传 [] 时退化为「只剔除」（拖 window 滑块时用）。 */
    function applyChanges(points) {
      var win = view.signal('window');
      var cs = vega.changeset()
        .insert(points)
        .remove(function (d) { return d.t <= t - win; });
      view.change('live', cs).runAsync();
    }

    function tick() {
      applyChanges(nextPoint());
    }

    function start() {
      if (timer) return;
      timer = setInterval(tick, 500);
      btnToggle.textContent = '暂停';
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      btnToggle.textContent = '开始';
    }

    btnToggle.addEventListener('click', function () {
      if (timer) stop(); else start();
    });

    btnStep.addEventListener('click', function () {
      stop(); // 单步时先停表，避免和定时器交错
      tick();
    });

    btnClear.addEventListener('click', function () {
      stop();
      t = 0;
      v = 0;
      // 谓词恒真 → 删除数据集中的全部元组；spec 里的坐标域会回落到空态默认值
      view.change('live', vega.changeset().remove(function () { return true; })).runAsync();
    });

    /* window 滑块变小时主动剔除旧点，不必等下一次插入 */
    view.addSignalListener('window', function () {
      applyChanges([]);
    });

    /* 预填一屏（window 默认值 40 个点），让页面打开即有图：
     * 一次 insert 整个数组 + 一次 runAsync，比逐点推入高效。 */
    var seed = [];
    for (var i = 0; i < 40; i += 1) seed.push(nextPoint());
    applyChanges(seed);
  });
