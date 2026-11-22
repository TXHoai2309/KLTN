import type { TripJourney } from "@/modules/trip-origin/trip-origin-contract";
import type { TripRequirementFormFields } from "./trip-requirement-form-logic";
import type { ConfirmedTripRequirement } from "./trip-requirement-review";

export type TripCreationStep = "details" | "planner";

export type TripCreationDraft = {
  version: 1;
  fields: TripRequirementFormFields;
  journey: TripJourney | null;
  planner: ConfirmedTripRequirement | null;
  activeTab: TripCreationStep;
  updatedAt: number;
};

const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export function tripCreationDraftKey(userId: string): string {
  return `kltn:trip-creation-draft:v1:${userId}`;
}

export function readTripCreationDraft(
  userId: string | undefined,
  storage?: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): TripCreationDraft | null {
  if (!userId) return null;
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return null;
  const key = tripCreationDraftKey(userId);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripCreationDraft> | null;
    if (!parsed || parsed.version !== 1 || !parsed.fields || typeof parsed.updatedAt !== "number") {
      store.removeItem(key);
      return null;
    }
    if (now - parsed.updatedAt > DRAFT_TTL_MS) {
      store.removeItem(key);
      return null;
    }
    const activeTab: TripCreationStep = parsed.activeTab === "planner" && parsed.planner ? "planner" : "details";
    return {
      version: 1,
      fields: parsed.fields,
      journey: parsed.journey ?? null,
      planner: parsed.planner ?? null,
      activeTab,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    try {
      store.removeItem(key);
    } catch {
      // Ignore storage removal errors.
    }
    return null;
  }
}

export function writeTripCreationDraft(
  userId: string | undefined,
  draft: Omit<TripCreationDraft, "version" | "updatedAt">,
  storage?: Pick<Storage, "setItem">,
  now = Date.now(),
): boolean {
  if (!userId) return false;
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return false;
  try {
    const payload: TripCreationDraft = {
      version: 1,
      fields: draft.fields,
      journey: draft.journey,
      planner: draft.planner,
      activeTab: draft.activeTab,
      updatedAt: now,
    };
    store.setItem(tripCreationDraftKey(userId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearTripCreationDraft(
  userId: string | undefined,
  storage?: Pick<Storage, "removeItem">,
): void {
  if (!userId) return;
  const store = storage ?? (typeof window !== "undefined" ? window.sessionStorage : undefined);
  if (!store) return;
  try {
    store.removeItem(tripCreationDraftKey(userId));
  } catch {
    // Ignore storage removal errors.
  }
}

export function syncTripCreationStepUrl(step: TripCreationStep): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("step") !== step) {
      url.searchParams.set("step", step);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    // Ignore history API errors in restricted environments.
  }
}
