import { placeTooltip, placePointerTooltip } from "../../core/placement.js";
import { useListeners } from "./use-listeners.js";

/**
 * 悬浮框。boxEl 必须绑定到真实的 .eih-tip 根元素（由 eih-tooltip 的 measure-ref 契约写入）。
 * 显示后 nextTick 再测量，避免尚未布局时宽高为 0。
 */
export function useTooltip(Vue, { delay = 260 } = {}) {
  const { reactive, computed, ref, nextTick } = Vue;
  const { timeout, cleanup } = useListeners(Vue);
  const tip = reactive({ show: false, x: 0, y: 0, payload: null, kind: "" });
  const boxEl = ref(null);
  const style = computed(() => ({
    left: tip.x + "px",
    top: tip.y + "px",
    display: tip.show ? "block" : "none",
  }));
  let showOff = null;

  function cancel() {
    if (showOff) showOff();
    showOff = null;
  }

  function boxSize() {
    const box = boxEl.value;
    if (!box || !box.getBoundingClientRect) return { width: 0, height: 0 };
    const r = box.getBoundingClientRect();
    return { width: r.width || 0, height: r.height || 0 };
  }

  function viewport() {
    return {
      vw: typeof innerWidth === "number" ? innerWidth : 1200,
      vh: typeof innerHeight === "number" ? innerHeight : 800,
    };
  }

  function applyPlacement() {
    const box = boxEl.value;
    if (!box) return;
    const size = boxSize();
    const vp = viewport();
    let pos;
    if (!tip._anchor && Number.isFinite(tip._px) && Number.isFinite(tip._py)) {
      pos = placePointerTooltip(tip._px || 0, tip._py || 0, size, vp);
    } else {
      const anchor = tip._anchor;
      const rect = anchor && anchor.getBoundingClientRect
        ? anchor.getBoundingClientRect()
        : { left: 0, top: 0, right: 0, bottom: 0 };
      pos = placeTooltip(rect, size, Object.assign({ preferRight: tip._preferRight || tip.kind === "type" }, vp));
    }
    tip.x = pos.left;
    tip.y = pos.top;
  }

  function placeSoon() {
    const run = () => applyPlacement();
    if (typeof nextTick === "function") nextTick(run);
    else run();
  }

  function show(next, wait = delay) {
    cancel();
    showOff = timeout(() => {
      tip.payload = next.payload;
      tip.kind = next.kind || "";
      tip._anchor = next.anchor || null;
      tip._preferRight = !!next.preferRight;
      tip._px = next.x;
      tip._py = next.y;
      tip.show = true;
      placeSoon();
    }, wait);
  }

  function hide() {
    cancel();
    tip.show = false;
  }

  function hideSoon() {
    cancel();
    showOff = timeout(() => { tip.show = false; }, 80);
  }

  function movePointer(x, y) {
    tip._px = x;
    tip._py = y;
    if (tip.show) applyPlacement();
  }

    function bindBox(el) { boxEl.value = el || null; }

  return { tip, style, boxEl, bindBox, show, hide, hideSoon, movePointer, applyPlacement, cancel, cleanup };

}
