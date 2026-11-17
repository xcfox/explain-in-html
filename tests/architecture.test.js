import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { skillPath } from "./helpers.js";
import { API_COMPONENT_MODULES } from "../runtime/register-api.js";
import { ERD_COMPONENT_MODULES } from "../runtime/register-erd.js";

const FORBIDDEN = [
  [/\.innerHTML\s*=/, "innerHTML 赋值"],
  [/insertAdjacentHTML\s*\(/, "insertAdjacentHTML"],
  [/document\.createElement(NS)?\s*\(/, "createElement"],
  [/createElementNS\s*\(/, "createElementNS"],
  [/\.outerHTML\s*=/, "outerHTML"],
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|css|html|md)$/.test(name)) acc.push(p);
  }
  return acc;
}

test("一组件一文件：文件名与 tag 一致，且只定义一个 template", () => {
  const dir = skillPath("runtime/components");
  const files = readdirSync(dir).filter(f => f.endsWith(".js")).sort();
  assert.ok(files.length >= 20, "组件文件过少");
  const tags = new Set();
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const tag = src.match(/export const tag = "([a-z0-9-]+)"/);
    assert.ok(tag, `${f} 缺少 export const tag`);
    assert.equal(tag[1] + ".js", f, `${f} 文件名必须等于 tag.js`);
    assert.match(src, /export function define\s*\(/);
    const templates = src.match(/\btemplate\s*:/g) || [];
    assert.equal(templates.length, 1, `${f} 应恰好一个 template，实际 ${templates.length}`);
    assert.equal(tags.has(tag[1]), false, `重复 tag ${tag[1]}`);
    tags.add(tag[1]);
  }
});

test("注册入口只聚合显式注册，不定义组件 template", () => {
  for (const f of ["runtime/register-api.js", "runtime/register-erd.js"]) {
    const src = readFileSync(skillPath(f), "utf8");
    assert.doesNotMatch(src, /\btemplate\s*:/);
    assert.doesNotMatch(src, /template:\s*`/);
    assert.match(src, /app\.component\(/);
  }
  const apiTags = API_COMPONENT_MODULES.map(([t]) => t);
  const erdTags = ERD_COMPONENT_MODULES.map(([t]) => t);
  assert.ok(apiTags.includes("api-explorer"));
  assert.ok(erdTags.includes("erd-graph") && erdTags.includes("erd-explorer") && erdTags.includes("erd-graph-node"));
  assert.equal(new Set(apiTags).size, apiTags.length);
});

test("不存在把多个组件塞进同一文件的旧入口", () => {
  const banned = ["components-erd.js", "components-api.js", "components-erd.mjs", "components-api.mjs", "erd-graph.mjs"];
  for (const f of banned) {
    assert.equal(
      readdirSync(skillPath("runtime")).includes(f) || readdirSync(skillPath("runtime/components")).includes(f),
      false,
      f,
    );
  }
});

test("运行时与 core 禁止用字符串拼接 DOM/SVG（架构）", () => {
  const roots = [skillPath("core"), skillPath("runtime")];
  const allow = new Set([
    // 仅文档/测试辅助不在此目录
  ]);
  const hits = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      if (file.endsWith(".css")) continue;
      const src = readFileSync(file, "utf8");
      for (const [re, label] of FORBIDDEN) {
        if (re.test(src)) hits.push(`${file.slice(skillPath().length + 1)}: ${label}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test("querySelector / 全局 getElementById 不得用于图的节点查找", () => {
  const graphFiles = walk(skillPath("runtime/components")).filter(f => basename(f).startsWith("erd-graph"));
  graphFiles.push(skillPath("runtime/composables/use-pan-zoom.js"));
  graphFiles.push(skillPath("runtime/composables/use-node-drag.js"));
  for (const f of graphFiles) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /querySelector(All)?\s*\(/, f);
    assert.doesNotMatch(src, /getElementById\s*\(/, f);
  }
});

test("核心布局/模型不引用 Vue", () => {
  for (const f of walk(skillPath("core"))) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\bVue\b/, f);
    assert.doesNotMatch(src, /from\s+['\"]vue['\"]/, f);
  }
});
