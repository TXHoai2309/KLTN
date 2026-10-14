import { canonicalCultureCategory } from "../culture/culture-categories";
import { z } from "zod";
const optionalText = (max: number) => z.string().max(max).transform(v => v.normalize("NFC").trim() || null).nullable().default(null);
export const referenceId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u);
export const publicHttpsUrl = z.string().max(2000).refine(value => {
    try {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password && !/[\u0000-\u0020\u007f]/u.test(value) && u.hostname.includes(".") && !u.hostname.includes("..") && !/^[\d.]+$|[:]|(^|\.)(localhost|local|internal)\.?$/iu.test(u.hostname);
    }
    catch {
        return false;
    }
}, "Cần URL HTTPS công khai, không chứa thông tin đăng nhập.");
const optionalUrl = publicHttpsUrl.nullable().default(null);
export const rightsStatus = z.enum(["UNKNOWN", "APPROVED", "REJECTED"]);
export const sourceSchema = z.object({ title: z.string().trim().min(1).max(300), url: optionalUrl, author: optionalText(200), publisher: optionalText(200), publishedOn: z.iso.date().nullable().default(null), claim: optionalText(2000), websiteRights: rightsStatus.default("UNKNOWN"), indexingRights: rightsStatus.default("UNKNOWN"), openAiRights: rightsStatus.default("UNKNOWN"), rightsEvidence: optionalText(2000) }).strict().superRefine((s, ctx) => { if ([s.websiteRights, s.indexingRights, s.openAiRights].includes("APPROVED") && !s.rightsEvidence)
    ctx.addIssue({ code: "custom", path: ["rightsEvidence"], message: "Quyền đã duyệt cần bằng chứng/quyết định duyệt." }); });
export const mediaSchema = z.object({ url: publicHttpsUrl, storageReference: optionalText(500), alt: z.string().trim().min(1).max(300), caption: optionalText(1000), author: optionalText(200), sourceUrl: optionalUrl, websiteRights: rightsStatus.default("UNKNOWN"), rightsEvidence: optionalText(2000), isCover: z.boolean().default(false) }).strict().superRefine((m, ctx) => { if (m.websiteRights === "APPROVED" && !m.rightsEvidence)
    ctx.addIssue({ code: "custom", path: ["rightsEvidence"], message: "Ảnh đã duyệt cần bằng chứng quyền sử dụng." }); });
const refs = z.array(referenceId).max(30).transform(ids => [...new Set(ids)].sort()).default([]);
const shared = { areaIds: refs, sources: z.array(sourceSchema).max(30).default([]), media: z.array(mediaSchema).max(20).default([]) };
const coverCheck = (p: {
    media: {
        isCover: boolean;
    }[];
}, ctx: z.RefinementCtx) => { if (p.media.filter(m => m.isCover).length > 1)
    ctx.addIssue({ code: "custom", path: ["media"], message: "Chỉ chọn một ảnh đại diện." }); };
export const destinationProfileSchema = z.object({ ...shared, sources: z.array(sourceSchema.safeExtend({ id: referenceId.optional() })).max(30).default([]), media: z.array(mediaSchema.safeExtend({ id: referenceId.optional() })).max(20).default([]), aliases: z.array(z.string().trim().min(1).max(200)).max(20).default([]), shortDescription: optionalText(1000), address: optionalText(1000), googleMapsUrl: optionalUrl.refine(v => v === null || ["google.com", "www.google.com", "maps.google.com", "google.com.vn", "www.google.com.vn", "maps.google.com.vn", "maps.app.goo.gl", "goo.gl"].includes(new URL(v).hostname), "Cần URL Google Maps hợp lệ."), locationVerified: z.boolean().default(false), locationEvidence: optionalText(2000), ticketPrice: optionalText(300), ticketVerification: z.enum(["UNKNOWN", "VERIFIED", "DISPUTED"]).default("UNKNOWN"), ticketEvidence: optionalText(2000), bestVisitTime: optionalText(2000), visitNotes: optionalText(4000), cultureIds: refs }).strict().superRefine((p, ctx) => { coverCheck(p, ctx); if (p.locationVerified && !p.locationEvidence)
    ctx.addIssue({ code: "custom", path: ["locationEvidence"], message: "Vị trí xác minh cần bằng chứng bản đồ." }); if (p.ticketVerification === "VERIFIED" && (!p.ticketPrice || !p.ticketEvidence))
    ctx.addIssue({ code: "custom", path: ["ticketEvidence"], message: "Giá vé xác minh cần giá và nguồn/bằng chứng." }); });
export const cultureProfileSchema = z.object({ ...shared, category: optionalText(200).transform(canonicalCultureCategory), shortDescription: optionalText(1000), geographicScope: optionalText(2000), communityIds: refs }).strict().superRefine(coverCheck);
export type DestinationProfile = z.infer<typeof destinationProfileSchema>;
export type CultureProfile = z.infer<typeof cultureProfileSchema>;
export type ContentSourceInput = z.infer<typeof sourceSchema>;
export type ContentMediaInput = z.infer<typeof mediaSchema>;
export const taxonomyInputSchema = z.object({ type: z.enum(["AREA", "COMMUNITY"]), name: z.string().trim().min(1).max(200).transform(v => v.normalize("NFC").replace(/\s+/gu, " ")), kind: z.enum(["LOCALITY", "REGION"]).optional() }).strict();
