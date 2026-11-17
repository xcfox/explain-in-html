import { enrichSchema, fkTarget, assocEndCols } from "../lib/model.js";

export const PALETTE_L = ["#5f83b4","#b08850","#5f9e83","#9b7bb8","#b87b7b","#6aa3a8","#a38b5f","#8b8fb8"];
export const PALETTE_D = ["#7fa5d6","#d2a464","#7dc2a4","#bd9cd8","#d69c9c","#86c6ca","#c4ad78","#aab0dc"];

export function isDarkScheme() {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyPalette(data, dark) {
  const P = dark ? PALETTE_D : PALETTE_L;
  let pi = 0;
  for (const t of data.tables || []) {
    if (t._auto || !t.color) {
      t._auto = true;
      t.color = P[pi++ % P.length];
    }
  }
  return data;
}

export function buildErdView(raw, dark) {
  const data = enrichSchema(raw);
  applyPalette(data, dark);
  const byName = {};
  const groups = [];
  const seenG = {};
  for (const t of data.tables || []) {
    byName[t.name] = t;
    if (!seenG[t.domain]) {
      seenG[t.domain] = { name: t.domain, color: t.color, tables: [], _auto: t._auto };
      groups.push(seenG[t.domain]);
    }
    seenG[t.domain].tables.push(t);
  }
  for (const g of groups) if (g._auto) g.color = g.tables[0].color;
  const typesByName = {};
  for (const t of data.tables || []) if (t.types) Object.assign(typesByName, t.types);
  return { data, byName, groups, typesByName };
}

export function tableMatches(t, filter) {
  const f = (filter || "").trim().toLowerCase();
  if (!f) return true;
  return t.name.toLowerCase().includes(f)
    || (t.comment || "").toLowerCase().includes(f)
    || (t.domain || "").toLowerCase().includes(f);
}

export function orderedGroupTables(tables) {
  return [...tables.filter(t => t.kind !== "assoc"), ...tables.filter(t => t.kind === "assoc")];
}

export function footText(data) {
  const tables = data.tables || [];
  const nE = tables.filter(t => t.kind !== "assoc").length;
  const nA = tables.filter(t => t.kind === "assoc").length;
  const nR = (data.relations || []).length;
  return nA ? `${nE} 实体 · ${nA} 关系表 · ${nR} 关系` : `${nE} 表 · ${nR} 关系`;
}

export function colCmt(byName, table, col) {
  const t = byName[table], c = t && t.columns.find(x => x.name === col);
  return (c && c.cmt) || "";
}

export function relsTouching(relations, name) {
  const out = [], inn = [], nm = [], slf = [];
  for (const r of relations || []) {
    if (r.kind === "n:m") {
      if (r.a === name || r.b === name) nm.push(r);
    } else if (r.kind === "nary") {
      if ((r.ends || []).some(e => e.table === name)) nm.push(r);
    } else if (r.kind === "self" && r.a === name) slf.push(r);
    else if (r.a === name) out.push(r);
    else if (r.b === name) inn.push(r);
  }
  out.sort((a, b) => (a.purpose === "owner" ? 0 : 1) - (b.purpose === "owner" ? 0 : 1));
  return { out, inn, nm, slf };
}

export function assocParts(data, byName, t) {
  const r = (data.relations || []).find(x => x.via === t.name);
  let ends = [];
  if (r && r.kind === "nary") ends = (r.ends || []).map(e => t.columns.find(c => c.name === e.col));
  else if (r) ends = [t.columns.find(c => c.name === r.aCols[0]), t.columns.find(c => c.name === r.bCols[0])];
  ends = ends.filter(Boolean);
  if (!ends.length) ends = assocEndCols(t);
  const endNames = new Set(ends.map(c => c.name));
  const attrs = t.columns.filter(c => !endNames.has(c.name) && !(c.pk && !c.fk));
  return { r, ends, attrs };
}

export function attrColumns(byName, r) {
  const via = byName[r.via];
  if (!via || !r.attrs || !r.attrs.length) return [];
  return r.attrs.map(n => via.columns.find(c => c.name === n)).filter(Boolean);
}

export { fkTarget, assocEndCols, enrichSchema };
