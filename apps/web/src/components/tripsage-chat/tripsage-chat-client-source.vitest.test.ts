import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");
const CLIENT_DIR = join(SRC, "components/tripsage-chat");
const CHAT_MODULE_DIR = join(SRC, "modules/tripsage-chat");
const read = (file: string) => readFileSync(file, "utf8");
const isTest = (name: string) => /\.(vitest\.)?test\.tsx?$/.test(name);

/** Modules of the chat that only run on the server (keys, providers, DB, env). */
const SERVER_ONLY_CHAT = /tripsage-chat-(runtime|provider|service|http|tools)|tripsage-(places|web)(?:["'/]|$)/;
const FORBIDDEN_SPECIFIER = /^(server-only|@\/server\/|@\/services|@\/env|\.\.?\/.*\/(?:server|services|env(?:\.server)?)$)|(^|\/)env(\.server)?$|@KLTN\/db|@prisma|^openai$|@ai-sdk\/openai|^node:/;

function importsOf(source: string) {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const match of source.matchAll(/^\s*(import|export)\s+(type\s+)?[^;"']*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)) out.push({ spec: match[3] ?? match[4]!, typeOnly: Boolean(match[2]) });
  return out;
}
function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(candidate) && /\.(tsx?)$/.test(candidate)) return candidate;
  return null;
}
/** Walks the runtime (non-type) import graph from the client entry files. */
function graph(entries: string[]) {
  const seen = new Map<string, string[]>(); const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = read(file); const specs: string[] = [];
    for (const { spec, typeOnly } of importsOf(source)) {
      if (typeOnly) continue;
      specs.push(spec);
      const next = resolveSpec(file, spec);
      if (next) queue.push(next);
    }
    seen.set(file, specs);
  }
  return seen;
}

describe("tripsage chat client bundle", () => {
  const clientFiles = readdirSync(CLIENT_DIR).filter(name => /\.tsx?$/.test(name) && !isTest(name)).map(name => join(CLIENT_DIR, name));

  it("finds the client files", () => { expect(clientFiles.length).toBeGreaterThanOrEqual(6); });

  it("never imports (directly or transitively, by runtime import) a server-only chat module, env, DB or provider SDK", () => {
    const files = graph(clientFiles);
    const bad: string[] = [];
    for (const [file, specs] of files) {
      for (const spec of specs) if (SERVER_ONLY_CHAT.test(spec) || FORBIDDEN_SPECIFIER.test(spec)) bad.push(`${file.replace(SRC, "")} -> ${spec}`);
      if (/^import\s+["']server-only["']/m.test(read(file))) bad.push(`${file.replace(SRC, "")} imports server-only`);
    }
    expect(bad).toEqual([]);
  });

  it("only the allowed chat modules (types, save controller, error vocabulary) are reachable from the client", () => {
    const reached = [...graph(clientFiles).keys()].filter(file => file.startsWith(CHAT_MODULE_DIR)).map(file => file.slice(CHAT_MODULE_DIR.length + 1));
    expect(reached.sort()).toEqual(["tripsage-chat-errors.ts", "tripsage-chat-save.ts"]);
  });

  it("reads no environment variable and names no provider key", () => {
    for (const file of [...clientFiles, join(CHAT_MODULE_DIR, "tripsage-chat-errors.ts"), join(CHAT_MODULE_DIR, "tripsage-chat-save.ts")]) {
      const source = read(file);
      expect(source, file).not.toMatch(/process\.env|NEXT_PUBLIC_|API_KEY|FIRECRAWL|STADIA|OPENAI_|GOOGLE_MAPS/);
    }
  });

  it("the client page entry is a client component and the chat route handler stays thin", () => {
    expect(read(join(CLIENT_DIR, "tripsage-chat-client.tsx")).startsWith('"use client"')).toBe(true);
    const route = read(join(SRC, "app/api/ai/chat/route.ts"));
    expect(route.split("\n").length).toBeLessThan(20);
    expect(route).not.toMatch(/console\.|process\.env/);
  });
});

describe("tripsage chat server logging", () => {
  const serverFiles = readdirSync(CHAT_MODULE_DIR).filter(name => name.endsWith(".ts") && !isTest(name)).map(name => join(CHAT_MODULE_DIR, name));

  it("only one generic console line exists, with no interpolation of errors, bodies, headers or keys", () => {
    const calls: string[] = [];
    for (const file of serverFiles) for (const line of read(file).split("\n")) if (/\bconsole\.\w+|\blogger\b|\bLogger\b|\bpino\b|\bwinston\b/.test(line)) calls.push(`${file.split(/[\/]/).pop()}: ${line.trim()}`);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('console.error("[tripsage-chat] provider stream failed")');
    expect(calls[0]).not.toMatch(/\$\{|,\s*(error|err|e)\b/);
  });

  it("no module in the chat folder or its route puts the key, Authorization or the user text into an error message", () => {
    for (const file of [...serverFiles, join(SRC, "app/api/ai/chat/route.ts")]) {
      const source = read(file);
      expect(source, file).not.toMatch(/NEXT_PUBLIC_/);
      expect(source, file).not.toMatch(/new (App)?Error\([^)]*(key|Key|Authorization|Bearer)/);
    }
  });
});
