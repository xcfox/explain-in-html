#!/usr/bin/env node
import { parseDDL } from "./ddl.js";
import { assembleErd } from "./assemble.js";
import { runCli } from "./cli.js";

runCli({
  parse: parseDDL,
  assemble: assembleErd,
  titleSuffix: "Schema",
  defPort: 4174,
  usage: `用法: node lib/render-erd.js <schema.sql> [-o out.html] [-n 名称] [-p 端口] [--no-open]
可选作者工具。生成的单文件 HTML 打开时无需 Node，但需联网加载 Vue CDN。`,
});
