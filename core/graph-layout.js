/**
 * 关系图布局（纯函数/就地更新节点坐标，不碰 DOM）。
 * 域内按归属边分层紧排，域作为超节点按连接就近拼。算法与原 design-viz 对齐。
 */

import { buildGraphModel } from "./graph-model.js";
export const HULL_P = 14;
export const HULL_TP = 16;

export function textW(s, fs) {
  let w = 0;
  for (const ch of String(s || "")) {
    w += /[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch) ? fs : fs * 0.62;
  }
  return w;
}

export function sizeNodes(nodes) {
  for (const n of nodes) {
    if (n.dia) {
      n.r = 24;
      n.w = Math.max(88, textW(n.name, 13) + 16);
      n.h = n.r * 2 + 22;
    } else {
      n.w = Math.max(128, textW(n.name, 15) + 28);
      n.h = 52;
    }
  }
  return nodes;
}

export function deOverlap(nodes, PAD = 16) {
  const EPS = 1e-6;
  for (let it = 0; it < 90; it++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const ox = (a.w + b.w) / 2 + PAD - Math.abs(a.x - b.x);
      const oy = (a.h + b.h) / 2 + PAD - Math.abs(a.y - b.y);
      if (ox <= EPS || oy <= EPS) continue;
      moved = true;
      if (ox < oy) { const d = (a.x <= b.x ? -1 : 1) * ox / 2; a.x += d; b.x -= d; }
      else { const d = (a.y <= b.y ? -1 : 1) * oy / 2; a.y += d; b.y -= d; }
    }
    if (!moved) break;
  }
}

export function packDomain(nodes, edges) {
  const names = new Set(nodes.map(n => n.name));
  const parent = {};
  for (const e of edges) {
    if (e.a === e.b || !names.has(e.a) || !names.has(e.b)) continue;
    if (e.kind === "n:m" || e.kind === "nary") continue;
    (parent[e.a] ||= []).push(e.b);
  }
  const rank = {};
  const getRank = (name, stack) => {
    if (rank[name] != null) return rank[name];
    if (stack.has(name)) return 0;
    stack.add(name);
    const ps = parent[name] || [];
    rank[name] = ps.length ? 1 + Math.max(...ps.map(p => getRank(p, stack))) : 0;
    stack.delete(name);
    return rank[name];
  };
  for (const n of nodes) getRank(n.name, new Set());

  const visDeg = n => (n.edges || []).filter(e => e.purpose !== "ref").length;
  const byRank = [];
  for (const n of nodes) (byRank[rank[n.name]] ||= []).push(n);
  const GAP_X = 34, GAP_Y = 36, MAX_W = 540;
  const rows = [];
  for (const group of byRank) {
    if (!group) continue;
    group.sort((a, b) => visDeg(b) - visDeg(a) || a.name.localeCompare(b.name));
    let cur = [], w = 0;
    for (const n of group) {
      const nw = cur.length ? w + GAP_X + n.w : n.w;
      if (cur.length && nw > MAX_W) { rows.push(cur); cur = [n]; w = n.w; }
      else { cur.push(n); w = nw; }
    }
    if (cur.length) rows.push(cur);
  }

  const rowW = rows.map(row => row.reduce((s, n, i) => s + n.w + (i ? GAP_X : 0), 0));
  const rowH = rows.map(row => Math.max(...row.map(n => n.h)));
  const contentW = Math.max(0, ...rowW);
  const local = {};
  let y = 0;
  rows.forEach((row, ri) => {
    let x = (contentW - rowW[ri]) / 2;
    const h = rowH[ri];
    for (const n of row) {
      local[n.name] = { x: x + n.w / 2, y: y + h / 2 };
      x += n.w + GAP_X;
    }
    y += h + GAP_Y;
  });
  return { local, w: contentW, h: Math.max(0, y - GAP_Y) };
}

