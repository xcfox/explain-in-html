import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { parseDDL } from "../lib/ddl.js";
import { parseSDL } from "../lib/gql.js";
import { assembleApi, assembleErd, extractInlineScripts, stripModule, bundle, API_FILES, ERD_FILES } from "../lib/assemble.js";
import { assertScriptSyntax, leftoverModuleSyntax, ensureVueCache, loadVue, compileVueTemplate, skillPath } from "./helpers.js";
import { API_COMPONENT_MODULES } from "../runtime/register-api.js";
import { ERD_COMPONENT_MODULES } from "../runtime/register-erd.js";

function samplePages() {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  const apiData = Object.assign(parseSDL(gql, { name: "TaskFlow" }), { name: "TaskFlow API" });
  const erdData = Object.assign(parseDDL(sql, { name: "TaskFlow" }), { name: "TaskFlow" });
  return [
    ["assemble-api", assembleApi(apiData)],
    ["assemble-erd", assembleErd(erdData)],
  ];
}

test("stripModule 将多行 import 改写为模块表访问，不残留 ESM 语句", () => {
  const src = `
import { a, b } from "./one.js";
import {
  KIND_LABEL,
  buildApiView,
} from "./api-view.js";
export { leftover };
export const X = 1;
export function y() { return X; }
`;
  const out = stripModule(src, "core/sample.js");
  assert.doesNotMatch(out, /^\s*import\b/m);
  assert.doesNotMatch(out, /^\s*export\b/m);
  assert.match(out, /__eih\["core\/one.js"\]/);
  assert.match(out, /__eih\["core\/api-view.js"\]/);
  assert.match(out, /const X = 1;/);
  assert.match(out, /function y\(\)/);
  assertScriptSyntax("var __eih = Object.create(null);\n__eih['core/one.js']={a:1,b:2};\n__eih['core/api-view.js']={KIND_LABEL:{},buildApiView:()=>{}};\n" + out, "sample-stripped.js");
});

test("组装产物与 templates 的内联脚本通过 vm.Script 与 node --check", () => {
  const pages = samplePages();
  for (const name of ["api.html", "erd.html"]) {
    const p = skillPath("templates", name);
    if (existsSync(p)) pages.push([`template-${name}`, readFileSync(p, "utf8")]);
  }
  assert.ok(pages.length >= 2);
  for (const [label, html] of pages) {
    const leftover = leftoverModuleSyntax(html);
    assert.deepEqual(leftover, [], `${label} 残留 ESM：${leftover.join(" | ")}`);
    const scripts = extractInlineScripts(html);
    assert.equal(scripts.length, 1, `${label} 应有且仅有一段内联脚本，实际 ${scripts.length}`);
    const bootAt = scripts[0].indexOf("(function boot");
    const vueCheck = scripts[0].indexOf('typeof Vue === "undefined"');
    const bundleHint = scripts[0].indexOf("var __eih");
    assert.ok(bootAt >= 0 && vueCheck > bootAt, `${label} Vue 检查应在 boot 内`);
    assert.ok(bundleHint > vueCheck, `${label} 组件库必须在 typeof Vue 判断之后`);
    assertScriptSyntax(scripts[0], `${label}.inline.js`);
  }
});

test("Vue CDN 未加载时 boot 仍能写出错误说明，且不抛语法/引用错误", () => {
  for (const [label, html] of samplePages()) {
    const [script] = extractInlineScripts(html);
    const app = { textContent: "" };
    const ctx = {
      Vue: undefined,
      document: { getElementById: (id) => (id === "app" ? app : null) },
    };
    vm.runInNewContext(script, ctx);
    assert.match(app.textContent, /无法加载 Vue 3\.5\.13/);
    assert.match(app.textContent, /不是离线自包含/);
  }
});

test("【需联网·可缓存】用固定 Vue 3.5.13 完整构建编译全部组件 HTML 模板", async () => {
  await ensureVueCache();
  const Vue = loadVue();
  assert.equal(Vue.version, "3.5.13");
  const comps = { ...Object.fromEntries(API_COMPONENT_MODULES.map(([t, d]) => [t, d(Vue)])),
                  ...Object.fromEntries(ERD_COMPONENT_MODULES.map(([t, d]) => [t, d(Vue)])) };
  assert.ok(comps["api-explorer"] && comps["erd-graph"] && comps["erd-explorer"]);
  for (const [tag, def] of Object.entries(comps)) {
    assert.equal(typeof def.template, "string", tag);
    try {
      const render = compileVueTemplate(Vue, def.template);
      assert.equal(typeof render, "function", tag);
    } catch (e) {
      throw new Error(`<${tag}> 模板编译失败：${e.message}`);
    }
  }
  for (const tpl of [
    '<api-explorer v-if="ready" :api="api"></api-explorer>',
    '<erd-explorer v-if="ready" :schema="schema"></erd-explorer>',
  ]) {
    assert.equal(typeof compileVueTemplate(Vue, tpl), "function");
  }
});

test("API 与 ERD 预打包 bundle 单独也可被解析", () => {
  assertScriptSyntax(bundle(API_FILES), "api-bundle.js");
  assertScriptSyntax(bundle(ERD_FILES), "erd-bundle.js");
});
