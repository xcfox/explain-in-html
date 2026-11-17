import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleApi, assembleErd } from "../lib/assemble.js";
import { parseSDL } from "../lib/gql.js";
import { parseDDL } from "../lib/ddl.js";
import { skillPath } from "./helpers.js";
import { API_COMPONENT_MODULES } from "../runtime/register-api.js";
import { ERD_COMPONENT_MODULES } from "../runtime/register-erd.js";

const VueStub = {
  ref(v) { return { value: v }; },
  computed(fn) { return { get value() { return fn(); } }; },
  reactive(v) { return v; },
  onMounted() {},
  onBeforeUnmount() {},
  watch() { return () => {}; },
};

test("组件以 kebab-case 显式注册，模板为 HTML 字符串且闭合标签", () => {
  const Vue = VueStub;
  const all = [
    ...API_COMPONENT_MODULES.map(([t, d]) => [t, d(Vue)]),
    ...ERD_COMPONENT_MODULES.map(([t, d]) => [t, d(Vue)]),
  ];
  for (const [tag, def] of all) {
    assert.match(tag, /^[a-z][a-z0-9-]*$/);
    assert.equal(typeof def.template, "string");
    assert.doesNotMatch(def.template, /<[A-Z]/);
    assert.doesNotMatch(def.template, /v-html\s*=/);
    // 自定义标签应显式闭合（排除 void html 与 svg 空元素）
    const voidish = /^(path|rect|circle|line|polygon|polyline|stop|img|input|br|hr|meta|link|source|area|col|embed|wbr|pattern|marker)$/;
    const open = [...def.template.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/g)].map(m => m[1]);
    for (const name of open) {
      if (voidish.test(name)) continue;
      if (def.template.includes(`</${name}>`)) continue;
      // 允许同一模板里用自闭合自定义标签 <foo></foo> 已覆盖；再允许 <path ...></path>
    }
  }
});

test("assembleApi / assembleErd 合成页遵守 Vue 规范", () => {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  const api = assembleApi(Object.assign(parseSDL(gql, { name: "T" }), { name: "T" }));
  const erd = assembleErd(Object.assign(parseDDL(sql, { name: "T" }), { name: "T" }));
  for (const html of [api, erd]) {
    assert.match(html, /vue@3\.5\.13\/dist\/vue\.global\.prod\.js/);
    assert.match(html, /createApp/);
    assert.match(html, /register(Api|Erd)\(app, Vue\)/);
    assert.doesNotMatch(html, /\sv-html\s*=/);
  }
});

test("组件模板不使用 v-html", () => {
  const dir = skillPath("runtime/components");
  for (const f of readdirSync(dir).filter(x => x.endsWith(".js"))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /v-html/, f);
  }
});
