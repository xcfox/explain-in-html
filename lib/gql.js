// gql.js — 将 .graphql SDL 解析为 GraphQL 页所需的 API 对象。
//
//   API = { name, operations: [{ kind, domain, name, description,
//                                args: [{ name, type, def?, desc? }], returns, returnsDesc? }],
//           types: { Name: { kind: "object|input|enum|interface|union|scalar", description?, sdl, domain? } } }
//
// 输入约定（全部是合法 GraphQL SDL + 少量行注释约定）：
//   """desc""" 或 "desc"   写在 type/字段/参数前   → description
//   # 注释                 写在字段/参数前行或行尾 → description 的兜底
//   # @domain 领域名        某操作字段之前           → 该字段起归入此领域（直到下一个 @domain）
//   # → 说明    或 docstring 内的 @returns 说明    → 操作的 returnsDesc
//   schema { query: MyQ }                          → 自定义根类型名，同样识别
//
// 说明：解析目标是"宽容"而非"完整"——合法 SDL 应全部通过；
// 极少数偏僻写法会被跳过而不是报错。

const PUNCT = new Set("{}()[]:=!|&@,".split(""));

function lex(src) {
  const T = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "#") {
      let e = src.indexOf("\n", i); if (e < 0) e = src.length;
      T.push({ k: "com", v: src.slice(i + 1, e).trim(), pos: i, end: e, line });
      i = e; continue;
    }
    if (src.startsWith('"""', i)) {
      let e = src.indexOf('"""', i + 3); if (e < 0) e = src.length;
      const v = src.slice(i + 3, e);
      T.push({ k: "str", v, pos: i, end: Math.min(e + 3, src.length), line });
      line += (v.match(/\n/g) || []).length;
      i = Math.min(e + 3, src.length); continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') { if (src[j] === "\\") j++; j++; }
      T.push({ k: "str", v: src.slice(i + 1, j), pos: i, end: j + 1, line });
      i = j + 1; continue;
    }
    if (PUNCT.has(c)) { T.push({ k: c, pos: i, end: i + 1, line }); i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < src.length && /\w/.test(src[j])) j++;
      T.push({ k: "name", v: src.slice(i, j), pos: i, end: j, line }); i = j; continue;
    }
    // 数字 / 字面量（默认值里可能出现 -1、1.5、true 等；true/false 走 name 分支无妨）
    let j = i + 1;
    while (j < src.length && /[\w.$+\-]/.test(src[j])) j++;
    T.push({ k: "lit", v: src.slice(i, j), pos: i, end: j, line });
    i = j;
  }
  return T;
}

