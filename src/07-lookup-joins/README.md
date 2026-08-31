# 07 · lookup 表连接：主表扩展、default 兜底与反向聚合

## 学习目标

掌握 Vega 的 `lookup` 变换（相当于 SQL 的 LEFT JOIN）：以哪张表为主表、匹配结果长什么样、
`values`/`default` 两个参数如何改变输出形态，以及反向连接后如何配合 `aggregate`
做出「每组统计 + 成员名单」的图。

两张原始表：

- `lookup_people.csv`：9 行，`name, age, height`（人 → 年龄/身高）
- `lookup_groups.csv`：9 行，`group, person`（组 → 组成员，`person` 引用 `people.name`）

## 运行

```sh
../../serve.sh        # 在本项目根目录启动静态服务器
# 浏览器打开 http://localhost:8000/src/07-lookup-joins/
```

## spec 逐段讲解

### 关键语义：lookup 挂回的是「单个匹配行对象」

`lookup` 在 from 表上按 `key` 建索引（内部是 TupleIndex，**假设 key 唯一**；from 表若有重复
key，后出现的行会覆盖先出现的）。主表每行按 `fields` 取出自己的键值去索引里查：

- 查到了 → 把**那一个匹配行对象**整体写到 `as` 字段（本例 `membership`），取字段写作
  `datum.membership.group`；它是对象不是数组，不需要 `membership[0]` 这样的下标。
- 没查到 → 写入 `default`（不给 `default` 参数时默认 `null`）。

若想得到「一组的全部成员数组」，方向要反过来想：lookup 只做 1:1 拼接；1:N 的列表用
`aggregate` 的 `values` 操作把同组行收集成数组（本例 `group_roster`），再用表达式处理。

### data 段

| 数据集 / 变换 | 输入 | 输出 | 讲解 |
| --- | --- | --- | --- |
| `people` / `groups` | 两个 CSV（url 加载） | 原样行 | **必须显式写 `"format": {"type": "csv"}`** —— Vega 不按扩展名推断，漏了会当 JSON 解析，整张表退化成 1 行 `{data: "name,age,height\nAlan,25,180…"}`。**类型也不会自动推断**：只写 `type: "csv"` 时 `age`/`height` 全是字符串 `"25"`，所以本例显式写了 `parse: {"age": "number", "height": "number"}`（写 `parse: "auto"` 让它自动推也可以） |
| `newcomers` | inline `values` | 1 行 Zoe | 人为构造的无匹配人员，专门触发 lookup 失败分支 |
| `roster` | `source: ["people", "newcomers"]` | 10 行 | **source 写数组 = 多表 union 合并**，同一个变换管线处理合并结果 |
| `roster` → lookup（as `membership`） | 上一步 | 每行挂匹配到的 groups 行对象 | 全字段行对象形态：未给 `values` 时拷贝整条记录 |
| `roster` → lookup（values+default） | 上一步 | 每行新增 `group_flat` | **平铺形态**：给了 `values: ["group"]` 就只拷贝该字段的标量值；Zoe 未匹配 → 写入 `default: "?"` |
| `roster` → formula `group_id` | 上一步 | 数值组号或 null | `datum.membership ? datum.membership.group : null`：对象形态的标准取法 |
| `roster` → formula + collect + window | 上一步 | `sort_key` → 排序 → `idx` 行号 | 未匹配者排最后；`window` 的 `row_number` 给文本行算 y 坐标 |
| `members` → lookup | source: `groups` | 9 行，平铺回 `age`,`height` | **反向连接**：主表换成 groups；`values` 多字段、省略 `as` 时直接用 values 的名字 |
| `group_stats` → aggregate | `members` | 每组一行：`avg_height`, `n` | 连接之后的常规分组统计 |
| `group_roster` → aggregate(values) + formula | source: `groups` | 每组一行：`member_list` 行数组 + `member_names` | aggregate 的 `values` 操作把组内整条数据行收进数组（fields 必须给非 null 字段，但收集的是整行）；`pluck(datum.member_list,'person')` 抽出名字数组，`join(...,'、')` 拼成一行文本 |

### 顶层 signals：面板几何

两个面板的位置与尺寸抽成了 `panelAW/panelAH/panelBX/panelBW/panelBH/panelTop` 六个信号。
这不是为了「可配置」，而是因为 **group 的 `encode`（决定坐标轴画在哪）与 group 的局部 `width`/`height` 信号
（决定比例尺 range 铺多宽）必须是同一个数字**，写两遍字面量迟早会写歪。

### marks 段

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `panelA`（group mark） | 左面板容器 | 不带 `from` 的 group mark 只实例化一次，当定位容器用；`title` 直接写在 group 上 |
| panelA 内 `signals` | **局部 `width`/`height` 信号** | `range: "width"/"height"` 的含义是「取当前作用域里名为 width/height 的信号」，group mark **不会**自动把它重绑成自己的宽高 —— 所以这里必须写 `[{"name":"width","update":"panelAW"},{"name":"height","update":"panelAH"}]`，见下节「作用域陷阱」 |
| panelA 内 `scales`/`axes` | 面板局部坐标系 | 有了上面那对局部信号，`xg`/`yg` 的 `range` 才落在 380×210 的面板里；`yg` 的 `domainMax: 200` 是给柱顶那行数值标注留出空间（不写的话 `nice` 只到 180，最高的柱子顶到面板上沿） |
| panelA 内 `rect` + `text` | 柱子与数值标注 | 数据源 `group_stats`；标注里同时拼均值与样本数 `n`；`rect` 的 `encode` 里 **`hover` 必须配一个 `update`**，见下节「hover 必须成对」 |
| panelA 内 `text`（from `group_roster`） | 成员名单 | 与柱子共用 `xg` 比例尺按 `group` 对齐；`band: 0.5` 居中 |
| `panelB`（group mark） | 右面板容器 | 纯文本清单；每行 y 用 `datum.idx` 信号表达式计算 |
| panelB 内 `text`（from `roster`） | 匹配结果清单 | `fill` 用信号按 `datum.membership` 是否存在着色；Zoe 行展示 `group_flat` 的 default 值 |

