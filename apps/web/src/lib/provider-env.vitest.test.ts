import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const keys = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_DESTINATION_FOLDER", "OPENAI_API_KEY", "OPENAI_EDITORIAL_MODEL"];
const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const root = resolve(webRoot, "../..");

async function loadFixture(configured: boolean) {
  const source = (await readFile(join(webRoot, ".env.schema"), "utf8")).split(/\r?\n/);
  const declarations = keys.map(key => {
    const end = source.findIndex(line => line.startsWith(key + "="));
    if (end < 0) throw Error("Provider declaration missing");
    let start = end;
    while (start > 0 && source[start - 1]!.startsWith("#")) start--;
    return source.slice(start, end + 1).join("\n");
  });
  const directory = await mkdtemp(join(tmpdir(), "kltn-provider-env-"));
  try {
    await writeFile(join(directory, ".env.schema"), "# @defaultRequired=true\n# @defaultSensitive=true\n# ---\n" + declarations.join("\n\n"));
    const fixture = configured ? {
      CLOUDINARY_CLOUD_NAME: "fixturecloud", CLOUDINARY_API_KEY: "fixture-api-key",
      CLOUDINARY_API_SECRET: "fixture-api-secret", CLOUDINARY_DESTINATION_FOLDER: "KLTN/destinations",
      OPENAI_API_KEY: "fixture-openai-key", OPENAI_EDITORIAL_MODEL: "fixture-model",
    } : {};
    await writeFile(join(directory, ".env"), Object.entries(fixture).map(([key, value]) => `${key}=${value}`).join("\n"));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (keys.includes(key) || /^_+VARLOCK/.test(key)) delete env[key];
    const auto = pathToFileURL(resolve(root, "node_modules/varlock/dist/auto-load.mjs")).href;
    const script = `import ${JSON.stringify(auto)}; const keys=${JSON.stringify(keys)}; const config=globalThis.__varlockLoadedEnv.config; console.log(JSON.stringify({present:Object.fromEntries(keys.map(k=>[k,Boolean(process.env[k]?.trim())])),sensitive:Object.fromEntries(['CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','OPENAI_API_KEY','OPENAI_EDITORIAL_MODEL'].map(k=>[k,config[k]?.isSensitive===true]))}));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: directory, env, encoding: "utf8", windowsHide: true, timeout: 20000 });
    if (result.status !== 0) throw Error("Isolated Varlock load failed; output suppressed");
    return JSON.parse(result.stdout.trim());
  } finally {
    // Only remove the absolute, uniquely created fixture under the OS temp root.
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("kltn-provider-env-")) throw Error("Refusing fixture cleanup outside temp root");
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Provider configuration through the actual Varlock schema", () => {
  it("injects configured values into runtime and keeps credentials sensitive", async () => {
    const result = await loadFixture(true);
    expect(result.present).toEqual(Object.fromEntries(keys.map(key => [key, true])));
    expect(Object.values(result.sensitive)).toEqual([true, true, true, true]);
  }, 25000);
  it("permits absent optional providers while retaining the canonical folder default", async () => {
    const result = await loadFixture(false);
    expect(result.present).toEqual(Object.fromEntries(keys.map(key => [key, key === "CLOUDINARY_DESTINATION_FOLDER"])));
  }, 25000);
});
