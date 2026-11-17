# 旧新规模与重复逻辑对比

行数下降不是成功的唯一指标。下面是一次实测统计，用来说明职责是否拆清、是否还在用 DOM 拼图。

## 规模（物理行数，含注释）

原始两页 HTML 的数字含内嵌 CSS；本轮只统计 lib/core/runtime 的 JS，另存的 CSS、示例 HTML、文档不计。口径不同，不能凭行数推断更简洁。

| 来源 | JS/HTML 行数 | 说明 |
| --- | ---: | --- |
| 原 design-viz（两页 HTML + 解析器 + serve） | 3660 | `api.html` 723 + `erd.html` 2029 + 解析器等 908。图与列表都是 `innerHTML` 命令式更新 |
| 上一轮「Vue 包装」技能（lib + runtime，不含测试） | 3373 | 解析器复用；但 `erd-graph` 868 行仍用 innerHTML / createElementNS 画节点和边；组件集中在两个大文件里 |
| 本轮 Vue 原生技能（lib + core + runtime，不含测试） | 4561 | 布局/几何、指针状态机与资源所有权显式拆分；不代表总代码更短 |
| 本轮测试（含 helpers） | 2026 | 上一轮约 22 个用例；本轮 68 个自动测试，覆盖布局、状态机、架构与可移植性 |

本轮另有 **26** 个组件文件、**15** 个 composable、**10** 个 core 模块。注册入口 2 个，均不定义模板。

## 架构差异（比行数更重要）

- 上一轮关系图模块中，字符串 DOM/SVG 赋值（`innerHTML` / `createElementNS`）出现 **10** 处；本轮 `core/` 与 `runtime/` 中为 **0**。节点、边、hull、图例、工具栏均由模板绑定。
- 上一轮把多个组件定义在 `components-erd` / `components-api` 两个聚合文件，图逻辑再挂到根组件查询固定 id。本轮一组件一文件，根组件只做组合。
- 拖拽不再 `setAttribute("transform")` 或 `moveEdge` 改 path，而是改响应式坐标，边与 hull 由 `computed` 派生。
- 解析器仍只有一份（`lib/ddl.js` `lib/gql.js` `lib/model.js`），不再把关系推断复制进 HTML。上一轮已做到这一点，本轮保持。
- 高亮分词（`core/highlight.js`）两页共用，模板 `v-for` token，避免把用户文本当 HTML 插入。
- 布局算法（分层、域超节点、去重叠、平行边偏移、自环）从绘制代码中分离，可单独对照黄金坐标测试。这不是「删掉算法让文件变短」，而是可验证的纯函数。

## 仍可能显得「重复」的部分

- API 与 ERD 都有搜索、tabs、侧栏、tooltip：实现已抽到 composable 与 `eih-*` 共享组件，但两页的视觉与数据形状不同，保留各自 Explorer。
- 预组装的 `templates/*.html` 内联了组件源，体积大于源文件之和（这是单文件交付的代价，不是第二份可编辑实现）。
