import { z } from "zod";
import { publicHttpsUrl } from "./content-profile-contract";
import { destinationMediaWhere, isDestinationMediaUsable } from "../destination/destination-media-eligibility";
const text = z.string().nullable();
export const publicContentProfileSchema = z.object({ shortDescription: text, category: text.optional(), geographicScope: text.optional(), aliases: z.array(z.string()).optional(), address: text.optional(), googleMapsUrl: publicHttpsUrl.nullable().optional(), locationVerified: z.boolean().optional(), ticketPrice: text.optional(), ticketVerification: z.enum(["UNKNOWN", "VERIFIED", "DISPUTED"]).optional(), bestVisitTime: text.optional(), visitNotes: text.optional(), areas: z.array(z.object({ name: z.string(), kind: z.string() })), communities: z.array(z.object({ name: z.string() })).optional(), sources: z.array(z.object({ title: z.string(), url: publicHttpsUrl.nullable(), author: text, publisher: text, publishedOn: text })), media: z.array(z.object({ url: publicHttpsUrl, alt: z.string(), caption: text, author: text, sourceUrl: publicHttpsUrl.nullable(), isCover: z.boolean() })) }).strict();
export type PublicContentProfile = z.infer<typeof publicContentProfileSchema>;
export const publicProfileSelect = { contentRevision: true, shortDescription: true, areas: { select: { name: true, kind: true } }, sources: { where: { websiteRights: "APPROVED" as const }, orderBy: { position: "asc" as const }, select: { title: true, url: true, author: true, publisher: true, publishedOn: true } }, media: { where: { websiteRights: "APPROVED" as const }, orderBy: { position: "asc" as const }, select: { url: true, alt: true, caption: true, author: true, sourceUrl: true, isCover: true } } };
export const publicDestinationProfileSelect = { ...publicProfileSelect,
  media: { ...publicProfileSelect.media, where: destinationMediaWhere, select: { ...publicProfileSelect.media.select, websiteRights: true, storageReference: true } },
  aliases: true, address: true, googleMapsUrl: true, locationVerified: true, ticketPrice: true, ticketVerification: true, bestVisitTime: true, visitNotes: true };
export const publicCultureProfileSelect = { ...publicProfileSelect, category: true, geographicScope: true, communities: { select: { name: true } } };
export function publicProfileDto(row: unknown, kind: "destination" | "culture") {
    const r = row as Record<string, unknown>;
    if (typeof r.contentRevision !== "number")
        return {};
    const keys = kind === "destination" ? ["aliases", "address", "googleMapsUrl", "locationVerified", "ticketPrice", "ticketVerification", "bestVisitTime", "visitNotes"] : ["category", "geographicScope", "communities"];
    const media = kind === "destination" ? (r.media as Array<{ url: string; websiteRights: string; storageReference?: string | null }>)
      .filter(m => isDestinationMediaUsable(m, r.id as string))
      .map(({ websiteRights: _rights, storageReference: _reference, ...item }) => item) : r.media;
    return { profile: publicContentProfileSchema.parse({ shortDescription: r.shortDescription, areas: r.areas, sources: r.sources, media, ...Object.fromEntries(keys.map(k => [k, r[k]])) }) };
}
