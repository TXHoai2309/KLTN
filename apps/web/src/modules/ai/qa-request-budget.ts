import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// Includes body/auth/admission/retrieval and all model calls, not 40s per phase.
// Leave 20s of the 60s Vercel route for final eligibility + persistence/response.
export const QA_PROVIDER_WORK_BUDGET_MS = 40_000;
export const QA_RESPONSE_BUDGET_MS = 58_000;
export const QA_REQUEST_DEADLINE = Symbol("QA_REQUEST_DEADLINE");
const budgets = new AsyncLocalStorage<{ deadline: number }>();
export const qaRemainingProviderMs = () => {
  const budget = budgets.getStore();
  return budget ? Math.max(0, budget.deadline - performance.now()) : Infinity;
};

/** A lost persistence acknowledgement is UNKNOWN, never a confirmed failure.
 * This only bounds waiting; it does not cancel/rollback a possibly committed DB
 * operation. The service must retain its same-key reconciliation semantics. */
export async function withinQaResponseBudget<T>(work: () => Promise<T>): Promise<T> {
  const budget = budgets.getStore();
  if (!budget) return work();
  const remaining = budget.deadline + QA_RESPONSE_BUDGET_MS - QA_PROVIDER_WORK_BUDGET_MS - performance.now();
  if (remaining <= 0) throw new Error("QA_FINALIZATION_ACKNOWLEDGEMENT_DEADLINE");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("QA_FINALIZATION_ACKNOWLEDGEMENT_DEADLINE")), remaining);
    })]);
  } finally { clearTimeout(timer); }
}

export async function withQaRequestBudget<T>(requestSignal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const relay = () => controller.abort(requestSignal.reason);
  requestSignal.addEventListener("abort", relay, { once: true });
  if (requestSignal.aborted) relay();
  const timer = setTimeout(() => controller.abort(QA_REQUEST_DEADLINE), QA_PROVIDER_WORK_BUDGET_MS);
  try {
    return await budgets.run({ deadline: performance.now() + QA_PROVIDER_WORK_BUDGET_MS }, () => work(controller.signal));
  } finally { clearTimeout(timer); requestSignal.removeEventListener("abort", relay); }
}
