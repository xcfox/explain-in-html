import { test } from "node:test";
import assert from "node:assert/strict";
import { useListeners } from "../runtime/composables/use-listeners.js";
import { useNodeDrag } from "../runtime/composables/use-node-drag.js";
import { usePaneResize } from "../runtime/composables/use-pane-resize.js";
import {
  ensureVueCache, loadHappyDom, installWindowGlobals, setViewport,
  loadVueInWindow, dispatchPointer, installPointerCapture,
} from "./helpers.js";

async function withVueDom(fn) {
  await ensureVueCache();
  const { Window } = loadHappyDom();
  const win = new Window({ url: "https://example.test/" });
  setViewport(win, 1280, 800);
  const restore = installWindowGlobals(win);
  const capture = installPointerCapture(win);
  try {
    const Vue = loadVueInWindow(win);
    return await fn({ win, Vue, document: win.document, capture });
  } finally {
    capture.restore();
    restore();
    try { win.close(); } catch { /* ignore */ }
  }
}

test("【可装临时依赖】真实 Vue mount：timeout/raf 触发后不累积，卸载后归零", async () => {
  await withVueDom(async ({ win, Vue, document }) => {
    let api;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() {
        api = useListeners(Vue);
        const n = Vue.ref(0);
        api.timeout(() => { n.value += 1; }, 5);
        api.raf(() => { n.value += 1; });
        return { n };
      },
      template: "<div>{{ n }}</div>",
    });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(api.pending(), 0, "已触发的 timeout/raf 应从表中移除");
    // 再登记一批长期定时器后卸载
    api.timeout(() => {}, 60_000);
    api.timeout(() => {}, 60_000);
    assert.equal(api.pending(), 2);
    app.unmount();
    assert.equal(api.pending(), 0);
  });
});

test("重复 hover（timeout）不会让 cleanups 只增不减", async () => {
  await withVueDom(async ({ Vue, document }) => {
    let api;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = Vue.createApp({
      setup() {
        api = useListeners(Vue);
        return { tick: Vue.ref(0) };
      },
      template: "<div>{{ tick }}</div>",
    });
    app.mount(host);
    for (let i = 0; i < 8; i++) {
      api.timeout(() => {}, 1);
    }
    await new Promise(r => setTimeout(r, 20));
    assert.equal(api.pending(), 0);
    app.unmount();
    assert.equal(api.pending(), 0);
  });
});

