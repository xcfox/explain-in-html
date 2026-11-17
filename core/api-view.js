import { namesIn } from "./highlight.js";

export const KIND_LABEL = {
  object: "type", input: "input", enum: "enum",
  interface: "interface", union: "union", scalar: "scalar",
};

export function kindClass(k) {
  return KIND_LABEL[k] ? ` k-${k}` : "";
}

export function refsOf(types, tn) {
  const t = types[tn];
  return t ? [...new Set(namesIn(t.sdl).filter(x => x !== tn))] : [];
}

export function usedBy(ops, tn) {
  return (ops || []).filter(o =>
    namesIn(o.returns).includes(tn) || (o.args || []).some(a => namesIn(a.type).includes(tn))
  );
}

export function namesFromOp(types, o) {
  return [...new Set([
    ...namesIn(o.returns),
    ...(o.args || []).flatMap(a => namesIn(a.type)),
  ])].filter(n => types[n]);
}

export function buildTypeGraph(types) {
  const implOf = {};
  for (const n of Object.keys(types || {})) {
    const m = (types[n].sdl || "").match(/\bimplements\s+([A-Za-z_][\w\s&]*)/);
    if (!m) continue;
    for (const iface of m[1].split(/\s*&\s*/).map(s => s.trim()).filter(s => types[s])) {
      (implOf[iface] ||= []).push(n);
    }
  }
  const kidsOf = tn => [...new Set([...refsOf(types, tn), ...(implOf[tn] || [])])];
  const parentOf = {};
  for (const p of Object.keys(types || {})) {
    for (const c of kidsOf(p)) (parentOf[c] ||= []).push(p);
  }
  return { implOf, parentOf };
}

export function sigText(o) {
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const desc = clean(o.description), ret = clean(o.returnsDesc);
  const args = o.args || [];
  const tail = "# " + desc + (ret ? ` → ${ret}` : "");
  const flat = `${o.name}${args.length ? "(" +
    args.map(a => `${a.name}: ${a.type}${a.def !== undefined ? " = " + a.def : ""}`).join(", ") +
    ")" : ""}: ${o.returns}`;
  if (!args.some(a => a.desc) && flat.length + tail.length <= 100) {
    return desc || ret ? flat + "  " + tail : flat;
  }
  const lines = args.map(a => {
    let s = `  ${a.name}: ${a.type}`; if (a.def !== undefined) s += ` = ${a.def}`;
    return { s, c: clean(a.desc) };
  });
  const w = Math.max(0, ...lines.map(l => l.s.length));
  return `${o.name}(` + (desc ? "  # " + desc : "") + "\n" +
    lines.map(l => l.s + (l.c ? " ".repeat(w - l.s.length + 2) + "# " + l.c : "")).join("\n") +
    `\n): ${o.returns}` + (ret ? "  # → " + ret : "");
}

export function groupOperations(ops) {
  const groups = [], seen = {};
  for (const o of ops || []) {
    const d = o.domain || "api";
    if (!seen[d]) { seen[d] = { name: d, ops: [], types: [] }; groups.push(seen[d]); }
    seen[d].ops.push(o);
  }
  return { groups, seen };
}

export function assignTypeHomes(types, ops, groups, seen) {
  const typeNames = Object.keys(types || {}).sort();
  const { parentOf } = buildTypeGraph(types);
  const home = {};
  for (const n of typeNames) {
    if (types[n].domain && seen[types[n].domain]) home[n] = types[n].domain;
  }
  const direct = {};
  for (const o of ops || []) {
    for (const n of namesFromOp(types, o)) {
      if (home[n]) continue;
      (direct[n] ||= {});
      direct[n][o.domain] = (direct[n][o.domain] || 0) + 1;
    }
  }
  const pick = counts => {
    let best = null, bestN = -1;
    for (const g of groups) {
      const c = counts[g.name] || 0;
      if (c > bestN) { best = g.name; bestN = c; }
    }
    return bestN > 0 ? best : null;
  };
  for (const n of Object.keys(direct)) if (!home[n]) home[n] = pick(direct[n]);
  for (let i = 0; i < 32; i++) {
    let changed = false;
    for (const n of typeNames) {
      if (home[n]) continue;
      const scores = {};
      for (const p of (parentOf[n] || [])) {
        if (home[p]) scores[home[p]] = (scores[home[p]] || 0) + 1;
      }
      const domains = Object.keys(scores);
      if (!domains.length) continue;
      if (domains.length > 1 && (types[n].kind === "scalar" || types[n].kind === "interface")) continue;
      home[n] = pick(scores);
      changed = true;
    }
    if (!changed) break;
  }
  return home;
}

