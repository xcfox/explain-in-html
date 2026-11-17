import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDDL } from "../lib/ddl.js";
import { parseSDL } from "../lib/gql.js";
import { buildErdView, tableMatches } from "../core/erd-view.js";
import { edgeDetailName } from "../core/graph-model.js";
import { registerErd } from "../runtime/register-erd.js";
import { registerApi } from "../runtime/register-api.js";
import { define as defineExplorer } from "../runtime/components/erd-explorer.js";
import { define as defineGraph } from "../runtime/components/erd-graph.js";
import { define as defineApiExplorer } from "../runtime/components/api-explorer.js";
import { define as defineChip } from "../runtime/components/api-type-chip.js";
import { define as defineDomain } from "../runtime/components/api-domain-section.js";
import { define as defineTooltip } from "../runtime/components/eih-tooltip.js";
import { useTooltip } from "../runtime/composables/use-tooltip.js";
import { erdPosKey } from "../core/storage.js";
import {
  ensureVueCache, loadHappyDom, installWindowGlobals, setViewport, installPointerCapture,
  loadVueInWindow, stubRect, memoryStorage, dispatchPointer, skillPath,
} from "./helpers.js";

function exampleErd() {
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  return Object.assign(parseDDL(sql, { name: "TaskFlow" }), { name: "TaskFlow" });
}
function exampleApi() {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  return Object.assign(parseSDL(gql, { name: "TaskFlow" }), { name: "TaskFlow API" });
}

async function withMount(fn, { width = 1280, height = 800 } = {}) {
  await ensureVueCache();
  const { Window } = loadHappyDom();
  const win = new Window({ url: "https://example.test/" });
  setViewport(win, width, height);
  const restore = installWindowGlobals(win);
  const capture = installPointerCapture(win);
  const errors = [];
  const onErr = ev => errors.push(ev.error || ev.message || ev);
  win.addEventListener("error", onErr);
  try {
    const Vue = loadVueInWindow(win);
    const result = await fn({ win, Vue, document: win.document, errors, capture });
    assert.deepEqual(errors.map(String), [], errors.join(" | "));
    return result;
  } finally {
    capture.restore();
    restore();
    try { win.close(); } catch { /* ignore */ }
  }
}

function flush(Vue, ms = 0) {
  return Vue.nextTick().then(() => ms ? new Promise(r => setTimeout(r, ms)) : Vue.nextTick());
}

