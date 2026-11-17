import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { VUE_CDN_URL, VUE_VERSION } from "../runtime/cdn.js";

/** 技能根目录：相对本测试文件，不硬编码主机路径。 */
export const SKILL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function skillPath(...p) {
  return join(SKILL_ROOT, ...p);
}

export function testDepsDir() {
  return process.env.EIH_TEST_DEPS || join(tmpdir(), "eih-test-deps");
}

export function vueCachePath() {
  return join(tmpdir(), "eih-vue-cache", `vue@${VUE_VERSION}.global.prod.js`);
}

/** 【需联网】仅在缓存未命中时请求固定 Vue CDN。 */
export async function ensureVueCache() {
  const cachePath = vueCachePath();
  if (existsSync(cachePath) && readFileSync(cachePath, "utf8").includes(`vue v${VUE_VERSION}`)) {
    return { path: cachePath, downloaded: false };
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  const res = await fetch(VUE_CDN_URL);
  if (!res.ok) throw new Error(`无法下载 Vue ${VUE_VERSION}：HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(cachePath));
  return { path: cachePath, downloaded: true };
}

function decodeHtmlEntities(raw) {
  return String(raw)
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, "\u00a0")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/gi, "&");
}

function fakeDocument() {
  function makeEl(tag = "div") {
    const attrs = Object.create(null);
    const children = [];
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children,
      childNodes: children,
      textContent: "",
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute(k, v) { attrs[String(k)] = String(v); },
      getAttribute(k) {
        const key = String(k);
        return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null;
      },
      appendChild(c) { children.push(c); return c; },
      removeChild(c) {
        const i = children.indexOf(c);
        if (i >= 0) children.splice(i, 1);
        return c;
      },
      get innerHTML() { return el._innerHTML || ""; },
      set innerHTML(v) {
        el._innerHTML = String(v);
        children.length = 0;
        const m = /^\s*<([a-zA-Z][\w:-]*)\s+([^\s=]+)="([^"]*)"\s*\/?>/.exec(el._innerHTML);
        if (m) {
          const child = makeEl(m[1]);
          child.setAttribute(m[2], decodeHtmlEntities(m[3]));
          children.push(child);
          el.textContent = "";
        } else {
          el.textContent = decodeHtmlEntities(el._innerHTML);
        }
      },
    };
    return el;
  }
  return {
    createElement: makeEl,
    createElementNS: (_n, tag) => makeEl(tag),
    createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
    createComment: text => ({ nodeType: 8, textContent: String(text) }),
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    body: makeEl("body"),
    documentElement: makeEl("html"),
  };
}

const vueContexts = new WeakMap();

export function loadVue(cachePath = vueCachePath()) {
  const code = readFileSync(cachePath, "utf8");
  const ctx = { console };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.document = fakeDocument();
  ctx.navigator = { userAgent: "node-test" };
  ctx.exports = {};
  ctx.module = { exports: {} };
  vm.runInNewContext(code, ctx);
  const Vue = ctx.Vue || ctx.module.exports;
  if (!Vue || typeof Vue.compile !== "function" || typeof Vue.createApp !== "function") {
    throw new Error("缓存的 Vue 构建缺少 compile / createApp（需要完整生产构建）");
  }
  if (Vue.version !== VUE_VERSION) {
    throw new Error(`Vue 版本不是 ${VUE_VERSION}：${Vue.version}`);
  }
  ctx.Vue = Vue;
  vueContexts.set(Vue, ctx);
  return Vue;
}

export function compileVueTemplate(Vue, template) {
  const ctx = vueContexts.get(Vue);
  if (!ctx) throw new Error("compileVueTemplate 需要由 loadVue() 返回的 Vue");
  ctx.__tpl = template;
  return vm.runInContext("Vue.compile(__tpl)", ctx);
}

export function assertScriptSyntax(code, filename) {
  try {
    new vm.Script(code, { filename });
  } catch (e) {
    const err = new Error(`${filename} vm.Script 语法错误：${e.message}`);
    err.cause = e;
    throw err;
  }
  const tmp = join(tmpdir(), `eih-syntax-${Date.now()}-${Math.random().toString(16).slice(2)}.js`);
  writeFileSync(tmp, code);
  const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${filename} node --check 失败：\n${r.stderr || r.stdout}`);
  }
}

