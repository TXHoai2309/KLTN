import type { MutationOutcome } from "@/lib/mutation-contract";

/** Keep the last confirmed view until the server confirms the write. */
export function confirmedRagDetail<T extends object>(previous: T, outcome: MutationOutcome<Partial<T>>): T {
  if (outcome.status !== "SUCCESS") return previous;
  // A read started before DISABLE may arrive after its confirmed mutation.
  // The terminal status must not be replaced by that older indexing response.
  if ("status" in previous && previous.status === "DISABLED" &&
      "status" in outcome.data && outcome.data.status !== "DISABLED") return previous;
  return { ...previous, ...outcome.data };
}