function graphButton(host, text) {
  const button = [...host.querySelectorAll("#gBar button")].find(el => el.textContent === text);
  assert.ok(button, `missing graph control ${text}`);
  button.click();
}
function graphToggle(host, index, checked) {
  const input = host.querySelectorAll("#gBar input")[index];
  assert.ok(input); input.checked = checked;
  input.dispatchEvent(new host.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

test("【需联网·可缓存】erd-graph 顶层 cssVars 解包，缩放更新 --invk 与 bg", async () => {
  const schema = exampleErd();
  const view = buildErdView(schema, false);
  const store = memoryStorage();
  await withMount(async ({ Vue, document, win }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { view, store }; },
      template: `<erd-graph ref="g" :view="view" :storage="store" :wide="true"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector("#graphWrap") || host.querySelector(".graph-wrap");
    const svg = host.querySelector("#gSvg") || host.querySelector("svg");
    assert.ok(wrap && svg, "图未渲染");
    stubRect(wrap, { width: 800, height: 600, left: 0, top: 0 });
    stubRect(svg, { width: 800, height: 600, left: 0, top: 0 });
    const g = inst.$refs.g;
    assert.ok(g);
    await flush(Vue, 20);
    const k0 = g.pzView.k;
    graphButton(host, "+");
    await flush(Vue);
    const style = svg.getAttribute("style") || svg.style.cssText || "";
    assert.match(String(style + " " + svg.style.getPropertyValue("--invk")), /--invk/);
    const inv = svg.style.getPropertyValue("--invk") || (style.match(/--invk:\s*([^;]+)/) || [])[1];
    assert.equal(Number(inv), Number((1 / Math.max(g.pzView.k, 0.6)).toFixed(4)), "inverse scale must reach actual SVG style");
    assert.ok(g.pzView.k !== k0, "zoomBy 应改变 k");
    const bg = host.querySelector("#gBg");
    assert.ok(bg, "底图矩形");
    const w0 = Number(bg.getAttribute("width"));
    graphButton(host, "+");
    await flush(Vue);
    const w1 = Number(bg.getAttribute("width"));
    assert.ok(w1 !== w0 && Number.isFinite(w1), `bg 宽度应随缩放变化 ${w0} -> ${w1}`);
    app.unmount();
  });
});

test("拖拽节点后面与 hull 跟随；平移/缩放/适应/重排/引用边与分组开关有效", async () => {
  const schema = exampleErd();
  const view = buildErdView(schema, false);
  const store = memoryStorage();
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { view, store }; },
      template: `<erd-graph ref="g" :view="view" :storage="store" :wide="true"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector(".graph-wrap");
    const svg = host.querySelector("svg");
    stubRect(wrap, { width: 900, height: 700, left: 0, top: 0 });
    stubRect(svg, { width: 900, height: 700, left: 0, top: 0 });
    const g = inst.$refs.g;
    await flush(Vue, 20);
    assert.ok(g.nodes.length > 0 && g.edgeViews.length > 0, "应有节点和边");
    assert.ok(g.showHull && g.hulls.length > 0, "默认应显示 hull");
    const node = g.nodes[0];
    const x0 = node.x, y0 = node.y;
    const path0 = (g.edgeViews[0] && g.edgeViews[0].geom && g.edgeViews[0].geom.d) || "";
    const hullKey = h => [h.name, h.x, h.y, h.w, h.h].join(":");
    const hx0 = g.hulls.filter(h => h.name === node.domain).map(hullKey).join("|") || g.hulls.map(hullKey).join("|");
    dispatchPointer(host.querySelector("g.gn"), "pointerdown", { x: 100, y: 100, pointerId: 1, win: document.defaultView });
    dispatchPointer(svg, "pointermove", { x: 280, y: 240, pointerId: 1, win: document.defaultView });
    dispatchPointer(svg, "pointerup", { x: 280, y: 240, pointerId: 1, win: document.defaultView });
    await flush(Vue);
    assert.ok(node.x !== x0 || node.y !== y0, "节点坐标应移动");
    const path1 = g.edgeViews[0].geom.d;
    assert.notEqual(path1, path0, "边路径应跟随");
    const hx1 = g.hulls.filter(h => h.name === node.domain).map(hullKey).join("|") || g.hulls.map(hullKey).join("|");
    assert.notEqual(hx1, hx0, "hull 应跟随");

    const tx0 = g.pzView.tx, ty0 = g.pzView.ty;
    dispatchPointer(svg, "pointerdown", { x: 200, y: 200, pointerId: 2, win: document.defaultView });
    dispatchPointer(svg, "pointermove", { x: 240, y: 230, pointerId: 2, win: document.defaultView });
    dispatchPointer(svg, "pointerup", { x: 240, y: 230, pointerId: 2, win: document.defaultView });
    await flush(Vue);
    assert.ok(g.pzView.tx !== tx0 || g.pzView.ty !== ty0, "平移应改 view");

    const k0 = g.pzView.k;
    graphButton(host, "+");
    await flush(Vue);
    assert.notEqual(g.pzView.k, k0, "缩放");
    const pos = g.nodes.map(n => n.name + ":" + n.x + "," + n.y).join("|");
    graphButton(host, "适应");
    await flush(Vue);
    assert.ok(Number.isFinite(g.pzView.k) && g.pzView.k > 0, "适应后 k 有效");

    const nRef = g.edgeViews.length;
    graphToggle(host, 0, true);
    await flush(Vue);
    assert.ok(g.edgeViews.length >= nRef, "打开引用边后面数应不少于默认");
    graphToggle(host, 1, false);
    await flush(Vue);
    assert.equal(g.hulls.length, 0, "关闭分组后无 hull");
    graphToggle(host, 1, true);
    await flush(Vue);
    assert.ok(g.hulls.length > 0);
    assert.ok(g.legend.length > 0, "图例应有项");
    const before = g.nodes.map(n => n.name + ":" + Math.round(n.x) + "," + Math.round(n.y)).join("|");
    graphButton(host, "重排");
    await flush(Vue);
    const after = g.nodes.map(n => n.name + ":" + Math.round(n.x) + "," + Math.round(n.y)).join("|");
    assert.notEqual(after, before, "relayout must replace the dragged layout");
    assert.equal(node.x, x0); assert.equal(node.y, y0);
    assert.ok(g.nodes.length > 0);
    assert.ok(g.pzView.k > 0);
    app.unmount();
  });
});

test("边点击不依赖 mouseenter：普通 / n:m / nary / self 映射详情名", async () => {
  const schema = exampleErd();
  schema.tables.push({ name: "multi", kind: "assoc", domain: "多元", columns: [] });
  schema.relations.push({ kind: "nary", via: "multi", ends: [
    { table: "users", col: "u" }, { table: "projects", col: "p" }, { table: "tasks", col: "t" },
  ] });
  const view = buildErdView(schema, false);
  const opened = [];
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() {
        return {
          view,
          store: memoryStorage(),
          onOpen(n) { opened.push(n); },
        };
      },
      template: `<erd-graph ref="g" :view="view" :storage="store" :wide="true" @open-tab="onOpen"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector(".graph-wrap");
    const svg = host.querySelector("svg");
    stubRect(wrap, { width: 800, height: 600, left: 0, top: 0 });
    stubRect(svg, { width: 800, height: 600, left: 0, top: 0 });
    const g = inst.$refs.g;
    await flush(Vue, 20);
    const kinds = {};
    for (const v of g.edgeViews) {
      const k = v.edge.kind;
      if (!kinds[k]) kinds[k] = v;
    }
    for (const k of ["n:m", "nary", "self", "n:1"]) assert.ok(kinds[k], `fixture must include ${k}`);
    for (const v of Object.values(kinds)) {
      const expect = edgeDetailName(v.edge);
      const group = [...host.querySelectorAll("g.eg")].find(el => el.getAttribute("data-id") === v.edge.id);
      assert.ok(group, `missing rendered edge ${v.edge.id}`);
      const before = opened.length;
      dispatchPointer(group, "pointerdown", { x: 10, y: 10, pointerId: 11, win: document.defaultView });
      dispatchPointer(group, "pointerup", { x: 10, y: 10, pointerId: 11, win: document.defaultView });
      await flush(Vue);
      assert.equal(opened.length, before + 1, "one tap must open exactly once");
      assert.equal(opened[opened.length - 1], expect, `${v.edge.kind} 应打开 ${expect}`);
    }
    app.unmount();
  });
});

test("搜索 projects 只筛导航，正文仍为全部卡片（原语义）", async () => {
  const schema = exampleErd();
  const allNames = (schema.tables || []).map(t => t.name);
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { schema }; },
      template: `<erd-explorer ref="ex" :schema="schema"></erd-explorer>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    await flush(Vue, 20);
    const ex = inst.$refs.ex;
    const cards0 = host.querySelectorAll("section.t-block").length;
    assert.ok(cards0 === allNames.length || cards0 >= 1, `卡片 ${cards0} 表 ${allNames.length}`);
    ex.filter = "projects";
    await flush(Vue);
    const navText = (host.querySelector("#nav") || host.querySelector(".erd-nav")).textContent;
    for (const t of schema.tables) {
      if (!tableMatches(t, "projects")) {
        // 导航中不应再列出该表名作为单独项——宽松：navGroups 不含
      }
    }
    const navNames = ex.navGroups.flatMap(g => g.tables.map(t => t.name));
    assert.ok(navNames.every(n => tableMatches(schema.tables.find(t => t.name === n), "projects")));
    assert.ok(navNames.length < allNames.length, "导航应被筛选");
    const cards1 = host.querySelectorAll("section.t-block").length;
    assert.equal(cards1, cards0, "主栏卡片数不应随搜索减少");
    const cardNames = [...host.querySelectorAll("section.t-block")].map(el => el.getAttribute("data-name") || el.id);
    assert.ok(allNames.every(n => cardNames.includes(n)), "正文仍有全部表卡片");
    app.unmount();
  });
});

