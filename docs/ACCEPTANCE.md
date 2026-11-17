# 验收清单

自动测试覆盖项见下方「已用 Node 测试」。标为「需浏览器」的由人工用 `file://` 打开 `templates/api.html` 与 `templates/erd.html` 复核。未测项不得称为通过。

## 已用 Node 测试（可搬走技能目录后独立运行）

在技能根执行：`node --test tests/*.test.js`（需 Node 能解析 ESM；技能根有 `package.json` 的 `"type":"module"`，无产品依赖）。

- 解析兼容：`examples/schema.sql` / `schema.graphql` 与 `tests/fixtures` 黄金期望一致；`enrichSchema` 不覆盖已有 kind/relations
- 真实布局输出：节点坐标 / 尺寸 / 边 id 与 `tests/fixtures/graph-layout.json` 一致
- 边坐标派生：移动节点后面路径变化；hull 随包围盒变化；引用边过滤
- 拖拽 / 缩放状态：节点拖拽只改 x/y，平移只改 view；`zoomAt` / `fitView` 为纯变换
- tabs / 筛选：开合激活；API 域分组随关键字变化
- 真实 Vue + happy-dom 挂载：顶层 computed 解包；`--invk` / 底图随缩放和尺寸变化；节点拖动的路径与 hull；表悬停入口
- 指针事件：测试基础设施模拟 capture 重定向（在事件派发期间核对 target=SVG），不手调业务回调补救；n:1/n:m/nary/self 各一次点击只打开一次；抖动、越阈值后回原点、取消、失去 capture、重复抬起和其它 pointer 不残留旧边
- tooltip：显示前设定可控测量尺寸，经真实 hover/move 入口自动 nextTick 定位，验证指针跟随及四角钳制；不手调 applyPlacement 补救
- prop 更新：不手动 sync，验证嵌套 relations 更新、kind/domain 变化、节点增删、替换输入、邻接高亮和无效选择清理；保留节点坐标；换肤不覆盖显式色
- 视角：从初始隐藏列表通过卡片第一次 focus，再列表/图往返，仍保持聚焦视角
- 资源：once 事件触发后登记归零；卸载后不再登记；双指 resize 不重复提交；capture 取消/丢失/卸载释放；mount 后立即 unmount 不会从 nextTick 新建孤儿 RAF；重复画布绑定不累加 observer/listener
- 组装产物真实 boot：两页在预装 Vue 的 DOM 中执行内联脚本并 mount，控制台无错误（不仅编译单组件模板）
- 表结构搜索语义：关键字只过滤导航，主栏卡片仍为全部（与原实现一致）
- API 窄屏：视口不足时详情为覆盖层，主栏不被 320px 最小栏挤占
- SKILL.md 含 YAML frontmatter（`name: Explain in HTML` 与 description）
- 组件卸载与计时器：`useListeners` 已触发的 timeout/raf 不滞留登记表（测试依赖 happy-dom，只装在 `os.tmpdir()` 下的临时目录，不进产物）
- 内联脚本：`vm.Script` 与 `node --check`；多行 import 改写不残留 ESM
- Vue 模板编译：【需联网·可缓存】固定 3.5.13 完整构建 `Vue.compile` 编译全部组件模板
- 安全注入与标题：`<` → `\u003c`；恶意 title 转义；标记替换；嵌套对象不被非贪婪正则截断
- 重新注入与单 HTML：产物无相邻相对 `src`/`href`；可再次 `injectData`
- CDN 缺失：boot 仍写出说明且不抛引用错误
- 架构：一组件一文件（文件名 = tag）；注册入口无 `template`；core/runtime 无 innerHTML / createElement 拼装；图模块不用 querySelector / getElementById；core 不引用 Vue
- 可移植性 / 隐私：交付文件无本机绝对路径、工作副本路径、机器 ID；不提交 `node_modules` 或安装包；仅示例数据

测试通过 `import.meta.url` 解析技能根，缓存与测试依赖使用 `os.tmpdir()` 或环境变量 `EIH_TEST_DEPS`，源码不硬编码主机路径。

## 需浏览器复核（打开 templates，允许加载 HTTPS CDN）

### 两页共通

- [ ] Vue CDN 返回 200，控制台无 `SyntaxError`，页面非空白
- [ ] 完全拦截 CDN 时出现「无法加载 Vue 3.5.13…不是离线自包含」说明
- [ ] 系统暗色 / 亮色外观可切换（跟随系统）

### GraphQL 页

- [ ] 域分组、搜索、空态、折叠记忆、搜索时强制展开
- [ ] 操作签名高亮、类型跳转、返回类型展开、芯片分组
- [ ] 类型详情（SDL / 引用 / 被哪些操作使用）
- [x] tabs 开关（含 Ctrl+点击多开、切换、关闭）— 见下方实证
- [x] 悬停预览（`api-type-chip` 的 `.tchip` 入口；已证 `CreateTaskInput` 一枚，见下方；**非** SDL 正文普通链接）
- [ ] 侧栏拖拽宽度并刷新后仍在
- [x] 窄视口（约 375px）打开详情时为覆盖层，主栏仍可读，点遮罩（scrim）关闭 — 见下方实证