### 作用域陷阱：group 里的 `range: "width"/"height"`

这是 Vega 最容易踩、且**完全不报错**的坑，本 demo 的左面板专门演示它的正确写法：

- `"range": "width"` 不是「铺满这个 group」，而是「查当前作用域里名为 `width` 的信号」。
  group mark 建立了新的信号作用域，但**不会**往里注入自己的宽高。
- 少了局部信号，`xg`/`yg` 会一路查到顶层的 `width: 780` / `height: 320`：
  柱子铺到 x=720、高 318px，糊出面板、压到右面板身上，而 `vega.parse`、数据流、`toSVG` 全都照样通过。
- 顺带一提，左轴 `grid: true` 的网格线长度取的也是作用域里的 `width` 信号（源码 `axisGrid` 里那句
  `ifX(orient, {signal:'height'}, {signal:'width'})`），所以局部 `width` 信号少不了。
- 两种修法：① 在 group 上声明同名局部信号（本例采用，与 src/05、src/08 一致）；
  ② 把 `range` 写成显式区间，如 `[0, {"signal": "panelAH"}]`。
- 注意坐标轴的位置是按 group **item** 的 `width`/`height`（也就是 `encode` 里那两个值）算的，
  比例尺 range 是按**信号**算的 —— 两者不一致时轴和柱子就会错位，所以本例让它们共用同一对信号。
- `node tools/validate.cjs` 的布局溢出检查就是为抓这个坑加的，但它有 300px 的容差（要给轴标签、图例留位置）。
  本 demo 出事的量级刚好在容差以内 —— 犯错版本的实测是「探出 左47/上41/右92/下26px」，**校验器照样报 PASS**。
  所以这类坑最终得靠 `node tools/inspect.cjs 07`（看比例尺 range 与 SVG 文字）
  和 `node tools/validate-browser.cjs 07 --shots <目录>`（直接看图）确认。

### hover 必须成对：`hover` 集要配一个 `update` 集

柱子的 `encode` 里除了 `enter` + `hover`，还写了一个看似多余的
`"update": {"fillOpacity": {"value": 1}}`。它是必需的：

- 指针移入时 Vega 发的编码指令是 `['hover']`，移出时发的是 `['update', 'hover']`。
- `Encode` 变换收到数组形式的指令时，会**先检查数组里每个集合是否都存在**，缺一个就直接
  `return pulse.StopPropagation`（源码注释原话：*only run the update set if the hover set is defined*）。
- 于是只写 `enter` + `hover` 时，移出事件被整条吞掉，`fillOpacity: 0.7` 永久留在柱子上，
  鼠标划过几根柱子就花几根。补上 `update` 集后，移出会把它复位成 1。

## 试一试（改练）

1. 把 roster 的第一个 lookup 的 `as` 去掉，看 parse 报错信息（未给 `values` 时 `as` 必填）。
2. 把 `default: "?"` 改成 `"0"` 或删掉该参数，观察 Zoe 行 `group_flat` 的变化。
3. 在 `newcomers` 里再加一行已在 groups 中出现的名字（如 `Alan`），观察重复主表键
   各自都能匹配（lookup 不要求主表键唯一，只要求 from 表键唯一）。
4. 把 `members` 里 lookup 的 `values: ["age", "height"]` 删掉、加 `"as": ["person_info"]`，
   然后把 `group_stats` 的 aggregate 字段改成 `person_info.height`，体会两种形态的取舍。
5. 给左面板按 `n` 给柱子上色（新增 ordinal scale），或把 `avg_height` 换成 `mean(age)`。
6. 把 panelA 的局部 `signals` 整段删掉再刷新页面：柱子会按顶层 780×320 铺开、糊出面板、
   压到右面板底下。注意 `node tools/validate.cjs 07` 这时**仍然报 PASS**（探出量在 300px 容差内），
   得用 `--shots` 出图或读 `inspect` 的比例尺 range 才看得出来 —— 校验器绿了不等于图对了。
7. 把柱子 `encode` 里的 `update` 集删掉，鼠标反复划过柱子：变淡的柱子不会再恢复。
8. 把 `people` 的 `format.parse` 删掉，看 `height` 变成字符串后平均身高算成什么
   （再把 `format.type` 也删掉，就是整表报废的样子）。

## 参考

- 官方文档：[lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [aggregate 变换（含 values 操作）](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [data source（含数组合并）](https://vega.github.io/vega/docs/data/) ·
  [表达式函数 pluck / join](https://vega.github.io/vega/docs/expressions/)
- 同组相关 demo：[06 · 数据变换管线](../06-data-pipeline/)（filter/window/aggregate 管线）
