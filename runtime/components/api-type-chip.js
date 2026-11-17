import { kindClass } from "../../core/api-view.js";

export const tag = "api-type-chip";
export const name = "ApiTypeChip";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { name: { type: String, required: true }, types: { type: Object, required: true } },
    emits: ["open-type", "tip", "tip-hide"],
    setup(props) {
      const cls = computed(() => "tchip" + kindClass(props.types[props.name] && props.types[props.name].kind));
      return { cls };
    },
    template: `<a :class="cls" :href="'#type-' + name" @click="$emit('open-type', name, $event)" @mouseenter="$emit('tip', name, $event.currentTarget)" @mouseleave="$emit('tip-hide')">
      <span class="dot"></span>{{ name }}
    </a>`,
  };
}
