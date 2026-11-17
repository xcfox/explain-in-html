import { tokenizeSDL } from "../../core/highlight.js";

export const tag = "sdl-highlight";
export const name = "SdlHighlight";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: {
      source: { type: String, default: "" },
      types: { type: Object, default: () => ({}) },
    },
    emits: ["open-type"],
    setup(props, { emit }) {
      const tokens = computed(() => tokenizeSDL(props.source, props.types));
      function onType(e, typ) {
        // 边界：若页面上已有 hash 锚点 #type-name，允许默认跳转；否则打开详情 tab。
        const local = typeof document !== "undefined" && typ && document.getElementById("type-" + typ);
        if (!local || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          emit("open-type", typ, e);
        }
      }
      return { tokens, onType };
    },
    template: `<pre class="sdl"><template v-for="(tok, i) in tokens" :key="i"><a v-if="tok.href" class="tk-type" :href="tok.href" @click="onType($event, tok.name)">{{ tok.text }}</a><span v-else-if="tok.cls" :class="tok.cls">{{ tok.text }}</span><template v-else>{{ tok.text }}</template></template></pre>`,
  };
}