export function retTypesOf(types, ops) {
  const seen = new Set(), out = [];
  for (const o of ops || []) {
    for (const n of namesIn(o.returns)) {
      if (types[n] && !seen.has(n)) { seen.add(n); out.push(n); }
    }
  }
  return out;
}

export function partitionByKind(types, names) {
  const typ = [], inputs = [];
  for (const n of names) ((types[n] && types[n].kind === "input") ? inputs : typ).push(n);
  return { types: typ, inputs };
}

export function opMatches(types, o, filter) {
  const f = (filter || "").trim().toLowerCase();
  if (!f) return true;
  return o.name.toLowerCase().includes(f)
    || (o.description || "").toLowerCase().includes(f)
    || namesFromOp(types, o).some(n => n.toLowerCase().includes(f));
}

export function typeMatches(types, n, filter) {
  const f = (filter || "").trim().toLowerCase();
  if (!f) return true;
  const t = types[n] || {};
  return n.toLowerCase().includes(f) || (t.description || "").toLowerCase().includes(f);
}

export function buildApiView(api) {
  const types = api.types || {};
  const ops = api.operations || [];
  const { groups, seen } = groupOperations(ops);
  const typeHome = assignTypeHomes(types, ops, groups, seen);
  const typeNames = Object.keys(types).sort();
  for (const n of typeNames) {
    const d = typeHome[n];
    if (d && seen[d]) seen[d].types.push(n);
  }
  const sharedTypes = typeNames.filter(n => !typeHome[n]);
  return { types, ops, groups, typeHome, sharedTypes };
}

export function buildApiSections(view, filter, collapsed) {
  const { types, ops, groups, sharedTypes } = view;
  const f = filter || "";
  const forceOpen = !!String(f).trim();
  const out = [];
  const seenId = new Set();
  for (const g of groups) {
    const gops = g.ops.filter(o => opMatches(types, o, f));
    const rets = retTypesOf(types, gops).filter(n => typeMatches(types, n, f) || gops.length);
    const rest = g.types.filter(n => typeMatches(types, n, f) && !rets.includes(n));
    if (!gops.length && !rets.length && !rest.length) continue;
    const exp = [];
    for (const n of rets) {
      const withId = !seenId.has(n);
      if (withId) seenId.add(n);
      exp.push({ name: n, withId });
    }
    const parts = partitionByKind(types, rest);
    out.push({
      key: g.name, title: g.name,
      count: gops.length + rets.length + rest.length,
      closed: !forceOpen && !!(collapsed && collapsed[g.name]),
      ops: gops, expands: exp, restTypes: parts.types, restInputs: parts.inputs,
    });
  }
  const shared = (sharedTypes || []).filter(n => typeMatches(types, n, f));
  if (shared.length) {
    const parts = partitionByKind(types, shared);
    out.push({
      key: "__shared__", title: "类型", count: shared.length,
      closed: !forceOpen && !!(collapsed && collapsed["__shared__"]),
      ops: [], expands: [], restTypes: parts.types, restInputs: parts.inputs,
    });
  }
  return out;
}

export function tipSdlPreview(t, maxLines = 9) {
  if (!t) return { sdl: "", kind: "", cls: "" };
  const lines = (t.sdl || "").split("\n");
  const sdl = lines.length > maxLines ? lines.slice(0, maxLines).join("\n") + "\n  …" : t.sdl;
  return {
    sdl,
    kind: (KIND_LABEL[t.kind] || t.kind || "").toUpperCase(),
    cls: "chip-tk" + kindClass(t.kind),
    description: t.description || "",
  };
}
