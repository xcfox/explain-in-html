/**
 * 由节点坐标派生边路径、标签显隐、hull 矩形、适应/缩放变换。纯计算，不写 DOM。
 */
import { textW, HULL_P, HULL_TP } from "./graph-layout.js";

export function invK(k) {
  return 1 / Math.max(Number(k) || 1, 0.6);
}

export function borderT(nd, ux, uy) {
  if (nd.dia) {
    const s = Math.abs(ux) + Math.abs(uy) || 1;
    return nd.r / s;
  }
  const tx = ux ? nd.w / 2 / Math.abs(ux) : 1e9;
  const ty = uy ? nd.h / 2 / Math.abs(uy) : 1e9;
  return Math.min(tx, ty);
}

export function edgeGeom(e, byN) {
  const A = byN[e.a], B = byN[e.b];
  if (!A || !B) return { d: "M0 0", lx: 0, ly: 0 };
  if (e.a === e.b) {
    const w = A.w, x = A.x, y = A.y - A.h / 2, o = (e.si || 0) * 15;
    return {
      d: `M ${x - w * 0.26} ${y} C ${x - w * 0.55} ${y - 42 - o}, ${x + w * 0.55} ${y - 42 - o}, ${x + w * 0.26} ${y}`,
      lx: x, ly: y - 47 - o,
    };
  }
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / d, uy = dy / d, px = -uy, py = ux;
  const off = (e.parc || 0) * 30;
  const ta = borderT(A, ux, uy), tb = borderT(B, ux, uy);
  const x1 = A.x + ux * ta + px * off, y1 = A.y + uy * ta + py * off;
  const x2 = B.x - ux * tb + px * off, y2 = B.y - uy * tb + py * off;
  const cx = (x1 + x2) / 2 + px * off * 1.4, cy = (y1 + y2) / 2 + py * off * 1.4;
  const q = t => ({
    x: (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2,
    y: (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2,
  });
  return {
    d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
    lx: (x1 + 2 * cx + x2) / 4, ly: (y1 + 2 * cy + y2) / 4,
    pa: q(0.13), pb: q(0.87), na: { x: px, y: py },
  };
}

export function edgeLabel(e) {
  if (e.kind === "n:m") return e.via;
  if (e.kind === "self") return e.role || "";
  if (e.kind === "nary") return "";
  return e.role || "";
}

export function edgeTicks(e) {
  if (e.kind === "n:m") return ["N", "N"];
  if (e.kind === "1:1") return ["1", e.nn ? "1" : "0..1"];
  if (e.kind === "n:1") return ["N", e.nn ? "1" : "0..1"];
  return null;
}

export function edgeClass(e) {
  const cls = e.kind === "n:m" || e.kind === "nary" ? "en"
    : e.kind === "self" ? "es" : e.purpose === "owner" ? "eo"
    : e.purpose === "ref" ? "er" : "eo";
  return "eg " + cls + (e.ident ? " ei" : "");
}

export function edgeHasArrow(e) {
  return e.kind === "n:1" || e.kind === "1:1" || e.kind === "self";
}

export function edgeScreenLen(e, byN, k) {
  if (e.a === e.b) return 1e9;
  const A = byN[e.a], B = byN[e.b];
  if (!A || !B) return 0;
  return Math.hypot(B.x - A.x, B.y - A.y) * (k || 1);
}

export function labelHitsNode(ge, nodes, pad = 12, halfW = 0) {
  for (const n of nodes) {
    if (Math.abs(ge.lx - n.x) < n.w / 2 + halfW + pad && Math.abs(ge.ly - n.y) < n.h / 2 + pad) return true;
  }
  return false;
}

export function edgeChrome(e, ge, nodes, byN, k) {
  const inv = invK(k);
  const label = edgeLabel(e);
  const sl = edgeScreenLen(e, byN, k);
  const lw = label ? textW(label, 12) + (e.kind === "n:m" && (e.attrs || []).length ? 26 : 0) : 0;
  const lwU = textW(label || "", 12) * inv;
  const showL = !!label && sl > lw + 36 && (e.a === e.b || !labelHitsNode(ge, nodes, 8, lwU / 2));
  const showT = sl > 64;
  const toff = 12 * inv;
  const ticks = edgeTicks(e);
  return {
    label,
    showL,
    showT,
    labelX: ge.lx,
    labelY: ge.ly - 6 * inv,
    badgeTransform: `translate(${ge.lx + lwU / 2 + 6 * inv},${ge.ly - 16 * inv}) scale(${inv})`,
    showBadge: !!(e.kind === "n:m" && e.attrs && e.attrs.length && showL),
    attrCount: (e.attrs || []).length,
    ticks,
    tickA: ge.pa && ticks ? { x: ge.pa.x + ge.na.x * toff, y: ge.pa.y + ge.na.y * toff, text: ticks[0] } : null,
    tickB: ge.pb && ticks ? { x: ge.pb.x + ge.na.x * toff, y: ge.pb.y + ge.na.y * toff, text: ticks[1] } : null,
  };
}

export function deriveEdgeViews(edges, nodes, k, { revealIds } = {}) {
  const byN = Object.fromEntries(nodes.map(n => [n.name, n]));
  const reveal = revealIds instanceof Set ? revealIds : new Set(revealIds || []);
  return edges.map(e => {
    const geom = edgeGeom(e, byN);
    const chrome = edgeChrome(e, geom, nodes, byN, k);
    if (reveal.has(e.id)) {
      chrome.showL = !!chrome.label || chrome.showL;
      chrome.showT = true;
      if (e.kind === "n:m" && e.attrs && e.attrs.length) chrome.showBadge = true;
    }
    return { edge: e, geom, chrome, cls: edgeClass(e), hasArrow: edgeHasArrow(e) };
  });
}

export function computeHulls(nodes, { pad = HULL_P, titlePad = HULL_TP } = {}) {
  const d = {};
  for (const n of nodes) (d[n.domain] ||= []).push(n);
  const hulls = [];
  for (const name of Object.keys(d)) {
    const arr = d[name];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of arr) {
      x0 = Math.min(x0, n.x - n.w / 2); y0 = Math.min(y0, n.y - n.h / 2);
      x1 = Math.max(x1, n.x + n.w / 2); y1 = Math.max(y1, n.y + n.h / 2);
    }
    hulls.push({
      name,
      color: arr[0].color,
      x: x0 - pad,
      y: y0 - pad - titlePad,
      w: x1 - x0 + 2 * pad,
      h: y1 - y0 + 2 * pad + titlePad,
      tx: x0 - pad + 14,
      ty: y0 - pad - titlePad + 16,
    });
  }
  return hulls;
}

export function nodesBounds(nodes, { showHull, pad = HULL_P, titlePad = HULL_TP } = {}) {
  const P = showHull ? pad : 8, TP = showHull ? titlePad : 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.w / 2 - P);
    y0 = Math.min(y0, n.y - n.h / 2 - P - TP);
    x1 = Math.max(x1, n.x + n.w / 2 + P);
    y1 = Math.max(y1, n.y + n.h / 2 + P);
  }
  if (!nodes.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

export function fitViewTransform(nodes, viewSize, { showHull } = {}) {
  const width = viewSize && viewSize.width || 0;
  const height = viewSize && viewSize.height || 0;
  if (!nodes.length || !width) return null;
  const { x0, y0, x1, y1 } = nodesBounds(nodes, { showHull });
  const bw = x1 - x0 + 32, bh = y1 - y0 + 32;
  const k0 = Math.min((width - 64) / bw, (height - 64) / bh);
  const k = Math.min(1.25, Math.max(0.35, k0));
  return {
    k,
    tx: (width - (x0 + x1) * k) / 2,
    ty: (height - (y0 + y1) * k) / 2,
  };
}

export function zoomAtTransform(view, mx, my, k2) {
  const k = Math.min(3, Math.max(0.1, k2));
  return {
    k,
    tx: mx - (mx - view.tx) * k / view.k,
    ty: my - (my - view.ty) * k / view.k,
  };
}

export function worldXY(clientX, clientY, rect, view) {
  return {
    x: (clientX - rect.left - view.tx) / view.k,
    y: (clientY - rect.top - view.ty) / view.k,
  };
}

export function bgRect(view, size) {
  const w = size && size.width || 0;
  const h = size && size.height || 0;
  const k = view.k || 1;
  return {
    x: -view.tx / k,
    y: -view.ty / k,
    w: w / k,
    h: h / k,
  };
}

export function focusTransform(node, viewSize, k) {
  const width = viewSize && viewSize.width || 0;
  const height = viewSize && viewSize.height || 0;
  const kk = Math.max(k || 1, 1);
  return {
    k: kk,
    tx: width / 2 - node.x * kk,
    ty: height / 2 - node.y * kk,
  };
}

export { placeTooltip, placePointerTooltip } from "./placement.js";

export function legendItems(nodes, groups) {
  const cnt = {};
  for (const n of nodes) cnt[n.domain] = (cnt[n.domain] || 0) + 1;
  return (groups || []).filter(g => cnt[g.name]).map(g => ({
    name: g.name,
    color: g.color,
    count: cnt[g.name],
  }));
}
