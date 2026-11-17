import { tokenizeTS } from "../../core/highlight.js";

export const tag = "ts-highlight";
export const name = "TsHighlight";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { source: { type: String, default: "" }, types: { type: Object, default: () => ({}) } },
    emits: ["ts-tip", "ts-hide"],
    setup(props) {
      const tokens = computed(() => tokenizeTS(props.source, props.types));
      return { tokens };
    },
    template: `<span><template v-for="(tok, i) in tokens" :key="i"><span v-if="tok.ts" class="tk-type ts-ref" @mouseenter="$emit('ts-tip', tok.ts, $event.currentTarget)" @mouseleave="$emit('ts-hide')">{{ tok.text }}</span><span v-else-if="tok.cls" :class="tok.cls">{{ tok.text }}</span><template v-else>{{ tok.text }}</template></template></span>`,
  };
}