export function leftoverModuleSyntax(code) {
  const hits = [];
  const re = /^\s*(import\s+.*from\s+['"]\.[^'"]+['"]|export\s+(function|const|let|var|class|default|\{))/gm;
  let m;
  while ((m = re.exec(code))) hits.push(m[0]);
  return hits;
}

/** 测试用 happy-dom：装在 os.tmpdir()/eih-test-deps，不进入技能目录。 */
export function loadHappyDom() {
  const dir = testDepsDir();
  const pkg = join(dir, "node_modules", "happy-dom", "package.json");
  if (!existsSync(pkg)) {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, "package.json"))) {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, name: "eih-test-deps" }));
    }
    const r = spawnSync("npm", ["install", "happy-dom@15", "--no-fund", "--no-audit"], {
      cwd: dir, encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(`【需联网或预装】无法在测试临时目录安装 happy-dom：\n${r.stderr || r.stdout}`);
    }
  }
  const require = createRequire(pathToFileURL(join(dir, "package.json")).href);
  return require("happy-dom");
}

/** 把 happy-dom 窗口的常用全局挂到 Node globalThis，返回还原函数。 */
export function installWindowGlobals(win) {
  const g = globalThis;
  const keys = [
    "window", "self", "document", "HTMLElement", "Node", "Element", "SVGElement",
    "customElements", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
    "ResizeObserver", "MutationObserver", "Event", "PointerEvent", "MouseEvent",
    "KeyboardEvent", "CustomEvent", "DOMParser", "navigator", "location",
    "localStorage", "sessionStorage", "matchMedia", "innerWidth", "innerHeight",
    "devicePixelRatio", "CSSStyleDeclaration",
  ];
  const prev = new Map();
  const set = (k, v) => {
    prev.set(k, Object.prototype.hasOwnProperty.call(g, k) ? ["own", g[k]] : ["none"]);
    try { g[k] = v; } catch {
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
    }
  };
  set("window", win);
  set("self", win);
  set("document", win.document);
  for (const k of keys) {
    if (k === "window" || k === "self" || k === "document") continue;
    if (k in win) set(k, win[k]);
  }
  if (typeof win.innerWidth === "number") set("innerWidth", win.innerWidth);
  if (typeof win.innerHeight === "number") set("innerHeight", win.innerHeight);
  return function restore() {
    for (const [k, info] of prev) {
      if (info[0] === "none") {
        try { delete g[k]; } catch { /* ignore */ }
      } else {
        try { g[k] = info[1]; } catch { /* ignore */ }
      }
    }
  };
}

export function setViewport(win, width, height) {
  try {
    Object.defineProperty(win, "innerWidth", { value: width, configurable: true, writable: true });
    Object.defineProperty(win, "innerHeight", { value: height, configurable: true, writable: true });
  } catch {
    win.innerWidth = width;
    win.innerHeight = height;
  }
  if (globalThis.window === win) {
    try { globalThis.innerWidth = width; globalThis.innerHeight = height; } catch { /* ignore */ }
  }
}

export function stubRect(el, rect) {
  const r = {
    x: rect.left || 0,
    y: rect.top || 0,
    left: rect.left || 0,
    top: rect.top || 0,
    width: rect.width || 0,
    height: rect.height || 0,
    get right() { return this.left + this.width; },
    get bottom() { return this.top + this.height; },
    toJSON() { return this; },
  };
  el.getBoundingClientRect = () => r;
  return r;
}

