import type { MutationOutcome } from "@/lib/mutation-contract";

/** Keep the last confirmed view until the server confirms the write. */
export function confirmedRagDetail<T extends object>(previous: T, outcome: MutationOutcome<Partial<T>>): T {
  return outcome.status === "SUCCESS" ? { ...previous, ...outcome.data } : previous;
}
