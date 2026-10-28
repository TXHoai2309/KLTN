import { expect, it } from "vitest";
import { consumePlanningAuthDraft, retainPlanningAuthDraft } from "./planning-auth-handoff";
it("restores only a one-use draft after auth, with no automatic action or durable storage", () => {
  retainPlanningAuthDraft("Đi 3 ngày", { type: "DESTINATION", destinationId: "public" }, 100);
  expect(consumePlanningAuthDraft("GUEST:a", 200)).toBeNull();
  expect(consumePlanningAuthDraft("USER:a", 200)).toMatchObject({ text: "Đi 3 ngày", context: { type: "DESTINATION", destinationId: "public" } });
  expect(consumePlanningAuthDraft("USER:a", 200)).toBeNull();
  retainPlanningAuthDraft("Expired", { type: "GENERAL" }, 100);
  expect(consumePlanningAuthDraft("USER:a", 300_101)).toBeNull();
});