test("表悬停预览：导航与卡片有 tip 入口", async () => {
  const schema = exampleErd();
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { schema }; },
      template: `<erd-explorer ref="ex" :schema="schema"></erd-explorer>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    await flush(Vue);
    const ex = inst.$refs.ex;
    const item = host.querySelector(".nav-item");
    const cardTip = host.querySelector("[data-tip-table]");
    assert.ok(item, "导航项");
    assert.ok(cardTip, "卡片上应有 data-tip-table");
    const name = item.textContent.trim().split(/\s+/)[0] || ex.current;
    ex.showTableTip(name, item);
    await flush(Vue, 300);
    assert.equal(ex.tip.tip.show, true);
    assert.equal(ex.tip.tip.payload, name);
    app.unmount();
  });
});

test("tooltip 绑定真实根元素，nextTick 后写入位置", async () => {
  await withMount(async ({ Vue, document, win }) => {
    setViewport(win, 400, 300);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let tip;
    const anchor = document.createElement("button");
    anchor.textContent = "a";
    document.body.appendChild(anchor);
    stubRect(anchor, { left: 10, top: 10, width: 40, height: 20 });
    const app = Vue.createApp({
      setup() {
        tip = useTooltip(Vue, { delay: 0 });
        return { tip, style: tip.style, show: Vue.computed(() => tip.tip.show) };
      },
      template: `<eih-tooltip :show="show" :style-pos="style" :measure-ref="tip.bindBox"><div style="width:120px;height:80px">tip</div></eih-tooltip>`,
    });
    app.component("eih-tooltip", defineTooltip(Vue));
    app.mount(host);
    await flush(Vue);
    stubRect(tip.boxEl.value, { width: 120, height: 80, left: 0, top: 0 });
    tip.show({ kind: "table", payload: "T", anchor }, 0);
    await flush(Vue, 20);
    assert.ok(tip.boxEl.value, "measure-ref 应写入真实元素");
    await flush(Vue);
    assert.ok(tip.tip.x >= 8);
    assert.ok(tip.tip.y >= 8);
    assert.ok(tip.tip.x + 120 <= 400 - 8 + 1e-6);
    app.unmount();
  });
});

test("位置记忆：拖拽后用同一存储重新 mount 可恢复坐标", async () => {
  const schema = exampleErd();
  const view = buildErdView(schema, false);
  const store = memoryStorage();
  let savedName, savedX, savedY;
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { view, store }; },
      template: `<erd-graph ref="g" :view="view" :storage="store"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector(".graph-wrap");
    const svg = host.querySelector("svg");
    stubRect(wrap, { width: 800, height: 600, left: 0, top: 0 });
    stubRect(svg, { width: 800, height: 600, left: 0, top: 0 });
    const g = inst.$refs.g;
    await flush(Vue, 20);
    const node = g.nodes[0];
    savedName = node.name;
    dispatchPointer(host.querySelector("g.gn"), "pointerdown", { x: 40, y: 40, pointerId: 1, win: document.defaultView });
    dispatchPointer(svg, "pointermove", { x: 200, y: 180, pointerId: 1, win: document.defaultView });
    dispatchPointer(svg, "pointerup", { x: 200, y: 180, pointerId: 1, win: document.defaultView });
    await flush(Vue);
    savedX = node.x;
    savedY = node.y;
    assert.ok(store.getItem(erdPosKey("TaskFlow")), "应写入位置记忆");
    app.unmount();
  });
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { view, store }; },
      template: `<erd-graph ref="g" :view="view" :storage="store"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const g = inst.$refs.g;
    const node = g.nodes.find(n => n.name === savedName);
    assert.ok(node);
    assert.equal(Math.round(node.x), Math.round(savedX));
    assert.equal(Math.round(node.y), Math.round(savedY));
    app.unmount();
  });
});

test("切换列表/图时保留用户视野；goGraph 聚焦不被适应覆盖", async () => {
  const schema = exampleErd();
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { schema }; },
      template: `<erd-explorer ref="ex" :schema="schema"></erd-explorer>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector(".graph-wrap");
    const svg = host.querySelector("svg");
    stubRect(wrap, { width: 800, height: 600, left: 0, top: 0 });
    stubRect(svg, { width: 800, height: 600, left: 0, top: 0 });
    const ex = inst.$refs.ex;
    ex.setMode("graph");
    await flush(Vue, 30);
    const g = ex.graphRef;
    assert.ok(g);
    const tx0 = g.pzView.tx, ty0 = g.pzView.ty, k0 = g.pzView.k;
    g.pz.panBy(40, -25);
    g.pz.zoomBy(1.3);
    await flush(Vue);
    const tx1 = g.pzView.tx, ty1 = g.pzView.ty, k1 = g.pzView.k;
    assert.ok(tx1 !== tx0 || ty1 !== ty0 || k1 !== k0);
    ex.setMode("list");
    await flush(Vue);
    ex.setMode("graph");
    await flush(Vue, 30);
    assert.equal(g.pzView.tx, tx1);
    assert.equal(g.pzView.ty, ty1);
    assert.equal(g.pzView.k, k1);
    const target = g.nodes[0].name;
    const beforeFitWouldBe = { ...g.pzView };
    ex.goGraph(target);
    await flush(Vue, 30);
    // 聚焦后 k 保持（focusTransform 保持当前 k），且选中目标；不应把 k 重置为一次全图适应
    assert.equal(g.selected, target);
    assert.equal(g.pzView.k, k1);
    app.unmount();
  });
});

