/** 悬浮框定位（纯函数）。两页共用，不依赖关系图模块。 */

export function placeTooltip(anchorRect, boxSize, { preferRight, pad = 8, vw, vh } = {}) {
  const tw = boxSize.width || 0, th = boxSize.height || 0;
  const W = vw || 1200, H = vh || 800;
  const r = anchorRect || { left: 0, top: 0, right: 0, bottom: 0 };
  let x, y;
  if (preferRight && W - r.right - pad >= Math.min(tw, 280)) {
    x = r.right + 10;
    y = r.top;
  } else {
    x = Math.min(r.left, W - tw - pad);
    y = r.bottom + 6;
    if (y + th > H - pad) y = Math.max(pad, r.top - th - 6);
  }
  return {
    left: Math.max(pad, Math.min(x, W - tw - pad)),
    top: Math.max(pad, Math.min(y, H - th - pad)),
  };
}

export function placePointerTooltip(x, y, boxSize, { pad = 8, vw, vh } = {}) {
  const tw = boxSize.width || 0, th = boxSize.height || 0;
  const W = vw || 1200, H = vh || 800;
  return {
    left: Math.max(pad, Math.min(x + 14, W - tw - pad)),
    top: Math.max(pad, Math.min(y + 14, H - th - pad)),
  };
}
