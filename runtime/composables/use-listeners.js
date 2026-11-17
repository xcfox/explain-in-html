/** Scoped, idempotent resource ownership; completed work removes its own registration. */
export function useListeners(Vue) {
  const cleanups = new Set();
  let disposed = false;
  function track(off) {
    let active = true;
    const release = () => {
      if (!active) return;
      active = false;
      cleanups.delete(release);
      off();
    };
    if (disposed) release();
    else cleanups.add(release);
    return release;
  }
  function listen(target, type, handler, opts) {
    if (disposed || !target?.addEventListener) return () => {};
    let off;
    const once = !!(opts && typeof opts === "object" && opts.once);
    const wrapped = once ? function (event) {
      off();
      if (typeof handler === "function") handler.call(this, event);
      else handler.handleEvent(event);
    } : handler;
    target.addEventListener(type, wrapped, opts);
    off = track(() => target.removeEventListener(type, wrapped, opts));
    return off;
  }
  function timeout(fn, ms) {
    if (disposed) return () => {};
    const id = setTimeout(() => { off(); fn(); }, ms);
    const off = track(() => clearTimeout(id));
    return off;
  }
  function raf(fn) {
    if (disposed) return () => {};
    if (typeof requestAnimationFrame !== "function") { fn(); return () => {}; }
    const id = requestAnimationFrame(() => { off(); fn(); });
    const off = track(() => cancelAnimationFrame(id));
    return off;
  }
  function cleanup() {
    for (const off of [...cleanups]) {
      try { off(); } catch { /* continue releasing the remaining resources */ }
    }
  }
  Vue.onBeforeUnmount?.(() => { disposed = true; cleanup(); });
  return { listen, timeout, raf, track, cleanup, pending: () => cleanups.size };
}
