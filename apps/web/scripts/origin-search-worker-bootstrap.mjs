// Test-only server marker alias, matching vitest.config.mts in independent workers.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: new URL("../src/test/server-only-stub.ts", import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});
await import("./origin-search-worker.mts");
