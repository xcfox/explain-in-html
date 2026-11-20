export const tag = "api-toolbar";
export const name = "ApiToolbar";

export function define() {
  return {
    name,
    props: {
      modelValue: { type: String, default: "" },
      brand: { type: String, default: "" },
      stats: { type: String, default: "" },
    },
    emits: ["update:modelValue"],
    setup() { return {}; },
    template: `<div class="topbar"><div class="topbar-in">
      <div v-if="brand" class="api-brand"><span class="api-brand-dot"></span><span class="api-brand-name">{{ brand }}</span><span class="api-brand-tag">GraphQL</span></div>
      <div class="search-box">
        <svg class="search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
        <input id="search" type="search" placeholder="搜索操作 / 类型…" autocomplete="off" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)">
      </div>
      <div v-if="stats" class="api-stats">{{ stats }}</div>
    </div></div>`,
  };
}
