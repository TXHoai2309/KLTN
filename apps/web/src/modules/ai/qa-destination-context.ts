import { Prisma, type Database } from "@KLTN/db";
import { AppError } from "../../server/http/app-error";
import { qaContextSchema, type QaContext } from "./qa-contract";
import { containsEvidenceInstruction, evidenceSentences } from "./qa-prompt";

export type QaResolvedContext = { type: "GENERAL" } | { type: "DESTINATION"; destinationId: string; name: string };
/** Minimal public projection. Metadata resolves intent; it is never RAG evidence. */
export async function resolveQaContext(reader: Pick<Database, "$queryRaw">, input: QaContext, lock = false): Promise<QaResolvedContext> {
  const context = qaContextSchema.parse(input);
  if (context.type === "GENERAL") return context;
  const rows = await reader.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`SELECT id,name FROM destination
    WHERE id=${context.destinationId} AND visibility='VISIBLE' ${lock ? Prisma.sql`FOR SHARE` : Prisma.empty}`);
  const row = rows[0];
  if (!row || !row.name.trim() || row.name.length > 200 || containsEvidenceInstruction(row.name) || /[\u0000-\u001f\u007f]/u.test(row.name)) {
    throw new AppError("CONTEXT_UNAVAILABLE", "Bối cảnh điểm đến không còn khả dụng.", 404);
  }
  return { ...context, name: row.name.normalize("NFC").trim() };
}

export function destinationEvidenceSentences(text: string, name: string): string[] {
  const canonical = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/gu, " ").trim();
  const needle = canonical(name);
  return evidenceSentences(text).filter(sentence => {
    const haystack = canonical(sentence);
    let from = 0;
    while (from < haystack.length) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) return false;
      const before = haystack[at - 1], after = haystack[at + needle.length];
      if ((!before || !/[\p{L}\p{N}_]/u.test(before)) && (!after || !/[\p{L}\p{N}_]/u.test(after))) return true;
      from = at + needle.length;
    }
    return false;
  });
}
