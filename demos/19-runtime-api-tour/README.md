# 19 · View API 全览：双渲染器 / 事件与信号监听 / 导出 / 动态尺寸

## 学习目标

spec 只描述"图表长什么样"；这个 demo 的主角是 `main.js`：把 Vega 视图当作一个
**可编程的运行时对象**来操作——同一 spec 渲染两份、监听事件与信号、导出图片、动态改尺寸。

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/demos/19-runtime-api-tour/
```

## spec 逐段讲解

本图（cars 散点）本身没有新语法，重点在 main.js。spec 只有一处是本 demo 的关键前提：

> 轴标题的一处语义提醒：`Miles_per_Gallon`（mpg）是**每加仑行驶多少英里**，属于燃油经济性指标，
> **值越大越省油**；中文"油耗"（L/100km）方向恰好相反。本例 y 轴 domain 是 5–50，
> 图上靠顶部的 40+ mpg 是轻量小车（mazda glc 46.6、honda civic 44.6），
> 靠底部的 9–10 mpg 是重型 V8（hi 1200d、ford f250），与 Horsepower 的相关系数约 -0.78。
> 所以轴标题写成"每加仑英里数，越大越省油"，不要写"油耗"——否则读者会把结论读反。

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `signals` | 声明 `pointSize` 并 `bind` 成滑块 | 每个 View 会各自渲染一个滑块；`addSignalListener` 监听的也是某个 View 的 signal |
| `scales[].range` | `"range": "width"` / `"height"` | **动态尺寸能生效的前提**：比例尺区间跟随 width/height 信号，`view.width(480)` 才会让图表伸缩 |
| `marks[].encode.update.size` | 点大小绑定 `{"signal": "pointSize"}` | 滑块改动 → signal 更新 → 触发监听器并重绘 |

### View 生命周期（对照 main.js 阅读）

| 步骤 | API | 发生了什么 |
| --- | --- | --- |
| 1. 编译 | `vega.parse(spec)` | JSON → 运行时描述（数据流图定义）。纯计算、不画图；产物可复用给多个 View |
| 2. 构造 | `new vega.View(runtime, {renderer, logLevel})` | 创建视图实例：自己的场景图、数据流、事件配置。`renderer: 'canvas'/'svg'/'none'` 只决定画到哪 |
| 3. 挂载 | `.initialize(domElement)` | 在容器里创建渲染器与事件处理器；带 `bind` 的 signal 控件也在这里生成 |
| 4. 悬停 | `.hover()` | 启用内置 hover 事件处理，驱动 encode 的 `hover` 集 |
| 5. 运行 | `.runAsync()` / `.run()` | 跑数据流（加载数据 → 变换 → 编码 → 渲染）。异步因为有数据加载；返回 Promise |
| 6. 销毁 | `.finalize()` | 移除 DOM 监听器、停掉定时器、释放渲染器。单页应用切换页面时必须调，本 demo 页面生命周期即会话故未演示 |

### 运行时操作（按钮区）

| 操作 | API | 说明 |
| --- | --- | --- |
| 点击拾取 | `view.addEventListener('click', (event, item) => …)` | `item.datum` 是图形背后的数据行；空白处 item 为空 |
| 信号监听 | `view.addSignalListener(name, (name, value) => …)` | 挂在**单个 View** 上；拖 canvas 视图的滑块不会触发 svg 视图的回调 |
| 导出 SVG | `await view.toSVG()` → Blob 下载 | 与当前渲染器无关：canvas 视图也能从场景图重新生成矢量 SVG |
| 导出 PNG | `await view.toCanvas(2)` → `toDataURL` 下载 | 参数是缩放倍数（2 = 两倍清晰度）；Node 里需要 node-canvas（见 demo 21） |
| 动态尺寸 | `view.width(w).height(h).runAsync()` | width/height 本质是同名 signal；改完必须再跑一次数据流 |

## 试一试（改练）

1. 在 main.js 里给 `viewSvg` 也注册 `mouseover` 监听器，对比两种渲染器的事件拾取差异。
2. 把 `toCanvas(2)` 改成 `toCanvas(1)`，对比下载 PNG 的像素尺寸。
3. 把 spec 里 x 轴 scale 的 `"range": "width"` 改成 `[0, 520]`（写死），再点"切换尺寸"，观察图表不再伸缩。
4. 用 `view.getState({signals: vega.falsy})` 把当前 signal 状态打进日志（官方文档 State 一节）。
5. 页面卸载前补一句 `viewCanvas.finalize()`，体会它和"直接关页面"的区别（在 SPA 里不 finalize 会泄漏监听器）。

## 参考

- 官方文档：[View API](https://vega.github.io/vega/docs/api/view/) ·
  [Event Listeners](https://vega.github.io/vega/docs/api/view/#view_addEventListener) ·
  [Signals at runtime](https://vega.github.io/vega/docs/api/view/#view_signal)
- 源码：[packages/vega-view/src/View.js](../../../packages/vega-view/src/View.js)
