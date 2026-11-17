import { colCmt, relsTouching, assocParts, attrColumns, fkTarget } from "../../core/erd-view.js";

export const tag = "erd-table-card";
export const name = "ErdTableCard";

export function define(Vue) {
  const { computed } = Vue;
  return {
    name: "ErdTableCard",
    props: {
      table: { type: Object, required: true },
      schema: { type: Object, required: true },
      byName: { type: Object, required: true },
      types: { type: Object, default: () => ({}) },
    },
    emits: ["open-tab", "go-graph", "ts-tip", "ts-hide", "tip", "tip-hide"],
    setup(props, { emit }) {
      const isAssoc = computed(() => props.table.kind === "assoc");
      const kindTag = computed(() => props.table.kind === "assoc" ? "关系表" : props.table.kind === "weak" ? "弱实体" : "");
      const parts = computed(() => isAssoc.value ? assocParts(props.schema, props.byName, props.table) : null);
      const rels = computed(() => relsTouching(props.schema.relations, props.table.name));
      const nRel = computed(() => {
        const r = rels.value;
        return r.out.length + r.inn.length + r.nm.length + r.slf.length;
      });
      function endFk(c) { return fkTarget(c); }
      function nmRole(r) {
        const flip = r.a !== props.table.name;
        const other = flip ? r.a : r.b;
        const viaCol = flip ? r.aCols[0] : r.bCols[0];
        const self = r.a === r.b;
        return self ? "自关联" : (colCmt(props.byName, r.via, viaCol) || other);
      }
      function nmOther(r) { return r.a !== props.table.name ? r.a : r.b; }
      function nmCols(r) {
        const flip = r.a !== props.table.name;
        const viaCol = flip ? r.aCols[0] : r.bCols[0];
        const myCol = flip ? r.bCols[0] : r.aCols[0];
        return `${myCol} ↔ ${viaCol}`;
      }
      function naryOthers(r) { return (r.ends || []).filter(e => e.table !== props.table.name); }
      function naryCols(r) { return (r.ends || []).map(e => e.col).join(" · "); }
      function attrs(r) { return attrColumns(props.byName, r); }
      function inCmt(r) {
        const src = props.byName[r.a];
        return colCmt(props.byName, r.a, r.aCols[0]) || (src && src.comment) || "";
      }
      function onOver(ev) {
        const a = ev.target && ev.target.closest && ev.target.closest("[data-tip-table]");
        if (!a) return;
        const n = a.getAttribute("data-tip-table");
        if (n) emit("tip", n, a);
      }
      return {
        isAssoc, kindTag, parts, rels, nRel, endFk, nmRole, nmOther, nmCols,
        naryOthers, naryCols, attrs, inCmt, onOver,
      };
    },
    template: `<div class="t-card" @mouseover="onOver" @mouseleave="$emit('tip-hide')">
      <div class="t-head">
        <div class="t-name" :data-tip-table="table.name"><span class="sq" :style="{ background: table.color }"></span>{{ table.name }}<span v-if="kindTag" class="kind-tag">{{ kindTag }}</span></div>
        <div class="t-cmt">{{ table.comment || "" }}</div>
        <div class="t-meta">
          <span class="meta-chip">{{ table.domain }}</span>
          <span v-if="isAssoc" class="meta-chip"><b>{{ parts.ends.length }}</b> 端点</span>
          <span v-if="isAssoc && parts.attrs.length" class="meta-chip"><b>{{ parts.attrs.length }}</b> 关联属性</span>
          <span v-if="!isAssoc" class="meta-chip"><b>{{ table.columns.length }}</b> 列</span>
          <span v-if="!isAssoc" class="meta-chip"><b>{{ nRel }}</b> 关系</span>
          <span v-if="table.indexes && table.indexes.length" class="meta-chip"><b>{{ table.indexes.length }}</b> 索引</span>
          <span class="meta-chip g-go" @click="$emit('go-graph', table.name)">⌖ 关系图</span>
        </div>
      </div>

      <template v-if="isAssoc">
        <template v-if="parts.r && parts.r.kind !== 'nary'">
          <h2 class="sec">关系 <span class="n">RELATES</span></h2>
          <div class="card">
            <div class="r-row">
              <span class="r-kind nm">N:M</span>
              <a :data-tip-table="parts.r.a" class="link" :href="'#' + parts.r.a" @click.prevent="$emit('open-tab', parts.r.a)"><span class="r-to">{{ parts.r.a }}</span></a>
              <span class="r-arrow">↔</span>
              <a :data-tip-table="parts.r.b" class="link" :href="'#' + parts.r.b" @click.prevent="$emit('open-tab', parts.r.b)"><span class="r-to">{{ parts.r.b }}</span></a>
            </div>
          </div>
        </template>
        <template v-else-if="parts.r">
          <h2 class="sec">关系 <span class="n">RELATES</span></h2>
          <div class="card">
            <div class="r-row">
              <span class="r-kind nm">N-ARY</span>
              <template v-for="(e, i) in parts.r.ends" :key="e.table">
                <span v-if="i" class="r-arrow"> · </span>
                <a :data-tip-table="e.table" class="link" :href="'#' + e.table" @click.prevent="$emit('open-tab', e.table)"><span class="r-to">{{ e.table }}</span></a>
              </template>
            </div>
          </div>
        </template>
        <h2 class="sec">端点 <span class="n">ENDS · {{ parts.ends.length }}</span></h2>
        <div class="card">
          <div v-if="!parts.ends.length" class="empty-rel">未识别端点</div>
          <div v-for="c in parts.ends" :key="c.name" class="r-row">
            <a :data-tip-table="endFk(c).table" class="link" :href="'#' + endFk(c).table" @click.prevent="$emit('open-tab', endFk(c).table)">
              <span class="r-kind nm">端点</span>
              <span class="r-cols">{{ c.name }}</span>
              <span class="r-arrow">──▶</span>
              <span class="r-to">{{ endFk(c).table }}.{{ endFk(c).col }}</span>
            </a>
            <span class="r-cmt">{{ c.cmt || "" }}</span>
          </div>
        </div>
        <template v-if="parts.attrs.length">
          <h2 class="sec">关联属性 <span class="n">ATTRIBUTES · {{ parts.attrs.length }}</span></h2>
          <div class="card">
            <erd-col-row v-for="c in parts.attrs" :key="c.name" :col="c" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></erd-col-row>
          </div>
        </template>
      </template>

      <template v-else>
        <h2 class="sec">列 <span class="n">COLUMNS · {{ table.columns.length }}</span></h2>
        <div class="card">
          <erd-col-row v-for="c in table.columns" :key="c.name" :col="c" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></erd-col-row>
        </div>
        <h2 class="sec">关系 <span class="n">RELATIONS · {{ nRel }}</span></h2>
        <div class="card">
          <div v-if="!nRel" class="empty-rel">暂无关系</div>
          <div v-for="r in rels.out" :key="'o'+r.a+r.aCols[0]+r.b" class="r-row">
            <a :data-tip-table="r.b" class="link" :href="'#' + r.b" @click.prevent="$emit('open-tab', r.b)">
              <span class="r-kind" :class="r.kind === 'self' ? 'self' : ''">{{ r.kind === 'self' ? 'SELF' : r.kind === '1:1' ? '1:1' : 'N:1' }}</span>
              <span class="r-cols">{{ r.aCols[0] }}</span>
              <span class="r-arrow">──▶</span>
              <span class="r-to">{{ r.b }}.{{ r.bCols[0] }}</span>
            </a>
            <span v-if="r.ident" class="r-id">标识</span>
            <span class="r-cmt">{{ r.role || "" }}</span>
          </div>
          <div v-for="r in rels.slf" :key="'s'+r.aCols[0]" class="r-row">
            <a :data-tip-table="r.b" class="link" :href="'#' + r.b" @click.prevent="$emit('open-tab', r.b)">
              <span class="r-kind self">SELF</span>
              <span class="r-cols">{{ r.aCols[0] }}</span>
              <span class="r-arrow">──▶</span>
              <span class="r-to">{{ r.b }}.{{ r.bCols[0] }}</span>
            </a>
            <span v-if="r.ident" class="r-id">标识</span>
            <span class="r-cmt">{{ r.role || "" }}</span>
          </div>
          <div v-for="r in rels.nm" :key="'n'+(r.via||'')+(r.kind||'')" class="r-block">
            <template v-if="r.kind === 'nary'">
              <div class="r-row">
                <span class="r-kind nm">N-ARY</span>
                <template v-for="(e, i) in naryOthers(r)" :key="e.table">
                  <span v-if="i" class="r-arrow"> · </span>
                  <a :data-tip-table="e.table" class="link" :href="'#' + e.table" @click.prevent="$emit('open-tab', e.table)"><span class="r-to">{{ e.table }}</span></a>
                </template>
              </div>
              <div class="r-via">通过 <a :data-tip-table="r.via" :href="'#' + r.via" @click.prevent="$emit('open-tab', r.via)">{{ r.via }}</a><span class="r-cols">{{ naryCols(r) }}</span></div>
            </template>
            <template v-else>
              <div class="r-row">
                <a :data-tip-table="nmOther(r)" class="link" :href="'#' + nmOther(r)" @click.prevent="$emit('open-tab', nmOther(r))">
                  <span class="r-kind nm">N:M</span>
                  <span class="r-to">{{ nmOther(r) }}</span>
                </a>
                <span class="r-cmt">{{ nmRole(r) }}</span>
              </div>
              <div class="r-via">通过 <a :data-tip-table="r.via" :href="'#' + r.via" @click.prevent="$emit('open-tab', r.via)">{{ r.via }}</a>
                <span class="r-cols">{{ nmCols(r) }}</span></div>
            </template>
            <div v-if="attrs(r).length" class="r-attrs">
              <erd-col-row v-for="c in attrs(r)" :key="c.name" :col="c" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></erd-col-row>
            </div>
          </div>
          <div v-for="r in rels.inn" :key="'i'+r.a+r.aCols[0]" class="r-row">
            <a :data-tip-table="r.a" class="link" :href="'#' + r.a" @click.prevent="$emit('open-tab', r.a)">
              <span class="r-kind in">1:N</span>
              <span class="r-to">{{ r.a }}.{{ r.aCols[0] }}</span>
              <span class="r-arrow">──▶</span>
              <span class="r-cols">{{ r.b }}.{{ r.bCols[0] }}</span>
            </a>
            <span v-if="r.ident" class="r-id">标识</span>
            <span class="r-cmt">{{ inCmt(r) }}</span>
          </div>
        </div>
      </template>
      <erd-indexes :table="table"></erd-indexes>
      <erd-types-block :table="table" :types="types" @ts-tip="(n, el) => $emit('ts-tip', n, el)" @ts-hide="$emit('ts-hide')"></erd-types-block>
    </div>`,
  };;
}
