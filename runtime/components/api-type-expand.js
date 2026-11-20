import { KIND_LABEL, kindClass } from "../../core/api-view.js";

export const tag = "api-type-expand";
export const name = "ApiTypeExpand";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { name: { type: String, required: true }, types: { type: Object, required: true }, withId: { type: Boolean, default: false } },
    emits: ["open-type"],
    setup(props) {
      const t = computed(() => props.types[props.name] || {});
      const label = computed(() => (KIND_LABEL[t.value.kind] || t.value.kind || "").toUpperCase());
      const headCls = computed(() => "chip-tk" + kindClass(t.value.kind));
      const cardCls = computed(() => "card t-exp" + kindClass(t.value.kind));
      return { t, label, headCls, cardCls };
    },
    template: `<div :class="cardCls" :id="withId ? 'type-' + name : undefined">
      <div class="t-exp-h">
        <span :class="headCls">{{ label }}</span>
        <span class="t-exp-name">{{ name }}</span>
      </div>
      <div v-if="t.description" class="t-desc">{{ t.description }}</div>
      <sdl-highlight :source="t.sdl" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)"></sdl-highlight>
    </div>`,
  };
}
