import { buildApiView, buildApiSections, tipSdlPreview, kindClass, KIND_LABEL } from "../../core/api-view.js";
import { API_PANE_KEY } from "../../core/storage.js";
import { defaultApiPane, clampApiPane, isApiOverlay } from "../../core/chrome.js";
import { useSearch } from "../composables/use-search.js";
import { useTabs } from "../composables/use-tabs.js";
import { useCollapse } from "../composables/use-collapse.js";
import { usePersistent } from "../composables/use-persistent.js";
import { useTooltip } from "../composables/use-tooltip.js";
import { useMedia } from "../composables/use-media.js";
import { useListeners } from "../composables/use-listeners.js";

export const tag = "api-explorer";
export const name = "ApiExplorer";

export function define(Vue) {
  const { computed, ref, onMounted } = Vue;
  return {
    name,
    props: { api: { type: Object, required: true } },
    setup(props) {
      const persist = usePersistent(Vue);
      const { viewport } = useMedia(Vue);
      const { listen } = useListeners(Vue);
      const view = computed(() => buildApiView(props.api));
      const types = computed(() => view.value.types);
      const ops = computed(() => view.value.ops);
      const { filter } = useSearch(Vue);
      const collapse = useCollapse(Vue, { storage: persist.storage });
      const tabs = useTabs(Vue, { isOpenable: id => !!types.value[id] });
      const defPane = defaultApiPane(typeof innerWidth === "number" ? innerWidth : 1200);
      const overlay = computed(() => isApiOverlay(viewport.value));
      const paneW = ref(clampApiPane(persist.readNumber(API_PANE_KEY, defPane), typeof innerWidth === "number" ? innerWidth : 1200, { overlay: isApiOverlay(typeof innerWidth === "number" ? innerWidth : 1200) }));
      const tip = useTooltip(Vue, { delay: 260 });

      const sections = computed(() => buildApiSections(view.value, filter.value, collapse.collapsed.value));
      const empty = computed(() => sections.value.length === 0);
      const tipView = computed(() => {
        const n = tip.tip.payload;
        const t = n && types.value[n];
        return t ? Object.assign({ name: n }, tipSdlPreview(t)) : null;
      });
      function tabClass(n) {
        const t = types.value[n];
        return "tab" + kindClass(t && t.kind);
      }
      function openTab(n, ev) {
        if (ev && ev.defaultPrevented === false) {
          const local = typeof document !== "undefined" && document.getElementById("type-" + n);
          if (local && !ev.metaKey && !ev.ctrlKey) return;
          ev.preventDefault && ev.preventDefault();
        }
        tabs.open(n);
      }
      function goOp(name) {
        const el = typeof document !== "undefined" && document.getElementById("op-" + name);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      function onResize(w) { paneW.value = w; }
      function onCommit(w) { persist.writeText(API_PANE_KEY, w); }
      function showTip(n, el) { tip.show({ payload: n, anchor: el, kind: "type" }); }
      onMounted(() => {
        listen(typeof window !== "undefined" ? window : null, "resize", () => {
          paneW.value = clampApiPane(paneW.value, viewport.value, { overlay: overlay.value });
        });
      });
      const tipShow = computed(() => tip.tip.show);
      return {
        types, ops, filter, sections, empty, tabs, paneW, overlay, tip, tipView, tipShow,
        tabList: tabs.tabs, activeTab: tabs.active, hasTabs: tabs.hasTabs,
        tabClass, openTab, goOp, onResize, onCommit, showTip, collapse, KIND_LABEL,
        tipStyle: tip.style,
      };
    },
    template: `<div class="api-root" :class="{ 'is-overlay': overlay }" style="display:flex;min-height:100vh;flex:1;">
      <main id="main">
        <api-toolbar v-model="filter"></api-toolbar>
        <div class="wrap" id="list">
          <div v-if="empty" class="list-empty">没有匹配项</div>
          <api-domain-section v-for="sec in sections" :key="sec.key" :sec="sec" :types="types" @toggle="collapse.toggle" @open-type="openTab" @tip="showTip" @tip-hide="tip.hide"></api-domain-section>
        </div>
      </main>
      <div class="api-scrim" :class="{ 'is-on': overlay && hasTabs }" @click="tabs.closeAll()"></div>
      <eih-side-pane :shown="hasTabs" :width="paneW" kind="api" :overlay="overlay" @resize="onResize" @commit="onCommit">
        <template #tabs>
          <eih-tab-strip :tabs="tabList" :active="activeTab" :tab-class="tabClass" @select="tabs.select" @close="tabs.close"></eih-tab-strip>
        </template>
        <api-type-detail v-if="activeTab && types[activeTab]" :name="activeTab" :types="types" :ops="ops" @open-type="openTab" @go-op="goOp" @tip="showTip" @tip-hide="tip.hide"></api-type-detail>
      </eih-side-pane>
      <eih-tooltip :show="tipShow" :style-pos="tipStyle" :measure-ref="tip.bindBox">
        <template v-if="tipView">
          <div class="tp-head"><span :class="tipView.cls">{{ tipView.kind }}</span><b>{{ tipView.name }}</b></div>
          <div class="tp-sdl">{{ tipView.sdl }}</div>
          <div v-if="tipView.description" class="tp-foot">{{ tipView.description }}</div>
        </template>
      </eih-tooltip>
    </div>`,
  };
}
