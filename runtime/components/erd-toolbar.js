export const tag = "erd-toolbar";
export const name = "ErdToolbar";

export function define() {
  return {
    name,
    props: {
      brand: { type: String, default: "" },
      mode: { type: String, default: "list" },
      filter: { type: String, default: "" },
    },
    emits: ["update:filter", "mode", "menu"],
    setup() { return {}; },
    template: `<div class="side-head">
      <div class="brand"><span class="brand-dot"></span><span id="brandName">{{ brand }}</span><span class="brand-sub">Schema</span></div>
      <div class="seg" id="modeSeg">
        <button type="button" :class="{ on: mode === 'list' }" @click="$emit('mode', 'list')">列表</button>
        <button type="button" :class="{ on: mode === 'graph' }" @click="$emit('mode', 'graph')">关系图</button>
      </div>
      <div class="search-box">
        <svg class="search-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        <input id="search" type="search" placeholder="搜索表名 / 注释…" autocomplete="off" :value="filter" @input="$emit('update:filter', $event.target.value)">
      </div>
    </div>`,
  };
}
