export const tag = "erd-indexes";
export const name = "ErdIndexes";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { table: { type: Object, required: true } },
    setup(props) {
      const idx = computed(() => props.table.indexes || []);
      return { idx };
    },
    template: `<template v-if="idx.length">
      <h2 class="sec">索引 <span class="n">INDEXES · {{ idx.length }}</span></h2>
      <div class="card">
        <div v-for="i in idx" :key="i.name" class="i-row">
          <span class="i-name">{{ i.name }}</span>
          <span class="i-cols">({{ i.cols }})</span>
          <span v-if="i.uq" class="i-uq"><span class="b b-uq">UNIQUE</span></span>
        </div>
      </div>
    </template>`,
  };
}
