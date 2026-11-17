// ddl.js — 将 .sql 建表语句解析为 表结构页所需的 DATA 对象。
//
//   DATA = { name, tables: [{ name, domain, color?, comment, kind,
//            columns: [{ name, type, pk?, uq?, nn?, fk: "表.列", def?, ts?, cmt? }],
//            indexes: [{ name, cols, uq? }], types?: { 名: "TS 声明体" } }],
//            relations: [ n:1 | 1:1 | self | n:m | nary ] }
//
//   kind 由 PK/FK 推断（见 lib/model.js），可用 -- @kind entity|assoc|weak 覆盖。
//
// 支持的输入（PostgreSQL 方言为主，常规写法均合法）：
//   CREATE TABLE t ( ... )             列定义、行级 PRIMARY KEY/REFERENCES/NOT NULL/UNIQUE/DEFAULT
//                                      表级 PRIMARY KEY/FOREIGN KEY/UNIQUE/CONSTRAINT/CHECK
//   CREATE [UNIQUE] INDEX n ON t (...) 索引（USING/WHERE 子句忽略）
//   ALTER TABLE t ADD ...              ADD PRIMARY KEY / FOREIGN KEY / UNIQUE / COLUMN
//   COMMENT ON TABLE t IS '...'        表说明（覆盖行内注释）
//   COMMENT ON COLUMN t.c IS '...'     列说明，可含 ts: TypeName
//
// 注释约定：
//   -- @domain 领域名 [#rrggbb]         之后的 CREATE TABLE 归入此领域（直到下一个 @domain）
//   -- @kind entity|assoc|weak          覆盖表分类（实体 / n:m 关系表 / 弱实体）
//   CREATE TABLE 之前的 -- 文字行       → 表说明（comment）；多行与空行按换行保留
//   列同行 -- 文字                      → 列说明（cmt）；其中 ts: Name 标记 jsonb 的 TS 类型
//   /* @ts  type X = { ... };  */      → 具名 TS 声明，自动挂到引用它的表
//
// 解析"宽容"：无法识别的语句被跳过而不是报错。

import { enrichSchema } from "./model.js";

const Q = `["'\`\\[\\]]?`;                            // 标识符引号："" '' `` []
const IDENT = `${Q}([\\w$]+)${Q}`;
const TNAME = `((?:${Q}[\\w.]+${Q})(?:\\.${Q}[\\w.]+${Q})?)`;  // 可为 schema.table，各段可带引号

const stripIdent = s => s.replace(/^["'`\[]|["'`\]]$/g, "");
const lastIdent  = s => s.trim().split(".").map(stripIdent).pop();

// 从 s 的 idx（应指向 '('）截取配对括号内容
function parenBody(s, idx) {
  let d = 0, inStr = false;
  for (let i = idx; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "'" && s[i - 1] !== "\\") inStr = false; continue; }
    if (c === "'") { inStr = true; continue; }
    if (c === "(") d++;
    else if (c === ")" && --d === 0) return s.slice(idx + 1, i);
  }
  return s.slice(idx + 1);
}

