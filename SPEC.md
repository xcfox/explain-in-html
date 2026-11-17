# Explain in HTML — 组件 API 与单页规范

## Vue 加载

- 版本 3.5.13，URL：`https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js`
- 单 `createApp`；`registerApi(app, Vue)` 或 `registerErd(app, Vue)`
- 根模板保持：
  - `<api-explorer v-if="ready" :api="api"></api-explorer>`
  - `<erd-explorer v-if="ready" :schema="schema"></erd-explorer>`

## 组件文件约定

每个组件位于 `runtime/components/<tag>.js`：

```js
export const tag = "erd-graph-node";
export const name = "ErdGraphNode";
export function define(Vue) {
  return { name, props, emits, setup, template: `...` };
}
```

注册入口只遍历这些导出并 `app.component(tag, define(Vue))`。

## GraphQL 页（组合关系）

`api-explorer` 组合：`api-toolbar`、`api-domain-section`（内含 `api-op-row` / `api-type-expand` / `api-type-chip`）、`eih-side-pane` + `eih-tab-strip` + `api-type-detail`、`eih-tooltip`。`sdl-highlight` 负责 SDL token。

主要 props：`api-explorer` 接收整个 `api`（`name` / `types` / `operations`）。子组件要类型映射、操作对象或节数据，事件为 `open-type`、`go-op`、`tip`、`toggle`。

## 表结构页（组合关系）

`erd-explorer` 组合：`erd-toolbar`、`erd-nav`、`erd-table-list`（`erd-table-card` / `erd-col-row` / `erd-indexes` / `erd-types-block`）、`erd-graph`、`eih-side-pane`、`eih-tooltip`。

`erd-graph` 组合：`erd-graph-node`、`erd-graph-edge`、`erd-graph-hull`、`erd-graph-legend`、`erd-graph-toolbar`。

`erd-graph` 的 `view` 为 `buildErdView` 的结果；输入（含嵌套结构）自动同步，保留同名节点坐标并刷新邻接关系，不要求调用方手动刷新。事件：`open-tab`、`open-list`。边的点击由画布唯一指针状态机识别，边组件仅发 hover 事件。

## 安全与组装

- 标题：`escapeHtml`。数据区：起止标记 + `escapeScriptJson`。
- 组装器只接受相对 `<SKILL_DIR>` 的 posix 路径，避免把主机绝对路径写入产物注释。
- Vue CDN 未定义时不得执行组件库。完整安全说明见 `SKILL.md` 与 `lib/inject.js`。
- DOM 边界见 `docs/ARCHITECTURE.md`。
