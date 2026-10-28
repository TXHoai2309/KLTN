import { describe, expect, it, vi } from "vitest";
import { nextNeedsPrompt } from "./planning-dialogue";
import { applyPlanningUnderstanding, planningUnderstandingSchema } from "./planning-ai";
import { fixtureNeeds } from "../../test/planning-fixtures";
import { acceptPlanningReply } from "./planning-reply";
import { PlanningClient } from "../../components/assistant/planning-client";
import type { PlanningRequest } from "./planning-contract";
import { missingPlanningPreferences, planningPreferenceReplies } from "./planning-preferences";

const base = planningUnderstandingSchema.parse({ intent: "NEEDS", durationDays: null, transport: null, startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [], message: "", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE" });
const dialogue = { question: "Mình gợi ý các câu hỏi còn thiếu nhé", field: "preferences" as const, recent: [], current: null };
const now = new Date("2026-10-27T03:00:00Z");

describe("Guided planning questions from the owner's screenshots", () => {
  it("remembers a family answer and asks for the count before advancing", () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["NATURE" as const], pace: "MODERATE" as const } };
    const family = applyPlanningUnderstanding({ ...base, companions: { type: "FAMILY", groupSize: null } }, needs, [], [], { ...dialogue, preferenceField: "companions" }, { text: "đi với gia đình", now });
    expect(family.needs.requirement.companions).toBeNull();
    expect(family.needs.companionDraft).toEqual({ type: "FAMILY" });
    expect(nextNeedsPrompt(family.needs, false, false).message).toContain("bao nhiêu người");
    const inventedCount = applyPlanningUnderstanding({ ...base, companions: { type: "FAMILY", groupSize: 4 } }, needs, [], [], { ...dialogue, preferenceField: "companions" }, { text: "đi với gia đình", now });
    expect(inventedCount.needs.requirement.companions).toBeNull();
    expect(inventedCount.needs.companionDraft).toEqual({ type: "FAMILY" });
    const qa = applyPlanningUnderstanding({ ...base, intent: "QA" }, family.needs, [], [], { ...dialogue, preferenceField: "companions" }, { text: "Lũng Cú ở đâu?", now });
    expect(qa.intent).toBe("QA");
    expect(qa.needs).toEqual(family.needs);
    const count = applyPlanningUnderstanding({ ...base, durationDays: 4 }, family.needs, [], [], { ...dialogue, preferenceField: "companions" }, { text: "4", now });
    expect(count.needs.requirement.durationDays).toBe(1);
    expect(count.needs.requirement.companions).toEqual({ type: "FAMILY", groupSize: 4 });
    const verbalCount = applyPlanningUnderstanding(base, family.needs, [], [], { ...dialogue, preferenceField: "companions" }, { text: "bốn người", now });
    expect(verbalCount.needs.requirement.companions).toEqual({ type: "FAMILY", groupSize: 4 });
    expect(nextNeedsPrompt(count.needs, false, false).message).toContain("Lưu ý di chuyển");
  });
  it("asks only the next unanswered topic and shows quick replies for that question", () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["ADVENTURE" as const] } };
    const next = nextNeedsPrompt(needs, false, false);
    expect(next.prompt).toEqual({ kind: "NEED", field: "preferences" });
    expect(next.message).toContain("Nhịp đi");
    expect(next.message).not.toContain("Đi cùng");
    expect(next.message).not.toContain("Lưu ý di chuyển");
    expect(next.message).not.toContain("Điểm muốn ghé");
    expect(next.message).not.toContain("Trải nghiệm bạn thích:");
    expect(planningPreferenceReplies(needs).map(r => r.label)).toEqual(["Đi thư thả", "Đi vừa phải", "Nhiều trải nghiệm"]);
  });
  it("keeps 'không cần lưu ý gì hả' in the planning conversation", () => {
    const understood = planningUnderstandingSchema.parse({ intent: "QA", durationDays: null, transport: null, startDate: null, departureText: null, pace: null, interests: null, companions: null, mobilityConstraints: null, destinations: [], message: "Bạn muốn hỏi về điểm đến nào?", operation: null, suggestedIds: [], dateDeferred: false, preferencesSkipped: false, mandatoryAddition: false, replyAction: "NONE" });
    const analysis = applyPlanningUnderstanding(understood, { ...fixtureNeeds, preferencesDone: true }, [], [], { question: "Bạn xem đã đúng ý chưa?", field: null, recent: [], current: null }, { text: "không cần lưu ý gì hả", now: new Date("2026-10-27T03:00:00Z") });
    expect(analysis.intent).toBe("NEEDS");
    expect(analysis.needs.preferencesDone).toBe(false);
    expect(analysis.needs.requirement.mobilityConstraints).toBeNull();
  });
  it("records an explicit no-mobility answer without skipping all other questions or blocking Save with an empty constraint", () => {
    const result = applyPlanningUnderstanding({ ...base, intent: "QA", preferencesSkipped: true, mobilityConstraints: { flags: [], note: null } }, fixtureNeeds, [], [], dialogue, { text: "Không có lưu ý di chuyển", now });
    expect(result.intent).toBe("NEEDS");
    expect(result.preferencesSkipped).toBe(false);
    expect(result.needs.skippedPreferences).toEqual(["mobility"]);
    expect(result.needs.requirement.mobilityConstraints).toBeNull();
    const next = nextNeedsPrompt(result.needs, false, false);
    expect(next.prompt.kind).toBe("NEED");
    expect(next.message).not.toContain("• Lưu ý di chuyển:");
    expect(next.message).toContain("Trải nghiệm bạn thích:");
    expect(missingPlanningPreferences(result.needs)).toContain("companions");
  });
  it("keeps genuine destination questions in public QA and does not discard an existing restriction when asked for guidance", () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, mobilityConstraints: { flags: ["SENIORS" as const], note: null } } };
    const qa = applyPlanningUnderstanding({ ...base, intent: "QA" }, needs, [], [], dialogue, { text: "Mã Pí Lèng có gì cần lưu ý không?", now });
    expect(qa.intent).toBe("QA"); expect(qa.needs).toEqual(needs);
    const guide = applyPlanningUnderstanding({ ...base, intent: "QA" }, needs, [], [], dialogue, { text: "không cần lưu ý gì hả", now });
    expect(guide.needs.requirement.mobilityConstraints).toEqual(needs.requirement.mobilityConstraints);
  });
  it("accepts a combined response, including an explicit request to let AI suggest the rest", () => {
    const result = applyPlanningUnderstanding({ ...base, interests: ["ADVENTURE"], preferencesSkipped: true }, fixtureNeeds, [], [], dialogue, { text: "Mình thích mạo hiểm, còn lại tùy bạn", now });
    expect(result.needs.requirement.interests).toEqual(["ADVENTURE"]);
    expect(result.needs.preferencesDone).toBe(true);
    expect(nextNeedsPrompt(result.needs, false, false).prompt.kind).toBe("RECAP");
    expect(result.needs.requirement.companions).toBeNull();
  });
  it("recaps after all sections are answered without inventing destinations or restrictions", () => {
    const text = "Mình thích mạo hiểm, nhịp vừa phải, đi một mình 1 người, không có lưu ý di chuyển, chưa có điểm đến bắt buộc";
    const result = applyPlanningUnderstanding({ ...base, interests: ["ADVENTURE"], pace: "MODERATE", companions: { type: "SOLO", groupSize: 1 } }, fixtureNeeds, [], [], dialogue, { text, now });
    expect(nextNeedsPrompt(result.needs, false, false).prompt.kind).toBe("RECAP");
    expect(result.needs.requiredDestinationIds).toEqual([]);
    expect(result.needs.requirement.mobilityConstraints).toBeNull();
  });
  it("clarifies a bare number for an experience question instead of changing trip duration", () => {
    const result = applyPlanningUnderstanding({ ...base, durationDays: 9 }, fixtureNeeds, [], [], dialogue, { text: "9", now });
    expect(result.intent).toBe("CLARIFY");
    expect(result.needs.requirement.durationDays).toBe(fixtureNeeds.requirement.durationDays);
    expect(result.needs.requirement.companions).toBeNull();
  });
  it("requires the current question and rejects a second question", () => {
    const canonical = nextNeedsPrompt(fixtureNeeds, false, false).message;
    const input = { kind: "NEED" as const, field: "preferences", canonical, needs: fixtureNeeds, latestText: "Xe máy" };
    expect(acceptPlanningReply(canonical, input)).toBe(true);
    expect(acceptPlanningReply(canonical.split("\n").slice(1).join("\n"), input)).toBe(false);
    expect(acceptPlanningReply(`${canonical}\nBạn đi cùng ai?`, input)).toBe(false);
  });
  it("the real client retains partial answers and requires explicit skip before recap", async () => {
    const call = vi.fn(async (body: string) => {
      const request = JSON.parse(body) as PlanningRequest;
      if (request.action === "START") return { conversationId: "guided", version: 0, needs: fixtureNeeds, pendingSaveKey: null, savedTripId: null };
      if (request.action === "ANALYZE") return applyPlanningUnderstanding({ ...base, ...(request.text.includes("mạo hiểm") ? { interests: ["ADVENTURE" as const] } : {}) }, request.draft, [], request.unresolved, request.dialogue, { text: request.text, now });
      throw Error("No generation/write allowed before confirmation");
    });
    const client = new PlanningClient("USER:guided", call); await client.start(null);
    await client.analyze("Tôi muốn trải nghiệm mạo hiểm");
    expect(client.getSnapshot().preferencesDone).toBe(false);
    expect(client.getSnapshot().prompt).toEqual({ kind: "NEED", field: "preferences" });
    expect(client.getSnapshot().message).toContain("Nhịp đi:");
    expect(client.getSnapshot().message).not.toContain("Lưu ý di chuyển:");
    expect(client.getSnapshot().message).not.toContain("Trải nghiệm bạn thích:");
    await client.analyze("Không có lưu ý di chuyển");
    expect(client.getSnapshot().message).not.toContain("• Lưu ý di chuyển:");
    await client.analyze("Không");
    expect(client.getSnapshot().message).toContain("bỏ qua câu này");
    await client.analyze("Bỏ qua phần còn lại");
    expect(client.getSnapshot().prompt?.kind).toBe("RECAP");
    expect(client.getSnapshot().draft.requirement.interests).toEqual(["ADVENTURE"]);
    expect(client.getSnapshot().generated).toBeNull();
    expect(call).toHaveBeenCalledTimes(3);
  });
  it("walks through one question at a time and scopes bare skip/no to that question", async () => {
    const call = vi.fn(async (body: string) => {
      const request = JSON.parse(body) as PlanningRequest;
      if (request.action === "START") return { conversationId: "sequential", version: 0, needs: fixtureNeeds, pendingSaveKey: null, savedTripId: null };
      if (request.action === "ANALYZE") return applyPlanningUnderstanding({ ...base, ...(request.text.includes("mạo hiểm") ? { interests: ["ADVENTURE" as const] } : { companions: { type: "SOLO" as const, groupSize: 1 } }) }, request.draft, [], [], request.dialogue, { text: request.text, now });
      throw Error("No generation before recap confirmation");
    });
    const client = new PlanningClient("USER:sequential", call); await client.start(null);
    expect(client.getSnapshot().message).toContain("Trải nghiệm bạn thích:");
    expect(client.getSnapshot().message).not.toContain("Nhịp đi:");
    await client.analyze("Mình thích mạo hiểm");
    expect(client.getSnapshot().message).toContain("Nhịp đi:");
    await client.analyze("Bỏ qua câu này");
    expect(client.getSnapshot().message).toContain("Đi cùng:");
    expect(client.getSnapshot().preferencesDone).toBe(false);
    await client.analyze("Mình đi một mình, 1 người");
    expect(JSON.parse(call.mock.calls.at(-1)![0]).dialogue.preferenceField).toBe("companions");
    expect(client.getSnapshot().message).toContain("Lưu ý di chuyển:");
    await client.analyze("Không");
    expect(client.getSnapshot().message).toContain("Điểm muốn ghé:");
    await client.analyze("Bỏ qua");
    expect(client.getSnapshot().prompt?.kind).toBe("RECAP");
    expect(client.getSnapshot().draft.skippedPreferences).toEqual(["pace", "mobility", "destinations"]);
    expect(client.getSnapshot().draft.requirement.companions).toEqual({ type: "SOLO", groupSize: 1 });
    expect(client.getSnapshot().generated).toBeNull();
    expect(call).toHaveBeenCalledTimes(3);
  });
});
