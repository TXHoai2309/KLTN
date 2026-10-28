import type { QaContext } from "../../modules/ai/qa-contract";
let handoff: { text: string; context: QaContext; at: number } | null = null;
/** Same-tab memory only; never place travel/mobility text in a URL or storage. */
export function retainPlanningAuthDraft(text: string, context: QaContext, now = Date.now()) {
  handoff = text.trim() ? { text: text.slice(0, 1000), context, at: now } : null;
}
export function consumePlanningAuthDraft(principal: string, now = Date.now()) {
  if (!principal.startsWith("USER:")) return null;
  const retained = handoff; handoff = null;
  return retained && now - retained.at <= 300_000 ? retained : null;
}
