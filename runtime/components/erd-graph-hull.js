export const tag = "erd-graph-hull";
export const name = "ErdGraphHull";

export function define() {
  return {
    name,
    props: { hull: { type: Object, required: true } },
    setup() { return {}; },
    template: `<g class="hull">
      <rect :x="hull.x" :y="hull.y" :width="hull.w" :height="hull.h" rx="12" :fill="hull.color" fill-opacity=".05" :stroke="hull.color" stroke-opacity=".25" stroke-dasharray="3 6"></rect>
      <text class="hull-t" :x="hull.tx" :y="hull.ty" :fill="hull.color">{{ hull.name }}</text>
    </g>`,
  };
}
