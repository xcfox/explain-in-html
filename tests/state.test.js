import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { useTabs } from "../runtime/composables/use-tabs.js";
import { useSearch } from "../runtime/composables/use-search.js";
import { useSelection } from "../runtime/composables/use-selection.js";
import { useNodeDrag } from "../runtime/composables/use-node-drag.js";
import { zoomAtTransform } from "../core/graph-geometry.js";
import { buildApiView, buildApiSections, opMatches } from "../core/api-view.js";
import { parseSDL } from "../lib/gql.js";
import {
  ensureVueCache, loadHappyDom, installWindowGlobals, setViewport,
  loadVueInWindow, skillPath,
} from "./helpers.js";

async function withSetup(run, exercise = v => v) {
  await ensureVueCache();
  const { Window } = loadHappyDom();
  const win = new Window({ url: "https://example.test/" });
  setViewport(win, 1280, 800);
  const restore = installWindowGlobals(win);
  try {
    const Vue = loadVueInWindow(win);
    let captured;
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const app = Vue.createApp({
      setup() {
        captured = run(Vue);
        return {};
      },
      template: "<div></div>",
    });
    app.mount(host);
    try { return await exercise(captured, Vue); }
    finally { try { app.unmount(); } catch { /* ignore */ } }
  } finally {
    restore();
    try { win.close(); } catch { /* ignore */ }
  }
}

test("tabs 开合与激活是单一事实来源（真实 Vue）", async () => {
  await withSetup(Vue => useTabs(Vue, { isOpenable: id => id === "A" || id === "B" }), t => {
  assert.equal(t.open("A"), true);
  assert.deepEqual(t.tabs.value, ["A"]);
  assert.equal(t.active.value, "A");
  t.open("B");
  t.close("A");
  assert.deepEqual(t.tabs.value, ["B"]);
  assert.equal(t.active.value, "B");
  assert.equal(t.open("C"), false);
  t.closeAll();
  assert.deepEqual(t.tabs.value, []);
  assert.equal(t.active.value, null);
  });
});

test("search + API 域分组筛选随关键字变化（真实 Vue）", async () => {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const api = Object.assign(parseSDL(gql, { name: "TaskFlow" }), { name: "TaskFlow API" });
  const view = buildApiView(api);
  const all = buildApiSections(view, "", {});
  const some = buildApiSections(view, "Task", {});
  assert.ok(all.length >= some.length);
  assert.ok(some.every(s => s.count > 0));
  await withSetup(Vue => useSearch(Vue), ({ filter, setFilter }) => {
  setFilter("xyz-no-match-zzz");
  const empty = buildApiSections(view, filter.value, {});
  assert.equal(empty.length, 0);
  assert.equal(opMatches(view.types, view.ops[0], ""), true);
  });
});

test("选择/热区状态切换（真实 Vue）", async () => {
  await withSetup(Vue => useSelection(Vue), s => {
  s.select("T");
  s.setHot("T");
  assert.equal(s.selected.value, "T");
  s.toggleDomain("core");
  assert.equal(s.focusDomain.value, "core");
  s.toggleDomain("core");
  assert.equal(s.focusDomain.value, null);
  s.clearHot();
  assert.equal(s.hot.value, null);
  });
});

test("节点拖拽只改响应式坐标，平移只改 view（真实 Vue）", async () => {
  const view = { k: 2, tx: 10, ty: 20 }, node = { x: 0, y: 0, name: "N" };
  await withSetup(Vue => useNodeDrag(Vue, { view }), drag => {
    drag.pointerDown({ button: 0, pointerId: 1, clientX: 10, clientY: 10, currentTarget: {}, preventDefault() {} }, node);
    drag.pointerMove({ pointerId: 1, clientX: 30, clientY: 10 });
    assert.equal(node.x, 10); assert.equal(view.tx, 10);
    drag.pointerUp({ pointerId: 1 });
    drag.pointerDown({ button: 0, pointerId: 2, clientX: 0, clientY: 0, currentTarget: {}, preventDefault() {} }, null);
    drag.pointerMove({ pointerId: 2, clientX: 15, clientY: 5 });
    assert.equal(view.tx, 25); assert.equal(view.ty, 25);
    drag.pointerUp({ pointerId: 2 });
  });
});

test("zoomAt 按指针为心更新变换", () => {
  const z = zoomAtTransform({ k: 1, tx: 0, ty: 0 }, 50, 50, 2);
  assert.equal(z.k, 2);
  assert.equal(z.tx, 50 - 50 * 2);
});
