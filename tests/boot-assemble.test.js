import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDDL } from "../lib/ddl.js";
import { parseSDL } from "../lib/gql.js";
import { assembleApi, assembleErd, extractInlineScripts, API_FILES, ERD_FILES } from "../lib/assemble.js";
import { ensureVueCache, vueCachePath, bootAssembledHtml, skillPath } from "./helpers.js";

function sampleData() {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  return {
    api: Object.assign(parseSDL(gql, { name: "TaskFlow" }), { name: "TaskFlow API" }),
    erd: Object.assign(parseDDL(sql, { name: "TaskFlow" }), { name: "TaskFlow" }),
  };
}

test("API 组装清单包含 placement 且不含 graph-geometry", () => {
  assert.ok(API_FILES.includes("core/placement.js"));
  assert.equal(API_FILES.includes("core/graph-geometry.js"), false);
  assert.ok(ERD_FILES.includes("core/placement.js"));
  assert.ok(ERD_FILES.includes("core/graph-geometry.js"));
  assert.ok(API_FILES.includes("runtime/composables/use-pane-resize.js"));
  assert.ok(ERD_FILES.includes("runtime/composables/use-pane-resize.js"));
});

test("【需联网·可缓存】组装产物在真实 Vue+DOM 中 boot，两页 mount 无错误", async () => {
  await ensureVueCache();
  const vueCode = readFileSync(vueCachePath(), "utf8");
  const { api, erd } = sampleData();
  const pages = [
    ["api", assembleApi(api)],
    ["erd", assembleErd(erd)],
  ];
  for (const [label, html] of pages) {
    const scripts = extractInlineScripts(html);
    assert.equal(scripts.length, 1, label);
    if (label === "api") {
      assert.match(scripts[0], /__eih\["core\/placement.js"\]/);
      assert.doesNotMatch(scripts[0], /__eih\["core\/graph-geometry.js"\]/);
    }
    const boot = bootAssembledHtml(html, { vueCode, width: 1280, height: 800 });
    try {
      assert.deepEqual(boot.errors.map(String), [], `${label} boot errors`);
      const app = boot.document.getElementById("app");
      assert.ok(app, `${label} 缺少 #app`);
      assert.doesNotMatch(app.textContent || "", /无法加载 Vue/);
      const root = app.querySelector(".api-root, .erd-root");
      assert.ok(root, `${label} 未挂上根组件，innerHTML=${(app.innerHTML || "").slice(0, 200)}`);
    } finally {
      boot.close();
    }
  }
});
