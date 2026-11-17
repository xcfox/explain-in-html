import { KIND_LABEL, kindClass, refsOf, usedBy } from "../../core/api-view.js";

export const tag = "api-type-detail";
export const name = "ApiTypeDetail";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name,
    props: { name: { type: String, required: true }, types: { type: Object, required: true }, ops: { type: Array, default: () => [] } },
    emits: ["open-type", "go-op", "tip", "tip-hide"],
    setup(props) {
      const t = computed(() => props.types[props.name] || {});
      const label = computed(() => (KIND_LABEL[t.value.kind] || t.value.kind || "").toUpperCase());
      const headCls = computed(() => "chip-tk" + kindClass(t.value.kind));
      const refs = computed(() => refsOf(props.types, props.name).filter(r => props.types[r]));
      const users = computed(() => usedBy(props.ops, props.name));
      function kindOf(n) { return props.types[n] && props.types[n].kind; }
      function initial(k) { return (k || "q")[0]; }
      return { t, label, headCls, refs, users, kindOf, initial };
    },
    template: `<div>
      <div class="head-chips"><span :class="headCls">{{ label }}</span></div>
      <div class="t-name">{{ name }}</div>
      <div class="t-desc">{{ t.description || "" }}</div>
      <h2 class="sec">定义 <span class="n">SDL</span></h2>
      <div class="card">
        <sdl-highlight :source="t.sdl" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)"></sdl-highlight>
      </div>
      <template v-if="refs.length">
        <h2 class="sec">引用 <span class="n">REFERENCES · {{ refs.length }}</span></h2>
        <div class="ref-chips">
          <a v-for="r in refs" :key="r" class="ref-chip" :href="'#type-' + r" @click="$emit('open-type', r, $event)" @mouseenter="$emit('tip', r, $event.currentTarget)" @mouseleave="$emit('tip-hide')">{{ r }}<span class="k">{{ kindOf(r) }}</span></a>
        </div>
      </template>
      <template v-if="users.length">
        <h2 class="sec">使用此类型的操作 <span class="n">USED BY · {{ users.length }}</span></h2>
        <div class="card">
          <a v-for="u in users" :key="u.name" class="use-row" :href="'#op-' + u.name" @click="$emit('go-op', u.name)">
            <span class="qm" :class="initial(u.kind)">{{ initial(u.kind).toUpperCase() }}</span>
            <span class="nm">{{ u.name }}</span>
            <span class="ds">{{ u.description || "" }}</span>
          </a>
        </div>
      </template>
    </div>`,
  };
}
