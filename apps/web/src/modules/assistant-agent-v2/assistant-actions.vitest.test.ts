import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createAssistantAction, createAssistantActions } from "./assistant-actions";
import { createAssistantAgentContext } from "./agent-context";
import { AssistantV2Error } from "./agent-errors";

const context = createAssistantAgentContext({ userId: "traveler", workspace: null });

describe("Assistant V2 action boundary", () => {
  it("validates input and returns typed validated output with the supplied context", async () => {
    const execute = vi.fn(async (input: { count: number }, actor: typeof context) => ({ total: input.count + 1, actor: actor.userId }));
    const action = createAssistantAction({
      id: "test-count", description: "Controlled test action",
      inputSchema: z.object({ count: z.number().int().min(0) }).strict(),
      outputSchema: z.object({ total: z.number().int(), actor: z.string() }).strict(), execute,
    });
    const output = await action.execute({ count: 2 }, context);
    expectTypeOf(output).toEqualTypeOf<{ total: number; actor: string }>();
    expect(output).toEqual({ total: 3, actor: "traveler" });
    expect(execute).toHaveBeenCalledExactlyOnceWith({ count: 2 }, context);
    await expect(action.execute({ count: -1 }, context)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(action.execute({ count: 2, injected: true }, context)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid application result after exactly one execution", async () => {
    const execute = vi.fn(async () => 0);
    const action = createAssistantAction({
      id: "invalid-output", description: "Controlled test action",
      inputSchema: z.object({}).strict(), outputSchema: z.number().min(1), execute,
    });
    await expect(action.execute({}, context)).rejects.toMatchObject({ code: "INVALID_ACTION_OUTPUT" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled execution failure without losing the internal cause or retrying", async () => {
    const cause = new Error("private service diagnostic");
    const execute = vi.fn(async (): Promise<number> => { throw cause; });
    const action = createAssistantAction({
      id: "failing-action", description: "Controlled test action",
      inputSchema: z.object({}).strict(), outputSchema: z.number(), execute,
    });
    const result = await action.execute({}, context).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AssistantV2Error);
    expect(result).toMatchObject({ code: "ACTION_EXECUTION_FAILED", cause });
    if (!(result instanceof AssistantV2Error)) throw new Error("Expected a controlled failure");
    expect(result.message).not.toContain(cause.message);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("registers the bounded planning capabilities while state reads have no object-ID override", async () => {
    const actions = createAssistantActions();
    expect(Object.keys(actions)).toEqual(["read-saved-trip", "resolve-current-location", "create-in-trip-proposal", "validate-in-trip-proposal", "apply-in-trip-proposal", "read-planning-state", "understand-planning-brief", "generate-preliminary-proposal", "refine-preliminary-proposal", "replan-preliminary-proposal", "answer-ha-giang-question"]);
    await expect(actions["read-planning-state"].execute({}, context)).resolves.toBeNull();
    await expect(actions["read-planning-state"].execute({ conversationId: "another-user" }, context))
      .rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
