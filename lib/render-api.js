#!/usr/bin/env node
import { parseSDL } from "./gql.js";
import { assembleApi } from "./assemble.js";
import { runCli } from "./cli.js";

runCli({
  parse: parseSDL,
  assemble: assembleApi,
  titleSuffix: "GraphQL",
  defPort: 4173,
  usage: `用法: node lib/render-api.js <schema.graphql> [-o out.html] [-n 名称] [-p 端口] [--no-open]
可选作者工具。生成的单文件 HTML 打开时无需 Node，但需联网加载 Vue CDN。`,
});
