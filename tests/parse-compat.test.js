import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDDL } from "../lib/ddl.js";
import { parseSDL } from "../lib/gql.js";
import { enrichSchema } from "../lib/model.js";
import { skillPath } from "./helpers.js";

test("parseDDL(examples/schema.sql) 与 tests/fixtures 黄金期望一致", () => {
  const sql = readFileSync(skillPath("examples/schema.sql"), "utf8");
  const got = parseDDL(sql, { name: "TaskFlow" });
  const exp = JSON.parse(readFileSync(skillPath("tests/fixtures/schema.sql.parse.json"), "utf8"));
  assert.deepEqual(got, exp);
});

test("parseSDL(examples/schema.graphql) 与 tests/fixtures 黄金期望一致", () => {
  const gql = readFileSync(skillPath("examples/schema.graphql"), "utf8");
  const got = parseSDL(gql, { name: "TaskFlow" });
  const exp = JSON.parse(readFileSync(skillPath("tests/fixtures/schema.graphql.parse.json"), "utf8"));
  assert.deepEqual(got, exp);
});

test("enrichSchema 在已有 kind/relations 时不覆盖", () => {
  const data = {
    tables: [{ name: "A", kind: "entity", columns: [], domain: "d" }],
    relations: [{ kind: "n:1", a: "A", b: "A" }],
  };
  const out = enrichSchema(data);
  assert.equal(out.tables[0].kind, "entity");
  assert.equal(out.relations.length, 1);
});
