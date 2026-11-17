/**
 * 从图数据构造节点与边（纯数据，与界面框架 / DOM 无关）。
 * n:m 关系表折叠为实体间的边；nary via 保留菱形节点；self / n:1 / 1:1 原样保留。
 */

export function buildGraphModel(data, byName = null) {
  const tables = (data && data.tables) || [];
  const relations = (data && data.relations) || [];
  const map = byName || Object.fromEntries(tables.map(t => [t.name, t]));
  const folded = new Set();
  const edges = [];

  for (const r of relations) {
    if (r.kind === "n:m") {
      if (!map[r.a] || !map[r.b]) continue;
      folded.add(r.via);
      edges.push({
        id: `nm:${r.via}:${r.a}:${r.b}`,
        kind: "n:m", a: r.a, b: r.b, via: r.via, attrs: r.attrs || [],
      });
    } else if (r.kind === "nary") {
      if (!map[r.via]) continue;
      for (const e of r.ends || []) {
        if (!map[e.table]) continue;
        edges.push({
          id: `nary:${r.via}:${e.col}:${e.table}`,
          kind: "nary", a: r.via, b: e.table, via: r.via, col: e.col, attrs: r.attrs || [],
        });
      }
    } else {
      if (!map[r.a] || !map[r.b]) continue;
      edges.push({
        id: `${r.kind}:${r.a}:${(r.aCols || [])[0] || ""}:${r.b}:${(r.bCols || [])[0] || ""}`,
        kind: r.kind, a: r.a, b: r.b,
        aCol: (r.aCols || [])[0], bCol: (r.bCols || [])[0],
        role: r.role, nn: r.nn, purpose: r.purpose, ident: r.ident,
      });
    }
  }

  const nodes = [];
  const byN = {};
  for (const t of tables) {
    if (t.kind === "assoc" && folded.has(t.name)) continue;
    const n = {
      name: t.name,
      kind: t.kind,
      domain: t.domain,
      color: t.color,
      dia: t.kind === "assoc",
      x: 0, y: 0, w: 0, h: 0, r: 0,
      edges: [],
    };
    nodes.push(n);
    byN[n.name] = n;
  }

  const kept = edges.filter(e => byN[e.a] && byN[e.b]);
  for (const e of kept) {
    byN[e.a].edges.push(e);
    if (e.a !== e.b) byN[e.b].edges.push(e);
  }
  return { nodes, edges: kept, byN, folded: [...folded] };
}

export function visibleEdges(edges, showRef) {
  return (edges || []).filter(e => e.purpose !== "ref" || showRef);
}

/** 为平行边 / 多重自环分配偏移索引（mutating copies 的 parc / si）。 */
export function assignEdgeOffsets(edges) {
  const pair = {}, self = {};
  for (const e of edges) {
    if (e.a === e.b) (self[e.a] ||= []).push(e);
    else {
      const k = e.a < e.b ? e.a + "\0" + e.b : e.b + "\0" + e.a;
      (pair[k] ||= []).push(e);
    }
  }
  for (const arr of Object.values(pair)) arr.forEach((e, i) => { e.parc = i - (arr.length - 1) / 2; });
  for (const arr of Object.values(self)) arr.forEach((e, i) => { e.si = i; });
  return edges;
}

export function neighborNames(node) {
  const set = new Set([node.name]);
  for (const e of node.edges || []) { set.add(e.a); set.add(e.b); }
  return set;
}


/** 点击边后打开的详情表：n:m / nary 打开关系表（via），其余打开起点表 a（若有 via 仍优先 via）。 */
export function edgeDetailName(edge) {
  if (!edge) return null;
  if (edge.kind === "n:m" || edge.kind === "nary") return edge.via || edge.a;
  return edge.via || edge.a;
}
