import { applyPalette } from "../../core/erd-view.js";

/** 系统暗色变化时只重染自动取色（与原 design-viz 一致）。 */
export function recolorTables(data, dark) {
  if (!data) return data;
  applyPalette(data, dark);
  return data;
}
