export const tag = "erd-nav";
export const name = "ErdNav";

export function define() {
  return {
    name,
    props: {
      groups: { type: Array, default: () => [] },
      empty: { type: Boolean, default: false },
      current: { type: String, default: "" },
      foot: { type: String, default: "" },
    },
    emits: ["select", "tip", "tip-hide"],
    setup() { return {}; },
    template: `<nav id="nav" class="erd-nav">
      <div v-if="empty" class="nav-empty">没有匹配的表</div>
      <template v-for="g in groups" :key="g.name">
        <div class="nav-g">
          <div class="nav-gh"><span class="sq" :style="{ background: g.color }"></span><span>{{ g.name }}</span><span class="n">{{ g.tables.length }}</span></div>
          <a v-for="t in g.tables" :key="t.name" class="nav-item" :class="{ on: t.name === current, 'is-assoc': t.kind === 'assoc' }" :style="{ '--nc': t.color }" :href="'#' + t.name" @click.prevent="$emit('select', t.name)" @mouseenter="$emit('tip', t.name, $event.currentTarget)" @mouseleave="$emit('tip-hide')">
            <span class="nav-dot" :class="t.kind || 'entity'"></span><span class="nav-lbl">{{ t.name }}</span><span v-if="t.columns" class="cnt">{{ t.columns.length }}</span>
          </a>
        </div>
      </template>
    </nav>
    <div class="side-foot" id="foot">{{ foot }}</div>`,
  };
}
