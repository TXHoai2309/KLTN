import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PLANNING_NEEDS, planningWorkspaceSchema } from "../assistant-planning/planning-contract";
import * as planningService from "../assistant-planning/planning-service";
import * as tripSave from "../trip-save/trip-save-service";
import * as registry from "./skill-registry";
import { createAssistantAgentContext } from "./agent-context";
import { executeAssistantV2Action, runAssistantV2 } from "./agent-runtime";

function setup() {
  const workspace = planningWorkspaceSchema.parse({
    conversationId: "owned-chat", version: 3, needs: structuredClone(EMPTY_PLANNING_NEEDS),
    pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" },
    dialogueRevision: 2, checkpoint: { needs: structuredClone(EMPTY_PLANNING_NEEDS), unresolved: [], resume: "NEEDS" },
  });
  return { skill: "travel-planning", context: { userId: "traveler", workspace } };
}

afterEach(() => vi.restoreAllMocks());

describe("Assistant V2 internal runtime", () => {
  it("activates the registered skill with the existing workspace/context and no implicit business work", () => {
    const v1 = vi.spyOn(planningService, "executePlanning");
    const save = vi.spyOn(tripSave, "saveTrip");
    const fetcher = vi.spyOn(globalThis, "fetch");
    const input = setup();
    const before = structuredClone(input.context);
    const active = runAssistantV2(input);
    expect(active.skill).toBe(registry.loadAssistantSkill("travel-planning"));
    expect(active.context).toEqual(input.context);
    expect(active.context.workspace).not.toBe(input.context.workspace);
    expect(active.decision).toEqual({ kind: "SKILL_READY", skillId: "travel-planning", allowedActions: ["read-planning-state", "understand-planning-brief", "generate-preliminary-proposal", "refine-preliminary-proposal"] });
    expect(input.context).toEqual(before);
    expect(v1).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("can initialize without a workspace without implicitly creating one", () => {
    const active = runAssistantV2({ skill: "travel-planning", context: { userId: "traveler", workspace: null } });
    expect(active.context.workspace).toBeNull();
    expect(active.decision.kind).toBe("SKILL_READY");
  });

  it("reuses existing workspace normalization without inferring missing trip facts", () => {
    const input = setup();
    input.context.workspace.needs = structuredClone(EMPTY_PLANNING_NEEDS);
    const active = runAssistantV2(input);
    expect(active.context.workspace?.needs).toEqual(planningWorkspaceSchema.parse(input.context.workspace).needs);
    expect(active.context.workspace?.needs.requirement).toMatchObject({ startDate: null, companions: null, interests: [], pace: null });
    expect(active.context.workspace?.needs.requirement.durationDays).toBeUndefined();
    expect(active.context.workspace?.needs.requirement.transport).toBeUndefined();
    expect(input.context.workspace.needs.requirement).toEqual({});
  });

  it("rejects unknown skills, including inherited object properties", () => {
    for (const skill of ["unknown", "place-research", "__proto__", "constructor"]) {
      expect(() => runAssistantV2({ ...setup(), skill })).toThrow(expect.objectContaining({ code: "UNKNOWN_SKILL" }));
    }
  });

  it("rejects malformed context rather than filling missing identity or state", () => {
    for (const context of [{ workspace: null }, { userId: " ", workspace: null }, { userId: "traveler", workspace: {} }, { userId: "traveler", workspace: null, save: true }]) {
      expect(() => createAssistantAgentContext(context)).toThrow(expect.objectContaining({ code: "INVALID_CONTEXT" }));
    }
    expect(() => runAssistantV2({ ...setup(), context: { userId: "", workspace: null } }))
      .toThrow(expect.objectContaining({ code: "INVALID_CONTEXT" }));
  });

  it("only reads an explicitly supplied workspace and detaches returned state", async () => {
    const input = setup();
    const before = structuredClone(input.context.workspace);
    const output = await executeAssistantV2Action({ ...input, action: "read-planning-state", payload: {} });
    expect(output).toEqual(input.context.workspace);
    expect(output).not.toBe(input.context.workspace);
    if (!output) throw new Error("Expected the supplied workspace");
    output.needs.requirement.durationDays = 5;
    expect(input.context.workspace).toEqual(before);
  });

  it.each(["save-trip", "generate-proposal", "constructor", "__proto__"])("rejects action %j without V1 fallback", async action => {
    const v1 = vi.spyOn(planningService, "executePlanning");
    const save = vi.spyOn(tripSave, "saveTrip");
    await expect(executeAssistantV2Action({ ...setup(), action, payload: {} }))
      .rejects.toMatchObject({ code: "UNKNOWN_ACTION" });
    expect(v1).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("checks the active policy as well as registration before dispatching an action", async () => {
    const skill = registry.loadAssistantSkill("travel-planning");
    vi.spyOn(registry, "loadAssistantSkill").mockReturnValue({ ...skill, allowedActions: [] });
    await expect(executeAssistantV2Action({ ...setup(), action: "read-planning-state", payload: {} }))
      .rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
  });

  it("does not let an action supply another conversation ID", async () => {
    await expect(executeAssistantV2Action({ ...setup(), action: "read-planning-state", payload: { conversationId: "unowned" } }))
      .rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
