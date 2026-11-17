import { fitViewTransform, zoomAtTransform, worldXY, bgRect, invK, focusTransform } from "../../core/graph-geometry.js";
import { useListeners } from "./use-listeners.js";

/**
 * 平移/缩放：只改 view.{k,tx,ty}。模板绑定 transform / --invk / 底图矩形。
 * size 为响应式，ResizeObserver / resize 后 bg 随视口更新。
 * 允许：getBoundingClientRect、wheel 非被动监听、Safari gesture*。卸载时移除监听并断开观察器。
 */
export function usePanZoom(Vue, { getSvgRect, getViewSize, nodes, showHull } = {}) {
  const { reactive, computed, ref } = Vue;
  const { listen, track, cleanup } = useListeners(Vue);
  const view = reactive({ k: 1, tx: 0, ty: 0 });
  const size = reactive({ width: 0, height: 0, left: 0, top: 0 });
  const panning = ref(false);
  const inv = computed(() => invK(view.k).toFixed(4));
  const cssVars = computed(() => ({ "--invk": inv.value }));
  const bg = computed(() => bgRect(view, size));

  function rectOf() {
    return typeof getSvgRect === "function" ? (getSvgRect() || { left: 0, top: 0, width: 0, height: 0 }) : { left: 0, top: 0, width: 0, height: 0 };
  }

  function measure() {
    const r = (typeof getViewSize === "function" && getViewSize()) || rectOf();
    if (!r) return size;
    size.width = r.width || 0;
    size.height = r.height || 0;
    if ("left" in r) size.left = r.left || 0;
    if ("top" in r) size.top = r.top || 0;
    return size;
  }

  function assign(next) {
    if (!next) return;
    view.k = next.k; view.tx = next.tx; view.ty = next.ty;
  }
  function panBy(dx, dy) { view.tx += dx; view.ty += dy; }
  function zoomAt(mx, my, k2) { assign(zoomAtTransform(view, mx, my, k2)); }
  function zoomBy(factor) {
    const w = size.width || 0, h = size.height || 0;
    zoomAt(w / 2, h / 2, view.k * factor);
  }
  function fit() {
    measure();
    assign(fitViewTransform(typeof nodes === "function" ? nodes() : (nodes && nodes.value) || [], size, {
      showHull: typeof showHull === "function" ? showHull() : !!(showHull && showHull.value),
    }));
  }
  function focusNode(node) {
    if (!node) return;
    measure();
    assign(focusTransform(node, size, view.k));
  }
  function toWorld(clientX, clientY) {
    return worldXY(clientX, clientY, rectOf(), view);
  }

  function onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      const r = rectOf();
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.k * Math.exp(-e.deltaY * 0.013));
    } else {
      const u = e.deltaMode === 1 ? 16 : 1;
      panBy(-e.deltaX * u, -e.deltaY * u);
    }
  }

  let pinch0 = 1;
  let gestureTarget = null;
  function detachGestures() { cleanup(); gestureTarget = null; }
  function attachGestures(wrapEl) {
    if (wrapEl === gestureTarget) return;
    detachGestures();
    if (!wrapEl) return;
    gestureTarget = wrapEl;
    listen(wrapEl, "wheel", onWheel, { passive: false });
    listen(wrapEl, "gesturestart", e => { e.preventDefault(); pinch0 = view.k; }, { passive: false });
    listen(wrapEl, "gesturechange", e => {
      e.preventDefault();
      const r = rectOf();
      zoomAt(e.clientX - r.left, e.clientY - r.top, pinch0 * e.scale);
    }, { passive: false });
    listen(wrapEl, "gestureend", e => e.preventDefault(), { passive: false });
    measure();
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => measure());
      ro.observe(wrapEl);
      track(() => ro.disconnect());
    }
    listen(typeof window !== "undefined" ? window : null, "resize", measure);
  }

  return {
    view, size, inv, cssVars, bg, panning,
    panBy, zoomAt, zoomBy, fit, focusNode, toWorld, onWheel, attachGestures, assign, measure, cleanup: detachGestures,
  };
}
