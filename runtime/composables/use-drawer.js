import { shouldHideSide, clampErdPane, isWide } from "../../core/chrome.js";

/**
 * 窄屏抽屉状态。sideOff / 钳制后的栏宽由 viewport 与 pane 开关派生，不使用 watch。
 */
export function useDrawer(Vue, { viewport, paneW, paneOn }) {
  const { ref, computed } = Vue;
  const sideOpen = ref(false);
  const sideOff = computed(() => shouldHideSide({
    width: viewport.value,
    paneOn: !!(paneOn && paneOn.value),
    paneW: paneW.value,
  }));
  const wide = computed(() => isWide(viewport.value));
  const paneWidth = computed(() => clampErdPane(paneW.value, {
    viewport: viewport.value,
    hideSideFlag: sideOff.value,
  }));
  const menuOpen = computed(() => sideOff.value && sideOpen.value);

  function openMenu() { sideOpen.value = true; }
  function closeMenu() { sideOpen.value = false; }
  function toggleMenu() { sideOpen.value = !sideOpen.value; }

  return { sideOpen, sideOff, wide, paneWidth, menuOpen, openMenu, closeMenu, toggleMenu };
}
