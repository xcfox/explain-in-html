# 架构与模块职责

数据 / 状态 / 组件契约先行。解析与布局是纯函数；界面用 Vue 3 Composition API 声明式渲染。

## 目录

- `lib/ddl.js` `lib/gql.js` `lib/model.js` — 可选作者工具：SQL / GraphQL 解析与关系推断
- `lib/inject.js` — 按起止标记替换数据区，HTML / JSON 转义
- `lib/assemble.js` — 将相对路径模块内联为单 HTML（注释只用仓库内相对路径）
- `lib/cli.js` `lib/render-api.js` `lib/render-erd.js` — 可选组装命令
- `core/` — 与 Vue 解耦：视图模型、图模型、布局、几何、存储、分栏阈值、高亮分词
- `runtime/composables/` — 有状态交互的单一事实来源（一钩子一文件）
- `runtime/components/` — **一组件一 `.js` 文件**，导出 `tag`（与文件名一致）和 `define(Vue)`
- `runtime/register-api.js` `runtime/register-erd.js` — 只聚合 `app.component(tag, define(Vue))`，不定义模板
- `runtime/cdn.js` `runtime/css-*.css` — 固定 CDN 与样式
- `templates/` — 用示例 schema 预组装的单文件 HTML
- `tests/` `tests/fixtures/` — 可随技能搬走的测试与黄金期望
- `docs/` — 功能、验收、架构、规模对比
- `package.json` — 仅 `"type":"module"`，无依赖、无构建

LLM 面对稳定的标签 / props / events / slots，以及根组件上少量 `setup` 数据（`API` / `DATA`）即可，不必改组件库。

## 图的数据流

1. `buildErdView` 丰富 schema 并着色
2. `buildGraphModel` 折叠 N:M，得到节点与边（纯数据）
3. `sizeNodes` + `layoutGraph` 写入 x/y/w/h（可注入已存坐标）
4. 节点放入 `reactive` 数组；拖拽只改 `node.x/y` 或 `view.{tx,ty,k}`
5. `computed` 调用 `deriveEdgeViews` / `computeHulls`；模板 `v-for` 绑定 `d`、`transform`、矩形与文字

禁止用 innerHTML、createElement、字符串拼接 SVG 来画节点或边。

## 必要 DOM 边界（允许的小范围操作）

| 用途 | 做法 | 位置 |
| --- | --- | --- |
| 适应画布 / 指针为心缩放 / tooltip 位置 | `getBoundingClientRect`、`offsetWidth`，结果写入响应式对象再绑到模板 | `use-pan-zoom` `use-tooltip` |
| 拖拽与侧栏 resize | `setPointerCapture` / `releasePointerCapture`；卸载或 cancel 时释放 | `use-node-drag` `eih-side-pane` |
| 列表滚到当前表 | 模板 ref 回调登记元素，再 `scrollIntoView` | `use-scroll-spy` |
| 窗口尺寸、系统暗色、hash、滚轮（非被动）、Safari 捏合 | `addEventListener`，在 `onBeforeUnmount` 对称移除 | `use-listeners` 及使用它的 composable |
| 位置 / 栏宽 / 域折叠 | `localStorage`（经 `core/storage.js` 适配器，测试可注入内存存储） | `use-persistent` 等 |
| 页内类型 / 操作锚点 | 仅当存在 `#type-` / `#op-` 目标时允许默认跳转或 `scrollIntoView` | `sdl-highlight` `api-explorer` |
| CDN 失败提示 | `document.getElementById("app").textContent = …`（bundle 尚未求值） | 组装页 boot |

不在上述边界内使用 `querySelector` 按全局 id 查找图节点，也不把旧的图 DOM 模块搬进 composable。

## 组装约定

运行时模块保持 ESM，便于 Node 测试与作者工具读取。组装器把每个相对路径文件包进 IIFE，改写 `import` 为模块表访问，避免顶层 `const tag` 冲突，并把 `registerApi` / `registerErd` 提升给 boot。产物注释只出现 `core/…` 这类仓库相对路径。


## 指针、输入同步与异步所有权

- 图的一个 `useNodeDrag` 状态机拥有 pointerId、按下时节点/边 id、capture 元素和统一的 **4 CSS px** 移动阈值。pointerup 即使重定向到 SVG，仍按已保存身份解析；边组件只负责几何和 hover，不再维护第二套 tap 状态。
- 活跃手势忽略其它 pointer；pointercancel、lostpointercapture、卸载只取消，不当作点击或提交。移动超过阈值后即使回到起点也仍为拖拽。
- 图对整个 `view` prop 做受组件生命周期管理的 deep watch（明确的输入边界，而非 LLM 页面随意 watch）。新模型更新边及每个保留节点的邻接表、kind、domain、尺寸与颜色，同时保留同名节点坐标；删除节点时清除无效选择。调用者不需要手动刷新。
- tooltip 先显示内容，nextTick 后通过真实根元素测量；无 anchor 且带有限指针坐标时按指针定位，故 `kind: edge` 不会误入空锚点分支。
- 适应/聚焦使用 activation generation 与 disposed 标记取消过期 nextTick/RAF；首次 focus 也算初始化，模式往返不会自动覆盖视角。
- once 事件、已完成/取消的 timeout/RAF 自行注销；卸载后的资源入口不再登记任务。滚动锁的 scrollend 与超时互相取消，重复 resize 绑定不累加监听或观察器。
