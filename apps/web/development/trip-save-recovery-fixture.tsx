// Offline browser fixture only. Never imported by application routes.
import { createRoot } from "react-dom/client";
import TripRequirementForm from "../src/app/trips/new/trip-requirement-form";
import { CHECK_KEYS, plannerResultSchema } from "../src/modules/trip-planner/planner-contract";
import { tripRequirementInputSchema } from "../src/modules/trip-requirement/trip-requirement-contract";
import { evaluateTripRequirement } from "../src/modules/trip-requirement/trip-requirement-readiness";
import { validateItinerary } from "../src/modules/trip-validation/trip-validation";
import "../src/app/trips/new/trip-form.css";

const now = new Date("2026-10-21T00:00:00Z");
const validation = validateItinerary([], [], now);
let releaseSave: (() => void) | undefined;
let releaseEvaluation: (() => void) | undefined;
const requests: { key: string | null; body: string }[] = [];
const fixture = {
  requests, mode: "unknown", navigations: [] as string[], deferEvaluation: false, completedEvaluations: 0,
  release: () => releaseSave?.(),
  releaseEvaluation: () => releaseEvaluation?.(),
};
Object.assign(window, { tripSaveFixture: fixture });
window.fetch = async (url, options) => {
  const path = String(url);
  const body = JSON.parse(String(options?.body ?? "{}"));
  if (path === "/api/trip-requirements/evaluate") {
    const requirement = tripRequirementInputSchema.parse(body);
    if (fixture.deferEvaluation) await new Promise<void>(resolve => { releaseEvaluation = resolve; });
    fixture.completedEvaluations++;
    return Response.json({ success: true, data: { requirement, readiness: evaluateTripRequirement(requirement, now) } });
  }
  if (path === "/api/trip-proposals") {
    const requirement = tripRequirementInputSchema.parse(body.requirement);
    const proposal = plannerResultSchema.parse({
      proposalId: "offline-proposal", phase: "PRELIMINARY_PROPOSAL", status: "PROPOSAL_READY", requirement,
      timezone: "Asia/Ho_Chi_Minh", eligibleForFinalConfirmation: true, checks: CHECK_KEYS.map(key => ({ key, status: "PASS", issues: [] })), warnings: [], reasonCodes: [],
      days: Array.from({ length: requirement.durationDays }, (_, i) => ({ day: i + 1, date: new Date(Date.parse(`${requirement.startDate}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), distanceMeters: null, travelSeconds: null,
        stops: [{ order: 1, destination: { id: `offline-${i}`, name: `TEST Điểm đến ${i}`, description: "Chỉ dùng kiểm thử.", area: "TEST", address: null, category: "TEST", latitude: 23, longitude: 105, image: null }, arrivalMinute: 480, departureMinute: 540, visitDurationMinutes: 60, scheduleState: "PLANNED", inbound: null, validationStatus: "PASS" }],
      })),
    });
    return Response.json({ success: true, data: proposal });
  }
  if (path === "/api/trips/validate") return Response.json({ success: true, data: { validation } });
  if (path === "/api/trips") {
    requests.push({ key: new Headers(options?.headers).get("Idempotency-Key"), body: String(options?.body) });
    await new Promise<void>(resolve => { releaseSave = resolve; });
    if (fixture.mode === "unknown") throw new TypeError("Offline response loss");
    if (fixture.mode === "failed") return Response.json({ success: false, operationStatus: "FAILED", error: { code: "TRIP_VALIDATION_FAILED", message: "TEST cần kiểm tra lại." } }, { status: 422 });
    return Response.json({ success: true, operationStatus: "SUCCESS", data: { tripId: "offline-trip", validation } });
  }
  throw new Error(`Unexpected offline request: ${path}`);
};
createRoot(document.getElementById("root")!).render(<TripRequirementForm />);
