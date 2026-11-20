import { buildErdView, tableMatches, orderedGroupTables, footText } from "../../core/erd-view.js";
import { ERD_PANE_KEY } from "../../core/storage.js";
import { defaultErdPane, isWide } from "../../core/chrome.js";
import { useSearch } from "../composables/use-search.js";
import { useTabs } from "../composables/use-tabs.js";
import { usePersistent } from "../composables/use-persistent.js";
import { useTooltip } from "../composables/use-tooltip.js";
import { useMedia } from "../composables/use-media.js";
import { useDrawer } from "../composables/use-drawer.js";
import { useScrollSpy } from "../composables/use-scroll-spy.js";
import { useHashNav } from "../composables/use-hash-nav.js";
import { useListeners } from "../composables/use-listeners.js";
import { recolorTables } from "../composables/use-scheme.js";

export const tag = "erd-explorer";
export const name = "ErdExplorer";

export function define(Vue) {
  const { computed, ref, watch, nextTick, onMounted } = Vue;
  return {
    name,
    props: { schema: { type: Object, required: true } },
    setup(props) {
      const persist = usePersistent(Vue);
      const { viewport, dark } = useMedia(Vue);
      const { listen } = useListeners(Vue);
      const view = computed(() => buildErdView(props.schema, dark.value));
      const data = computed(() => view.value.data);
      const byName = computed(() => view.value.byName);
      const groups = computed(() => view.value.groups);
      const typesByName = computed(() => view.value.typesByName);
      const { filter } = useSearch(Vue);
      const current = ref((props.schema.tables && props.schema.tables[0] && props.schema.tables[0].name) || "");
      const mode = ref("graph");
      const graphRef = ref(null);
      const tabs = useTabs(Vue, { isOpenable: id => !!byName.value[id] });
      const defPane = defaultErdPane(typeof innerWidth === "number" ? innerWidth : 1200);
      const paneW = ref(persist.readNumber(ERD_PANE_KEY, defPane));
      const paneOn = computed(() => tabs.hasTabs.value && isWide(viewport.value));
      const drawer = useDrawer(Vue, { viewport, paneW, paneOn });
      const spy = useScrollSpy(Vue, { current });
      const tip = useTooltip(Vue, { delay: 260 });

      const navGroups = computed(() => {
        const out = [];
        for (const g of groups.value) {
          const ts = g.tables.filter(t => tableMatches(t, filter.value));
          if (!ts.length) continue;
          out.push({ name: g.name, color: g.color, tables: orderedGroupTables(ts) });
        }
        return out;
      });
      const navEmpty = computed(() => navGroups.value.length === 0);
      const foot = computed(() => footText(data.value));
      const contentBlocks = computed(() => {
        const blocks = [];
        let last = "";
        for (const t of data.value.tables || []) {
          if (t.domain !== last) { blocks.push({ mark: t.domain, color: t.color }); last = t.domain; }
          blocks.push({ table: t });
        }
        return blocks;
      });
      const tableNames = computed(() => (data.value.tables || []).map(t => t.name));
      const paneWidth = drawer.paneWidth;
      const sideOff = drawer.sideOff;
      const menuOpen = drawer.menuOpen;
      const wide = drawer.wide;
      const brand = computed(() => data.value.name || "Schema");
      const tipTable = computed(() => {
        if (tip.tip.kind !== "table") return null;
        return byName.value[tip.tip.payload] || null;
      });
      const tipTs = computed(() => {
        if (tip.tip.kind !== "ts") return null;
        const n = tip.tip.payload;
        return { n, src: typesByName.value[n] || n };
      });
      const activeTable = computed(() => (tabs.active.value && byName.value[tabs.active.value]) || null);

      function setMode(m) {
        mode.value = m === "graph" ? "graph" : "list";
        drawer.closeMenu();
        tip.hide();
        if (mode.value === "graph") {
          nextTick(() => {
            if (graphRef.value && graphRef.value.activate) graphRef.value.activate({ fit: false });
          });
        }
      }
      function openTab(n) {
        if (!wide.value) {
          mode.value = "list";
          drawer.closeMenu();
          nextTick(() => spy.scrollToName(n));
          return;
        }
        tabs.open(n);
      }
      function goGraph(name) {
        mode.value = "graph";
        drawer.closeMenu();
        tip.hide();
        nextTick(() => {
          if (graphRef.value && graphRef.value.activate) graphRef.value.activate({ focusName: name });
        });
      }
      function onOpenList(n) {
        mode.value = "list";
        drawer.closeMenu();
        nextTick(() => spy.scrollToName(n));
      }
      function onNav(name) {
        if (mode.value === "graph") goGraph(name);
        else {
          spy.scrollToName(name);
          drawer.closeMenu();
        }
      }
      function showTableTip(n, el) { tip.show({ kind: "table", payload: n, anchor: el }, 260); }
      function showTsTip(n, el) { tip.show({ kind: "ts", payload: n, anchor: el, preferRight: true }, 120); }
      function tabClass() { return "tab"; }
      function tabStyle(n) {
        const t = byName.value[n];
        return t && t.color ? { "--tac": t.color } : null;
      }
      function onResize(w) { paneW.value = w; }
      function onCommit(w) { persist.writeText(ERD_PANE_KEY, w); }
      function onScroll() { if (mode.value === "list") spy.onScroll(tableNames.value); }

      useHashNav(Vue, {
        onHash: name => {
          if (!name || !byName.value[name]) return;
          if (mode.value === "graph") goGraph(name);
          else spy.scrollToName(name, true);
        },
      });

      watch(dark, (d) => {
        recolorTables(props.schema, d);
        // The view prop drives graph synchronization; no imperative child refresh.
      });

      onMounted(() => {
        listen(typeof window !== "undefined" ? window : null, "scroll", onScroll, { passive: true });
      });

      const tipShow = computed(() => tip.tip.show);
      const tipVariant = computed(() => tip.tip.kind === "ts" ? "ts" : "");

      return {
        view, data, byName, typesByName, filter, current, mode, graphRef,
        navGroups, navEmpty, foot, contentBlocks, brand,
        tabList: tabs.tabs, activeTab: tabs.active, hasTabs: tabs.hasTabs, activeTable,
        paneWidth, paneW, sideOff, menuOpen, wide,
        tip, tipShow, tipStyle: tip.style, tipVariant, tipTable, tipTs,
        setMode, openTab, goGraph, onNav, showTableTip, showTsTip, tabClass, tabStyle,
        onResize, onCommit, spy, drawer, tabs,
      };
    },
    template: `<div class="erd-root" :class="{ 'side-off': sideOff, gmode: mode === 'graph' }" style="display:flex;min-height:100vh;flex:1;">
      <button type="button" id="menuBtn" aria-label="菜单" @click="drawer.toggleMenu()">☰</button>
      <aside id="side" :class="{ open: menuOpen }">
        <erd-toolbar :brand="brand" :mode="mode" :filter="filter" @update:filter="v => filter = v" @mode="setMode"></erd-toolbar>
        <erd-nav :groups="navGroups" :empty="navEmpty" :current="current" :foot="foot" @select="onNav" @tip="showTableTip" @tip-hide="tip.hideSoon"></erd-nav>
      </aside>
      <div id="scrim" @click="drawer.closeMenu()"></div>
      <main id="main" :class="{ gmode: mode === 'graph' }">
        <erd-table-list v-show="mode === 'list'" :blocks="contentBlocks" :schema="data" :by-name="byName" :types="typesByName" @open-tab="openTab" @go-graph="goGraph" @ts-tip="showTsTip" @ts-hide="tip.hideSoon" @tip="showTableTip" @tip-hide="tip.hideSoon" @bind-el="spy.setEl"></erd-table-list>
        <erd-graph v-show="mode === 'graph'" ref="graphRef" :view="view" :wide="wide" @open-tab="openTab" @open-list="onOpenList"></erd-graph>
      </main>
      <eih-side-pane :shown="hasTabs && wide" :width="paneWidth" kind="erd" @resize="onResize" @commit="onCommit">
        <template #tabs>
          <eih-tab-strip :tabs="tabList" :active="activeTab" :tab-class="tabClass" :tab-style="tabStyle" @select="tabs.select" @close="tabs.close">
          </eih-tab-strip>
        </template>
        <erd-table-card v-if="activeTable" :table="activeTable" :schema="data" :by-name="byName" :types="typesByName" @open-tab="openTab" @go-graph="goGraph" @ts-tip="showTsTip" @ts-hide="tip.hideSoon" @tip="showTableTip" @tip-hide="tip.hideSoon"></erd-table-card>
      </eih-side-pane>
      <eih-tooltip :show="tipShow" :style-pos="tipStyle" :variant="tipVariant" :measure-ref="tip.bindBox" @enter="tip.cancel" @leave="tip.hideSoon">
        <template v-if="tipTable">
          <div class="tp-head"><span class="sq" :style="{ background: tipTable.color }"></span><b>{{ tipTable.name }}</b>
            <span class="dom">{{ tipTable.kind === 'assoc' ? '关系表 · ' : tipTable.kind === 'weak' ? '弱实体 · ' : '' }}{{ tipTable.domain }}</span></div>
          <div v-for="c in tipTable.columns" :key="c.name" class="tp-row">
            <span class="tp-n">{{ c.name }}</span>
            <span class="tp-t">{{ c.type + (c.ts ? '<' + c.ts + '>' : '') }}</span>
            <span v-if="c.pk" class="b b-pk">PRIMARY KEY</span>
            <span v-if="c.fk" class="b b-fk">FOREIGN KEY</span>
            <span v-if="c.uq" class="b b-uq">UNIQUE</span>
            <span v-if="c.nn && !c.pk" class="b b-nn">NOT NULL</span>
          </div>
          <div v-if="tipTable.comment" class="tp-foot">{{ tipTable.comment }}</div>
        </template>
        <template v-else-if="tipTs">
          <div class="tp-head"><b>{{ tipTs.n }}</b><span class="dom">type</span></div>
          <pre class="tp-ts"><span class="tk-kw">type</span> <span class="tk-type">{{ tipTs.n }}</span> <span class="tk-pun">=</span> <ts-highlight :source="tipTs.src" :types="typesByName"></ts-highlight></pre>
        </template>
      </eih-tooltip>
    </div>`,
  };
}
