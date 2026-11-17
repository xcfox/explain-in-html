export const tag = "erd-graph-edge";
export const name = "ErdGraphEdge";

/** Geometry and hover only; the canvas owns the single pointer state machine. */
export function define() {
  return {
    name,
    props: {
      view: { type: Object, required: true },
      dimmed: { type: Boolean, default: false },
      hot: { type: Boolean, default: false },
    },
    emits: ["enter", "leave"],
    setup() { return {}; },
    template: `<g class="eg" :class="[view.cls, { dim: dimmed, hot: hot }]" :data-id="view.edge.id" @mouseenter="$emit('enter', view, $event)" @mouseleave="$emit('leave', view, $event)">
      <path class="ge-hit" :d="view.geom.d"></path>
      <path class="ge" :d="view.geom.d" :marker-end="view.hasArrow ? 'url(#gArr)' : null"></path>
      <text v-if="view.chrome.label && (view.chrome.showL || hot)" class="ge-lb" :x="view.chrome.labelX" :y="view.chrome.labelY">{{ view.chrome.label }}</text>
      <g v-if="view.chrome.showBadge || (hot && view.edge.kind === 'n:m' && view.chrome.attrCount)" class="ge-ba" :transform="view.chrome.badgeTransform">
        <rect width="23" height="13" rx="6.5"></rect>
        <text x="11.5" y="9.7">+{{ view.chrome.attrCount }}</text>
      </g>
      <text v-if="view.chrome.tickA && (view.chrome.showT || hot)" class="ge-tk" :x="view.chrome.tickA.x" :y="view.chrome.tickA.y">{{ view.chrome.tickA.text }}</text>
      <text v-if="view.chrome.tickB && (view.chrome.showT || hot)" class="ge-tk" :x="view.chrome.tickB.x" :y="view.chrome.tickB.y">{{ view.chrome.tickB.text }}</text>
    </g>`,
  };
}
