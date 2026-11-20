import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOutPath, parsePort, portBusyMessage } from "../lib/cli.js";
import { skillPath } from "./helpers.js";

test("defaultOutPath 把输入扩展名换成 .html", () => {
  const dir = mkdtempSync(join(tmpdir(), "eih-out-"));
  try {
    assert.equal(defaultOutPath(join(dir, "demo.sql")), join(dir, "demo.html"));
    assert.equal(defaultOutPath(join(dir, "schema.graphql")), join(dir, "schema.html"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parsePort 拒绝非法值，空值回退默认", () => {
  assert.equal(parsePort(undefined, 4174), 4174);
  assert.equal(parsePort("4173", 4174), 4173);
  assert.equal(parsePort("0", 4174), null);
  assert.equal(parsePort("foo", 4174), null);
  assert.equal(parsePort("70000", 4174), null);
});

test("portBusyMessage 说明不换端口", () => {
  assert.match(portBusyMessage(4174), /4174/);
  assert.match(portBusyMessage(4174), /不会自动换端口/);
});

test("无 -o 且无 --serve 时写到输入同名 .html 后退出", () => {
  const dir = mkdtempSync(join(tmpdir(), "eih-cli-"));
  try {
    const sql = join(dir, "demo.sql");
    copyFileSync(skillPath("examples/schema.sql"), sql);
    const r = spawnSync(process.execPath, [skillPath("lib/render-erd.js"), sql], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /已导出/);
    const html = readFileSync(join(dir, "demo.html"), "utf8");
    assert.match(html, /erd-explorer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("-o 与 --serve 互斥", () => {
  const r = spawnSync(process.execPath, [
    skillPath("lib/render-erd.js"),
    skillPath("examples/schema.sql"),
    "-o",
    join(tmpdir(), "eih-should-not-write.html"),
    "--serve",
  ], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /-o 与 --serve/);
});

test("-p 仅用于 --serve", () => {
  const r = spawnSync(process.execPath, [
    skillPath("lib/render-erd.js"),
    skillPath("examples/schema.sql"),
    "-p",
    "4174",
  ], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /仅用于 --serve/);
});

test("--serve 端口占用时报错且不换端口", async () => {
  const blocker = createServer(() => {});
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });
  const port = blocker.address().port;
  try {
    const r = spawnSync(process.execPath, [
      skillPath("lib/render-erd.js"),
      skillPath("examples/schema.sql"),
      "--serve",
      "-p",
      String(port),
      "--no-open",
    ], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /已被占用/);
    assert.match(r.stderr, /不会自动换端口/);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});
