import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeScriptJson, injectData, escapeHtml, setTitle, wrapDataBlock, dataStartMark, dataEndMark } from "../lib/inject.js";
import { assembleApi } from "../lib/assemble.js";
import { tokenizeSDL, tokenizeTS } from "../core/highlight.js";

test("escapeScriptJson 将 < 写成 \\u003c，防止 </script> 提前闭合", () => {
  const s = escapeScriptJson({ x: "</script><script>alert(1)" });
  assert.match(s, /\\u003c/);
  assert.doesNotMatch(s, /<\/script>/i);
});

test("injectData 按起止标记替换，并转义尖括号", () => {
  const html = `head\n${wrapDataBlock("API", '{"a":1}')}\ntail`;
  const out = injectData(html, "API", { a: 2, s: "<x>" });
  assert.match(out, /"a":2/);
  assert.match(out, /\\u003c/);
  assert.ok(out.includes(dataStartMark("API")) && out.includes(dataEndMark("API")));
});

test("injectData 在缺少数据区时抛错", () => {
  assert.throws(() => injectData("<html></html>", "API", {}), /未找到/);
});

test("tokenizeSDL 不把用户文本当 HTML 插入：token.text 保持原文，由模板转义", () => {
  const toks = tokenizeSDL('type Foo { x: String @deprecated(reason: "<b>") }', { Foo: {} });
  assert.ok(toks.some(t => t.text.includes("<b>")));
});

test("tokenizeTS 识别具名类型引用", () => {
  const toks = tokenizeTS("type Id = TaskId", { TaskId: "string" });
  assert.ok(toks.some(t => t.ts === "TaskId"));
});

test("恶意 title 经 escapeHtml 后不能闭合 title 或注入 script", () => {
  const evil = '</title><script>alert(1)</script>';
  const html = setTitle("<html><head><title>old</title></head></html>", evil);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /&lt;\/title&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.equal(escapeHtml(evil).includes("<script>"), false);
});

test("按起止标记替换嵌套对象；非贪婪正则会截断", () => {
  const data = { a: { b: { c: 1 } }, d: 2 };
  const html = wrapDataBlock("DATA", escapeScriptJson({ a: 0 }));
  const page = `xx\n${html}\nyy`;
  const out = injectData(page, "DATA", data);
  const start = out.indexOf(dataStartMark("DATA"));
  const end = out.indexOf(dataEndMark("DATA"));
  const inner = out.slice(start, end);
  assert.match(inner, /"c":1/);
  const naive = page.replace(/const DATA = \{[\s\S]*?\};/, "BROKEN");
  assert.equal(naive.includes("BROKEN") && !naive.includes('"c"'), true);
});