/** 在 happy-dom 窗口中 eval 缓存的完整 Vue 生产构建。 */
export function loadVueInWindow(win, cachePath = vueCachePath()) {
  const code = readFileSync(cachePath, "utf8");
  win.eval(code);
  const Vue = win.Vue;
  if (!Vue || typeof Vue.compile !== "function" || typeof Vue.createApp !== "function") {
    throw new Error("窗口内的 Vue 构建缺少 compile / createApp");
  }
  return Vue;
}

export function extractDocumentHtml(html) {
  return String(html).replace(/<script\b[^>]*\ssrc\s*=[^>]*>\s*<\/script>/gi, "");
}

/**
 * 在预装 Vue 的 happy-dom 中执行组装产物的内联 boot（跳过 CDN script）。
 * 返回 { win, document, Vue, errors, restore, close }。
 */
export function bootAssembledHtml(html, { width = 1280, height = 800, vueCode } = {}) {
  const { Window } = loadHappyDom();
  const win = new Window({ url: "https://example.test/page.html" });
  setViewport(win, width, height);
  const errors = [];
  win.addEventListener("error", ev => {
    errors.push(ev.error || ev.message || String(ev));
  });
  const origError = win.console && win.console.error && win.console.error.bind(win.console);
  if (win.console) {
    win.console.error = (...args) => {
      errors.push(args.map(String).join(" "));
      if (origError) origError(...args);
    };
  }
  const restore = installWindowGlobals(win);
  try {
    if (vueCode) win.eval(vueCode);
    else loadVueInWindow(win);
  } catch (e) {
    restore();
    try { win.close(); } catch { /* ignore */ }
    throw e;
  }
  const page = extractDocumentHtml(html);
  try {
    win.document.open();
    win.document.write(page);
    win.document.close();
  } catch (e) {
    errors.push(e);
  }
  return {
    win,
    document: win.document,
    Vue: win.Vue,
    errors,
    restore,
    close() {
      restore();
      try { win.close(); } catch { /* ignore */ }
    },
  };
}

export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    _map: map,
  };
}

// DOM emulation has no native capture routing: explicitly model it, never supplement business callbacks.
const pointerCaptures = new WeakMap();
export function installPointerCapture(win) {
  const active = new Map(), captures = [], releases = [];
  const proto = win.Element.prototype;
  const oldSet = proto.setPointerCapture, oldRelease = proto.releasePointerCapture;
  proto.setPointerCapture = function(id) { active.set(id, this); captures.push(id); };
  proto.releasePointerCapture = function(id) {
    if (active.get(id) !== this) return;
    active.delete(id); releases.push(id);
    dispatchPointer(this, "lostpointercapture", { pointerId: id, win });
  };
  pointerCaptures.set(win, active);
  return { active, captures, releases, restore() {
    pointerCaptures.delete(win);
    if (oldSet) proto.setPointerCapture = oldSet; else delete proto.setPointerCapture;
    if (oldRelease) proto.releasePointerCapture = oldRelease; else delete proto.releasePointerCapture;
  } };
}

export function dispatchPointer(el, type, { x = 0, y = 0, button = 0, pointerId = 1, isPrimary = true, bubbles = true, win } = {}) {
  const w = win || (typeof window !== "undefined" ? window : globalThis);
  const Ctor = w.PointerEvent || w.MouseEvent || w.Event;
  const ev = new Ctor(type, {
    bubbles,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button,
    pointerId,
    pointerType: "touch",
    isPrimary,
    view: w,
  });
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: pointerId }); } catch { ev.pointerId = pointerId; }
  }
  const active = pointerCaptures.get(w);
  const target = type !== "pointerdown" && type !== "lostpointercapture" ? active?.get(pointerId) || el : el;
  target.dispatchEvent(ev);
  if (type === "pointerup" || type === "pointercancel") active?.get(pointerId)?.releasePointerCapture(pointerId);
  return ev;
}
