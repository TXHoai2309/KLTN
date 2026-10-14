import "server-only";
import { Prisma } from "@KLTN/db";
import { db } from "../../services";
import { AppError } from "../../server/http/app-error";
import { qaReferenceIdSchema } from "../../modules/ai/qa-contract";
import { resolveQaContext } from "../../modules/ai/qa-destination-context";
import { containsEvidenceInstruction } from "../../modules/ai/qa-prompt";
import type { AssistantContextProps } from "../../components/assistant/assistant-chat";

export async function loadAssistantContext(query: Record<string, string | string[] | undefined>): Promise<AssistantContextProps> {
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
  return { initialContext: selected ? { type: "DESTINATION", destinationId: selected.id } : { type: "GENERAL" }, destinations, syncContextUrl: true };
}
