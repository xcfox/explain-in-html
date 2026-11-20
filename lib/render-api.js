#!/usr/bin/env node
import { parseSDL } from "./gql.js";
import { assembleApi } from "./assemble.js";
import { runCli } from "./cli.js";

runCli({
  parse: parseSDL,
  assemble: assembleApi,
  titleSuffix: "GraphQL",
  defPort: 4173,
  usage: `用法: node lib/render-api.js <schema.graphql> [-o out.html] [-n 名称]
       node lib/render-api.js <schema.graphql> --serve [-p 端口] [--no-open]
默认写出 HTML 后退出（未指定 -o 时写到输入同名 .html）。--serve 才启动 live-reload（默认 4173）；端口被占则报错，不换端口。
可选作者工具。生成的单文件 HTML 打开时无需 Node，但需联网加载 Vue CDN。`,
});
