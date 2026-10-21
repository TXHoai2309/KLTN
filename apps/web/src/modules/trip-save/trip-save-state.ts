export type SaveState = "idle" | "pending" | "success" | "failed" | "unknown";

/** An unresolved save must retain its mounted proposal and idempotency key. */
export function isTripSaveNavigationLocked(state: SaveState): boolean {
  return state === "pending" || state === "unknown" || state === "success";
}
