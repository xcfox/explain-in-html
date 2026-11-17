export const tag = "erd-graph-node";
export const name = "ErdGraphNode";

export function define() {
  return {
    name,
    props: {
      node: { type: Object, required: true },
      selected: { type: Boolean, default: false },
      dimmed: { type: Boolean, default: false },
      hotDim: { type: Boolean, default: false },
    },
    emits: ["pointerdown", "enter", "leave"],
    setup() { return {}; },
    template: `<g class="gn" :class="{ gd: node.dia, sel: selected, dim: dimmed, hdim: hotDim }" :transform="'translate(' + node.x + ' ' + node.y + ')'" @pointerdown.stop="$emit('pointerdown', $event, node)" @mouseenter="$emit('enter', node, $event)" @mouseleave="$emit('leave', node, $event)">
      <template v-if="node.dia">
        <path class="gn-d" :d="'M0 ' + (-node.r) + ' L' + node.r + ' 0 L0 ' + node.r + ' L' + (-node.r) + ' 0 Z'" :fill="node.color" fill-opacity=".12" :stroke="node.color" stroke-opacity=".75"></path>
        <text class="gn-t gn-ts" :y="node.r + 16">{{ node.name }}</text>
      </template>
      <template v-else>
        <rect class="gn-r" :x="-node.w / 2" :y="-node.h / 2" :width="node.w" :height="node.h" rx="9" :fill="node.color" fill-opacity=".07" :stroke="node.color" stroke-opacity=".62"></rect>
        <rect v-if="node.kind === 'weak'" :x="-node.w / 2 + 4" :y="-node.h / 2 + 4" :width="node.w - 8" :height="node.h - 8" rx="6" fill="none" :stroke="node.color" stroke-opacity=".35"></rect>
        <text class="gn-t" y="5">{{ node.name }}</text>
      </template>
    </g>`,
  };
}