test("拖拽中途卸载会释放 pointer capture，登记表归零", async () => {
  await withVueDom(async ({ win, Vue, document }) => {
    const node = { name: "T", x: 0, y: 0 };
    const view = { k: 1, tx: 0, ty: 0 };
    const el = document.createElement("div");
    let captured = 0, released = 0;
    el.setPointerCapture = () => { captured += 1; };
    el.releasePointerCapture = () => { released += 1; };
    document.body.appendChild(el);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let drag;
    const app = Vue.createApp({
      setup() {
        drag = useNodeDrag(Vue, { view, getRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
        return {};
      },
      template: "<div></div>",
    });
    app.mount(host);
    drag.pointerDown({ button: 0, pointerId: 7, clientX: 10, clientY: 10, currentTarget: el, preventDefault() {} }, node);
    assert.equal(captured, 1);
    assert.ok(drag.drag.value);
    app.unmount();
    assert.equal(drag.drag.value, null);
    assert.equal(released, 1);
  });
});

test("侧栏拖拽卸载释放 capture", async () => {
  await withVueDom(async ({ Vue, document }) => {
    const width = Vue.ref(400);
    const el = document.createElement("div");
    let released = 0;
    el.setPointerCapture = () => {};
    el.releasePointerCapture = () => { released += 1; };
    document.body.appendChild(el);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let pane;
    const app = Vue.createApp({
      setup() {
        pane = usePaneResize(Vue, { width, min: 260, maxOf: () => 900 });
        return {};
      },
      template: "<div></div>",
    });
    app.mount(host);
    pane.onGripDown({ button: 0, pointerId: 3, clientX: 800, currentTarget: el, preventDefault() {}, target: el });
    assert.equal(pane.dragging.value, true);
    app.unmount();
    assert.equal(pane.dragging.value, false);
    assert.equal(released, 1);
  });
});


test("once events deregister themselves; completed callbacks cannot re-register work after unmount", async () => {
  await withVueDom(async ({ Vue, document, win }) => {
    let resources, fired = 0;
    const app = Vue.createApp({ setup() { resources = useListeners(Vue); return {}; }, template: "<div></div>" });
    app.mount(document.createElement("div"));
    for (let i = 0; i < 50; i++) {
      resources.listen(win, "scrollend", () => fired++, { once: true });
      win.dispatchEvent(new win.Event("scrollend"));
      assert.equal(resources.pending(), 0);
    }
    assert.equal(fired, 50);
    app.unmount();
    resources.timeout(() => fired++, 0);
    resources.raf(() => fired++);
    resources.listen(win, "scrollend", () => fired++);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(fired, 50); assert.equal(resources.pending(), 0);
  });
});

test("actual pane ignores foreign pointers, releases lost/cancelled captures, and commits each completed gesture once", async () => {
  const { define } = await import("../runtime/components/eih-side-pane.js");
  await withVueDom(async ({ Vue, document, win, capture }) => {
    const commits = [], host = document.createElement("div"); document.body.append(host);
    const app = Vue.createApp({ setup() { return { width: Vue.ref(400), commit: w => commits.push(w) }; },
      template: `<eih-side-pane :shown="true" :width="width" @resize="w => width = w" @commit="commit"></eih-side-pane>` });
    app.component("eih-side-pane", define(Vue)); const vm = app.mount(host);
    const grip = host.querySelector(".pane-grip");
    const send = (el, type, id, x = 800) => dispatchPointer(el, type, { x, y: 100, pointerId: id, win });
    for (let i = 0; i < 10; i++) {
      const id = i * 2 + 1;
      send(grip, "pointerdown", id);
      send(grip, "pointerdown", id + 1);
      send(win, "pointermove", id + 1, 900); send(win, "pointerup", id + 1);
      assert.equal(capture.active.has(id), true); assert.equal(capture.active.has(id + 1), false);
      send(win, "pointermove", id, 900); send(win, "pointerup", id);
      assert.equal(commits.length, i + 1); assert.equal(commits[i], 380);
      assert.equal(capture.active.size, 0);
      await Vue.nextTick(); assert.equal(vm.width, 380);
    }
    send(grip, "pointerdown", 30); send(win, "pointercancel", 30);
    send(grip, "pointerdown", 31); grip.releasePointerCapture(31);
    assert.equal(commits.length, 10); assert.equal(capture.active.size, 0);
    send(grip, "pointerdown", 32); app.unmount(); assert.equal(capture.active.size, 0);
    send(win, "pointerup", 32); assert.equal(commits.length, 10);
    assert.deepEqual(capture.captures, capture.releases);
  });
});

test("graph queued nextTick cannot schedule RAF after unmount; superseded activations own at most one RAF", async () => {
  const { registerErd } = await import("../runtime/register-erd.js");
  const { buildErdView } = await import("../core/erd-view.js");
  await withVueDom(async ({ Vue, document }) => {
    const previousRAF = globalThis.requestAnimationFrame, previousCancel = globalThis.cancelAnimationFrame;
    const jobs = new Map(); let seq = 0;
    globalThis.requestAnimationFrame = fn => { jobs.set(++seq, fn); return seq; };
    globalThis.cancelAnimationFrame = id => jobs.delete(id);
    function create() {
      const view = buildErdView({ name: "Life", tables: [{ name: "A", domain: "D", columns: [] }], relations: [] }, false);
      const app = Vue.createApp({ setup: () => ({ view }), template: `<erd-graph ref="g" :view="view"></erd-graph>` });
      registerErd(app, Vue); const vm = app.mount(document.createElement("div"));
      return { app, g: vm.$refs.g };
    }
    try {
      const a = create(); a.app.unmount(); await Vue.nextTick();
      assert.equal(jobs.size, 0, "mount/unmount before tick must never create an orphan RAF");
      a.g.activate(); await Vue.nextTick(); assert.equal(jobs.size, 0);
      const b = create(); await Vue.nextTick(); assert.equal(jobs.size, 1);
      b.g.activate(); b.g.activate(); await Vue.nextTick(); assert.equal(jobs.size, 1);
      const stale = [...jobs.values()][0]; b.app.unmount(); assert.equal(jobs.size, 0);
      stale(); assert.equal(jobs.size, 0, "even an already dequeued stale callback is harmless");
    } finally { globalThis.requestAnimationFrame = previousRAF; globalThis.cancelAnimationFrame = previousCancel; }
  });
});

test("pan/zoom attachment is idempotent; resize updates bg; unmount disconnects observer and every listener", async () => {
  const { usePanZoom } = await import("../runtime/composables/use-pan-zoom.js");
  await withVueDom(async ({ Vue, document }) => {
    const wrap = document.createElement("div");
    let width = 800, wheelAdds = 0, wheelRemoves = 0, observes = 0, disconnects = 0, resize;
    const add = wrap.addEventListener.bind(wrap), remove = wrap.removeEventListener.bind(wrap);
    wrap.addEventListener = (type, ...args) => { if (type === "wheel") wheelAdds++; return add(type, ...args); };
    wrap.removeEventListener = (type, ...args) => { if (type === "wheel") wheelRemoves++; return remove(type, ...args); };
    const oldRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(fn) { resize = fn; }
      observe() { observes++; }
      disconnect() { disconnects++; }
    };
    let pz;
    const app = Vue.createApp({ setup() {
      pz = usePanZoom(Vue, { getViewSize: () => ({ width, height: 600 }), nodes: () => [] });
      Vue.onMounted(() => { pz.attachGestures(wrap); pz.attachGestures(wrap); });
      return {};
    }, template: "<div></div>" });
    try {
      app.mount(document.createElement("div"));
      assert.equal(wheelAdds, 1); assert.equal(observes, 1);
      width = 450; resize(); assert.equal(pz.bg.value.w, 450);
      app.unmount(); assert.equal(wheelRemoves, 1); assert.equal(disconnects, 1);
    } finally { globalThis.ResizeObserver = oldRO; }
  });
});
