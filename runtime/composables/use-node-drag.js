/** One pointer gesture owns capture, hit identity and the screen-pixel drag threshold. */
export function useNodeDrag(Vue, { view, onDrop, onPanEnd, threshold = 4 } = {}) {
  const { ref, onBeforeUnmount } = Vue;
  const drag = ref(null);
  let disposed = false;
  function release(d) {
    if (d && d.captureEl && d.captureEl.releasePointerCapture && d.pointerId != null) {
      try { d.captureEl.releasePointerCapture(d.pointerId); } catch { /* capture may already be lost */ }
    }
  }
  function matches(ev, d) {
    return d && (d.pointerId == null || ev?.pointerId == null || ev.pointerId === d.pointerId);
  }
  function pointerDown(ev, node, edgeId = null) {
    if (disposed || drag.value || ev.button || ev.isPrimary === false) return false;
    const el = ev.currentTarget?.ownerSVGElement || ev.currentTarget || ev.target;
    const d = {
      kind: node ? "node" : "pan", node: node || null, edgeId,
      pointerId: ev.pointerId, captureEl: el, target: ev.target,
      sx: ev.clientX, sy: ev.clientY, ox: view.tx, oy: view.ty,
      nx: node?.x || 0, ny: node?.y || 0, k: view.k || 1, moved: false,
    };
    drag.value = d;
    if (el?.setPointerCapture && ev.pointerId != null) {
      try { el.setPointerCapture(ev.pointerId); } catch { /* retain the same identity without capture */ }
    }
    ev.preventDefault?.();
    return true;
  }
  function pointerMove(ev) {
    const d = drag.value;
    if (!matches(ev, d) || !Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY)) return;
    const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
    if (Math.hypot(dx, dy) > threshold) d.moved = true;
    if (!d.moved) return;
    if (d.node) { d.node.x = d.nx + dx / d.k; d.node.y = d.ny + dy / d.k; }
    else { view.tx = d.ox + dx; view.ty = d.oy + dy; }
  }
  function pointerUp(ev, { onTap } = {}) {
    const d = drag.value;
    if (!matches(ev, d)) return;
    pointerMove(ev);
    drag.value = null; // clear before release can synchronously emit lostpointercapture
    release(d);
    if (!d.moved) onTap?.({ node: d.node, edgeId: d.edgeId, target: d.target, event: ev, kind: d.kind });
    else if (d.node) onDrop?.(d.node);
    else onPanEnd?.();
  }
  function pointerCancel(ev) {
    const d = drag.value;
    if (!matches(ev, d)) return;
    drag.value = null;
    release(d);
  }
  function interrupt() { const d = drag.value; drag.value = null; release(d); }
  onBeforeUnmount?.(() => { disposed = true; interrupt(); });
  return { drag, pointerDown, pointerMove, pointerUp, pointerCancel, interrupt };
}