### 表结构页

- [ ] 域导航、搜索（只过滤导航，主栏仍为全部卡片）、列表卡片（列 / 索引 / TS / 关系 / 弱实体 / 关系表端点与属性）
- [ ] N:M、nary、自关系展示正确
- [x] 窄屏菜单抽屉与遮罩（scrim）关闭 — 见下方实证
- [ ] 宽屏三栏 / 收起侧栏
- [ ] tabs 详情；窄屏点击改为滚动到卡片
- [ ] 表 / TS 悬停预览；hash 定位

### 关系图

- [ ] 切换到关系图后节点、边、hull、图例可见
- [ ] 引用边开关、分组开关、适应、重排、缩放、平移
- [ ] 拖拽节点后面与 hull 跟随（不是停在旧位置）
- [ ] 刷新后节点位置仍在（位置记忆）；重排后恢复自动布局
- [ ] 悬停高亮与边说明；点击打开详情或（窄屏）回列表
- [ ] 图例点击聚焦域；自环与平行边偏移可见


## 自动测试的边界

happy-dom 不提供浏览器排版和原生指针捕获。本测试在派发层模拟 capture routing，并在显示前注入确定尺寸；没有手动调用组件业务处理器来绕过事件或自动同步链路。它能验证 Vue 数据与事件契约，不能替代原生浏览器的 file://、CDN、布局、触屏与系统换肤验收。未在下方实证记录中写明、且清单仍为未勾选的项，不得称为通过。不能把前一版本的浏览器结果直接勾到本产物上。

## 浏览器实证记录

时间均为 Asia/Shanghai（UTC+8）。上方清单的勾选只用于「该完整条目已在本产物 `templates/` 上确认」；部分确认、仅前一版本测过、或仍在另测中的条目保持未勾选，以免把未完成的验收写成通过。

2026-11-17 21:01（本版本 `templates/`，已与组装输出逐字节核对相同）：

- 两页强制刷新后显示正常，控制台 0 条 error。
- 表结构关系图：普通边点击后，右侧栏打开正确的对应详情；边 tooltip 出现在目标附近；从关系图切到列表再切回关系图，坐标保持。

前一版本（非本版本全量重验）曾在测试图上通过：拖拽节点后面与 hull 跟随、平移、缩放、引用边开关、hull 开关等。仅作历史记录，对应清单项保持未勾选，须在本版本上补验。

2026-11-17 21:12（本版本 `templates/`，延续同日早些时候关系图/console0 记录）：

- **GraphQL / API**：`Ctrl+点击` `User` 与 `Task` 各打开一个 tab，共两个 tab；切换与关闭行为正常。
- **GraphQL / API 窄屏（约 375px）**：类型详情为覆盖层（overlay），主栏不被挤没；点击 scrim 可关闭 — **PASS**。
- **表结构 / ERD 窄屏**：菜单抽屉与 scrim 关闭 — **PASS**。
- **悬停预览范围说明**：SDL 正文中的普通类型文字链（例如先前在 `User` 上试探）**不**提供悬停预览；设计入口仅为 `api-type-chip` 的 `.tchip` 药丸。该试探**不得**记为缺失或缺陷。

2026-11-17 21:13（本版本 `templates/api.html`，桌面视口 **1365×1072**，控制台 **0 error / 0 warning**）：

- **GraphQL / API · `.tchip` 悬停预览（单点实证）**：在 `CreateTaskInput` 上悬停其实际 `.tchip` 芯片 **>260ms**，预览出现在芯片邻近位置；指针离开后预览消失 — **PASS**（仅此一枚芯片在本视口下记录，**不**推广到其余芯片、**不**声称 SDL 链接预览、**不**声称 ~375px 窄屏下同一行为已验）。

## 浏览器未验边界（不得称为通过）

以下仅在 Node / happy-dom 或部分 GUI 点测之外，**本产物尚未在真实浏览器中实证**：

- 完全拦截 Vue CDN 时的离线说明文案
- 真实触屏（touch）手势与滚动
- Safari 专项
- 浏览器内 **全量 fresh** 刷新后的关系图节点位置记忆（非 Node 单测所能替代）
- 除上文明示 PASS 以外的清单勾选项（域分组全量、ERD 重排/图例/自环目视、其余 `.tchip` / 表·TS 悬停、侧栏拖拽刷新持久化、hash、系统明暗跟随等）

尚未记录、因此不得称为通过的项还包括：上节未列名且清单仍为 `[ ]` 的其余浏览器条目。
