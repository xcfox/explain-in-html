// model.js — 从表的 PK/FK 推出 kind + relations，供解析器与 core/erd-view 使用。
//
//   kind:  entity | weak | assoc
//   relations[]:
//     n:1 / 1:1 / self  { kind, a, b, aCols, bCols, role?, nn?, purpose, ident? }
//     n:m               { kind, a, b, aCols, bCols, aRef, bRef, via, purpose, attrs? }
//     nary              { kind, via, ends: [{ table, col, ref }], purpose, attrs? }
//
//   purpose: owner（结构型 * _id 对齐目标表名）| ref（角色/审计）| self | assoc
//   @kind 已写在表上时不覆盖。

const THIN_NAME = /^(role|status|position|sort|sort_order|ord|priority|seq)$/;
const THIN_SUFFIX = /(_at|_on|_by|_ts)$/;
const AUDIT_COL = /_by$|^(actor_id|uploader_id)$/;

export function splitCols(cols) {
  return String(cols || "").split(",").map(s => s.trim()).filter(Boolean);
}

export function fkTarget(c) {
  if (!c || !c.fk) return null;
  const i = String(c.fk).indexOf(".");
  return { table: i < 0 ? c.fk : c.fk.slice(0, i), col: i < 0 ? "id" : c.fk.slice(i + 1) };
}

function isThinCol(c) {
  const n = (c.name || "").toLowerCase();
  return THIN_NAME.test(n) || THIN_SUFFIX.test(n) || n === "actor_id" || n === "uploader_id";
}

function uniqueIndexEnds(t) {
  const out = [];
  for (const idx of t.indexes || []) {
    if (!idx.uq) continue;
    const cols = splitCols(idx.cols).map(n => t.columns.find(c => c.name === n));
    if (cols.length < 2 || cols.some(c => !c || !c.fk)) continue;
    const tables = new Set(cols.map(c => fkTarget(c).table));
    if (tables.size >= 2 || (tables.size === 1 && cols.length >= 2)) out.push(cols);
  }
  return out;
}

function pkLooksAssoc(pkFk) {
  if (pkFk.length < 2) return false;
  const tables = new Set(pkFk.map(c => fkTarget(c).table));
  return tables.size >= 2 || (tables.size === 1 && pkFk.length >= 2);
}

export function inferKind(t) {
  const pk = (t.columns || []).filter(c => c.pk);
  const pkFk = pk.filter(c => c.fk);
  const pkNon = pk.filter(c => !c.fk);

  if (pkNon.length === 0 && pkLooksAssoc(pkFk)) return "assoc";
  if (pkFk.length === 1 && pkNon.length >= 1) return "weak";

  const uq = uniqueIndexEnds(t)[0];
  if (uq && pkNon.length >= 1) {
    const endNames = new Set(uq.map(c => c.name));
    const extras = t.columns.filter(c => !c.pk && !endNames.has(c.name));
    if (extras.every(isThinCol)) return "assoc";
  }
  return "entity";
}

export function assocEndCols(t) {
  const pkFk = (t.columns || []).filter(c => c.pk && c.fk);
  if (pkLooksAssoc(pkFk)) return pkFk;
  const uq = uniqueIndexEnds(t)[0];
  if (uq) return uq;
  const fks = (t.columns || []).filter(c => c.fk);
  return fks.length >= 2 ? fks : [];
}

function isUniqueCol(t, c) {
  if (c.uq) return true;
  return (t.indexes || []).some(i => i.uq && splitCols(i.cols).length === 1 && splitCols(i.cols)[0] === c.name);
}

export function roleOf(c) {
  if (c && c.cmt) {
    const s = String(c.cmt).replace(/[，。；;：:].*$/, "").trim();
    if (s && s.length <= 16) return s;
  }
  return (c && c.name || "").replace(/_id$/, "");
}

export function purposeOf(col, from, to) {
  const n = (col.name || "").toLowerCase();
  if (from === to) return "self";
  if (AUDIT_COL.test(n)) return "ref";
  const stem = n.replace(/_id$/, "");
  const t = (to || "").toLowerCase();
  if (!stem || !t) return "ref";
  if (stem === t || stem + "s" === t || stem + "es" === t) return "owner";
  if (t.endsWith("s") && t.slice(0, -1) === stem) return "owner";
  if (t.endsWith("ies") && stem === t.slice(0, -3) + "y") return "owner";
  return "ref";
}

export function isAuditRel(r) {
  if (!r || r.kind === "n:m" || r.kind === "nary" || r.kind === "self") return false;
  const col = (r.aCols && r.aCols[0] || "").toLowerCase();
  return AUDIT_COL.test(col);
}

function buildRelations(tables) {
  const rels = [];
  for (const t of tables) {
    if (t.kind === "assoc") {
      const ends = assocEndCols(t);
      if (ends.length < 2) continue;
      const endNames = new Set(ends.map(c => c.name));
      const attrNames = t.columns
        .filter(c => !endNames.has(c.name) && !(c.pk && !c.fk))
        .map(c => c.name);
      const rec = { kind: "n:m", via: t.name, purpose: "assoc" };
      if (attrNames.length) rec.attrs = attrNames;
      if (ends.length === 2) {
        const A = fkTarget(ends[0]), B = fkTarget(ends[1]);
        rec.a = A.table; rec.b = B.table;
        rec.aCols = [ends[0].name]; rec.bCols = [ends[1].name];
        rec.aRef = A.col; rec.bRef = B.col;
      } else {
        rec.kind = "nary";
        rec.ends = ends.map(c => {
          const f = fkTarget(c);
          return { table: f.table, col: c.name, ref: f.col };
        });
      }
      rels.push(rec);
      continue;
    }
    for (const c of t.columns) {
      if (!c.fk) continue;
      const f = fkTarget(c);
      const self = t.name === f.table;
      rels.push({
        kind: self ? "self" : isUniqueCol(t, c) ? "1:1" : "n:1",
        a: t.name,
        b: f.table,
        aCols: [c.name],
        bCols: [f.col],
        role: roleOf(c),
        nn: (c.nn || c.pk) ? 1 : undefined,
        purpose: self ? "self" : purposeOf(c, t.name, f.table),
        ident: t.kind === "weak" && c.pk ? 1 : undefined,
      });
    }
  }
  for (const r of rels) {
    if (r.nn === undefined) delete r.nn;
    if (!r.ident) delete r.ident;
  }
  return rels;
}

export function enrichSchema(data) {
  const tables = data.tables || [];
  for (const t of tables) {
    if (!t.kind) t.kind = inferKind(t);
  }
  if (!Array.isArray(data.relations)) data.relations = buildRelations(tables);
  return data;
}
