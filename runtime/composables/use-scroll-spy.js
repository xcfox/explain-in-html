import { useListeners } from "./use-listeners.js";

/**
 * 列表滚动同步当前表。允许 scrollIntoView 与滚动监听。
 * tableEls: { [name]: Element } 由模板 ref 回调填充，不用全局 getElementById 查找图节点。
 * 锚点 id 仍可写在区块上供 hash 使用。
 */
export function useScrollSpy(Vue, { current }) {
  const { listen, timeout } = useListeners(Vue);
  const tableEls = {};
  let lock = false, gen = 0;
  let releaseLock = () => {};

  function setEl(name, el) {
    if (el) tableEls[name] = el;
    else delete tableEls[name];
  }

  function lockSpy() {
    releaseLock();
    const g = ++gen;
    lock = true;
    let offEnd = () => {}, offTimer = () => {};
    const done = () => {
      offEnd(); offTimer();
      if (g === gen) lock = false;
    };
    releaseLock = done;
    offEnd = listen(typeof window !== "undefined" ? window : null, "scrollend", done, { once: true });
    offTimer = timeout(done, 900);
  }

  function scrollToName(name, instant) {
    const el = tableEls[name];
    if (!el || typeof el.scrollIntoView !== "function") return false;
    lockSpy();
    current.value = name;
    el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
    return true;
  }

  function onScroll(namesInOrder, getTop) {
    if (lock) return;
    const y = typeof getTop === "function" ? getTop() : (typeof scrollY === "number" ? scrollY : 0);
    let hit = namesInOrder[0];
    for (const n of namesInOrder) {
      const el = tableEls[n];
      if (!el || typeof el.getBoundingClientRect !== "function") continue;
      if (el.getBoundingClientRect().top <= 120) hit = n;
    }
    if (hit) current.value = hit;
    return y;
  }

  return { setEl, scrollToName, onScroll, lockSpy };
}
