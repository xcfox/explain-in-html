import { sigText } from "../../core/api-view.js";

export const tag = "api-op-row";
export const name = "ApiOpRow";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { op: { type: Object, required: true }, types: { type: Object, required: true } },
    emits: ["open-type"],
    setup(props) {
      const sig = computed(() => sigText(props.op));
      const kindCls = computed(() => props.op.kind ? props.op.kind[0] : "");
      const kindLabel = computed(() => (props.op.kind || "").toUpperCase());
      return { sig, kindCls, kindLabel };
    },
    template: `<div class="op-row" :id="'op-' + op.name">
      <span class="chip-kind" :class="kindCls">{{ kindLabel }}</span>
      <sdl-highlight :source="sig" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)"></sdl-highlight>
    </div>`,
  };
}
