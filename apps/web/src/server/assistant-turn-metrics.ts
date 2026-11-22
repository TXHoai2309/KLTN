import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type Metrics = { runtimeVersion: "v2"; activeSkills: string[]; providerCallCount: number; planningGenerationCount: number; retrievalCount: number; composerOutcomes: Record<string, { accepted: number; fallback: number }>; actionsExecuted: string[] };
const context = new AsyncLocalStorage<Metrics>();
export function assistantMetric(event: "provider" | "planning" | "retrieval" | "skill" | "action", id?: string) {
  const current = context.getStore(); if (!current) return;
  if (event === "provider") current.providerCallCount++;
  if (event === "planning") current.planningGenerationCount++;
  if (event === "retrieval") current.retrievalCount++;
  if (event === "skill" && id && !current.activeSkills.includes(id)) current.activeSkills.push(id);
  if (event === "action" && id) current.actionsExecuted.push(id);
}
/** Whether model wording for a goal was used or replaced by the fixed fallback. Counts per goal only, never text. */
export function assistantComposerOutcome(goal: string, outcome: "accepted" | "fallback") {
  const current = context.getStore(); if (!current) return;
  const bucket = (current.composerOutcomes[goal] ??= { accepted: 0, fallback: 0 });
  bucket[outcome]++;
}
/** Numeric counts and registry identifiers only. No prompt, user, capsule or GPS. */
export async function measureAssistantTurn<T>(work: () => Promise<T>) {
  const metrics: Metrics = { runtimeVersion: "v2", activeSkills: [], providerCallCount: 0, planningGenerationCount: 0, retrievalCount: 0, composerOutcomes: {}, actionsExecuted: [] };
  return context.run(metrics, async () => {
    try { return await work(); }
    finally { console.info("ASSISTANT_V2_TURN_METRICS", JSON.stringify(metrics)); }
  });
}