export function rectsHit(a, b, pad) {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
         a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export function deOverlapRects(rects, pad) {
  const EPS = 1e-6;
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
      const acy = a.y + a.h / 2, bcy = b.y + b.h / 2;
      const ox = (a.w + b.w) / 2 + pad - Math.abs(acx - bcx);
      const oy = (a.h + b.h) / 2 + pad - Math.abs(acy - bcy);
      if (ox <= EPS || oy <= EPS) continue;
      moved = true;
      if (ox < oy) { const d = (acx <= bcx ? -1 : 1) * ox / 2; a.x += d; b.x -= d; }
      else { const d = (acy <= bcy ? -1 : 1) * oy / 2; a.y += d; b.y -= d; }
    }
    if (!moved) break;
  }
}

function applySavedPositions(nodes, saved) {
  const nSaved = nodes.filter(nd => saved[nd.name]).length;
  if (nSaved < nodes.length * 0.7) return false;
  for (const nd of nodes) {
    const s = saved[nd.name];
    if (s) { nd.x = s.x; nd.y = s.y; }
  }
  for (const nd of nodes) {
    if (saved[nd.name]) continue;
    const mates = nodes.filter(m => m.domain === nd.domain && saved[m.name]);
    if (mates.length) {
      nd.x = mates.reduce((s, m) => s + m.x, 0) / mates.length;
      nd.y = mates.reduce((s, m) => s + m.y, 0) / mates.length + 70;
    } else { nd.x = 0; nd.y = 0; }
  }
  deOverlap(nodes);
  return true;
}

/**
 * 就地写入 nodes[].x/y。saved 为 { [name]: {x,y} }；groups 为域顺序。
 */
