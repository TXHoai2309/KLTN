import { describe, expect, it } from "vitest";

import { decideAnalyzeTripNeedsResponse } from "@/lib/preference-extraction-client";
import {
  decideTripRequirementCheckResponse,
  type TripRequirementCheckResult,
} from "@/lib/trip-requirement-check-client";
import type { AuthorizationDependencies } from "@/server/authorization/guard";
import { modelOutputSchema } from "../preference-extraction/preference-extraction-contract";
import { analyzePreferencesResponse } from "../preference-extraction/preference-extraction-http";
import { canConfirm, mergeClarificationRequests } from "./trip-clarification-logic";
import { checkTripRequirementResponse } from "./trip-requirement-check-http";
import {
  applyFieldEdit,
  clearField,
  confirmDraft,
  draftFromExtraction,
  draftToCandidate,
  type TripRequirementReviewDraft,
} from "./trip-requirement-review";

const NOW = new Date("2026-10-15T03:00:00Z");
const ORIGIN = "http://localhost";
const CONFIRM_STATE = { acknowledged: true, editingKey: null, isChecking: false };

type RepairField = "durationDays" | "transport";
type Scenario = {
  name: string;
  text: string;
  durationSource: string | null;
  transportSource: string | null;
  blockers: string[];
  repairs: readonly RepairField[];
};

const scenarios: Scenario[] = [
  {
    name: "missing duration",
    text: "Đi Hà Giang bằng ô tô, tôi chưa chốt số ngày.",
    durationSource: null,
    transportSource: "ô tô",
    blockers: ["durationDays:MISSING"],
    repairs: ["durationDays"],
  },
  {
    name: "missing transport",
    text: "Đi Hà Giang 3 ngày, chưa chọn phương tiện.",
    durationSource: "3 ngày",
    transportSource: null,
    blockers: ["transport:MISSING"],
    repairs: ["transport"],
  },
  {
    name: "unsupported transport reported as CAR by the model",
    text: "Đi Hà Giang 3 ngày bằng xe đạp.",
    durationSource: "3 ngày",
    transportSource: "xe đạp",
    blockers: ["transport:UNSUPPORTED"],
    repairs: ["transport"],
  },
  {
    name: "ambiguous transport reported as CAR by the model",
    text: "Đi Hà Giang 3 ngày, tự lái.",
    durationSource: "3 ngày",
    transportSource: "tự lái",
    blockers: ["transport:AMBIGUOUS"],
    repairs: ["transport"],
  },
  {
    name: "two contradictions requiring two separate user corrections",
    text: "Đi Hà Giang 2-3 ngày, xe máy hoặc ô tô.",
    durationSource: "2-3 ngày",
    transportSource: "xe máy hoặc ô tô",
    blockers: ["durationDays:AMBIGUOUS", "transport:CONFLICT"],
    repairs: ["durationDays", "transport"],
  },
];

const authorization: AuthorizationDependencies = {
  resolveSession: async () => ({ user: { id: "task229-traveler", role: "TRAVELER" } }),
  database: {
    user: {
      findUnique: async () => ({ id: "task229-traveler", role: "TRAVELER" }),
    },
  } as unknown as AuthorizationDependencies["database"],
};

const missing = () => ({ status: "MISSING", value: null, sourceText: null, note: null });
const extracted = (value: string | number, sourceText: string) => ({
  status: "EXTRACTED", value, sourceText, note: null,
});

