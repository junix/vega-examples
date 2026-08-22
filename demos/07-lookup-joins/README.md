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
../../serve.sh        # 在 vega 仓库根启动静态服务器
# 浏览器打开 http://localhost:8000/vega-examples/demos/07-lookup-joins/
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
| `people` / `groups` | 两个 CSV（url 加载） | 原样行 | CSV 自动按扩展名推断格式并自动类型推断（age/height/group 是数值） |
| `newcomers` | inline `values` | 1 行 Zoe | 人为构造的无匹配人员，专门触发 lookup 失败分支 |
| `roster` | `source: ["people", "newcomers"]` | 10 行 | **source 写数组 = 多表 union 合并**，同一个变换管线处理合并结果 |
| `roster` → lookup（as `membership`） | 上一步 | 每行挂匹配到的 groups 行对象 | 全字段行对象形态：未给 `values` 时拷贝整条记录 |
| `roster` → lookup（values+default） | 上一步 | 每行新增 `group_flat` | **平铺形态**：给了 `values: ["group"]` 就只拷贝该字段的标量值；Zoe 未匹配 → 写入 `default: "?"` |
| `roster` → formula `group_id` | 上一步 | 数值组号或 null | `datum.membership ? datum.membership.group : null`：对象形态的标准取法 |
| `roster` → formula + collect + window | 上一步 | `sort_key` → 排序 → `idx` 行号 | 未匹配者排最后；`window` 的 `row_number` 给文本行算 y 坐标 |
| `members` → lookup | source: `groups` | 9 行，平铺回 `age`,`height` | **反向连接**：主表换成 groups；`values` 多字段、省略 `as` 时直接用 values 的名字 |
| `group_stats` → aggregate | `members` | 每组一行：`avg_height`, `n` | 连接之后的常规分组统计 |
| `group_roster` → aggregate(values) + formula | source: `groups` | 每组一行：`member_list` 行数组 + `member_names` | aggregate 的 `values` 操作把组内整条数据行收进数组（fields 必须给非 null 字段，但收集的是整行）；`pluck(datum.member_list,'person')` 抽出名字数组，`join(...,'、')` 拼成一行文本 |

### marks 段

| 段落 | 作用 | 本例要点 |
| --- | --- | --- |
| `panelA`（group mark） | 左面板容器 | 不带 `from` 的 group mark 只实例化一次，当定位容器用；`title` 直接写在 group 上 |
| panelA 内 `scales`/`axes` | 面板局部坐标系 | `range: "width"/"height"` 相对 group 的宽高 |
| panelA 内 `rect` + `text` | 柱子与数值标注 | 数据源 `group_stats`；标注里同时拼均值与样本数 `n` |
| panelA 内 `text`（from `group_roster`） | 成员名单 | 与柱子共用 `xg` 比例尺按 `group` 对齐；`band: 0.5` 居中 |
| `panelB`（group mark） | 右面板容器 | 纯文本清单；每行 y 用 `datum.idx` 信号表达式计算 |
| panelB 内 `text`（from `roster`） | 匹配结果清单 | `fill` 用信号按 `datum.membership` 是否存在着色；Zoe 行展示 `group_flat` 的 default 值 |

## 试一试（改练）

1. 把 roster 的第一个 lookup 的 `as` 去掉，看 parse 报错信息（未给 `values` 时 `as` 必填）。
2. 把 `default: "?"` 改成 `"0"` 或删掉该参数，观察 Zoe 行 `group_flat` 的变化。
3. 在 `newcomers` 里再加一行已在 groups 中出现的名字（如 `Alan`），观察重复主表键
   各自都能匹配（lookup 不要求主表键唯一，只要求 from 表键唯一）。
4. 把 `members` 里 lookup 的 `values: ["age", "height"]` 删掉、加 `"as": ["person_info"]`，
   然后把 `group_stats` 的 aggregate 字段改成 `person_info.height`，体会两种形态的取舍。
5. 给左面板按 `n` 给柱子上色（新增 ordinal scale），或把 `avg_height` 换成 `mean(age)`。

## 参考

- 官方文档：[lookup 变换](https://vega.github.io/vega/docs/transforms/lookup/) ·
  [aggregate 变换（含 values 操作）](https://vega.github.io/vega/docs/transforms/aggregate/) ·
  [data source（含数组合并）](https://vega.github.io/vega/docs/data/) ·
  [表达式函数 pluck / join](https://vega.github.io/vega/docs/expressions/)
- 同组相关 demo：[06 · 数据变换管线](../06-data-pipeline/)（filter/window/aggregate 管线）
