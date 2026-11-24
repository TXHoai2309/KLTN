import "server-only";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Prisma } from "@KLTN/db";
import { db } from "../../services";
import { AppError } from "../../server/http/app-error";
import { qaReferenceIdSchema } from "../../modules/ai/qa-contract";
import { resolveQaContext } from "../../modules/ai/qa-destination-context";
import { containsEvidenceInstruction } from "../../modules/ai/qa-prompt";
import type { AssistantContextProps } from "../../components/assistant/assistant-answer";

export async function loadAssistantContext(query: Record<string, string | string[] | undefined>): Promise<AssistantContextProps> {
  const mode = query.mode;
  if (mode === "plan" || (Array.isArray(mode) && mode.includes("plan"))) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "mode" || value === undefined) continue;
      if (Array.isArray(value)) for (const item of value) next.append(key, item);
      else next.set(key, value);
    }
    const qs = next.toString();
    redirect((qs ? `/assistant?${qs}` : "/assistant") as Route);
  }
  let selected: { id: string; name: string } | undefined;
  if (query.destinationId !== undefined) {
    const id = qaReferenceIdSchema.safeParse(query.destinationId);
    if (!id.success) return { contextError: "Bối cảnh điểm đến không còn khả dụng." };
    try {
      const context = await resolveQaContext(db, { type: "DESTINATION", destinationId: id.data });
      if (context.type === "DESTINATION") selected = { id: context.destinationId, name: context.name };
    } catch (error) {
      if (error instanceof AppError && error.code === "CONTEXT_UNAVAILABLE") return { contextError: "Bối cảnh điểm đến không còn khả dụng." };
      throw error;
    }
  }
  const rows = await db.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`SELECT id,name FROM destination WHERE visibility='VISIBLE' ORDER BY name,id LIMIT 50`);
  const destinations = rows.filter(row => row.name.trim() && !containsEvidenceInstruction(row.name) && !/[\u0000-\u001f\u007f]/u.test(row.name));
  if (selected && !destinations.some(row => row.id === selected.id)) destinations.unshift(selected);

  // P3 / P8: allow pre-selecting verified public destination IDs for planning (mustInclude=...&intent=plan)
  const rawMustInclude = query.mustInclude;
  const candidateIds = (Array.isArray(rawMustInclude) ? rawMustInclude : rawMustInclude ? rawMustInclude.split(",") : [])
    .map(value => value.trim())
    .filter(Boolean);
  const validIds: string[] = [];
  for (const candidate of candidateIds) {
    const parsed = qaReferenceIdSchema.safeParse(candidate);
    if (parsed.success && !validIds.includes(parsed.data)) validIds.push(parsed.data);
  }
  const byId = new Map(destinations.map(d => [d.id, d]));
  const missingIds = validIds.filter(id => !byId.has(id)).slice(0, 20);
  if (missingIds.length > 0) {
    const extraRows = await db.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`SELECT id,name FROM destination WHERE visibility='VISIBLE' AND id IN (${Prisma.join(missingIds)})`,
    );
    for (const row of extraRows) {
      if (row.name.trim() && !containsEvidenceInstruction(row.name) && !/[\u0000-\u001f\u007f]/u.test(row.name)) {
        if (!destinations.some(d => d.id === row.id)) destinations.push(row);
        byId.set(row.id, row);
      }
    }
  }
  const mustIncludeDestinations = validIds
    .map(id => byId.get(id))
    .filter((item): item is { id: string; name: string } => Boolean(item));
  const initialPlanIntent =
    query.intent === "plan" || (Array.isArray(query.intent) && query.intent.includes("plan"));

  return {
    initialContext: selected ? { type: "DESTINATION", destinationId: selected.id } : { type: "GENERAL" },
    destinations,
    syncContextUrl: true,
    ...(mustIncludeDestinations.length > 0 ? { mustIncludeDestinations } : {}),
    ...(initialPlanIntent ? { initialPlanIntent: true } : {}),
  };
}
