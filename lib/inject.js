// inject.js — 把解析结果写入单文件 HTML 的数据区（运行仍依赖 Vue CDN，并非离线自包含）。
// 定位只靠唯一起止标记，不用非贪婪正则去匹配嵌套 `{...}`。
// JSON 中的 "<" 写成 "\u003c"，避免 </script> 提前闭合。

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeScriptJson(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function dataStartMark(varName) {
  return `/* ===EXPLAIN-IN-HTML-DATA:${varName}:START=== */`;
}

export function dataEndMark(varName) {
  return `/* ===EXPLAIN-IN-HTML-DATA:${varName}:END=== */`;
}

export function wrapDataBlock(varName, json) {
  return `${dataStartMark(varName)}\nconst ${varName} = ${json};\n${dataEndMark(varName)}`;
}

export function injectData(html, varName, data) {
  const json = escapeScriptJson(data);
  const block = wrapDataBlock(varName, json);
  const start = dataStartMark(varName);
  const end = dataEndMark(varName);
  const i = html.indexOf(start);
  const j = i >= 0 ? html.indexOf(end, i + start.length) : -1;
  if (i >= 0 && j >= 0) {
    return html.slice(0, i) + block + html.slice(j + end.length);
  }

  // 无标记的旧模板：用括号配对替换 `const NAME = { ... };`（不是非贪婪正则）。
  const marker = `const ${varName} = `;
  const p = html.indexOf(marker);
  if (p < 0) throw new Error(`模板中未找到 ${start} 或 const ${varName} = { ... }; 数据区`);
  let q = p + marker.length;
  while (q < html.length && /\s/.test(html[q])) q++;
  if (html[q] !== "{") throw new Error(`const ${varName} 后应为 { ... }`);

  let d = 0, k = q, inStr = null, inLine = false, inBlock = false;
  for (; k < html.length; k++) {
    const c = html[k], n = html[k + 1];
    if (inLine) { if (c === "\n") inLine = false; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; k++; } continue; }
    if (inStr) { if (c === inStr && html[k - 1] !== "\\") inStr = null; continue; }
    if (c === "/" && n === "/") { inLine = true; k++; continue; }
    if (c === "/" && n === "*") { inBlock = true; k++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") d++;
    else if (c === "}" && --d === 0) { k++; break; }
  }
  let e = k;
  while (e < html.length && /\s/.test(html[e])) e++;
  if (html[e] === ";") e++;
  return html.slice(0, p) + block + html.slice(e);
}

export function setTitle(html, title) {
  const safe = escapeHtml(title);
  const open = html.indexOf("<title>");
  const close = open >= 0 ? html.indexOf("</title>", open) : -1;
  if (open < 0 || close < 0) throw new Error("模板中未找到 <title>…</title>");
  return html.slice(0, open) + `<title>${safe}</title>` + html.slice(close + 8);
}
