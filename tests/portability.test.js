import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { skillPath } from "./helpers.js";

/**
 * 通用规则在运行时拼接，避免测试源里写出完整绝对路径字面量。
 * 扫描包含本文件自身。
 */
function pathRoot(dir) {
  return new RegExp(String.raw`(?:^|[\s"'` + "`" + `(=])/${dir}/`);
}

const FORBIDDEN = [
  { re: pathRoot("Users"), why: "用户主目录绝对路径" },
  { re: new RegExp(String.raw`(?:^|[\s"'` + "`" + `(=])/home/[A-Za-z0-9._-]+`), why: "home 绝对路径" },
  { re: pathRoot("workspace"), why: "工作区绝对路径" },
  { re: pathRoot("tmp"), why: "临时目录绝对路径" },
  { re: /[A-Za-z]:\\Users\\/, why: "Windows 用户目录绝对路径" },
  { re: new RegExp(String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`, "i"), why: "机器或会话 UUID" },
];

const SKIP_DIR = new Set(["node_modules", ".git", ".cache"]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(name.name) || name.name === ".DS_Store") continue;
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("交付文件（含本测试）不含本机绝对路径或 UUID", () => {
  const root = skillPath();
  const leaks = [];
  for (const file of walk(root)) {
    if (/\.(png|jpg|jpeg|gif|webp|woff2?|gz|tgz)$/i.test(file)) continue;
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    const rel = relative(root, file).replace(/\\/g, "/");
    for (const { re, why } of FORBIDDEN) {
      if (re.test(text)) {
        const line = text.split(/\n/).findIndex(l => re.test(l)) + 1;
        leaks.push(`${rel}:${line} ${why}`);
      }
    }
  }
  assert.deepEqual(leaks, [], leaks.join("\n"));
});

test("技能根不提交依赖缓存或安装包", () => {
  const root = skillPath();
  assert.equal(existsSync(join(root, "node_modules")), false);
  const tarballs = walk(root).filter(f => /\.(tar\.gz|tgz)$/.test(f));
  assert.deepEqual(tarballs.map(f => relative(root, f)), []);
});

test("示例与 fixture 只有随仓库分发的示例数据", () => {
  const examples = readdirSync(skillPath("examples")).sort();
  assert.deepEqual(examples, ["schema.graphql", "schema.sql"]);
  const fixtures = readdirSync(skillPath("tests/fixtures")).sort();
  assert.ok(fixtures.includes("schema.sql.parse.json"));
  assert.ok(fixtures.includes("schema.graphql.parse.json"));
  assert.ok(fixtures.includes("graph-layout.json"));
});
