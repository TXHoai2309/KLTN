import { expect, it, vi } from "vitest";
import { createMemoryTools } from "./memory-tools";

it("permits at most three concurrent saves and three concurrent recalls per turn", async () => {
  const save = vi.fn(async () => ({ status: "SUCCESS", data: { id: "private-id" } } as const));
  const recall = vi.fn(async () => []);
  const tools = createMemoryTools({
    actor: { userId: "authenticated" },
    source: { text: "Tôi thích đi xe máy.", messageId: "message" },
    resolve: () => ({ save, recall, list: vi.fn(), delete: vi.fn(), deleteAll: vi.fn() }),
  });
  const options = { toolCallId: "memory", messages: [], context: {} };
  const saved = await Promise.all(Array.from({ length: 4 }, () => tools.rememberPreference.execute(
    { content: "Tôi thích đi xe máy.", kind: "PREFERENCE" }, options,
  )));
  const recalled = await Promise.all(Array.from({ length: 4 }, () => tools.recallMemories.execute({ query: "xe máy" }, options)));
  expect(save).toHaveBeenCalledTimes(3);
  expect(recall).toHaveBeenCalledTimes(3);
  expect(saved[3]).toMatchObject({ ok: false, code: "MEMORY_TOOL_LIMIT" });
  expect(recalled[3]).toMatchObject({ ok: false, code: "MEMORY_TOOL_LIMIT" });
  expect(JSON.stringify(saved)).not.toContain("private-id");
});
