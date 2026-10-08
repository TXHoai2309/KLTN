import { build } from "esbuild";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") throw new Error("Assistant demo is development-only.");
const entry = fileURLToPath(new URL("../development/assistant-demo.tsx", import.meta.url));
// Existing esbuild comes from the installed tsx toolchain. No dependency added.
const bundle = await build({ entryPoints: [entry], bundle: true, write: false, outdir: "in-memory-demo", platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).contents;
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).contents;
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,interactive-widget=resizes-content"><title>Assistant — local simulation only</title><link rel="stylesheet" href="/demo.css"><style>body{margin:0;font-family:Arial,sans-serif}.dark{--card:#233028}.demo-controls{padding:16px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:#fff4d9;color:#3e3020}.demo-controls label{display:flex;flex-wrap:wrap;gap:8px}.demo-controls select,.demo-controls button{font:inherit;max-width:100%;padding:8px;min-height:44px}</style></head><body><div id="root"></div><script type="module" src="/demo.js"></script></body></html>`;
const assets = new Map([["/", ["text/html", html]], ["/demo.js", ["text/javascript", js]], ["/demo.css", ["text/css", css]]]);
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET" || !asset) { response.writeHead(404); response.end(); return; }
  response.setHeader("Content-Type", `${asset[0]}; charset=utf-8`);
  response.end(asset[1]);
});
server.listen(3002, "127.0.0.1", () => console.log("DEMO ONLY: http://127.0.0.1:3002 — no API, AI or database."));
