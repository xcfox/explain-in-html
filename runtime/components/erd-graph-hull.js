export const tag = "erd-graph-hull";
export const name = "ErdGraphHull";

export function define() {
  return {
    name,
    props: {
      hull: { type: Object, required: true },
      dragging: { type: Boolean, default: false },
    },
    emits: ["pointerdown"],
    setup() { return {}; },
    template: `<g class="hull" :class="{ dragging }">
      <rect :x="hull.x" :y="hull.y" :width="hull.w" :height="hull.h" rx="14" :fill="hull.color" fill-opacity=".045" :stroke="hull.color" stroke-opacity=".28" stroke-dasharray="4 5"></rect>
      <text class="hull-t" :x="hull.tx" :y="hull.ty" :fill="hull.color" @pointerdown.stop="$emit('pointerdown', $event, hull)">{{ hull.name }}</text>
    </g>`,
  };
}
