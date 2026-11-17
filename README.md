# Explain in HTML

把 SQL DDL 或 GraphQL SDL 做成**单文件 HTML** 说明页。运行依赖固定 Vue 3.5.13 完整生产 CDN，不是离线自包含。两种输入对应两个独立页面，不要合并。

## 生成页面

在技能根（下文记为 `<SKILL_DIR>`）执行：

```bash
node lib/render-erd.js examples/schema.sql -n TaskFlow -o erd.html
node lib/render-api.js examples/schema.graphql -n "TaskFlow API" -o api.html
```

不使用 Node 时，按 `SKILL.md` 的标记规则替换 `templates/` 里的数据区。打开产物只需浏览器能加载 Vue CDN（`file://` 下只要允许 HTTPS 脚本即可）。

## 源码结构

- `core/` 解析结果的视图模型、关系图布局与几何（与 Vue 无关）
- `runtime/components/` 一组件一文件
- `runtime/composables/` 交互状态
- `runtime/register-api.js` `register-erd.js` 显式注册
- `docs/FEATURES.md` 功能对照；`docs/ACCEPTANCE.md` 验收；`docs/ARCHITECTURE.md` 模块与 DOM 边界；`docs/COMPARISON.md` 规模对比

## 测试

```bash
node --test tests/*.test.js
```

详见 `docs/ACCEPTANCE.md`。请勿把 `node_modules`、缓存或临时安装包放进本目录。
