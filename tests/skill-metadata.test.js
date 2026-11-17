import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { skillPath } from "./helpers.js";

test("SKILL.md 含 YAML frontmatter：name 与 description", () => {
  const text = readFileSync(skillPath("SKILL.md"), "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  assert.ok(m, "SKILL.md 必须以 YAML frontmatter 开头");
  const body = m[1];
  const name = body.match(/^name:\s*(.+)$/m);
  assert.ok(name, "缺少 name");
  assert.equal(name[1].trim(), "Explain in HTML");
  assert.match(body, /^description:\s*/m);
  const desc = body.includes("description: >-")
    ? body.split(/description:\s*>-\s*/)[1]
    : body.match(/^description:\s*(.+)$/m)[1];
  assert.ok(String(desc).trim().length > 20, "description 过短");
});
