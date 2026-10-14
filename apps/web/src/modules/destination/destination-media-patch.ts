import { AppError } from "@/server/http/app-error";
import type { Prisma } from "@KLTN/db";
import type { DestinationV3Input } from "./destination-v3-contract";
type Row = { id: string; url: string; alt: string; caption: string | null; author: string | null; sourceUrl: string | null; isCover: boolean; position: number };
const invalid = () => new AppError("INVALID_MEDIA_OWNER", "Ảnh không thuộc điểm đến hoặc thao tác ảnh không hợp lệ.", 400);
export function mediaChanges(rows: Row[], input: DestinationV3Input) {
  const removed = input.removedMediaIds ?? [];
  const patches = input.media ?? [];
  if (new Set(removed).size !== removed.length || new Set(patches.map(m => m.id)).size !== patches.length ||
      removed.some(id => !rows.some(m => m.id === id)) || patches.some(m => removed.includes(m.id) || !rows.some(r => r.id === m.id))) throw invalid();
  const retained = rows.filter(m => !removed.includes(m.id));
  if (input.mediaOrder && (input.mediaOrder.length !== retained.length || new Set(input.mediaOrder).size !== retained.length || input.mediaOrder.some(id => !retained.some(m => m.id === id)))) throw invalid();
  if (input.coverMediaId && !retained.some(m => m.id === input.coverMediaId)) throw invalid();
  const updates: { where: { id: string }; data: Prisma.ContentMediaUpdateWithoutDestinationInput }[] = [];
  for (const row of retained) {
    const patch = patches.find(m => m.id === row.id);
    const data: Prisma.ContentMediaUpdateWithoutDestinationInput = {};
    for (const key of ["url", "alt", "caption", "author", "sourceUrl"] as const)
      if (patch?.[key] !== undefined && patch[key] !== row[key]) Object.assign(data, { [key]: patch[key] });
    if (data.url) Object.assign(data, { storageReference: null, websiteRights: "UNKNOWN", rightsEvidence: null, reviewedBy: null, reviewedAt: null });
    if (input.mediaOrder) {
      const position = input.mediaOrder.indexOf(row.id);
      if (position !== row.position) data.position = position;
    }
    if (input.coverMediaId !== undefined && row.isCover !== (row.id === input.coverMediaId)) data.isCover = row.id === input.coverMediaId;
    if (Object.keys(data).length) updates.push({ where: { id: row.id }, data });
  }
  return updates.length || removed.length ? {
    ...(updates.length ? { update: updates } : {}),
    ...(removed.length ? { deleteMany: { id: { in: removed } } } : {}),
  } : undefined;
}
