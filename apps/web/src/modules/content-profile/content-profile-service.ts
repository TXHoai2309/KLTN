import type { Prisma } from "@KLTN/db";
import { AppError } from "@/server/http/app-error";
import type { DestinationProfile, CultureProfile } from "./content-profile-contract";
export const commonProfileSelect = { contentRevision: true, areas: { select: { id: true } }, sources: { orderBy: { position: "asc" as const } }, media: { orderBy: { position: "asc" as const } } };
export const destinationProfileSelect = { ...commonProfileSelect, aliases: true, shortDescription: true, address: true, googleMapsUrl: true, locationVerified: true, locationEvidence: true, ticketPrice: true, ticketVerification: true, ticketEvidence: true, bestVisitTime: true, visitNotes: true, cultureLinks: { select: { cultureId: true } } } satisfies Prisma.DestinationSelect;
export const cultureProfileSelect = { ...commonProfileSelect, category: true, shortDescription: true, geographicScope: true, communities: { select: { id: true } } } satisfies Prisma.CultureContentSelect;
const sourceKeys = ["title", "url", "author", "publisher", "publishedOn", "claim", "websiteRights", "indexingRights", "openAiRights", "rightsEvidence"];
const mediaKeys = ["url", "storageReference", "alt", "caption", "author", "sourceUrl", "websiteRights", "rightsEvidence", "isCover"];
function pick(row: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.map(k => [k, row[k]])); }
export function profileDto(row: unknown, kind: "destination" | "culture") {
    const r = row as Record<string, unknown>;
    if (typeof r.contentRevision !== "number")
        return {};
    const keys = kind === "destination" ? ["aliases", "shortDescription", "address", "googleMapsUrl", "locationVerified", "locationEvidence", "ticketPrice", "ticketVerification", "ticketEvidence", "bestVisitTime", "visitNotes"] : ["category", "shortDescription", "geographicScope"];
    const ids = (name: string, key = "id") => (r[name] as Record<string, string>[]).map(x => x[key]);
    return { profile: { ...pick(r, keys), areaIds: ids("areas"), sources: (r.sources as Record<string, unknown>[]).map(s => pick(s, kind === "destination" ? ["id", ...sourceKeys] : sourceKeys)), media: (r.media as Record<string, unknown>[]).map(m => pick(m, kind === "destination" ? ["id", ...mediaKeys] : mediaKeys)), ...(kind === "destination" ? { cultureIds: ids("cultureLinks", "cultureId") } : { communityIds: ids("communities") }) } };
}
export async function profileWrite(tx: Prisma.TransactionClient, profile: DestinationProfile | CultureProfile | undefined, actorId: string, update: boolean) {
    if (!profile)
        return {};
    const { areaIds, sources, media, ...rest } = profile;
    const communityIds = "communityIds" in rest ? rest.communityIds : undefined;
    const cultureIds = "cultureIds" in rest ? rest.cultureIds : undefined;
    const scalars = { ...rest } as Record<string, unknown>;
    delete scalars.communityIds;
    delete scalars.cultureIds;
    for (const [model, ids] of [[tx.area, areaIds], [tx.community, communityIds], [tx.cultureContent, cultureIds]] as const) {
        if (ids?.length) {
            const rows = await (model.findMany as (args: unknown) => Promise<{
                id: string;
            }[]>)({ where: { id: { in: ids } }, select: { id: true } });
            if (rows.length !== ids.length)
                throw new AppError("INVALID_CONTENT_REFERENCES", "Có liên kết không còn tồn tại. Hãy chọn lại.", 400);
        }
    }
    const relation = (ids: string[]) => update ? { set: ids.map(id => ({ id })) } : { connect: ids.map(id => ({ id })) };
    const reviewed = (item: {
        websiteRights: string;
        indexingRights?: string;
        openAiRights?: string;
    }) => [item.websiteRights, item.indexingRights, item.openAiRights].some(v => v && v !== "UNKNOWN") ? { reviewedBy: actorId, reviewedAt: new Date() } : { reviewedBy: null, reviewedAt: null };
    const owned = (items: unknown[]) => ({ ...update ? { deleteMany: {} } : {}, create: items });
    return { ...scalars, areas: relation(areaIds), ...(communityIds ? { communities: relation(communityIds) } : {}), ...(cultureIds ? { cultureLinks: owned(cultureIds.map(cultureId => ({ cultureId }))) } : {}), sources: owned(sources.map((s, position) => ({ ...s, position, ...reviewed(s) }))), media: owned(media.map((m, position) => ({ ...m, position, ...reviewed(m) }))) };
}
