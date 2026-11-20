// 可选作者工具：解析输入并组装单 HTML。用户打开产物无需 Node/Bun。
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, resolve } from "node:path";
import { execFile } from "node:child_process";

/** 未指定 -o 时，写到输入文件同目录、同主名的 .html。 */
export function defaultOutPath(file) {
  const abs = resolve(file);
  const ext = extname(abs);
  return (ext ? abs.slice(0, -ext.length) : abs) + ".html";
}

export function portBusyMessage(port) {
  return `端口 ${port} 已被占用。预览不会自动换端口。请结束占用该端口的进程，或用 -p 指定其它端口。`;
}

export function parsePort(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) return null;
  return n;
}

export function runCli({ parse, assemble, titleSuffix, defPort, usage }) {
  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", short: "p" },
      out: { type: "string", short: "o" },
      name: { type: "string", short: "n" },
      serve: { type: "boolean" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const file = positionals[0];
  if (v.help || !file) {
    console.log(usage);
    process.exit(file ? 0 : 1);
  }

  if (v.serve && v.out) {
    console.error("不要同时使用 -o 与 --serve：导出用 -o，live-reload 预览用 --serve。");
    process.exit(1);
  }
  if (!v.serve && (v.port != null || v["no-open"])) {
    console.error("-p / --no-open 仅用于 --serve。");
    process.exit(1);
  }

  const name = v.name || basename(file).replace(/\.[^.]+$/, "");
  const render = () => {
    const data = parse(readFileSync(file, "utf8"), { name });
    data.name = name;
    return assemble(data, { title: `${name} · ${titleSuffix}` });
  };

  if (!v.serve) {
    const out = resolve(v.out || defaultOutPath(file));
    writeFileSync(out, render());
    console.log(`✓ 已导出 ${out}`);
    return;
  }

  const port = parsePort(v.port, defPort);
  if (port == null) {
    console.error("无效端口。请使用 1–65535 的整数。");
    process.exit(1);
  }

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
  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(portBusyMessage(port));
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
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