// 按顶层逗号切分（忽略括号/字符串/行注释内的逗号）。
// 逗号后同行若有 -- 注释，归入前一段（视为前一列的说明）。
function splitTop(s) {
  const out = [];
  let cur = "", d = 0, inStr = false, inLine = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inLine) { cur += c; if (c === "\n") inLine = false; continue; }
    if (inStr) { cur += c; if (c === "'" && s[i - 1] !== "\\") inStr = false; continue; }
    if (c === "-" && s[i + 1] === "-") { inLine = true; cur += c; continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") d++;
    else if (c === ")") d--;
    if (c === "," && d === 0) {
      let j = i + 1;
      while (s[j] === " " || s[j] === "\t") j++;
      if (s[j] === "-" && s[j + 1] === "-") {
        let e = s.indexOf("\n", j); if (e < 0) e = s.length;
        cur += " " + s.slice(j, e);          // 行尾注释并到当前段
        i = e - 1;
      }
      out.push(cur); cur = ""; continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// 拆分语句：顶层 ; 为界，跳过字符串、行注释、$$ 函数体
function splitStmts(src) {
  const out = [];
  let cur = "", d = 0, inStr = false, inLine = false, inDollar = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inDollar) {
      cur += c;
      if (c === "$" && src[i + 1] === "$") { cur += "$"; i++; inDollar = false; }
      continue;
    }
    if (inLine) { cur += c; if (c === "\n") inLine = false; continue; }
    if (inStr) { cur += c; if (c === "'" && src[i - 1] !== "\\") inStr = false; continue; }
    if (c === "-" && src[i + 1] === "-") { inLine = true; cur += c; continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "$" && src[i + 1] === "$") { inDollar = true; cur += c; continue; }
    if (c === "(") d++;
    else if (c === ")") d--;
    if (c === ";" && d === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// 注释文本中的 ts: 标记 → { ts, cmt }；ts 可为 TypeName 或内联 { ... }
function takeTs(text) {
  let ts;
  const cmt = text.replace(/\bts\s*:\s*(\{[\s\S]*?\}|[A-Za-z_$][\w$]*)/, (_, n) => { ts = n; return " "; })
                  .replace(/\s{2,}/g, " ").replace(/^[;；,，\s]+|[;；,，\s]+$/g, "");
  return { ts, cmt };
}

const CONS_KW = /\b(PRIMARY\s+KEY|NOT\s+NULL|NULL|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|COLLATE|GENERATED|COMMENT|FOREIGN\s+KEY)\b/i;
const RE_REF = new RegExp(`\\bREFERENCES\\s+${TNAME}`, "i");

/* ── 列定义 / 表级约束 ── */
function parseItem(item, table) {
  // 提取首条行注释（-- 到行尾；注释后可能还有代码）
  let cmtText = "", body = item;
  const ci = item.indexOf("--");
  if (ci >= 0) {
    const e = item.indexOf("\n", ci);
    const e2 = e < 0 ? item.length : e;
    cmtText = item.slice(ci + 2, e2).trim();
    body = (item.slice(0, ci) + " " + item.slice(e2)).trim();
  }
  const { ts, cmt } = takeTs(cmtText);

  const raw = body.trim();
  if (!raw) return;

  let consName = null, noCons = raw;
  const cm = raw.match(new RegExp(`^CONSTRAINT\\s+${IDENT}\\s+`, "i"));
  if (cm) { consName = cm[1]; noCons = raw.slice(cm[0].length); }

  // 表级约束
  if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\b|CHECK\b|EXCLUDE\b|LIKE\b)/i.test(noCons)) {
    applyTableCons(noCons, table, consName);
    return;
  }
  // 列定义
  const m = raw.match(new RegExp(`^${IDENT}\\s+([\\s\\S]*)$`));
  if (!m) return;
  const col = { name: m[1] };
  const rest = m[2].trim();
  const ki = rest.search(CONS_KW);
  col.type = (ki < 0 ? rest : rest.slice(0, ki)).trim().replace(/\s+/g, " ");
  const cons = ki < 0 ? "" : rest.slice(ki);

  if (/\bPRIMARY\s+KEY\b/i.test(cons)) col.pk = 1;
  if (/\bNOT\s+NULL\b/i.test(cons)) col.nn = 1;
  if (/\bUNIQUE\b/i.test(cons)) col.uq = 1;
  const rm = cons.match(RE_REF);
  if (rm) {
    const tName = lastIdent(rm[1]);
    const ri = cons.indexOf("(", rm.index + rm[0].length);
    const refCol = ri >= 0 ? lastIdent(parenBody(cons, ri).split(",")[0]) : "__pk__";
    col.fk = `${tName}.${refCol}`;
  }
  const dm = cons.match(/\bDEFAULT\s+([\s\S]*?)(?=\s*\b(?:NOT\s+NULL|NULL|REFERENCES|UNIQUE|CHECK|PRIMARY|CONSTRAINT|COLLATE|GENERATED|ON\b)\b|$)/i);
  if (dm) col.def = dm[1].trim();

  if (ts) col.ts = ts;
  if (cmt) col.cmt = cmt;
  table.columns.push(col);
}

function applyTableCons(cons, table, consName) {
  if (/\bPRIMARY\s+KEY\b/i.test(cons)) {
    const pi = cons.indexOf("(");
    if (pi < 0) return;
    (table._pkCols ||= []).push(...parenBody(cons, pi).split(",").map(lastIdent));
    return;
  }
  if (/\bFOREIGN\s+KEY\b/i.test(cons)) {
    const pi = cons.indexOf("(");
    if (pi < 0) return;
    const localCols = parenBody(cons, pi).split(",").map(lastIdent);
    const rm = cons.match(RE_REF);
    if (!rm) return;
    const tName = lastIdent(rm[1]);
    const ri = cons.indexOf("(", rm.index + rm[0].length);
    const refCols = ri >= 0 ? parenBody(cons, ri).split(",").map(lastIdent) : [];
    localCols.forEach((cn, i) => {
      const target = `${tName}.${refCols[i] || refCols[0] || "__pk__"}`;
      const col = table.columns.find(c => c.name === cn);
      if (col) col.fk = target; else (table._pendingFk ||= {})[cn] = target;
    });
    return;
  }
  if (/^\s*UNIQUE\b/i.test(cons)) {
    const pi = cons.indexOf("(");
    if (pi < 0) return;
    const cols = parenBody(cons, pi).split(",").map(s => s.trim()).join(", ");
    table.indexes.push({ name: consName || `uq_${table.name}_${cols.split(",")[0].trim()}`, cols, uq: 1 });
  }
}

/* ── @ts 声明块 ── */
function collectTsBlocks(src, decls) {
  // 结束标记 */ 必须独占一行（避免 TS 声明内的 /** */ 注释提前闭合块）
  return src.replace(/\/\*\s*@ts\b([\s\S]*?)^[ \t]*\*\//gm, (_, body) => {
    const re = /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g;
    let m;
    while ((m = re.exec(body))) {
      let i = re.lastIndex, d = 0, inStr = null, inCom = false;
      for (; i < body.length; i++) {
        const c = body[i];
        if (inCom) { if (c === "*" && body[i + 1] === "/") { inCom = false; i++; } continue; }
        if (inStr) { if (c === inStr && body[i - 1] !== "\\") inStr = null; continue; }
        if (c === "/" && body[i + 1] === "*") { inCom = true; i++; continue; }
        if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
        if ("{([".includes(c)) d++;
        else if ("})]".includes(c)) d--;
        else if (c === ";" && d <= 0) break;
      }
      decls[m[1]] = body.slice(re.lastIndex, i).trim();
      re.lastIndex = i;
    }
    return "\n";
  });
}

