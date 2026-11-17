export const tag = "api-domain-section";
export const name = "ApiDomainSection";

export function define() {
  return {
    name,
    props: { sec: { type: Object, required: true }, types: { type: Object, required: true } },
    emits: ["toggle", "open-type", "tip", "tip-hide"],
    setup() { return {}; },
    template: `<section class="dom" :class="{ closed: sec.closed }" :data-dom="sec.key">
      <div class="dom-h" role="button" :aria-expanded="(!sec.closed).toString()" @click="$emit('toggle', sec.key)">
        <span class="caret"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg></span>{{ sec.title }}<span class="n">{{ sec.count }}</span>
      </div>
      <div class="dom-body">
        <div v-if="sec.ops.length" class="card">
          <api-op-row v-for="o in sec.ops" :key="o.name" :op="o" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)"></api-op-row>
        </div>
        <api-type-expand v-for="e in sec.expands" :key="e.name" :name="e.name" :types="types" :with-id="e.withId" @open-type="(name, ev) => $emit('open-type', name, ev)"></api-type-expand>
        <template v-if="sec.restTypes.length">
          <div class="t-sub">类型 <span class="n">{{ sec.restTypes.length }}</span></div>
          <div class="tchips">
            <api-type-chip v-for="n in sec.restTypes" :key="n" :name="n" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)" @tip="(n, el) => $emit('tip', n, el)" @tip-hide="$emit('tip-hide')"></api-type-chip>
          </div>
        </template>
        <template v-if="sec.restInputs.length">
          <div class="t-sub">输入 <span class="n">{{ sec.restInputs.length }}</span></div>
          <div class="tchips">
            <api-type-chip v-for="n in sec.restInputs" :key="n" :name="n" :types="types" @open-type="(name, ev) => $emit('open-type', name, ev)" @tip="(n, el) => $emit('tip', n, el)" @tip-hide="$emit('tip-hide')"></api-type-chip>
          </div>
        </template>
      </div>
    </section>`,
  };
}
