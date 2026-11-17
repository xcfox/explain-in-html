export const tag = "erd-graph-legend";
export const name = "ErdGraphLegend";

export function define() {
  return {
    name,
    props: {
      items: { type: Array, default: () => [] },
      focus: { type: String, default: null },
    },
    emits: ["toggle"],
    setup() { return {}; },
    template: `<div id="gLegend" class="g-legend">
      <button v-for="g in items" :key="g.name" type="button" class="gl" :class="{ on: focus === g.name }" @click="$emit('toggle', g.name)">
        <i :style="{ background: g.color }"></i>{{ g.name }}<span class="n">{{ g.count }}</span>
      </button>
    </div>`,
  };
}
