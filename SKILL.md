---
name: Explain in HTML
description: >-
  Generate two standalone Vue 3 single-file HTML pages that visualize a SQL DDL
  schema (table list plus ER diagram) or a GraphQL SDL API. Uses a pinned Vue
  3.5.13 full production CDN (single-file delivery, not offline-self-contained).
  Use when the user wants explain-in-html schema or API pages without a user-side
  build step.
---

# Explain in HTML — 表结构 / GraphQL 接口可视化（单 HTML）

用固定 Vue 3 完整生产 CDN 生成**两个互相独立**的单文件页面：SQL 表结构（含关系图）与 GraphQL 接口。不要把两种输入塞进同一页，也不要拓展成任意内容解释器。

本技能生成**单文件 HTML**（样式与组件库已内联，不依赖同目录其它文件）。**运行依赖固定 Vue 3 生产 CDN，不是离线自包含。**

## 硬性规范（生成任何页面都必须遵守）

- Vue 精确版本 **3.5.13**，完整生产构建：
  `https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.global.prod.js`
  （`vue.global.prod.js`，含模板编译器。禁止 runtime-only / ESM / dev 构建。）
- 单 `createApp`；页面逻辑用 Composition API（`setup` / `ref` / `computed` / `reactive`）。默认不要 `watch`。
- 组件必须 `app.component('kebab-name', def)` 显式注册；HTML 字符串模板；标签 kebab-case 并显式闭合。
- 禁止 Options API、SFC、JSX、`render` 函数；不要引入路由 / Pinia / npm 构建。
- **一组件一文件**（`<SKILL_DIR>/runtime/components/<tag>.js`），导出 `tag` 与 `define(Vue)`。禁止把多个组件写进同一文件。注册入口只聚合注册。
- LLM 只组合已有标签、props、events、slots，加少量数据逻辑。复杂交互在组件库与 composable 内。
- 最终用户打开 HTML 不需要 npm / Node / Bun，但需要能访问上述 CDN。

## 用法

可选作者工具（在技能根目录）：

```bash
node lib/render-erd.js examples/schema.sql -n TaskFlow -o erd.html
node lib/render-api.js examples/schema.graphql -n "TaskFlow API" -o api.html
```

也可用 `lib/ddl.js` / `lib/gql.js` 解析后调用 `assembleErd` / `assembleApi`。预组装示例见 `templates/api.html`、`templates/erd.html`。

## 无 Node/Bun 时：只替换数据区（不要跑 inject 模块）

1. 定位唯一标记：
   `/* ===EXPLAIN-IN-HTML-DATA:API:START=== */` … `END`（表结构页把 `API` 换成 `DATA`）。
2. 将整段替换为同样标记包裹的 `const API = …;` 或 `const DATA = …;`。
3. JSON 中每个 `<` 必须写成 `\u003c`，以免 `</script>` 提前闭合。
4. 不要用非贪婪正则 `/{[\s\S]*?}/` 去匹配对象：嵌套花括号会被截断。应当整段替换标记之间的内容，或做括号配对。
5. `<title>` 文本必须做 HTML 转义（`&` `<` `>` `"`）。

## 输入约定（摘要；完整说明见 lib/ddl.js / lib/gql.js 头注释）

- SQL：建表语句、PK/FK/UNIQUE、注释；可用指令覆盖 kind / domain。关系可由 `lib/model.js` 推断（n:1、1:1、self、n:m、nary）。
- GraphQL：SDL 中的 type / input / enum / interface / union / scalar 与 Query/Mutation/Subscription 操作。

## 测试

在技能根运行 `node --test tests/*.test.js`。测试与 fixture 可随目录搬走；用 `import.meta.url` 定位技能根，不写本机绝对路径。标为「需联网·可缓存」的用例会在 `os.tmpdir()` 缓存 Vue 3.5.13；DOM 生命周期测试把 happy-dom 装到临时目录，不进入本技能。完整清单见 `docs/ACCEPTANCE.md`。
