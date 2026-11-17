// 可选作者工具：解析输入并组装单 HTML。用户打开产物无需 Node/Bun。
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import { execFile } from "node:child_process";

export function runCli({ parse, assemble, titleSuffix, defPort, usage, varName }) {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", short: "p" },
      out: { type: "string", short: "o" },
      name: { type: "string", short: "n" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const file = positionals[0];
  if (v.help || !file) {
    console.log(usage);
    process.exit(file ? 0 : 1);
  }

  const name = v.name || basename(file).replace(/\.[^.]+$/, "");
  const render = () => {
    const data = parse(readFileSync(file, "utf8"), { name });
    data.name = name;
    return assemble(data, { title: `${name} · ${titleSuffix}` });
  };

  if (v.out) {
    const out = resolve(v.out);
    writeFileSync(out, render());
    console.log(`✓ 已导出 ${out}`);
    return;
  }

  const port = v.port ? parseInt(v.port, 10) : defPort;
  const version = () => {
    try { return String(statSync(file).mtimeMs); } catch { return "0"; }
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/__v") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(version());
      return;
    }
    try {
      const live = `<script>(()=>{let v=null;setInterval(async()=>{try{const t=await fetch("/__v").then(r=>r.text());if(v!==null&&t!==v)location.reload();v=t}catch(e){}},700)})();</script>`;
      const html = render().replace("</body>", live + "</body>");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`解析失败：\n\n${e.stack || e}`);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`${name} · ${titleSuffix}\n  ${url}    (修改 ${basename(file)} 后页面自动刷新，Ctrl+C 退出)`);
    if (!v["no-open"]) {
      const opener = process.platform === "darwin" ? "open"
        : process.platform === "win32" ? "cmd" : "xdg-open";
      const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
      execFile(opener, args, { stdio: "ignore" });
    }
  });
}
