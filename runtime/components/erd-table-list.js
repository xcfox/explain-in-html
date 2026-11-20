export const tag = "erd-table-list";
export const name = "ErdTableList";

export function define() {
  return {
    name,
    props: {
      blocks: { type: Array, default: () => [] },
      schema: { type: Object, required: true },
      byName: { type: Object, required: true },
      types: { type: Object, default: () => ({}) },
    },
    emits: ["open-tab", "go-graph", "ts-tip", "ts-hide", "tip", "tip-hide", "bind-el"],
    setup(props, { emit }) {
      function bind(name, el) { emit("bind-el", name, el); }
      return { bind };
    },
    template: `<div class="wrap" id="content">
      <template v-for="(b, i) in blocks" :key="b.table ? b.table.name : 'd'+b.mark+i">
        <div v-if="b.mark" class="dom-mark"><span v-if="b.color" class="sq" :style="{ background: b.color }"></span><span>{{ b.mark }}</span></div>
        <section v-else class="t-block" :id="b.table.name" :data-name="b.table.name" :ref="el => bind(b.table.name, el)">
          <erd-table-card :table="b.table" :schema="schema" :by-name="byName" :types="types" @open-tab="$emit('open-tab', $event)" @go-graph="$emit('go-graph', $event)" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')" @tip="(n, el) => $emit('tip', n, el)" @tip-hide="$emit('tip-hide')"></erd-table-card>
        </section>
      </template>
    </div>`,
  };
}