export function parseSDL(src) {
  const T = lex(src);
  let p = 0;

  const peek = () => T[p];
  const next = () => T[p++];
  const at = k => !!peek() && peek().k === k;
  const atName = v => at("name") && (v === undefined || peek().v === v);

  const roots = { query: "Query", mutation: "Mutation", subscription: "Subscription" };
  const types = {};
  const operations = [];

  let curDomain = null;
  let pendDesc = null;    // 前导 # 注释 → 下一个定义/字段/参数的描述
  let pendReturns = null; // # → xxx  → 下一个操作的 returnsDesc

  const RE_RETURNS = /^(?:[→➜\-]>|@returns)\s*[:：]?\s*(.+)$/;

  function comAnnot(v) {
    let m;
    if ((m = v.match(/^@domain\s+(.+)$/))) { curDomain = m[1].trim(); return; }
    if ((m = v.match(RE_RETURNS))) { pendReturns = m[1].trim(); return; }
    pendDesc = pendDesc ? pendDesc + " " + v : v;
  }
  // docstring 优先；无则取前导注释；docstring 内可含 @returns
  function takeDesc() {
    let d = at("str") ? next().v.trim() : null;
    if (d === null) { d = pendDesc; } pendDesc = null;
    let rd = null;
    if (d) {
      const m = d.match(/@returns\s*[:：]?\s*([\s\S]+)$/);
      if (m) { d = d.slice(0, m.index).trim(); rd = m[1].trim(); }
    }
    return { d: d || null, rd };
  }

  function typeRef() {
    let r;
    if (at("[")) { next(); r = { list: typeRef() }; if (at("]")) next(); }
    else r = { name: next() ? T[p - 1].v : "?" };
    if (at("!")) { next(); r.bang = true; }
    return r;
  }
  const fmtT = r => (r.list ? `[${fmtT(r.list)}]` : r.name) + (r.bang ? "!" : "");

  function skipBalanced(o, c) {
    let d = 0;
    while (peek()) { const t = next(); if (t.k === o) d++; else if (t.k === c && --d === 0) return; }
  }
  function skipDirectives() {
    while (at("@")) {
      next(); if (atName()) next();
      if (at("(")) skipBalanced("(", ")");
    }
  }
  // 从当前位置捕获默认值原文，直到顶层 , 或 )
  function takeDefault() {
    const start = peek() ? peek().pos : src.length;
    let depth = 0, end = start;
    while (peek()) {
      const t = peek();
      if (depth === 0 && (t.k === "," || t.k === ")" || t.k === "}")) break;
      if (depth === 0 && t.k === "name" && T[p + 1] && T[p + 1].k === ":") break; // 下一个参数
      next(); end = t.end;
      if (t.k === "(" || t.k === "[" || t.k === "{") depth++;
      else if (t.k === ")" || t.k === "]" || t.k === "}") depth--;
    }
    return src.slice(start, end).trim() || undefined;
  }

  function parseArgs() {
    const args = [];
    if (!at("(")) return args;
    next();
    while (peek() && !at(")")) {
      if (at("com")) { comAnnot(next().v); continue; }
      if (at(",")) { next(); continue; }
      const { d } = takeDesc();
      if (!atName()) { next(); continue; }
      const arg = { name: next().v };
      if (at(":")) next();
      arg.type = fmtT(typeRef());
      if (at("=")) { next(); const dv = takeDefault(); if (dv !== undefined) arg.def = dv; }
      skipDirectives();
      if (d) arg.desc = d;
      // 参数行尾注释 → desc 兜底
      const last = T[p - 1];
      if (at("com") && last && peek().line === last.line) {
        const v = next().v;
        if (!RE_RETURNS.test(v) && !/^@domain\b/.test(v) && !arg.desc) arg.desc = v;
      } else if (at("com")) {
        // 非同行的注释照常走注解
        comAnnot(next().v);
      }
      args.push(arg);
    }
    if (at(")")) next();
    return args;
  }

  // 解析一对花括号内的字段列表；kind 非空时字段产出为操作
  function parseFields(kind) {
    if (!at("{")) return;
    next();
    while (peek() && !at("}")) {
      if (at("com")) { comAnnot(next().v); continue; }
      if (at(",")) { next(); continue; }
      const { d, rd } = takeDesc();
      if (!atName()) { next(); continue; }
      const name = next().v;
      const args = parseArgs();
      if (!at(":")) { skipDirectives(); continue; }
      next();
      const ret = fmtT(typeRef());
      if (at("=")) { next(); takeDefault(); }          // input 字段默认值
      skipDirectives();
      let retDesc = rd || pendReturns; pendReturns = null;
      let desc = d;
      // 字段行尾注释：# → xxx = returnsDesc；否则若还无描述则当作描述
      const last = T[p - 1];
      if (at("com") && last && peek().line === last.line) {
        const v = next().v; const m = v.match(RE_RETURNS);
        if (m) retDesc = retDesc || m[1].trim();
        else if (!/^@domain\b/.test(v)) { if (!desc) desc = v; }
      }
      if (kind) {
        const op = { kind, domain: curDomain || "api", name };
        if (desc) op.description = desc;
        op.args = args;
        op.returns = ret;
        if (retDesc) op.returnsDesc = retDesc;
        operations.push(op);
      }
    }
    if (at("}")) next();
  }

  function skipEnumBody() {
    if (!at("{")) return;
    skipBalanced("{", "}");
  }

  while (peek()) {
    const t = peek();
    if (t.k === "com") { comAnnot(next().v); continue; }
    const { d: docD } = takeDesc();
    while (at("com")) comAnnot(next().v);            // docstring 与关键字之间的注释
    if (!peek()) break;
    if (!atName()) { next(); continue; }

    const kwTok = peek();
    let kw = kwTok.v, ext = false, defStart = kwTok.pos;
    if (kw === "extend") { next(); ext = true; if (!atName()) break; kw = peek().v; defStart = kwTok.pos; }

    if (kw === "schema") {
      next(); skipDirectives();
      if (at("{")) {
        next();
        while (peek() && !at("}")) {
          if (atName() && T[p + 1] && T[p + 1].k === ":") {
            const op = next().v; next();
            if (atName() && roots[op] !== undefined) roots[op] = next().v;
          } else next();
        }
        if (at("}")) next();
      }
      continue;
    }

    if (kw === "directive") {           // directive @x(...) on A | B —— 跳过整段
      next();
      while (peek() && !(atName("on") && T[p - 1] && T[p - 1].k === "name")) next();
      if (atName("on")) { next(); while (atName() || at("|")) next(); }
      continue;
    }

    if (!["type", "interface", "input", "enum", "union", "scalar"].includes(kw)) { next(); continue; }
    next();
    if (!atName()) continue;
    const nameTok = next();
    const name = nameTok.v;

    if (kw === "scalar") {
      skipDirectives();
      if (!ext && !isRoot(name)) {
        types[name] = mkType("scalar", docD, src.slice(defStart, T[p - 1].end));
      }
      continue;
    }
    if (kw === "union") {
      skipDirectives();
      if (at("=")) { next(); while (atName() || at("|") || at("&")) next(); }
      if (!ext && !isRoot(name)) {
        types[name] = mkType("union", docD, src.slice(defStart, T[p - 1].end));
      }
      continue;
    }

    // type / interface / input / enum
    if (atName("implements")) { next(); while (at("&") || atName()) next(); }
    skipDirectives();
    const kindMap = { type: "object", interface: "interface", input: "input", enum: "enum" };
    const rootKind = rootKindOf(name);
    if (kw === "enum") {
      skipEnumBody();
    } else {
      parseFields(rootKind);          // 根类型产出 operations；普通类型仅推进游标
    }
    const defEnd = T[p - 1] ? T[p - 1].end : nameTok.end;
    if (!ext && !rootKind) {
      types[name] = mkType(kindMap[kw], docD, src.slice(defStart, defEnd));
    }
  }

  function mkType(kind, desc, sdl) {
    const t = { kind };
    if (desc) t.description = desc;
    t.sdl = sdl.trim();
    return t;
  }
  function isRoot(n) { return n === roots.query || n === roots.mutation || n === roots.subscription; }
  function rootKindOf(n) {
    if (n === roots.query) return "query";
    if (n === roots.mutation) return "mutation";
    if (n === roots.subscription) return "subscription";
    return null;
  }

  return { operations, types };
}
