export const tag = "eih-tooltip";
export const name = "EihTooltip";

/**
 * 悬浮框根节点。measure-ref 须为 setter 函数（或带 .value 的袋），
 * 在根元素挂载后写入，供 useTooltip 测量。不要把顶层 ref 直接绑到这个 prop（模板会自动解包成 null）。
 */
export function define() {
  return {
    name,
    props: {
      show: { type: Boolean, default: false },
      stylePos: { type: Object, default: () => ({ display: "none" }) },
      variant: { type: String, default: "" },
      measureRef: { default: null },
    },
    emits: ["enter", "leave"],
    setup(props) {
      function setRoot(el) {
        const t = props.measureRef;
        if (typeof t === "function") t(el || null);
        else if (t && typeof t === "object") t.value = el || null;
      }
      return { setRoot };
    },
    template: `<div class="eih-tip" id="tip" :class="{ 'is-ts': variant === 'ts' }" :style="stylePos" :ref="setRoot" @mouseenter="$emit('enter')" @mouseleave="$emit('leave')"><slot></slot></div>`,
  };
}
