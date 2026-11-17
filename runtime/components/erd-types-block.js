export const tag = "erd-types-block";
export const name = "ErdTypesBlock";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { table: { type: Object, required: true }, types: { type: Object, default: () => ({}) } },
    emits: ["ts-tip", "ts-hide"],
    setup(props) {
      const entries = computed(() => Object.entries(props.table.types || {}));
      function glue(v) { return String(v).includes("\n") ? "\n" : " "; }
      return { entries, glue };
    },
    template: `<template v-if="entries.length">
      <h2 class="sec">类型 <span class="n">TS TYPES · {{ entries.length }}</span></h2>
      <div class="card">
        <pre v-for="([k, v]) in entries" :key="k" class="ts-pre"><span class="tk-kw">type</span> <span class="tk-type">{{ k }}</span> <span class="tk-pun">=</span>{{ glue(v) }}<ts-highlight :source="v" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></ts-highlight></pre>
      </div>
    </template>`,
  };
}
