import type { Prisma } from "@KLTN/db";
import { publicHttpsUrl } from "../content-profile/content-profile-contract";

// Application-use provenance, not a legal rights approval. Only upload finalization
// may mint this marker; generic profile writes strip client-supplied markers.
export const ADMIN_IMAGE_USE = "ADMIN_UPLOAD_V1";
export const destinationMediaWhere = {
  OR: [
    { websiteRights: "APPROVED" },
    { websiteRights: "UNKNOWN", destinationId: { not: null }, cultureId: null,
      storageReference: { contains: `"websiteUse":"${ADMIN_IMAGE_USE}"` } },
  ],
} satisfies Prisma.ContentMediaWhereInput;

type Media = { url: string; websiteRights: string; storageReference?: string | null };
export function isDestinationMediaUsable(media: Media, destinationId: string): boolean {
  if (!publicHttpsUrl.safeParse(media.url).success) return false;
  if (media.websiteRights === "APPROVED") return true;
  if (media.websiteRights !== "UNKNOWN") return false;
  try {
    const r = JSON.parse(media.storageReference ?? "null");
    return r?.websiteUse === ADMIN_IMAGE_USE && r.destinationId === destinationId &&
      r.provider === "cloudinary" && typeof r.cloud === "string" && /^[\w-]+$/.test(r.cloud) &&
      typeof r.assetId === "string" && Boolean(r.assetId) && typeof r.publicId === "string" && Boolean(r.publicId) &&
      Number.isSafeInteger(r.version) && r.version >= 1 &&
      media.url === `https://res.cloudinary.com/${r.cloud}/image/upload/v${r.version}/${r.publicId}.${r.format}`;
  } catch { return false; }
}

/** Preserve all legacy metadata while removing only our server-owned capability. */
export function withoutWebsiteUse(reference: string | null | undefined) {
  try {
    const parsed = JSON.parse(reference ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "websiteUse" in parsed) {
      delete parsed.websiteUse; delete parsed.destinationId;
      return JSON.stringify(parsed);
    }
  } catch { /* Unrelated legacy references are retained byte-for-byte. */ }
  return reference;
}

export function defaultDestinationImageAlt(name: string) {
  return `Hình ảnh ${name.trim() || "điểm đến"}`.slice(0, 300);
}