function post(path: string, body: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function checkThroughHttp(draft: TripRequirementReviewDraft): Promise<TripRequirementCheckResult> {
  const response = await checkTripRequirementResponse(
    post("/api/trip-requirements/check", draftToCandidate(draft)),
    { authorization, now: () => NOW },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const body: unknown = await response.json();
  const outcome = decideTripRequirementCheckResponse({ kind: "http", status: response.status, body });
  expect(outcome.kind).toBe("CHECKED");
  if (outcome.kind !== "CHECKED") throw new Error("The check HTTP response did not pass the client contract");
  return outcome.result;
}

describe("Task229 missing recovery coverage: HTTP responses → strict client parsing → review corrections", () => {
  it.each(scenarios)("$name cannot confirm until every correction survives /check", async (scenario) => {
    // Deliberately wrong model transport exercises server verification/downgrade;
    // the provider is synthetic and no fetch, database runtime or server session is used.
    const model = modelOutputSchema.parse({
      fields: {
        startDate: missing(),
        durationDays: scenario.durationSource === null ? missing() : extracted(3, scenario.durationSource),
        transport: scenario.transportSource === null ? missing() : extracted("CAR", scenario.transportSource),
        companions: missing(),
        interests: missing(),
        pace: missing(),
        mobilityConstraints: missing(),
      },
    });
    const analyzeResponse = await analyzePreferencesResponse(
      post("/api/trip-requirements/analyze", { text: scenario.text }),
      {
        authorization,
        llm: { complete: async () => ({ rawText: JSON.stringify(model), model: "task229-synthetic" }) },
        now: () => NOW,
        nowMs: () => 1_000,
      },
    );
    expect(analyzeResponse.status).toBe(200);
    expect(analyzeResponse.headers.get("Cache-Control")).toBe("private, no-store");
    const analyzeBody: unknown = await analyzeResponse.json();
    const analyzed = decideAnalyzeTripNeedsResponse({ kind: "http", status: analyzeResponse.status, body: analyzeBody });
    expect(analyzed.kind).toBe("SUCCESS");
    if (analyzed.kind !== "SUCCESS") throw new Error("The analyze HTTP response did not pass the client contract");
    expect(analyzed.clarificationRequests.map(request => request.id)).toEqual(scenario.blockers);

    let draft = draftFromExtraction(analyzed.result);
    const originalDraft = structuredClone(draft);
    let checked = await checkThroughHttp(draft);
    let requests = mergeClarificationRequests(analyzed.clarificationRequests, checked.clarificationRequests, { draft }, NOW);
    expect(checked.confirmable).toBe(false);
    expect(canConfirm(requests, CONFIRM_STATE)).toBe(false);
    expect(confirmDraft(draft, checked, NOW).confirmation).toEqual({ state: "NOT_CONFIRMED", snapshot: null });

    for (const [index, field] of scenario.repairs.entries()) {
      expect(draft.fields[field].value).toBeNull();
      const sourceText = draft.fields[field].sourceText;
      const edit = applyFieldEdit(draft, field, field === "durationDays" ? "3" : "MOTORCYCLE", NOW);
      expect(edit.ok).toBe(true);
      if (!edit.ok) throw new Error("The explicit user correction was unexpectedly rejected");
      expect(edit.confirmation).toBe("NOT_CONFIRMED");
      draft = edit.draft;
      expect(draft.fields[field]).toMatchObject({ origin: "USER", edited: true, sourceText });
      checked = await checkThroughHttp(draft);
      requests = mergeClarificationRequests(analyzed.clarificationRequests, checked.clarificationRequests, { draft }, NOW);

      const allRepaired = index === scenario.repairs.length - 1;
      expect(checked.confirmable).toBe(allRepaired);
      expect(canConfirm(requests, CONFIRM_STATE)).toBe(allRepaired);
      expect(confirmDraft(draft, checked, NOW).confirmation.state).toBe(allRepaired ? "CONFIRMED" : "NOT_CONFIRMED");
      if (!allRepaired) {
        expect(draft.fields.transport.value).toBeNull();
        expect(requests).toContainEqual(expect.objectContaining({ field: "transport", severity: "BLOCKING" }));
      }
    }

    const confirmed = confirmDraft(draft, checked, NOW);
    expect(requests).toEqual([]);
    expect(confirmed.confirmation.snapshot).toMatchObject({
      requirement: { durationDays: 3, transport: scenario.repairs.includes("transport") ? "MOTORCYCLE" : "CAR" },
      usesRelativeDays: true,
      eligibleForFinalConfirmation: false,
    });
    expect(draftFromExtraction(analyzed.result)).toEqual(originalDraft);

    // A later clear must close both the merged FE gate and the authoritative
    // check even though this exact scenario previously reached confirmation.
    draft = clearField(confirmed.draft, scenario.repairs[0]!);
    checked = await checkThroughHttp(draft);
    requests = mergeClarificationRequests(analyzed.clarificationRequests, checked.clarificationRequests, { draft }, NOW);
    expect(checked.confirmable).toBe(false);
    expect(canConfirm(requests, CONFIRM_STATE)).toBe(false);
    expect(confirmDraft(draft, checked, NOW).confirmation.state).toBe("NOT_CONFIRMED");
  });
});