export function layoutGraph(nodes, edges, groups = [], saved = {}, { hullP = HULL_P, hullTp = HULL_TP } = {}) {
  if (!nodes.length) return nodes;
  if (applySavedPositions(nodes, saved || {})) return nodes;

  const byN = Object.fromEntries(nodes.map(n => [n.name, n]));
  const byDom = {};
  for (const nd of nodes) (byDom[nd.domain] ||= []).push(nd);
  const make = (name, list) => {
    const pack = packDomain(list, edges);
    return {
      name, nodes: list, local: pack.local,
      w: pack.w + 2 * hullP, h: pack.h + 2 * hullP + hullTp, x: 0, y: 0,
    };
  };
  const clusters = [];
  const seen = new Set();
  for (const g of groups) {
    if (!byDom[g.name]) continue;
    clusters.push(make(g.name, byDom[g.name]));
    seen.add(g.name);
  }
  for (const name in byDom) if (!seen.has(name)) clusters.push(make(name, byDom[name]));

  const pair = (a, b) => a < b ? a + "\0" + b : b + "\0" + a;
  const link = {};
  for (const e of edges) {
    if (e.a === e.b) continue;
    const A = byN[e.a], B = byN[e.b];
    if (!A || !B) continue;
    const da = A.domain, db = B.domain;
    if (da === db) continue;
    const k = pair(da, db);
    const w = e.purpose === "ref" ? 0.5 : (e.purpose === "owner" || e.ident ? 2 : e.kind === "n:m" ? 1.5 : 1);
    link[k] = (link[k] || 0) + w;
  }
  const wLink = (a, b) => link[pair(a, b)] || 0;
  const cross = name => clusters.reduce((s, c) => s + (c.name === name ? 0 : wLink(name, c.name)), 0);
  const gIndex = {};
  groups.forEach((g, i) => { gIndex[g.name] = i; });
  clusters.sort((a, b) => {
    const d = cross(b.name) - cross(a.name);
    return d || (gIndex[a.name] ?? 99) - (gIndex[b.name] ?? 99);
  });

  const GAP = 56;
  const ownerBias = (c, p) => {
    let child = 0, par = 0;
    for (const e of edges) {
      if ((e.purpose !== "owner" && !e.ident) || e.a === e.b) continue;
      const A = byN[e.a], B = byN[e.b];
      if (!A || !B) continue;
      const da = A.domain, db = B.domain;
      if (da === c.name && db === p.name) child++;
      if (db === c.name && da === p.name) par++;
    }
    return child - par;
  };

  const placed = [];
  for (const c of clusters) {
    if (!placed.length) { c.x = 0; c.y = 0; placed.push(c); continue; }
    const nbrs = placed.filter(p => wLink(c.name, p.name) > 0);
    const anchors = nbrs.length ? nbrs : placed;
    let bx = 0, by = 0, tw = 0;
    for (const p of anchors) {
      const w = wLink(c.name, p.name) || 1;
      bx += (p.x + p.w / 2) * w;
      by += (p.y + p.h / 2) * w;
      tw += w;
    }
    bx /= tw; by /= tw;

    const cands = [];
    const push = (x, y) => cands.push({ x, y });
    for (const p of anchors) {
      push(p.x + p.w + GAP, p.y);
      push(p.x + p.w + GAP, p.y + p.h / 2 - c.h / 2);
      push(p.x - c.w - GAP, p.y);
      push(p.x - c.w - GAP, p.y + p.h / 2 - c.h / 2);
      push(p.x, p.y + p.h + GAP);
      push(p.x + p.w / 2 - c.w / 2, p.y + p.h + GAP);
      push(p.x, p.y - c.h - GAP);
      push(p.x + p.w / 2 - c.w / 2, p.y - c.h - GAP);
    }
    push(bx - c.w / 2, by - c.h / 2);

    const free = (x, y) => {
      if (!placed.every(p => !rectsHit({ x, y, w: c.w, h: c.h }, p, GAP))) return false;
      const cy = y + c.h / 2;
      for (const p of anchors) {
        const bias = ownerBias(c, p);
        if (bias > 0 && cy < p.y + p.h / 2 - 10) return false;
        if (bias < 0 && cy > p.y + p.h / 2 + 10) return false;
      }
      return true;
    };
    const score = (x, y) => {
      const cx = x + c.w / 2, cy = y + c.h / 2;
      let s = 0;
      for (const p of anchors) {
        const w = wLink(c.name, p.name) || 1;
        s += w * Math.hypot((cx - (p.x + p.w / 2)) * 0.75, (cy - (p.y + p.h / 2)) * 1.15);
        const bias = ownerBias(c, p);
        if (bias > 0 && cy < p.y + p.h / 2) s += bias * 240;
        if (bias < 0 && cy > p.y + p.h / 2) s += -bias * 240;
        if (bias > 0 && cy > p.y + p.h / 2) s -= bias * 50;
        if (bias < 0 && cy < p.y + p.h / 2) s -= -bias * 50;
      }
      let x0 = x, y0 = y, x1 = x + c.w, y1 = y + c.h;
      for (const p of placed) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
      }
      const bw = x1 - x0, bh = y1 - y0;
      return s + (bw + bh) * 0.35 + Math.max(0, bh * 1.35 - bw) * 0.45;
    };

    let best = null, bestS = 1e15;
    for (const q of cands) {
      if (!free(q.x, q.y)) continue;
      const sc = score(q.x, q.y);
      if (sc < bestS) { bestS = sc; best = q; }
    }
    if (!best) {
      for (let ring = 1; ring <= 48 && !best; ring++) {
        const steps = 12 * ring, dist = ring * (GAP + Math.min(c.w, c.h) * 0.35);
        for (let i = 0; i < steps; i++) {
          const ang = (i / steps) * Math.PI * 2 - Math.PI / 2;
          const x = bx + Math.cos(ang) * dist - c.w / 2;
          const y = by + Math.sin(ang) * dist - c.h / 2;
          if (!free(x, y)) continue;
          const sc = score(x, y);
          if (sc < bestS) { bestS = sc; best = { x, y }; }
        }
      }
    }
    if (!best) {
      let right = 0;
      for (const p of placed) right = Math.max(right, p.x + p.w);
      best = { x: right + GAP, y: 0 };
    }
    c.x = best.x; c.y = best.y;
    placed.push(c);
  }
  deOverlapRects(clusters, GAP);

  for (const c of clusters) {
    for (const n of c.nodes) {
      const loc = c.local[n.name];
      n.x = c.x + hullP + loc.x;
      n.y = c.y + hullP + hullTp + loc.y;
    }
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2);
    x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const n of nodes) { n.x -= cx; n.y -= cy; }
  return nodes;
}


export function layoutFromView(view, saved = {}, opts) {
  const model = buildGraphModel(view.data, view.byName);
  sizeNodes(model.nodes);
  layoutGraph(model.nodes, model.edges, view.groups || [], saved, opts);
  return model;
}
