export const tag = "eih-tab-strip";
export const name = "EihTabStrip";

export function define(Vue) {
  return {
    name,
    props: {
      tabs: { type: Array, default: () => [] },
      active: { type: String, default: null },
      tabClass: { type: Function, default: n => "tab" + (n ? "" : "") },
    },
    emits: ["select", "close"],
    setup(props) {
      function cls(n) {
        const base = typeof props.tabClass === "function" ? props.tabClass(n) : "tab";
        return ((base || "tab") + (n === props.active ? " on" : "")).trim();
      }
      return { cls };
    },
    template: `<div class="tab-strip" id="tabStrip">
      <div v-for="n in tabs" :key="n" :class="cls(n)" @click="$emit('select', n)">
        <span class="dot"></span>{{ n }}
        <span class="x" @click.stop="$emit('close', n)">×</span>
      </div>
    </div>`,
  };
}