test("view 换肤同步自动色并保留坐标；显式色不变", async () => {
  const schema = {
    name: "ColorSync",
    tables: [
      { name: "Explicit", domain: "A", color: "#abcdef", columns: [{ name: "id" }], indexes: [] },
      { name: "AutoOne", domain: "A", columns: [{ name: "id" }], indexes: [] },
      { name: "AutoTwo", domain: "B", columns: [{ name: "id" }], indexes: [] },
    ],
    relations: [],
  };
  const explicit = schema.tables[0];
  await withMount(async ({ Vue, document }) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const light = buildErdView(schema, false);
    const app = Vue.createApp({
      setup() {
        const view = Vue.ref(light);
        return { view, store: memoryStorage() };
      },
      template: `<erd-graph ref="g" :view="view" :storage="store"></erd-graph>`,
    });
    registerErd(app, Vue);
    const inst = app.mount(host);
    const wrap = host.querySelector(".graph-wrap");
    const svg = host.querySelector("svg");
    stubRect(wrap, { width: 800, height: 600, left: 0, top: 0 });
    stubRect(svg, { width: 800, height: 600, left: 0, top: 0 });
    const g = inst.$refs.g;
    await flush(Vue, 20);
    const pos = Object.fromEntries(g.nodes.map(n => [n.name, { x: n.x, y: n.y, color: n.color }]));
    const autoNode = g.nodes.find(n => n.name !== explicit.name);
    const autoColor0 = autoNode.color;
    const expl0 = g.nodes.find(n => n.name === explicit.name).color;
    const { applyPalette } = await import("../core/erd-view.js");
    applyPalette(schema, true);
    const darkView = buildErdView(schema, true);
    inst.view = darkView;
    await flush(Vue);
    const auto1 = g.nodes.find(n => n.name === autoNode.name);
    const expl1 = g.nodes.find(n => n.name === explicit.name);
    assert.equal(expl1.color, "#abcdef");
    assert.notEqual(auto1.color, autoColor0);
    assert.equal(auto1.x, pos[auto1.name].x);
    assert.equal(auto1.y, pos[auto1.name].y);
    app.unmount();
  });
});

