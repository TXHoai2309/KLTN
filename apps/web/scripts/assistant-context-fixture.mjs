import { build } from "esbuild";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
if (process.env.NODE_ENV === "production") throw new Error("Fixture is development-only");
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../development/assistant-context-fixture.tsx", import.meta.url))], bundle: true, write: false, outdir: "memory", platform: "browser", format: "esm", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const assets = new Map([["/fixture.js", ["text/javascript", bundle.outputFiles.find(file => file.path.endsWith(".js")).contents]], ["/fixture.css", ["text/css", bundle.outputFiles.find(file => file.path.endsWith(".css")).contents]]]);
const html = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>US22 offline fixture</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0}output{display:block;overflow-wrap:anywhere}</style></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
  if (request.url?.split("?")[0] === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); return; }
  const asset = assets.get(request.url);
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.setHeader("Content-Type", `${asset[0]}; charset=utf-8`); response.end(asset[1]);
});
server.listen(3003, "127.0.0.1", () => console.log("OFFLINE_FIXTURE=http://127.0.0.1:3003; no APIs/providers/database"));
