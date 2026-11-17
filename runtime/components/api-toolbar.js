export const tag = "api-toolbar";
export const name = "ApiToolbar";

export function define() {
  return {
    name,
    props: { modelValue: { type: String, default: "" } },
    emits: ["update:modelValue"],
    setup() { return {}; },
    template: `<div class="topbar"><div class="topbar-in">
      <input id="search" type="search" placeholder="搜索操作 / 类型…" autocomplete="off" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)">
    </div></div>`,
  };
}
