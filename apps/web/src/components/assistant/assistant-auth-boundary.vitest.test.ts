import { describe, expect, it, vi } from "vitest";
import { assistantAuthBoundary } from "./assistant-auth-boundary";
import { AssistantController } from "./assistant-controller";

const settledGuest = { isPending: false, hasError: false, unauthorized: false };
describe("Assistant auth refresh preserves the same principal's controller", () => {
  it("retains UNKNOWN and its identical key through repeated Guest revalidation without sending again", async () => {
    const send = vi.fn(async () => ({ kind: "networkAmbiguity" as const }));
    const controller = new AssistantController({ send }, "GUEST:fixture", () => "key_unknown_fixture");
    controller.setDraft("fixture question"); controller.submit();
    await new Promise(resolve => setTimeout(resolve, 0));
    const pending = controller.getSnapshot().pending;
    expect(pending?.phase).toBe("unknown");
    let boundary = assistantAuthBoundary(settledGuest, null);
    for (let i = 0; i < 3; i++) {
      boundary = assistantAuthBoundary({ ...settledGuest, isPending: true }, boundary);
      expect(boundary).toBe("GUEST");
      boundary = assistantAuthBoundary(settledGuest, boundary);
    }
    expect(controller.getSnapshot().pending).toBe(pending);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("keeps the confirmed Guest boundary during Better Auth's null-data refetch", async () => {
    const transport = { send: async () => ({ kind: "response" as const, httpStatus: 502, body: { success: false, operationStatus: "FAILED", error: { code: "AI_INVALID_RESPONSE", message: "Fixture error" } } }) };
    const controller = new AssistantController(transport, "GUEST:fixture", () => "key_fixture");
    controller.setDraft("fixture question"); controller.submit();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(controller.getSnapshot().pending?.phase).toBe("failed");
    const key = assistantAuthBoundary(settledGuest, null);
    const refreshing = assistantAuthBoundary({ ...settledGuest, isPending: true }, key);
    expect(refreshing).toBe(key); // Different key would unmount/dispose this controller.
    expect(assistantAuthBoundary(settledGuest, refreshing)).toBe(key);
    expect(controller.getSnapshot().pending?.attempt.key).toBe("key_fixture");
    expect(controller.getSnapshot().pending?.phase).toBe("failed");
  });
  it("keeps the confirmed User boundary on a transient session error", () => {
    expect(assistantAuthBoundary({ userId: "fixture", isPending: false, hasError: true, unauthorized: false }, "USER:fixture")).toBe("USER:fixture");
  });
  it("has no usable boundary before initial authentication or after confirmed unauthorized", () => {
    expect(assistantAuthBoundary({ ...settledGuest, isPending: true }, null)).toBeNull();
    expect(assistantAuthBoundary({ ...settledGuest, hasError: true, unauthorized: true }, "USER:fixture")).toBeNull();
  });
  it("switches immediately on confirmed login, logout or account change", () => {
    expect(assistantAuthBoundary({ ...settledGuest, userId: "new" }, "GUEST")).toBe("USER:new");
    expect(assistantAuthBoundary(settledGuest, "USER:old")).toBe("GUEST");
    expect(assistantAuthBoundary({ ...settledGuest, userId: "new" }, "USER:old")).toBe("USER:new");
  });
});
