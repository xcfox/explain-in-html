import { usePaneResize } from "../composables/use-pane-resize.js";
import { API_PANE_MIN, API_MAIN_MIN, ERD_PANE_MIN, ERD_PANE_MAX } from "../../core/chrome.js";

export const tag = "eih-side-pane";
export const name = "EihSidePane";

/**
 * 右侧详情栏。宽度由 props.width 单源输入，拖拽只 $emit('resize'|'commit')。
 * overlay 时改为覆盖层宽度计算（不挤占主栏）。卸载时释放 pointer capture。
 */
export function define(Vue) {
  const { computed, ref } = Vue;
  return {
    name,
    props: {
      shown: { type: Boolean, default: false },
      width: { type: Number, default: 400 },
      kind: { type: String, default: "api" },
      overlay: { type: Boolean, default: false },
    },
    emits: ["resize", "commit"],
    setup(props, { emit }) {
      const grabbing = ref(false);
      const paneStyle = computed(() => ({ width: props.width + "px" }));
      const widthRef = computed({
        get: () => props.width,
        set: v => emit("resize", v),
      });
      function maxOf(vw) {
        if (props.overlay) return Math.max(200, vw - 24);
        if (props.kind === "erd") return Math.min(ERD_PANE_MAX, vw * 0.62);
        return Math.max(API_PANE_MIN, vw - API_MAIN_MIN);
      }
      function minOf(vw) {
        const floor = props.kind === "erd" ? ERD_PANE_MIN : API_PANE_MIN;
        if (props.overlay) return Math.min(floor, Math.max(200, (vw || 1200) - 24));
        return floor;
      }
      const pane = usePaneResize(Vue, {
        width: widthRef,
        min: minOf,
        maxOf,
        onCommit: w => emit("commit", w),
        grabbing,
      });
      return { paneStyle, gripEl: pane.gripEl, grabbing, onGripDown: pane.onGripDown };
    },
    template: `<aside id="pane" class="eih-pane" :class="{ show: shown, overlay: overlay }" :style="paneStyle">
      <div id="paneGrip" class="pane-grip" :class="{ on: grabbing }" ref="gripEl" @pointerdown="onGripDown"></div>
      <slot name="tabs"></slot>
      <div id="tabBody" class="tab-body"><slot></slot></div>
    </aside>`,
  };
}