test("open-type 转发全部参数（含原生事件修饰键）", async () => {
  const api = exampleApi();
  await withMount(async ({ Vue, document, win }) => {
    const received = [];
    const types = api.types || (await import("../core/api-view.js")).buildApiView(api).types;
    const viewMod = await import("../core/api-view.js");
    const typenames = Object.keys(viewMod.buildApiView(api).types);
    assert.ok(typenames.length > 0);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() {
        return {
          name: typenames[0],
          types: viewMod.buildApiView(api).types,
          onOpen(...args) { received.push(args); },
        };
      },
      template: `<api-type-chip :name="name" :types="types" @open-type="onOpen"></api-type-chip>`,
    });
    registerApi(app, Vue);
    app.mount(host);
    await flush(Vue);
    const a = host.querySelector("a");
    assert.ok(a);
    const ev = new win.MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true, ctrlKey: false });
    a.dispatchEvent(ev);
    await flush(Vue);
    assert.ok(received.length >= 1);
    assert.equal(received[0][0], typenames[0]);
    assert.ok(received[0][1], "第二参应是原生事件");
    assert.equal(!!received[0][1].metaKey, true);
    app.unmount();
  });
});

test("375px 视口打开类型详情时根节点为覆盖层，不把主栏挤没", async () => {
  const api = exampleApi();
  await withMount(async ({ Vue, document, win }) => {
    setViewport(win, 375, 800);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() { return { api }; },
      template: `<api-explorer ref="ex" :api="api"></api-explorer>`,
    });
    registerApi(app, Vue);
    const inst = app.mount(host);
    await flush(Vue, 20);
    const ex = inst.$refs.ex;
    assert.equal(ex.overlay, true);
    const typenames = Object.keys(ex.types);
    ex.openTab(typenames[0], { defaultPrevented: true, preventDefault() {}, metaKey: false, ctrlKey: false });
    await flush(Vue);
    const root = host.querySelector(".api-root");
    assert.ok(root.classList.contains("is-overlay"));
    const pane = host.querySelector("#pane");
    assert.ok(pane.classList.contains("show"));
    assert.ok(pane.classList.contains("overlay"));
    const main = host.querySelector("#main");
    assert.ok(main, "主栏仍在文档流中（覆盖层不挤占）");
    const scrim = host.querySelector(".api-scrim.is-on");
    assert.ok(scrim, "应显示遮罩");
    scrim.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    await flush(Vue);
    assert.equal(ex.hasTabs, false);
    app.unmount();
  }, { width: 375, height: 800 });
});

