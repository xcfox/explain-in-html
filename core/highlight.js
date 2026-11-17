// 把 SDL / TS 源切成 token，供模板 v-for 渲染（避免把源码当 HTML 插入）。

export const GQL_BUILTIN = new Set(["ID", "String", "Int", "Float", "Boolean"]);
export const GQL_KW = new Set([
  "type", "interface", "enum", "input", "union", "scalar", "schema", "implements",
  "extend", "query", "mutation", "subscription", "fragment", "on", "directive",
  "repeatable", "true", "false", "null",
]);
export const TS_KW = new Set([
  "type", "interface", "extends", "keyof", "typeof", "readonly", "in", "as", "const",
  "string", "number", "boolean", "unknown", "any", "void", "null", "undefined",
  "never", "true", "false",
]);

export function tokenizeSDL(src, types = {}) {
  const re = /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\]|\\.)*")|(@[A-Za-z_][A-Za-z0-9_]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  const out = [];
  let m;
  while ((m = re.exec(src || ""))) {
    const [tok, com, str, dir, num, word] = m;
    if (com) out.push({ text: tok, cls: "tk-com" });
    else if (str) out.push({ text: tok, cls: "tk-str" });
    else if (dir) out.push({ text: tok, cls: "tk-dir" });
    else if (num) out.push({ text: tok, cls: "tk-num" });
    else if (word) {
      if (GQL_KW.has(word)) out.push({ text: tok, cls: "tk-kw" });
      else if (/^[A-Z]/.test(word)) {
        if (types[word] && !GQL_BUILTIN.has(word)) {
          out.push({ text: tok, cls: "tk-type", href: `#type-${word}`, name: word });
        } else {
          out.push({ text: tok, cls: "tk-type" });
        }
      } else out.push({ text: tok, cls: "tk-field" });
    } else if (/\s/.test(tok)) out.push({ text: tok, cls: "" });
    else out.push({ text: tok, cls: "tk-pun" });
  }
  return out;
}

export function tokenizeTS(src, typesByName = {}) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)|([\s\S])/g;
  const out = [];
  let m;
  while ((m = re.exec(src || ""))) {
    const [tok, com, str, num, word] = m;
    if (com) out.push({ text: tok, cls: "tk-com" });
    else if (str) out.push({ text: tok, cls: "tk-str" });
    else if (num) out.push({ text: tok, cls: "tk-num" });
    else if (word) {
      if (TS_KW.has(word)) out.push({ text: tok, cls: "tk-kw" });
      else if (typesByName[word]) out.push({ text: tok, cls: "tk-type", ts: word });
      else if (/^[A-Z]/.test(word)) out.push({ text: tok, cls: "tk-type" });
      else out.push({ text: tok, cls: "tk-field" });
    } else if (/\s/.test(tok)) out.push({ text: tok, cls: "" });
    else out.push({ text: tok, cls: "tk-pun" });
  }
  return out;
}

export function namesIn(s) {
  return (String(s || "").match(/[A-Z][A-Za-z0-9_]*/g) || []).filter(w => !GQL_BUILTIN.has(w));
}
