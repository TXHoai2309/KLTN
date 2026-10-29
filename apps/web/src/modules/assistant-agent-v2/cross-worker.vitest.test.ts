import { expect, it, vi } from "vitest";
import type { AuthorizationDependencies } from "../../server/authorization/guard";
import { createAssistantV2HttpService } from "./http-service";
import type { startSavedTripAssistantV2 } from "./in-trip-runtime";
import { createTestSessionHeadStore } from "./session-head-test-store";
import type { InTripSessionState } from "./in-trip-session";

it("continues an authenticated interaction on a second worker without the first worker's memory", async () => {
  const state: InTripSessionState = { location: null, awaitingLocation: null, clarification: null, pending: null, interrupted: false, unknown: null, qa: { head: null, subject: null } };
  const startInTrip = vi.fn(async () => ({
    snapshot: async () => ({ trip: { baseRevision: "owned-current-revision" } }),
    send: async (text: string) => ({ message: text, uncertain: false }),
    provideLocation: vi.fn(), reconcile: vi.fn(), exportState: () => structuredClone(state),
  }));
  const deps = { authorization: {} as AuthorizationDependencies, forActor: vi.fn(), startInTrip: startInTrip as unknown as typeof startSavedTripAssistantV2, heads: createTestSessionHeadStore(), secret: () => "v207a-test-only-secret-with-at-least-32-characters" };
  const workerA = createAssistantV2HttpService(deps);
  const workerB = createAssistantV2HttpService(deps);
  const started = await workerA({ action: "ASSISTANT_V2", operation: "START", tripId: "owned-trip" }, "v207a-start-key", "owner", new Headers()) as { sessionId: string; stateToken?: string };
  const request = { action: "ASSISTANT_V2" as const, operation: "TURN" as const, sessionId: started.sessionId, stateToken: started.stateToken, text: "Áp dụng đi" };
  await expect(workerB(request, "v207a-turn-key", "owner", new Headers())).resolves.toMatchObject({ runtimeVersion: "v2", turn: { message: "Áp dụng đi" } });
  const workerC = createAssistantV2HttpService(deps);
  await expect(workerC(request, "v207a-stale-key", "owner", new Headers())).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
  await expect(workerC(request, "v207a-foreign-key", "other", new Headers())).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
  await expect(workerC({ ...request, stateToken: request.stateToken!.slice(0, -6) + "AAAAAA" }, "v207a-tampered-key", "owner", new Headers())).rejects.toMatchObject({ code: "ASSISTANT_SESSION_EXPIRED" });
});