test("capture retarget / jitter / drag / cancel / second pointer produce exactly one or zero opens", async () => {
  await withMount(async ({ Vue, document, win, capture }) => {
    const opened = [], routes = [];
    const view = buildErdView({ name: "Pointer", tables: ["A", "B"].map(name => ({ name, domain: "D", columns: [] })),
      relations: [{ kind: "n:1", a: "A", b: "B", aCols: ["b"], bCols: ["id"] }] }, false);
    const host = document.createElement("div"); document.body.append(host);
    const app = Vue.createApp({ setup: () => ({ view, store: memoryStorage(), wide: Vue.ref(true), openTab: n => { opened.push(n); routes.push("tab"); }, openList: n => { opened.push(n); routes.push("list"); } }),
      template: `<erd-graph ref="g" :view="view" :storage="store" :wide="wide" @open-tab="openTab" @open-list="openList"></erd-graph>` });
    registerErd(app, Vue); const vm = app.mount(host);
    const svg = host.querySelector("svg"), wrap = host.querySelector(".graph-wrap"), edge = host.querySelector("g.eg");
    stubRect(svg, { width: 800, height: 600 }); stubRect(wrap, { width: 800, height: 600 });
    await flush(Vue, 20);
    const send = (el, type, id, x = 100, y = 100) => dispatchPointer(el, type, { x, y, pointerId: id, win });
    // Event hits the captured svg on up, not the original edge. Identity must survive routing.
    send(edge, "pointerdown", 1); assert.ok(capture.active.get(1) === svg);
    let upTarget;
    svg.addEventListener("pointerup", ev => { upTarget = ev.target; }, { once: true });
    send(edge, "pointerup", 1); assert.ok(upTarget === svg, "captured up must target svg during dispatch");
    assert.deepEqual(opened, ["A"]); assert.equal(capture.active.size, 0);
    // Three pixels are below the one screen-space threshold; no stale edge remains for blank taps.
    send(edge, "pointerdown", 2); send(edge, "pointermove", 2, 103); send(edge, "pointerup", 2, 103);
    assert.equal(opened.length, 2);
    send(svg, "pointerdown", 3); send(svg, "pointerup", 3); assert.equal(opened.length, 2);
    // Crossing the threshold stays a drag even if the pointer returns to its origin.
    send(edge, "pointerdown", 4); send(edge, "pointermove", 4, 130); send(edge, "pointerup", 4);
    assert.equal(opened.length, 2);
    send(edge, "pointerdown", 5); send(edge, "pointercancel", 5); send(svg, "pointerup", 5);
    assert.equal(opened.length, 2);
    send(edge, "pointerdown", 6); svg.releasePointerCapture(6); send(svg, "pointerup", 6);
    assert.equal(opened.length, 2);
    send(edge, "pointerdown", 7);
    send(edge, "pointerdown", 8); send(svg, "pointermove", 8, 400); send(svg, "pointerup", 8);
    assert.equal(capture.active.has(7), true); assert.equal(capture.active.has(8), false);
    send(svg, "pointerup", 7); assert.equal(opened.length, 3);
    vm.wide = false; await flush(Vue);
    send(edge, "pointerdown", 9); send(edge, "pointerup", 9); assert.equal(opened.length, 4);
    assert.deepEqual(routes, ["tab", "tab", "tab", "list"]);
    // DOM updates cannot turn repeated pointerup into a second open.
    send(svg, "pointerup", 9); assert.equal(opened.length, 4);
    app.unmount(); assert.equal(capture.active.size, 0);
  });
});

