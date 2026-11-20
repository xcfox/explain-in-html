export const tag = "erd-graph-toolbar";
export const name = "ErdGraphToolbar";

export function define() {
  return {
    name,
    props: {
      showRef: { type: Boolean, default: true },
      showHull: { type: Boolean, default: true },
    },
    emits: ["update:showRef", "update:showHull", "zoom-in", "zoom-out", "fit", "relayout"],
    setup() { return {}; },
    template: `<div id="gBar" class="g-bar">
      <label><input type="checkbox" :checked="showRef" @change="$emit('update:showRef', $event.target.checked)">引用边</label>
      <label><input type="checkbox" :checked="showHull" @change="$emit('update:showHull', $event.target.checked)">分组</label>
      <button type="button" @click="$emit('zoom-out')">−</button>
      <button type="button" @click="$emit('zoom-in')">+</button>
      <button type="button" @click="$emit('fit')">适应</button>
      <button type="button" @click="$emit('relayout')">重排</button>
    </div>`,
  };
}
