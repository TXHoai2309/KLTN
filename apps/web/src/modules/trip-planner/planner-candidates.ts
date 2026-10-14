import type { Database, Prisma } from "@KLTN/db";
import { visibleDestinationWhere, isDestinationEligibleForNewItinerary, findEligibleDestinationIds } from "../destination/destination-eligibility";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";
import { richContentText } from "../culture/culture-rich-content";
import type { TripInterest } from "../trip-requirement/trip-requirement-contract";
import type { z } from "zod";
import type { plannerDestinationSchema } from "./planner-contract";

export type PlannerCandidate = z.infer<typeof plannerDestinationSchema> & {
  visibility: string; revision: string; suggestedDurationMinutes: number | null; minimumDurationMinutes: number | null;
  openingDays: { dayOfWeek: string; status: string; intervals: { opensAtMinute: number; closesAtMinute: number }[] }[];
};
export const MAX_CANDIDATES = 64;
const select = {
  id: true, name: true, description: true, shortDescription: true, area: true, category: true, address: true,
  latitude: true, longitude: true, visibility: true, updatedAt: true, contentRevision: true,
  suggestedDurationMinutes: true, minimumDurationMinutes: true,
  media: { where: { websiteRights: "APPROVED" as const }, take: 1, orderBy: [{ isCover: "desc" as const }, { position: "asc" as const }, { id: "asc" as const }], select: { url: true, alt: true, author: true, sourceUrl: true } },
  openingDays: { orderBy: { dayOfWeek: "asc" as const }, select: { dayOfWeek: true, status: true, intervals: { orderBy: { opensAtMinute: "asc" as const }, select: { opensAtMinute: true, closesAtMinute: true } } } },
} satisfies Prisma.DestinationSelect;
export async function retrievePlannerCandidates(database: Pick<Database, "destination">, ids?: readonly string[], excludedIds: readonly string[] = []): Promise<PlannerCandidate[]> {
  const rows = await database.destination.findMany({ where: { ...visibleDestinationWhere, ...(ids ? { id: { in: [...ids] } } : {}) }, select, orderBy: { id: "asc" }, take: MAX_CANDIDATES });
  return rows.filter(row => !excludedIds.includes(row.id) && isDestinationEligibleForNewItinerary(row) && Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180).map(row => {
    const image = row.media[0];
    return { id: row.id, name: row.name, description: richContentText(row.shortDescription || row.description).slice(0, 1000), area: row.area, category: row.category,
      address: row.address, latitude: row.latitude, longitude: row.longitude, image: image && publicHttpsUrl.safeParse(image.url).success ? { ...image, sourceUrl: image.sourceUrl && publicHttpsUrl.safeParse(image.sourceUrl).success ? image.sourceUrl : null } : null,
      visibility: row.visibility, revision: `${row.contentRevision}:${row.updatedAt.toISOString()}`, suggestedDurationMinutes: row.suggestedDurationMinutes,
      minimumDurationMinutes: row.minimumDurationMinutes, openingDays: row.openingDays };
  });
}
export function candidateSnapshot(candidate: PlannerCandidate) { return JSON.stringify(candidate); }
export async function recheckPlannerCandidates(database: Pick<Database, "destination">, candidates: readonly PlannerCandidate[], excludedIds: readonly string[] = []): Promise<boolean> {
  const ids = candidates.map(candidate => candidate.id);
  if (!ids.length) return true;
  if ((await findEligibleDestinationIds(ids, database)).length !== ids.length) return false;
  const current = new Map((await retrievePlannerCandidates(database, ids, excludedIds)).map(candidate => [candidate.id, candidateSnapshot(candidate)]));
  return candidates.every(candidate => current.get(candidate.id) === candidateSnapshot(candidate));
}
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase();
// Ranking heuristic only, not an approved taxonomy mapping or a factual suitability claim.
const terms: Record<TripInterest, string[]> = {
  NATURE: ["thien nhien", "nui", "deo", "thac", "hang", "canh quan"], CULTURE_HISTORY: ["van hoa", "lich su", "di tich", "dinh", "pho co"],
  ETHNIC_VILLAGES: ["ban lang", "cong dong", "dan toc"], PHOTOGRAPHY: ["ngam canh", "check-in", "chup anh"],
  FOOD: ["am thuc", "cho", "mon an"], ADVENTURE: ["kham pha", "trekking", "mao hiem"], RELAXATION: ["thu gian", "nghi duong"],
};
export function interestScore(candidate: PlannerCandidate, interests: readonly TripInterest[]) {
  const text = normalized(candidate.category);
  return interests.filter(interest => terms[interest].some(term => text.includes(term))).length;
}
