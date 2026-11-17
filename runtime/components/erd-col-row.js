export const tag = "erd-col-row";
export const name = "ErdColRow";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { col: { type: Object, required: true }, types: { type: Object, default: () => ({}) } },
    emits: ["ts-tip", "ts-hide"],
    setup(props) {
      const tsNamed = computed(() => props.col.ts && (props.types[props.col.ts] || true));
      return { tsNamed };
    },
    template: `<div class="c-row" :class="{ 'is-pk': col.pk }">
      <span class="c-name">{{ col.name }}</span>
      <span class="c-type">{{ col.type }}<template v-if="col.ts">&lt;<ts-highlight :source="String(col.ts)" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></ts-highlight>&gt;</template></span>
      <span v-if="col.def !== undefined" class="c-def">= {{ col.def }}</span>
      <span class="c-badges">
        <span v-if="col.pk" class="b b-pk">PRIMARY KEY</span>
        <span v-if="col.fk" class="b b-fk">FOREIGN KEY</span>
        <span v-if="col.uq" class="b b-uq">UNIQUE</span>
        <span v-if="col.nn && !col.pk" class="b b-nn">NOT NULL</span>
      </span>
      <span class="c-cmt">{{ col.cmt || "" }}</span>
    </div>`,
  };
}
