import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@KLTN/ui": fileURLToPath(
        new URL("../../packages/ui/src", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    // Windows thread workers intermittently exit with 0xC0000005 after all
    // assertions pass. Use a child process so native teardown is isolated.
    pool: process.platform === "win32" ? "forks" : "threads",
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    isolate: false,
    include: ["src/**/*.vitest.test.ts"],
    reporters: ["default"],
  },
});
