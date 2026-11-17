import { visibleEdges, assignEdgeOffsets, neighborNames, edgeDetailName } from "../../core/graph-model.js";
import { layoutFromView, layoutGraph, sizeNodes } from "../../core/graph-layout.js";
import { deriveEdgeViews, computeHulls, legendItems } from "../../core/graph-geometry.js";
import { loadPositions, savePositions, clearPositions, getStorage } from "../../core/storage.js";
import { usePanZoom } from "../composables/use-pan-zoom.js";
import { useNodeDrag } from "../composables/use-node-drag.js";
import { useSelection } from "../composables/use-selection.js";
import { useTooltip } from "../composables/use-tooltip.js";

export const tag = "erd-graph";
export const name = "ErdGraph";

/**
 * 关系图画布。节点/边/hull/图例由模板 v-for 声明式渲染。
 * 拖拽只改响应式坐标，边与 hull 由 computed 派生。
 * cssVars / bg 必须从 setup 顶层返回，模板才能自动解包 ComputedRef。
 */
export function define(Vue) {
  const { reactive, ref, computed, watch, nextTick, onMounted, onBeforeUnmount } = Vue;
  return {
    name,
    props: {
      view: { type: Object, required: true },
      storage: { type: Object, default: null },
      wide: { type: Boolean, default: true },
    },
    emits: ["open-tab", "open-list"],
    setup(props, { emit }) {
      const store = props.storage || getStorage();
      const schemaName = computed(() => (props.view.data && props.view.data.name) || "schema");
      const nodes = reactive([]);
      const edges = reactive([]);
      const showRef = ref(false);
      const showHull = ref(true);
      const wrapEl = ref(null);
      const svgEl = ref(null);
      let fittedOnce = false;
      let rafId = null;
      let disposed = false;
      let activation = 0;

      function hydrateFromView({ useStorage = false } = {}) {
        const saved = useStorage
          ? loadPositions(store, schemaName.value)
          : Object.fromEntries(nodes.map(n => [n.name, { x: n.x, y: n.y }]));
        const model = layoutFromView(props.view, saved);
        const have = new Map(nodes.map(n => [n.name, n]));
        const next = [];
        for (const n of model.nodes) {
          const old = have.get(n.name);
          if (old) {
            old.edges = n.edges;
            old.color = n.color;
            old.w = n.w; old.h = n.h; old.r = n.r;
            old.kind = n.kind; old.dia = n.dia; old.domain = n.domain;
            next.push(old);
          } else {
            next.push(n);
          }
        }
        nodes.splice(0, nodes.length, ...next);
        edges.splice(0, edges.length, ...model.edges);
      }

      hydrateFromView({ useStorage: true });

      const pz = usePanZoom(Vue, {
        getSvgRect: () => svgEl.value && svgEl.value.getBoundingClientRect && svgEl.value.getBoundingClientRect(),
        getViewSize: () => wrapEl.value && wrapEl.value.getBoundingClientRect && wrapEl.value.getBoundingClientRect(),
        nodes: () => nodes,
        showHull,
      });
      const cssVars = pz.cssVars;
      const bg = pz.bg;
      const pzView = pz.view;
      const sel = useSelection(Vue);
      const tip = useTooltip(Vue, { delay: 0 });
      const drag = useNodeDrag(Vue, {
        view: pz.view,
        onDrop: () => savePositions(store, schemaName.value, nodes),
      });

      const visEdges = computed(() => assignEdgeOffsets(visibleEdges(edges, showRef.value).map(e => Object.assign({}, e))));
      const revealIds = computed(() => {
        const set = new Set();
        if (sel.hotEdge.value) set.add(sel.hotEdge.value.id);
        if (sel.hot.value) {
          const n = nodes.find(x => x.name === sel.hot.value);
          if (n) for (const e of n.edges || []) set.add(e.id);
        }
        return set;
      });
      const edgeViews = computed(() => deriveEdgeViews(visEdges.value, nodes, pz.view.k, { revealIds: revealIds.value }));
      const hulls = computed(() => showHull.value ? computeHulls(nodes) : []);
      const legend = computed(() => legendItems(nodes, props.view.groups));
      const byN = computed(() => Object.fromEntries(nodes.map(n => [n.name, n])));

      function isNodeDim(n) {
        const f = sel.focusDomain.value;
        return !!f && n.domain !== f;
      }
      function isNodeHotDim(n) {
        if (sel.hotEdge.value) return n.name !== sel.hotEdge.value.a && n.name !== sel.hotEdge.value.b;
        if (!sel.hot.value) return false;
        const node = byN.value[sel.hot.value];
        const set = neighborNames(node || { name: sel.hot.value, edges: [] });
        return !set.has(n.name);
      }
      function isEdgeDim(v) {
        const f = sel.focusDomain.value;
        const e = v.edge;
        const A = byN.value[e.a], B = byN.value[e.b];
        if (f && A && B && A.domain !== f && B.domain !== f) return true;
        if (sel.hotEdge.value) return e.id !== sel.hotEdge.value.id;
        if (sel.hot.value) return e.a !== sel.hot.value && e.b !== sel.hot.value;
        return false;
      }
      function isEdgeHot(v) {
        return !!(sel.hotEdge.value && sel.hotEdge.value.id === v.edge.id)
          || !!(sel.hot.value && (v.edge.a === sel.hot.value || v.edge.b === sel.hot.value));
      }

      function openDetail(name) {
        if (!name) return;
        if (props.wide) emit("open-tab", name);
        else emit("open-list", name);
      }

      function onNodeDown(ev, node) { drag.pointerDown(ev, node); }
      function onCanvasDown(ev) {
        if (ev.target && ev.target.closest && ev.target.closest(".gn")) return;
        const edgeEl = ev.target?.closest?.(".eg");
        drag.pointerDown(ev, null, edgeEl?.getAttribute("data-id") || null);
      }
      function onMove(ev) {
        if (tip.tip.show && tip.tip.kind === "edge") tip.movePointer(ev.clientX, ev.clientY);
        drag.pointerMove(ev);
      }
      function onUp(ev) {
        drag.pointerUp(ev, {
          onTap: ({ node, edgeId }) => {
            if (node) { sel.select(node.name); openDetail(node.name); return; }
            const edge = edgeId && edges.find(e => e.id === edgeId);
            if (edge) { openDetail(edgeDetailName(edge)); return; }
            sel.select(null);
            sel.clearHot();
            tip.hide();
          },
        });
        pz.panning.value = false;
      }
      function onCancel(ev) { drag.pointerCancel(ev); pz.panning.value = false; }
      function onDbl(ev) {
        if (ev.target && ev.target.closest && (ev.target.closest(".gn") || ev.target.closest(".eg"))) return;
        pz.fit();
      }
      function onEnterNode(node) { sel.setHot(node.name); tip.hide(); }
      function onLeaveNode() { sel.clearHot(); }
      function onEnterEdge(v, ev) {
        sel.setHot(null, v.edge);
        tip.show({ kind: "edge", payload: v.edge, x: ev.clientX, y: ev.clientY, anchor: null }, 0);
      }
      function onLeaveEdge() { sel.clearHot(); tip.hide(); }

      function relayout() {
        clearPositions(store, schemaName.value);
        sizeNodes(nodes);
        layoutGraph(nodes, edges, props.view.groups || [], {});
        pz.fit();
        savePositions(store, schemaName.value, nodes);
      }

      function cancelRaf() {
        if (rafId != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
        rafId = null;
      }

      function whenSized(fn) {
        const generation = ++activation;
        cancelRaf();
        const tryRun = () => {
          if (disposed || generation !== activation) return true;
          if (pz.measure) pz.measure();
          const s = pz.size;
          if (s && s.width > 0 && s.height > 0) {
            fn();
            return true;
          }
          return false;
        };
        const afterTick = () => {
          if (disposed || generation !== activation) return;
          if (tryRun()) return;
          cancelRaf();
          if (typeof requestAnimationFrame === "function") {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              tryRun();
            });
          }
        };
        if (typeof nextTick === "function") nextTick(afterTick);
        else afterTick();
      }

      function activate(opts = {}) {
        const { fit = false, focusName = null } = opts;
        whenSized(() => {
          if (focusName) {
            const nd = nodes.find(n => n.name === focusName);
            if (nd) {
              fittedOnce = true;
              pz.focusNode(nd);
              sel.select(focusName);
              sel.setHot(focusName);
              return;
            }
            openDetail(focusName);
            return;
          }
          if (fit || !fittedOnce) {
            pz.fit();
            fittedOnce = true;
          }
        });
      }

      function focusNode(name) {
        return activate({ focusName: name });
      }

      function syncFromView() {
        drag.interrupt();
        tip.hide();
        hydrateFromView({ useStorage: false });
        const names = new Set(nodes.map(n => n.name));
        if (!names.has(sel.selected.value)) sel.select(null);
        if (sel.hot.value && !names.has(sel.hot.value)) sel.clearHot();
        if (sel.hotEdge.value) {
          const current = edges.find(e => e.id === sel.hotEdge.value.id);
          if (current) sel.setHot(null, current);
          else { sel.clearHot(); tip.hide(); }
        }
        if (sel.focusDomain.value && !nodes.some(n => n.domain === sel.focusDomain.value)) sel.focusDomain.value = null;
      }

      watch(() => props.view, syncFromView, { deep: true });

      onMounted(() => {
        pz.attachGestures(wrapEl.value);
        activate({ fit: true });
      });
      onBeforeUnmount(() => {
        disposed = true;
        activation++;
        cancelRaf();
        if (pz.cleanup) pz.cleanup();
        drag.interrupt();
      });

      const panning = computed(() => {
        const d = drag.drag.value;
        return !!(d && d.moved && d.kind === "pan");
      });
      const edgeTip = computed(() => tip.tip.kind === "edge" ? tip.tip.payload : null);
      const selected = sel.selected;
      const focusDomain = sel.focusDomain;
      const tipShow = computed(() => tip.tip.show);
      const tipStyle = tip.style;

      return {
        nodes, showRef, showHull, wrapEl, svgEl, pz, sel, tip, drag,
        cssVars, bg, pzView,
        selected, focusDomain, tipShow, tipStyle,
        edgeViews, hulls, legend, edgeTip, panning,
        isNodeDim, isNodeHotDim, isEdgeDim, isEdgeHot,
        onNodeDown, onCanvasDown, onMove, onUp, onCancel, onDbl,
        onEnterNode, onLeaveNode, onEnterEdge, onLeaveEdge,
        relayout, activate, focusNode,
      };
    },
    template: `<div class="graph-wrap" id="graphWrap" ref="wrapEl" :class="{ pan: panning }">
      <svg class="g-svg" id="gSvg" ref="svgEl" :style="cssVars" @pointerdown="onCanvasDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onCancel" @lostpointercapture="onCancel" @dblclick="onDbl" @mouseleave="onLeaveNode(); tip.hide()">
        <defs>
          <marker id="gArr" viewBox="0 0 10 10" refX="9.4" refY="5" markerWidth="7.5" markerHeight="7.5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z"></path>
          </marker>
          <pattern id="gDots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" class="g-dot"></circle>
          </pattern>
        </defs>
        <g id="gVp" :transform="'translate(' + pzView.tx + ' ' + pzView.ty + ') scale(' + pzView.k + ')'">
          <rect id="gBg" fill="url(#gDots)" :x="bg.x" :y="bg.y" :width="bg.w" :height="bg.h"></rect>
          <g id="gHulls">
            <erd-graph-hull v-for="h in hulls" :key="h.name" :hull="h"></erd-graph-hull>
          </g>
          <g id="gEdges">
            <erd-graph-edge v-for="v in edgeViews" :key="v.edge.id" :view="v" :dimmed="isEdgeDim(v)" :hot="isEdgeHot(v)" @enter="onEnterEdge" @leave="onLeaveEdge"></erd-graph-edge>
          </g>
          <g id="gNodes">
            <erd-graph-node v-for="n in nodes" :key="n.name" :node="n" :selected="selected === n.name" :dimmed="isNodeDim(n)" :hot-dim="isNodeHotDim(n)" @pointerdown="onNodeDown" @enter="onEnterNode" @leave="onLeaveNode"></erd-graph-node>
          </g>
        </g>
      </svg>
      <erd-graph-legend :items="legend" :focus="focusDomain" @toggle="sel.toggleDomain"></erd-graph-legend>
      <erd-graph-toolbar :show-ref="showRef" :show-hull="showHull" @update:showRef="v => showRef = v" @update:showHull="v => showHull = v" @zoom-in="pz.zoomBy(1.45)" @zoom-out="pz.zoomBy(1/1.45)" @fit="pz.fit()" @relayout="relayout"></erd-graph-toolbar>
      <eih-tooltip :show="tipShow" :style-pos="tipStyle" :measure-ref="tip.bindBox" variant="">
        <template v-if="edgeTip && edgeTip.kind === 'n:m'">
          <div class="tp-head"><b>{{ edgeTip.via }}</b><span class="dom">N:M 关系表</span></div>
          <div class="tp-row"><span class="tp-n">{{ edgeTip.a }}</span><span class="tp-t">↔ {{ edgeTip.b }}</span></div>
        </template>
        <template v-else-if="edgeTip && edgeTip.kind === 'nary'">
          <div class="tp-head"><b>{{ edgeTip.via }}</b><span class="dom">N 元关系表</span></div>
          <div class="tp-row"><span class="tp-n">{{ edgeTip.col || '' }}</span><span class="tp-t">──▶ {{ edgeTip.b }}</span></div>
        </template>
        <template v-else-if="edgeTip">
          <div class="tp-head"><b>{{ edgeTip.a }}.{{ edgeTip.aCol || '' }}</b><span class="dom">{{ edgeTip.kind }}</span></div>
          <div class="tp-row"><span class="tp-n">──▶ {{ edgeTip.b }}.{{ edgeTip.bCol || '' }}</span><span class="tp-t">{{ edgeTip.role || '' }}</span></div>
        </template>
        <div v-if="edgeTip && edgeTip.attrs && edgeTip.attrs.length" class="tp-foot">关联属性：{{ edgeTip.attrs.join('，') }}</div>
      </eih-tooltip>
    </div>`,
  };
}
