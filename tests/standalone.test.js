import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSDL } from "../lib/gql.js";
import { parseDDL } from "../lib/ddl.js";
import { assembleApi, assembleErd, extractInlineScripts } from "../lib/assemble.js";
import { injectData } from "../lib/inject.js";
import { skillPath } from "./helpers.js";

test("产物不引用相邻相对文件，且可再次 inject", () => {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  const api = assembleApi(Object.assign(parseSDL(gql, { name: "T" }), { name: "T" }));
  const erd = assembleErd(Object.assign(parseDDL(sql, { name: "T" }), { name: "T" }));
  for (const [label, html] of [["api", api], ["erd", erd]]) {
    assert.doesNotMatch(html, /<(script|link)\s[^>]*(src|href)=["']\.\//i);
    const again = injectData(html, label === "api" ? "API" : "DATA", { name: "T2", types: {}, operations: [], tables: [], relations: [] });
    assert.match(again, /"name":"T2"/);
    assert.equal(extractInlineScripts(again).length, 1);
  }
});