/* ── 主解析 ── */
export function parseDDL(src0, { name = "Schema" } = {}) {
  const tsDecls = {};
  let src = collectTsBlocks(src0, tsDecls);
  src = src.replace(/\/\*[\s\S]*?\*\//g, "\n");

  const tables = [], byName = {};
  const idxByTable = {};                 // CREATE INDEX 可能晚于表声明，先缓存
  let curDomain = "未分组", curColor = undefined;

  const findCol = (t, n) => t.columns.find(c => c.name === n);

  for (const rawStmt of splitStmts(src)) {
    // 语句内的纯注释行：@domain 指令 / 表说明
    const comLines = [];
    const code = rawStmt.split("\n").filter(l => {
      const tr = l.trim();
      if (tr.startsWith("--")) { comLines.push(tr.slice(2).trim()); return false; }
      return true;
    }).join("\n");

    let tblCmt = null, tblKind = null;
    for (const c of comLines) {
      const dm = c.match(/^@domain\s+(.+?)(?:\s+(#[0-9a-fA-F]{3,8}))?\s*$/);
      if (dm) {
        curDomain = dm[1].trim(); curColor = dm[2];
        tblCmt = null; // @domain 之前的是文件/分组前言，不是表说明
        continue;
      }
      const km = c.match(/^@kind\s+(entity|assoc|weak)\b/i);
      if (km) { tblKind = km[1].toLowerCase(); continue; }
      if (/^@/.test(c)) continue;
      if (!c) { if (tblCmt) tblCmt += "\n"; continue; }
      tblCmt = tblCmt ? tblCmt + "\n" + c : c;
    }
    if (tblCmt) tblCmt = tblCmt.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n{3,}/g, "\n\n");

    // CREATE TABLE
    let m = code.match(new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TNAME}`, "i"));
    if (m) {
      const tName = lastIdent(m[1]);
      const pi = code.indexOf("(", m.index);
      if (pi < 0) continue;
      const table = {
        name: tName, domain: curDomain, color: curColor,
        comment: tblCmt || "", columns: [], indexes: [],
      };
      if (tblKind) table.kind = tblKind;
      tables.push(table); byName[tName] = table;
      for (const item of splitTop(parenBody(code, pi))) parseItem(item, table);
      continue;
    }

    // CREATE [UNIQUE] INDEX
    m = code.match(new RegExp(`\\bCREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:${IDENT}\\s+)?ON\\s+(?:ONLY\\s+)?${TNAME}`, "i"));
    if (m) {
      const idxName = m[2], tName = lastIdent(m[3]);
      const pi = code.indexOf("(", m.index + m[0].length);
      if (pi >= 0) {
        const cols = parenBody(code, pi).split(",")
          .map(s => s.trim().replace(/\s+(ASC|DESC)\b.*$/i, "").replace(/\bNULLS\s+(FIRST|LAST)\b/i, "").trim())
          .join(", ");
        (idxByTable[tName] ||= []).push({ name: idxName || `idx_${tName}`, cols, uq: !!m[1] });
      }
      continue;
    }

    // COMMENT ON TABLE / COLUMN
    m = code.match(new RegExp(`\\bCOMMENT\\s+ON\\s+TABLE\\s+${TNAME}\\s+IS\\s+'((?:[^'\\\\]|\\\\.)*)'`, "i"));
    if (m) {
      const t = byName[lastIdent(m[1])];
      if (t) t.comment = m[2].replace(/\\n/g, "\n");
      continue;
    }
    m = code.match(/\bCOMMENT\s+ON\s+COLUMN\s+([\w."'`\[\].]+)\s+IS\s+'((?:[^'\\]|\\.)*)'/i);
    if (m) {
      const dot = m[1].lastIndexOf(".");
      const t = byName[lastIdent(m[1].slice(0, dot))];
      const col = t && findCol(t, stripIdent(m[1].slice(dot + 1)));
      if (col) {
        const { ts, cmt } = takeTs(m[2]);
        if (ts) col.ts = ts;
        if (cmt) col.cmt = cmt;
      }
      continue;
    }

    // ALTER TABLE ... ADD ...
    m = code.match(new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?${TNAME}\\s+([\\s\\S]*)$`, "i"));
    if (m) {
      const t = byName[lastIdent(m[1])];
      if (t) {
        for (const a of m[2].split(/\bADD\b/i).slice(1)) {
          const body = a.trim().replace(/,$/, "");
          if (/^(?:CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\b)/i.test(body)) {
            const cn2 = body.match(new RegExp(`^CONSTRAINT\\s+${IDENT}\\s+`, "i"));
            applyTableCons(body.replace(/^CONSTRAINT\s+\S+\s+/i, ""), t, cn2 && cn2[1]);
          } else if (/^COLUMN\b/i.test(body)) {
            parseItem(body.replace(/^COLUMN\s+/i, ""), t);
          }
        }
      }
      continue;
    }
    // 其他语句（CREATE TYPE / SET / INSERT / CREATE FUNCTION ...）跳过
  }

  // 汇总：挂起的主键/外键、CREATE INDEX、__pk__ 目标解析、TS 声明挂载
  for (const t of tables) {
    if (t._pkCols) for (const cn of t._pkCols) { const c = findCol(t, cn); if (c) c.pk = 1; }
    if (t._pendingFk) for (const [cn, target] of Object.entries(t._pendingFk)) {
      const c = findCol(t, cn); if (c) c.fk = target;
    }
    if (idxByTable[t.name]) t.indexes.push(...idxByTable[t.name]);
    const tys = {};
    for (const c of t.columns) {
      if (c.fk && c.fk.endsWith("__pk__")) {
        const tn = c.fk.split(".")[0];
        const target = byName[tn];
        const pkc = target && target.columns.find(x => x.pk);
        c.fk = `${tn}.${pkc ? pkc.name : "id"}`;
      }
      if (c.ts && tsDecls[c.ts]) tys[c.ts] = tsDecls[c.ts];
    }
    if (Object.keys(tys).length) t.types = tys;
    delete t._pkCols; delete t._pendingFk;
  }

  return enrichSchema({ name, tables });
}
