import { qaReferenceIdSchema, type QaContext } from "../../modules/ai/qa-contract";

/** Reconcile a cached page tree with the explicit URL reference using only the
 * server-projected public choices. Never recover history or accept client names.
 * The ask boundary revalidates current destination eligibility every time. */
export function assistantContextFromUrl(initial: QaContext | undefined, destinations: readonly { id: string }[], search?: string): QaContext {
  if (search === undefined) return initial ?? { type: "GENERAL" };
  const params = new URLSearchParams(search);
  const ids = params.getAll("destinationId");
  if (!ids.length) return { type: "GENERAL" };
  const id = qaReferenceIdSchema.safeParse(ids.length === 1 ? ids[0] : undefined);
  if (id.success && destinations.some(destination => destination.id === id.data)) return { type: "DESTINATION", destinationId: id.data };
  return initial ?? { type: "GENERAL" };
}