test("graph edge tooltip automatic show / move uses real entry events and clamps all corners", async () => {
  await withMount(async ({ Vue, document, win }) => {
    const view = buildErdView({ name: "Tip", tables: ["A", "B"].map(name => ({ name, domain: "D", columns: [] })),
      relations: [{ kind: "n:1", a: "A", b: "B", aCols: ["b"], bCols: ["id"] }] }, false);
    const host = document.createElement("div"); document.body.append(host);
    const app = Vue.createApp({ setup: () => ({ view, store: memoryStorage() }), template: `<erd-graph ref="g" :view="view" :storage="store"></erd-graph>` });
    registerErd(app, Vue); const vm = app.mount(host), g = vm.$refs.g;
    const svg = host.querySelector("svg"), edge = host.querySelector("g.eg"), tip = host.querySelector(".eih-tip");
    stubRect(tip, { width: 200, height: 100 }); // before any show/measurement
    edge.dispatchEvent(new win.MouseEvent("mouseenter", { clientX: 600, clientY: 350 }));
    await flush(Vue, 10);
    assert.ok(g.tip.tip.x > 400 && g.tip.tip.y > 200, "edge tip must track the pointer, not an empty anchor");
    assert.equal(tip.style.left, g.tip.tip.x + "px");
    for (const [x, y] of [[0, 0], [1279, 0], [0, 799], [1279, 799]]) {
      dispatchPointer(svg, "pointermove", { x, y, win }); await flush(Vue);
      assert.ok(g.tip.tip.x >= 8 && g.tip.tip.x + 200 <= 1272);
      assert.ok(g.tip.tip.y >= 8 && g.tip.tip.y + 100 <= 792);
    }
    edge.dispatchEvent(new win.MouseEvent("mouseleave")); await flush(Vue);
    assert.equal(tip.style.display, "none"); app.unmount();
  });
});

