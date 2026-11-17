// 把运行时模块内联成单文件 HTML。产物不引用相邻相对路径文件，注释只用仓库内相对路径。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VUE_CDN_URL, VUE_VERSION } from "../runtime/cdn.js";
import { escapeHtml, escapeScriptJson, wrapDataBlock } from "./inject.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function statementComplete(text) {
  let i = 0, depth = 0, inStr = null, inLine = false, inBlock = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inLine) { if (c === "\n") inLine = false; i++; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i += 2; continue; } i++; continue; }
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === "/" && n === "/") { inLine = true; i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; i++; continue; }
    if (c === "}" || c === ")" || c === "]") { depth = Math.max(0, depth - 1); i++; continue; }
    if (c === ";" && depth === 0 && !inStr) return true;
    i++;
  }
  const t = text.trim();
  if (depth !== 0) return false;
  if (/from\s+['"][^'"]+['"]\s*$/.test(t)) return true;
  if (/^import\s+['"][^'"]+['"]\s*$/.test(t)) return true;
  return false;
}

function resolveRel(fromFile, spec) {
  const parts = fromFile.replace(/\\/g, "/").split("/");
  parts.pop();
  for (const seg of spec.replace(/\\/g, "/").split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function splitExportedNames(inner) {
  return inner.split(",").map(s => s.trim()).filter(Boolean).map(n => {
    const [orig, alias] = n.split(/\s+as\s+/).map(x => x.trim());
    return { orig, local: alias || orig };
  });
}

function rewriteImportStmt(stmt, fromFile) {
  const text = stmt.trim().replace(/;?\s*$/, "");
  const named = text.match(/^import\s+\{([\s\S]+)\}\s+from\s+['"]([^'"]+)['"]$/);
  if (named) {
    const resolved = resolveRel(fromFile, named[2]);
    return splitExportedNames(named[1]).map(({ orig, local }) =>
      `const ${local} = __eih[${JSON.stringify(resolved)}].${orig};`
    ).join("\n");
  }
  const side = text.match(/^import\s+['"]([^'"]+)['"]$/);
  if (side) return `void __eih[${JSON.stringify(resolveRel(fromFile, side[1]))}];`;
  throw new Error(`${fromFile}: 无法内联的 import：${stmt.trim()}`);
}

function stripModule(src, filename) {
  const lines = src.split("\n");
  const out = [];
  const exported = [];
  let buf = [];

  const flushStmt = (stmt) => {
    const raw = stmt.join("\n");
    const t = raw.trim();
    if (/^import\b/.test(t)) {
      out.push(rewriteImportStmt(t, filename));
      return;
    }
    if (/^export\s*\{/.test(t)) {
      const reexp = t.match(/^export\s*\{([\s\S]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/);
      if (reexp) {
        const resolved = resolveRel(filename, reexp[2]);
        for (const { orig, local } of splitExportedNames(reexp[1])) {
          out.push(`const ${local} = __eih[${JSON.stringify(resolved)}].${orig};`);
          exported.push(local);
        }
        return;
      }
      const local = t.match(/^export\s*\{([\s\S]+)\}\s*;?\s*$/);
      if (local) {
        for (const { orig, local: loc } of splitExportedNames(local[1])) {
          if (loc !== orig) out.push(`const ${loc} = ${orig};`);
          exported.push(loc);
        }
        return;
      }
      throw new Error(`${filename}: 无法内联的 export：${t}`);
    }
    if (/^export\s*\*\s*from\b/.test(t)) {
      throw new Error(`${filename}: 不支持 export * from`);
    }
    if (/^export\s+default\b/.test(t)) {
      out.push(raw.replace(/^(\s*)export\s+default\s+/, "$1const __default = "));
      exported.push({ as: "default", local: "__default" });
      return;
    }
    const decl = t.match(/^export\s+(async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/);
    if (decl) {
      out.push(raw.replace(/^(\s*)export\s+/, "$1"));
      exported.push(decl[2]);
      return;
    }
    out.push(raw);
  };

  const flushBuf = () => {
    if (!buf.length) return;
    if (!statementComplete(buf.join("\n"))) {
      throw new Error(`${filename}: 未结束的 import/export 语句：\n${buf.join("\n")}`);
    }
    flushStmt(buf);
    buf = [];
  };

  for (const line of lines) {
    if (buf.length) {
      buf.push(line);
      if (statementComplete(buf.join("\n"))) flushBuf();
      continue;
    }
    const t = line.trim();
    // 只缓冲 import 与 export { } / export * from；export function/const 只改首行，避免函数体被吞进 statementComplete。
    if (/^import\b/.test(t) || /^export\s*\{/.test(t) || /^export\s*\*\s*from\b/.test(t)) {
      buf = [line];
      if (statementComplete(line)) flushBuf();
      continue;
    }
    if (/^export\b/.test(t)) {
      flushStmt([line]);
      continue;
    }
    out.push(line);
  }
  if (buf.length) flushBuf();

  const ret = exported.map(e => (typeof e === "object" ? `default: ${e.local}` : e)).join(", ");
  return `\n/* ---- ${filename} ---- */\n__eih[${JSON.stringify(filename)}] = (() => {\n${out.join("\n")}\n  return { ${ret} };\n})();\n`;
}

function extractInlineScripts(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf("<script", i);
    if (start < 0) break;
    const tagEnd = html.indexOf(">", start);
    if (tagEnd < 0) break;
    const open = html.slice(start, tagEnd + 1);
    i = tagEnd + 1;
    if (/\ssrc\s*=/i.test(open)) continue;
    const close = html.indexOf("</script>", i);
    if (close < 0) break;
    out.push(html.slice(i, close));
    i = close + 9;
  }
  return out;
}

/** files 必须是相对技能根的 posix 路径，禁止绝对路径以免写入产物注释。 */
function bundle(relFiles) {
  const parts = ["var __eih = Object.create(null);"];
  for (const rel of relFiles) {
    const norm = rel.replace(/\\/g, "/");
    if (norm.startsWith("/") || /^[A-Za-z]:\//.test(norm)) {
      throw new Error("bundle() 只接受相对路径：" + rel);
    }
    const src = readFileSync(join(ROOT, ...norm.split("/")), "utf8");
    parts.push(stripModule(src, norm));
  }
  parts.push('var registerApi = __eih["runtime/register-api.js"] && __eih["runtime/register-api.js"].registerApi;');
  parts.push('var registerErd = __eih["runtime/register-erd.js"] && __eih["runtime/register-erd.js"].registerErd;');
  return parts.join("\n");
}


const API_FILES = [
  "core/highlight.js",
  "core/api-view.js",
  "core/chrome.js",
  "core/storage.js",
  "core/placement.js",
  "runtime/composables/use-listeners.js",
  "runtime/composables/use-persistent.js",
  "runtime/composables/use-media.js",
  "runtime/composables/use-search.js",
  "runtime/composables/use-tabs.js",
  "runtime/composables/use-collapse.js",
  "runtime/composables/use-tooltip.js",
  "runtime/components/sdl-highlight.js",
  "runtime/components/api-type-chip.js",
  "runtime/components/api-op-row.js",
  "runtime/components/api-type-expand.js",
  "runtime/components/api-type-detail.js",
  "runtime/components/api-domain-section.js",
  "runtime/components/api-toolbar.js",
  "runtime/components/eih-tab-strip.js",
  "runtime/composables/use-pane-resize.js",
  "runtime/components/eih-side-pane.js",
  "runtime/components/eih-tooltip.js",
  "runtime/components/api-explorer.js",
  "runtime/register-api.js",
];

const ERD_FILES = [
  "lib/model.js",
  "core/highlight.js",
  "core/erd-view.js",
  "core/chrome.js",
  "core/storage.js",
  "core/placement.js",
  "core/graph-model.js",
  "core/graph-layout.js",
  "core/graph-geometry.js",
  "runtime/composables/use-listeners.js",
  "runtime/composables/use-persistent.js",
  "runtime/composables/use-media.js",
  "runtime/composables/use-search.js",
  "runtime/composables/use-tabs.js",
  "runtime/composables/use-selection.js",
  "runtime/composables/use-tooltip.js",
  "runtime/composables/use-scheme.js",
  "runtime/composables/use-drawer.js",
  "runtime/composables/use-pan-zoom.js",
  "runtime/composables/use-node-drag.js",
  "runtime/composables/use-scroll-spy.js",
  "runtime/composables/use-hash-nav.js",
  "runtime/components/ts-highlight.js",
  "runtime/components/erd-col-row.js",
  "runtime/components/erd-indexes.js",
  "runtime/components/erd-types-block.js",
  "runtime/components/erd-table-card.js",
  "runtime/components/erd-nav.js",
  "runtime/components/erd-toolbar.js",
  "runtime/components/erd-table-list.js",
  "runtime/components/eih-tab-strip.js",
  "runtime/composables/use-pane-resize.js",
  "runtime/components/eih-side-pane.js",
  "runtime/components/eih-tooltip.js",
  "runtime/components/erd-graph-node.js",
  "runtime/components/erd-graph-edge.js",
  "runtime/components/erd-graph-hull.js",
  "runtime/components/erd-graph-legend.js",
  "runtime/components/erd-graph-toolbar.js",
  "runtime/components/erd-graph.js",
  "runtime/components/erd-explorer.js",
  "runtime/register-erd.js",
];

const FILE_PROTOCOL_NOTE = `本页是单文件交付：样式与组件库已内联，不依赖同目录其它文件，无需 npm / Node / Bun 即可打开。运行时依赖固定 Vue ${VUE_VERSION} 生产 CDN（${VUE_CDN_URL}，完整构建 vue.global.prod.js，含模板编译器），需要联网，不是离线自包含。用 file:// 打开时，只要浏览器允许加载 HTTPS 脚本即可；CDN 被拦截或完全离线时页面无法启动。`;

function assemblePage({ title, css, varName, varComment, dataJson, registerCall, rootTag, propName, bundleJs }) {
  const safeTitle = escapeHtml(title);
  const dataBlock = wrapDataBlock(varName, dataJson);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
${css}
  #app { display: flex; min-height: 100vh; }
  .api-root, .erd-root { width: 100%; }
</style>
</head>
<body>
<div id="app"></div>
<!--
  Vue 3 完整生产 CDN，精确版本 ${VUE_VERSION}。
  ${FILE_PROTOCOL_NOTE}
-->
<script src="${VUE_CDN_URL}"></script>
<script>
${varComment}
${dataBlock}

(function boot() {
  if (typeof Vue === "undefined") {
    document.getElementById("app").textContent = ${JSON.stringify("无法加载 Vue " + VUE_VERSION + " 生产 CDN（" + VUE_CDN_URL + "）。本页需要联网；file:// 下只要浏览器允许请求 HTTPS 脚本即可。最终 HTML 是单文件交付，无需 npm/Node/Bun，但运行依赖 Vue CDN，不是离线自包含。")};
    return;
  }
  /* 组件库仅在 Vue 可用之后求值，避免 CDN 失败时顶层引用 Vue 导致本提示无法执行。 */
${bundleJs}
  const { createApp, ref, computed } = Vue;
  const app = createApp({
    setup() {
      const ${propName} = ref(${varName});
      const ready = computed(() => !!${propName}.value);
      return { ${propName}, ready };
    },
    template: '<${rootTag} v-if="ready" :${propName}="${propName}"></${rootTag}>'
  });
  ${registerCall}(app, Vue);
  app.mount("#app");
})();
</script>
</body>
</html>
`;
}

export function assembleApi(data, { title } = {}) {
  const css = readFileSync(join(ROOT, "runtime", "css-api.css"), "utf8");
  const bundleJs = bundle(API_FILES);
  const name = (data && data.name) || "GraphQL";
  const htmlTitle = title || `${name} · GraphQL`;
  const comment = `/* ════════════════════════════════════════════════════════════════════════
   数据区 —— 替换此对象即可复用本页。也可用可选作者工具：
   node lib/render-api.js <schema.graphql> -o <out.html>
   边界标记见 SKILL.md「无 Node/Bun 时」；JSON 中的 "<" 必须写成 \\u003c。
   ════════════════════════════════════════════════════════════════════════ */`;
  return assemblePage({
    title: htmlTitle,
    css,
    varName: "API",
    varComment: comment,
    dataJson: escapeScriptJson(data),
    registerCall: "registerApi",
    rootTag: "api-explorer",
    propName: "api",
    bundleJs,
  });
}

export function assembleErd(data, { title } = {}) {
  const css = readFileSync(join(ROOT, "runtime", "css-erd.css"), "utf8");
  const bundleJs = bundle(ERD_FILES);
  const name = (data && data.name) || "Schema";
  const htmlTitle = title || `${name} · Schema`;
  const comment = `/* ════════════════════════════════════════════════════════════════════════
   数据区 —— 替换此对象即可复用本页。也可用可选作者工具：
   node lib/render-erd.js <schema.sql> -o <out.html>
   边界标记见 SKILL.md「无 Node/Bun 时」；JSON 中的 "<" 必须写成 \\u003c。
   ════════════════════════════════════════════════════════════════════════ */`;
  return assemblePage({
    title: htmlTitle,
    css,
    varName: "DATA",
    varComment: comment,
    dataJson: escapeScriptJson(data),
    registerCall: "registerErd",
    rootTag: "erd-explorer",
    propName: "schema",
    bundleJs,
  });
}

export { VUE_CDN_URL, VUE_VERSION, FILE_PROTOCOL_NOTE, API_FILES, ERD_FILES, bundle, stripModule, extractInlineScripts, ROOT };
