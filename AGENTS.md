# vega-examples 约定

本仓库是离线 Vega 教学 demo 集；目录契约和校验规则以 `tools/validate.cjs` 为准，不在本文复制版本号、demo 数量或数据集清单。

## Demo 契约

- 每个 `src/NN-slug/` 包含 `index.html`、`spec.vg.json`、`main.js` 和中文 `README.md`；元数据、必需章节与正文阈值由校验器检查。
- spec 与标识符使用英文；教学解释使用中文。新增或修改 demo 时同步首页登记和 `thumbs/<slug>.png`。
- 使用共享 `assets/demo.js` 注册 View；截图、导出和无头验证前等待 `window.__sceneReady === true`。
- SVG/PNG 从 Vega scenegraph 导出，不以屏幕截图代替；透明背景、尺寸和非空内容必须实际解码验证。
- CSV/TSV 显式声明 format；缺失值先过滤；数字和日期显式格式化；`size` 通道按面积理解。
- group 内不要假设 `range: "width"/"height"` 自动重绑；多序列排序、facet 与 signal 作用域必须用渲染结果验证。
- Node 校验无法覆盖真实 canvas、文字布局和溢出；涉及渲染、导出或布局时必须跑浏览器检查并看截图。

## 验证

- 常规改动：`just build && just test && just gallery-check`。
- 渲染或导出改动：再运行 `node tools/validate-browser.cjs --shots <dir>`。
- 新增/修改 demo：运行 `node tools/thumbs.cjs <slug>`，再用 `tools/inspect.cjs` 检查最终文本和数据。