test("view structural mutations automatically update edges, adjacency, kind/domain and remove stale selection without moving retained nodes", async () => {
  await withMount(async ({ Vue, document, win }) => {
    const host = document.createElement("div"); document.body.append(host);
    const schema = { name: "Structural", tables: ["A", "B", "C"].map(name => ({ name, domain: "D", columns: [] })),
      relations: [{ kind: "n:1", a: "A", b: "B", aCols: ["b"], bCols: ["id"] }] };
    const app = Vue.createApp({ setup() { const source = Vue.ref(schema); return { source, view: Vue.computed(() => buildErdView(source.value, false)), store: memoryStorage() }; },
      template: `<erd-graph ref="g" :view="view" :storage="store"></erd-graph>` });
    registerErd(app, Vue); const vm = app.mount(host), g = vm.$refs.g, svg = host.querySelector("svg");
    stubRect(svg, { width: 800, height: 600 }); stubRect(host.querySelector(".graph-wrap"), { width: 800, height: 600 }); await flush(Vue, 20);
    const nodeEl = name => [...host.querySelectorAll("g.gn")].find(el => el.textContent.trim() === name);
    const send = (el, type, x = 100) => dispatchPointer(el, type, { x, y: 100, pointerId: 1, win });
    send(nodeEl("A"), "pointerdown"); send(svg, "pointermove", 180); send(svg, "pointerup", 180); await flush(Vue);
    const positions = Object.fromEntries(g.nodes.map(n => [n.name, [n.x, n.y]]));
    vm.source.relations[0].b = "C"; await flush(Vue);
    assert.deepEqual(g.edgeViews.map(v => v.edge.b), ["C"]);
    assert.deepEqual(g.nodes.find(n => n.name === "A").edges.map(e => e.b), ["C"]);
    nodeEl("A").dispatchEvent(new win.MouseEvent("mouseenter")); await flush(Vue);
    assert.equal(nodeEl("C").classList.contains("hdim"), false);
    assert.equal(nodeEl("B").classList.contains("hdim"), true);
    vm.source.tables[0].kind = "weak"; vm.source.tables[0].domain = "New";
    vm.source.tables.push({ name: "D", domain: "New", columns: [] }); await flush(Vue);
    assert.equal(nodeEl("A").querySelectorAll("rect").length, 2);
    assert.equal(g.nodes.find(n => n.name === "A").domain, "New"); assert.ok(nodeEl("D"));
    for (const n of g.nodes.filter(n => positions[n.name])) assert.deepEqual([n.x, n.y], positions[n.name]);
    send(nodeEl("C"), "pointerdown"); send(svg, "pointerup"); assert.equal(g.selected, "C");
    vm.source.tables.splice(vm.source.tables.findIndex(t => t.name === "C"), 1); await flush(Vue);
    assert.equal(g.selected, null); assert.equal(nodeEl("C"), undefined); assert.equal(g.edgeViews.length, 0);
    assert.equal(g.nodes.find(n => n.name === "A").edges.length, 0);
    // Replacement props with identical names/colors must still observe a new relation.
    vm.source = { ...vm.source, relations: [{ kind: "n:1", a: "A", b: "D", aCols: ["d"], bCols: ["id"] }] }; await flush(Vue);
    assert.deepEqual(g.edgeViews.map(v => v.edge.b), ["D"]);
    app.unmount();
  });
});

test("first graph entry via card focus initializes the viewport; later list/graph roundtrip preserves it", async () => {
  await withMount(async ({ Vue, document, win }) => {
    const schema = exampleErd(), host = document.createElement("div"); document.body.append(host);
    const app = Vue.createApp({ setup: () => ({ schema }), template: `<erd-explorer ref="ex" :schema="schema"></erd-explorer>` });
    registerErd(app, Vue); const vm = app.mount(host), ex = vm.$refs.ex, g = ex.graphRef;
    const wrap = host.querySelector(".graph-wrap"), svg = host.querySelector("svg");
    for (const el of [wrap, svg]) el.getBoundingClientRect = () => ({ width: wrap.style.display === "none" ? 0 : 800, height: wrap.style.display === "none" ? 0 : 600, left: 0, top: 0 });
    await flush(Vue, 30); // initial list really measures zero, unlike an unconditional size stub
    const card = host.querySelector("#content .g-go") || host.querySelector(".g-go");
    card.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); await flush(Vue, 30);
    assert.equal(ex.mode, "graph"); assert.ok(g.selected);
    const selected = g.nodes.find(n => n.name === g.selected);
    assert.equal(selected.x * g.pzView.k + g.pzView.tx, 400);
    assert.equal(selected.y * g.pzView.k + g.pzView.ty, 300);
    const before = { ...g.pzView };
    const modeButtons = [...host.querySelectorAll("#modeSeg button")];
    assert.equal(modeButtons.length, 2);
    modeButtons[0].click(); await flush(Vue); modeButtons[1].click(); await flush(Vue, 30);
    assert.deepEqual({ ...g.pzView }, before); app.unmount();
  });
});
