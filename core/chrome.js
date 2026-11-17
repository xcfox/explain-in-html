/** 分栏阈值（与原 design-viz 一致）。纯函数，不读 DOM。 */

export const ERD_PANE_MIN_VW = 720;
export const ERD_SIDE_W = 264;
export const ERD_MAIN_MIN = 480;
export const ERD_SIDE_PHONE = 920;
export const ERD_PANE_MIN = 260;
export const ERD_PANE_MAX = 900;
export const API_PANE_MIN = 320;
export const API_MAIN_MIN = 400;

export function isWide(width, minVw = ERD_PANE_MIN_VW) {
  return Number(width) >= minVw;
}

export function shouldHideSide({ width, paneOn, paneW }) {
  const w = Number(width) || 0;
  const phone = w <= ERD_SIDE_PHONE;
  const threeFits = w >= ERD_SIDE_W + (paneOn ? Number(paneW) || 0 : 0) + ERD_MAIN_MIN;
  return phone || (paneOn && !threeFits);
}

export function clampErdPane(width, { viewport, hideSideFlag }) {
  const vw = Number(viewport) || 1200;
  const floor = hideSideFlag ? ERD_MAIN_MIN : ERD_SIDE_W + ERD_MAIN_MIN;
  const maxPane = Math.min(ERD_PANE_MAX, vw * 0.62, Math.max(ERD_PANE_MIN, vw - floor));
  return Math.min(Math.max(Number(width) || ERD_PANE_MIN, ERD_PANE_MIN), maxPane);
}

/** 视口不足以同时放下最小详情栏与最小主栏时，详情改为覆盖层，避免主栏被挤到不可用宽度。 */
export function isApiOverlay(width) {
  return Number(width) < API_PANE_MIN + API_MAIN_MIN;
}

export function clampApiPane(width, viewport, { overlay } = {}) {
  const vw = Number(viewport) || 1200;
  const useOverlay = overlay == null ? isApiOverlay(vw) : !!overlay;
  if (useOverlay) {
    const max = Math.max(200, vw - 24);
    const min = Math.min(API_PANE_MIN, max);
    return Math.min(Math.max(Number(width) || min, min), max);
  }
  const max = Math.max(API_PANE_MIN, vw - API_MAIN_MIN);
  return Math.min(Math.max(Number(width) || API_PANE_MIN, API_PANE_MIN), max);
}

export function defaultErdPane(viewport) {
  const vw = Number(viewport) || 1200;
  return Math.min(Math.max(vw * 0.3, 280), 400);
}

export function defaultApiPane(viewport) {
  const vw = Number(viewport) || 1200;
  return Math.min(560, Math.round(vw * 0.45));
}
