import { describe, expect, it, vi } from "vitest";
import { fixtureNeeds, planningCandidate, planningNow } from "../../test/planning-fixtures";
import { scheduleSelection } from "../assistant-planning/planning-engine";
import { externalPlannerCandidate } from "../trip-planner/planner-candidates";
import { COMPLETE_JOURNEY_FIXTURE } from "../trip-origin/trip-origin-fixtures";
import { createChatSaveController, chatSaveProposal, chatSavePlan } from "./tripsage-chat-save";

const verified = { status: "VERIFIED", reason: null, durationSeconds: 3600, distanceMeters: 50_000, provider: "STADIA_MAPS" } as const;
const routes = { route: async (pair: { from: { id: string }; to: { id: string } }) => ({ fromDestinationId: pair.from.id, toDestinationId: pair.to.id, ...verified }), coordinateRoute: async () => verified };
const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, journey: COMPLETE_JOURNEY_FIXTURE } };
const schedule = (ids: string[]) => scheduleSelection(needs, { days: [ids] }, [planningCandidate("a"), planningCandidate("b"), externalPlannerCandidate({ placeId: "ChIJx", name: "Quán X", latitude: 22.8, longitude: 104.98 })], routes as never, planningNow);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const validation = { timeReference: "t", canConfirm: false, groups: { openingHours: { status: "INSUFFICIENT_DATA", findings: [] }, minimumDuration: { status: "INSUFFICIENT_DATA", findings: [] }, travelTime: { status: "SATISFIED", findings: [] }, scheduleConflict: { status: "INSUFFICIENT_DATA", findings: [] } } };

describe("chat Save controller with unchecked items", () => {
  it("offers a plan only for an unchecked schedule; PASS-only Save and its payload are unchanged", async () => {
    const unchecked = await schedule(["a", "ext:google:ChIJx"]);
    expect(chatSaveProposal(unchecked)).toBeNull();
    expect(chatSavePlan(unchecked)?.unchecked.length).toBeGreaterThan(0);
    const pass = await schedule(["a", "b"]);
    expect(chatSavePlan(pass)).toMatchObject({ unchecked: [] });
    const fetcher = vi.fn(async () => json({ success: false, operationStatus: "FAILED", error: { code: "X", message: "x" } }, 422));
    await createChatSaveController({ fetcher: fetcher as never, newKey: () => "k" }).save(pass);
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).not.toHaveProperty("acknowledgedUnchecked");
  });

  it("sends nothing until the user confirms; then sends the exact list, and SUCCESS keeps it as unchecked", async () => {
    const result = await schedule(["a", "ext:google:ChIJx"]);
    const plan = chatSavePlan(result)!;
    const fetcher = vi.fn(async () => json({ success: true, operationStatus: "SUCCESS", data: { tripId: "t1", validation, unchecked: plan.unchecked } }));
    const controller = createChatSaveController({ fetcher: fetcher as never, newKey: () => "k1" });
    expect(await controller.save(result)).toMatchObject({ state: "idle" });
    expect(fetcher).not.toHaveBeenCalled();
    const view = await controller.save(result, undefined, { confirmUnchecked: true });
    expect(view).toMatchObject({ state: "success", tripId: "t1", unchecked: plan.unchecked });
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).acknowledgedUnchecked).toEqual({ confirmed: true, items: plan.unchecked });
  });

  it("a SUCCESS that claims an unchecked schedule is fully checked, or lacks the list, is never shown as success", async () => {
    const result = await schedule(["a", "ext:google:ChIJx"]);
    const fetcher = vi.fn(async () => json({ success: true, operationStatus: "SUCCESS", data: { tripId: "t1", validation } }));
    const view = await createChatSaveController({ fetcher: fetcher as never }).save(result, undefined, { confirmUnchecked: true });
    expect(view.state).toBe("unknown");
  });

  it("UNKNOWN retry sends the identical body and key", async () => {
    const result = await schedule(["a", "ext:google:ChIJx"]);
    const sent: { key: string; body: string }[] = [];
    const fetcher = (async (_u: unknown, init: RequestInit) => { sent.push({ key: (init.headers as Record<string, string>)["Idempotency-Key"]!, body: init.body as string }); throw new TypeError("offline"); }) as never;
    let n = 0;
    const controller = createChatSaveController({ fetcher, newKey: () => `k${++n}` });
    expect((await controller.save(result, undefined, { confirmUnchecked: true })).state).toBe("unknown");
    await controller.save(result, undefined, { confirmUnchecked: true });
    expect(sent[1]).toEqual(sent[0]);
    expect(n).toBe(1);
  });

  it("a server MISMATCH shows the server's list, asks again, and the next confirmed Save uses that list with a new key", async () => {
    const result = await schedule(["a", "ext:google:ChIJx"]);
    const serverList = [{ check: "OPENING_HOURS", reasonCode: "OPENING_UNKNOWN", placeId: "ext:google:ChIJx" }];
    const bodies: string[] = []; const keys: string[] = [];
    let call = 0;
    const fetcher = (async (_u: unknown, init: RequestInit) => {
      bodies.push(init.body as string); keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
      return call++ === 0 ? json({ success: false, operationStatus: "FAILED", error: { code: "UNCHECKED_CONFIRMATION_MISMATCH", message: "Danh sách đã thay đổi.", details: { unchecked: serverList } } }, 422)
        : json({ success: true, operationStatus: "SUCCESS", data: { tripId: "t2", validation, unchecked: serverList } });
    }) as never;
    let n = 0;
    const controller = createChatSaveController({ fetcher, newKey: () => `k${++n}` });
    const failed = await controller.save(result, undefined, { confirmUnchecked: true });
    expect(failed).toMatchObject({ state: "failed", unchecked: serverList });
    expect(await controller.save(result)).toMatchObject({ state: "failed" }); // not confirmed again: nothing sent
    expect(bodies).toHaveLength(1);
    expect((await controller.save(result, undefined, { confirmUnchecked: true })).state).toBe("success");
    expect(JSON.parse(bodies[1]!).acknowledgedUnchecked.items).toEqual(serverList);
    expect(keys[1]).not.toBe(keys[0]);
  });
});
