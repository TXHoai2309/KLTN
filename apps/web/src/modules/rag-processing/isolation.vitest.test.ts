import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(import.meta.dirname, "../../..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? sourceFiles(resolve(directory, item.name)) : /\.[cm]?[jt]sx?$/.test(item.name) && !/\.test\./.test(item.name) ? [resolve(directory, item.name)] : []);
}

describe("RAG processing import boundaries", () => {
  it("real client entry graphs cannot reach processing/parsers/fixtures", async () => {
    const entries = sourceFiles(resolve(web, "src")).filter(path => /^\s*["']use client["']/m.test(readFileSync(path, "utf8")));
    expect(entries.length).toBeGreaterThan(0);
    const result = await build({ entryPoints: entries, absWorkingDir: web, bundle: true, write: false, metafile: true, outdir: "unused-isolation-output", platform: "browser", packages: "external", define: { "process.env.NODE_ENV": '"production"' }, loader: { ".css": "empty", ".svg": "dataurl" }, alias: { "@": resolve(web, "src") } });
    const inputs = Object.keys(result.metafile!.inputs).join("\n");
    expect(inputs).not.toMatch(/rag-processing|rag-index|openai-embedding-provider|js-tiktoken|pdfjs-dist|fast-xml-parser|synthetic-documents/);
    expect(result.outputFiles.every(file => !/pdfjs-4\.10\.38-lines-v1|DOCX_ZIP_CHECKSUM_INVALID/.test(file.text))).toBe(true);
  });
  it("processing has no storage/database/provider/UI dependency", async () => {
    const result = await build({ entryPoints: [resolve(import.meta.dirname, "extract-document.ts"), resolve(import.meta.dirname, "chunk-document.ts"), resolve(import.meta.dirname, "embed-chunks.ts")], absWorkingDir: web, bundle: true, write: false, metafile: true, outdir: "unused-server-output", platform: "node", format: "esm", packages: "external" });
    const inputs = Object.keys(result.metafile!.inputs).join("\n");
    expect(inputs).not.toMatch(/__fixtures__|development|rag-document|assistant|services\.ts|server\/authorization/);
    for (const output of Object.values(result.metafile!.outputs)) {
      expect(output.imports.map(item => item.path).join("\n")).not.toMatch(/@KLTN\/db|@vercel\/blob|openai|prisma/);
    }
    expect(inputs).not.toMatch(/openai-embedding-provider|__fixtures__|rag-index-store/);
  });
});
