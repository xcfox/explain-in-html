import { useListeners } from "./use-listeners.js";

/** One active pointer owns resize, capture, listeners and the final committed width. */
export function usePaneResize(Vue, { width, min, maxOf, onCommit, grabbing } = {}) {
  const { ref, onBeforeUnmount } = Vue;
  const { listen } = useListeners(Vue);
  const dragging = ref(false);
  const gripEl = ref(null);
  let gesture = null;
  let disposed = false;
  function matches(e) { return gesture && (gesture.id == null || e?.pointerId == null || e.pointerId === gesture.id); }
  function finish(commit = false) {
    const d = gesture;
    if (!d) return;
    gesture = null;
    for (const off of d.offs) off();
    dragging.value = false;
    if (grabbing) grabbing.value = false;
    if (d.el?.releasePointerCapture && d.id != null) {
      try { d.el.releasePointerCapture(d.id); } catch { /* capture already lost */ }
    }
    if (commit) onCommit?.(d.width);
  }
  function onGripDown(ev) {
    if (disposed || gesture || ev.button || ev.isPrimary === false) return false;
    ev.preventDefault();
    const d = { id: ev.pointerId, el: ev.currentTarget, width: width.value, offs: [] };
    gesture = d;
    dragging.value = true;
    if (grabbing) grabbing.value = true;
    const target = typeof window !== "undefined" ? window : d.el;
    d.offs.push(listen(target, "pointermove", e => {
      if (!matches(e)) return;
      const vw = typeof innerWidth === "number" ? innerWidth : 1200;
      const max = typeof maxOf === "function" ? maxOf(vw) : vw;
      const lo = typeof min === "function" ? min(vw) : min;
      d.width = Math.min(Math.max(vw - e.clientX, lo), max);
      width.value = d.width;
    }));
    d.offs.push(listen(target, "pointerup", e => { if (matches(e)) finish(true); }));
    d.offs.push(listen(target, "pointercancel", e => { if (matches(e)) finish(false); }));
    d.offs.push(listen(d.el, "lostpointercapture", e => { if (matches(e)) finish(false); }));
    if (d.el?.setPointerCapture && d.id != null) {
      try { d.el.setPointerCapture(d.id); } catch { /* global listeners remain usable */ }
    }
    return true;
  }
  function interrupt() { finish(false); }
  onBeforeUnmount?.(() => { disposed = true; interrupt(); });
  return { gripEl, dragging, onGripDown, interrupt };
}
