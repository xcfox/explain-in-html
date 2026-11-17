import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDDL } from "../lib/ddl.js";
import { buildErdView } from "../core/erd-view.js";
import { layoutFromView } from "../core/graph-layout.js";
import { visibleEdges, assignEdgeOffsets } from "../core/graph-model.js";
import { deriveEdgeViews, computeHulls, edgeGeom, zoomAtTransform, fitViewTransform } from "../core/graph-geometry.js";
import { skillPath } from "./helpers.js";

function loadExampleView() {
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  const data = Object.assign(parseDDL(sql, { name: "TaskFlow" }), { name: "TaskFlow" });
  return buildErdView(data, false);
}

test("示例 schema 的布局坐标与 tests/fixtures/graph-layout.json 一致", () => {
  const exp = JSON.parse(readFileSync(skillPath("tests/fixtures/graph-layout.json"), "utf8"));
  const model = layoutFromView(loadExampleView(), {});
  const got = Object.fromEntries(model.nodes.map(n => [n.name, n]));
  assert.equal(model.nodes.length, exp.nodes.length);
  for (const e of exp.nodes) {
    const n = got[e.name];
    assert.ok(n, e.name);
    assert.equal(n.kind, e.kind);
    assert.equal(n.dia, e.dia);
    assert.equal(Math.round(n.x * 1000) / 1000, e.x);
    assert.equal(Math.round(n.y * 1000) / 1000, e.y);
    assert.equal(Math.round(n.w * 1000) / 1000, e.w);
    assert.equal(Math.round(n.h * 1000) / 1000, e.h);
  }
  assert.deepEqual(model.edges.map(e => e.id).sort(), exp.edges.map(e => e.id).sort());
});

test("移动节点后边几何由坐标派生，不需改 DOM", () => {
  const model = layoutFromView(loadExampleView(), {});
  const byN = Object.fromEntries(model.nodes.map(n => [n.name, n]));
  const edge = model.edges.find(e => e.a !== e.b);
  assert.ok(edge);
  const before = edgeGeom(edge, byN);
  byN[edge.b].x += 80;
  byN[edge.b].y += 40;
  const after = edgeGeom(edge, byN);
  assert.notEqual(after.d, before.d);
  assert.ok(after.d.startsWith("M "));
});

test("引用边过滤与 hull 随节点包围盒变化", () => {
  const model = layoutFromView(loadExampleView(), {});
  const hidden = visibleEdges(model.edges, false);
  const shown = visibleEdges(model.edges, true);
  assert.ok(shown.length >= hidden.length);
  assert.ok(hidden.every(e => e.purpose !== "ref"));
  const h1 = computeHulls(model.nodes);
  assert.ok(h1.length >= 1);
  const n = model.nodes[0];
  n.x += 200;
  const h2 = computeHulls(model.nodes);
  const a = h1.find(h => h.name === n.domain);
  const b = h2.find(h => h.name === n.domain);
  assert.ok(a && b);
  assert.ok(b.x !== a.x || b.w !== a.w);
});

test("缩放/适应是纯变换，只返回 k/tx/ty", () => {
  const view = { k: 1, tx: 0, ty: 0 };
  const z = zoomAtTransform(view, 100, 80, 2);
  assert.equal(z.k, 2);
  assert.equal(typeof z.tx, "number");
  const model = layoutFromView(loadExampleView(), {});
  const fit = fitViewTransform(model.nodes, { width: 800, height: 600 }, { showHull: true });
  assert.ok(fit.k >= 0.7 && fit.k <= 1.25);
});

test("可见边分配平行偏移后可派生 chrome", () => {
  const model = layoutFromView(loadExampleView(), {});
  const vis = assignEdgeOffsets(visibleEdges(model.edges, true).map(e => ({ ...e })));
  const views = deriveEdgeViews(vis, model.nodes, 1);
  assert.equal(views.length, vis.length);
  assert.ok(views.every(v => v.geom && v.geom.d && v.cls));
});

import { placeTooltip, placePointerTooltip } from "../core/placement.js";
import { edgeDetailName } from "../core/graph-model.js";
import { PALETTE_L, PALETTE_D, applyPalette } from "../core/erd-view.js";
import { isApiOverlay, clampApiPane, API_PANE_MIN, API_MAIN_MIN } from "../core/chrome.js";

test("placeTooltip 在视口四边内侧钳制", () => {
  const box = { width: 120, height: 80 };
  const pad = 8;
  const vw = 400, vh = 300;
  const left = placeTooltip({ left: 0, top: 100, right: 10, bottom: 120 }, box, { pad, vw, vh });
  assert.equal(left.left, pad);
  const right = placeTooltip({ left: 380, top: 100, right: 400, bottom: 120 }, box, { pad, vw, vh, preferRight: false });
  assert.ok(right.left + box.width <= vw - pad);
  const top = placeTooltip({ left: 100, top: 0, right: 160, bottom: 10 }, box, { pad, vw, vh });
  // 下方放不下时翻到上方，再钳到 pad
  assert.ok(top.top >= pad);
  const bottom = placeTooltip({ left: 100, top: 250, right: 160, bottom: 290 }, box, { pad, vw, vh });
  assert.ok(bottom.top + box.height <= vh - pad);
  const pointer = placePointerTooltip(390, 290, box, { pad, vw, vh });
  assert.ok(pointer.left >= pad && pointer.left + box.width <= vw - pad);
  assert.ok(pointer.top >= pad && pointer.top + box.height <= vh - pad);
});

test("edgeDetailName：n:m/nary 打开 via，普通/自关系打开 a（via 优先）", () => {
  assert.equal(edgeDetailName({ kind: "n:m", a: "User", b: "Project", via: "ProjectMember" }), "ProjectMember");
  assert.equal(edgeDetailName({ kind: "nary", a: "Assignment", b: "Task", via: "Assignment" }), "Assignment");
  assert.equal(edgeDetailName({ kind: "n:1", a: "Task", b: "Project", via: null }), "Task");
  assert.equal(edgeDetailName({ kind: "self", a: "Task", b: "Task" }), "Task");
  assert.equal(edgeDetailName({ kind: "n:1", a: "Task", b: "Project", via: "UnexpectedVia" }), "UnexpectedVia");
});

test("applyPalette 只重染自动色，显式颜色不变", () => {
  const data = {
    tables: [
      { name: "A", _auto: true, color: PALETTE_L[0] },
      { name: "B", color: "#123456" },
    ],
  };
  applyPalette(data, true);
  assert.equal(data.tables[0].color, PALETTE_D[0]);
  assert.equal(data.tables[1].color, "#123456");
  applyPalette(data, false);
  assert.equal(data.tables[0].color, PALETTE_L[0]);
  assert.equal(data.tables[1].color, "#123456");
});

test("窄屏 API 使用覆盖层钳制，不把主栏挤到约 55px", () => {
  assert.equal(isApiOverlay(375), true);
  assert.equal(isApiOverlay(API_PANE_MIN + API_MAIN_MIN), false);
  const w = clampApiPane(560, 375);
  assert.ok(w <= 375 - 24);
  assert.ok(w >= Math.min(API_PANE_MIN, 375 - 24));
});
