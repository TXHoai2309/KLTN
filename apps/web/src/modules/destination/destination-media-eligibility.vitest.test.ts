import { describe, it, expect } from "vitest";
import { ADMIN_IMAGE_USE, defaultDestinationImageAlt, isDestinationMediaUsable, withoutWebsiteUse } from "./destination-media-eligibility";
import { autoLayout, resolveEditorial, usableEditorialMedia, validateLayoutReferences } from "../destination-editorial/editorial-engine";
import { editorialFixture } from "../destination-editorial/__fixtures__/editorial-fixture";

const reference = { provider: "cloudinary", cloud: "fixture", assetId: "asset", publicId: "photo", version: 1, format: "jpg", websiteUse: ADMIN_IMAGE_USE, destinationId: "destination" };
const media = { url: "https://res.cloudinary.com/fixture/image/upload/v1/photo.jpg", websiteRights: "UNKNOWN", storageReference: JSON.stringify(reference) };
describe("Destination application-use eligibility is separate from legal rights", () => {
  it("admits only verified server-tagged uploads or existing APPROVED media", () => {
    expect(isDestinationMediaUsable(media, "destination")).toBe(true);
    expect(isDestinationMediaUsable({ ...media, storageReference: withoutWebsiteUse(media.storageReference) }, "destination")).toBe(false);
    expect(isDestinationMediaUsable({ ...media, storageReference: null }, "destination")).toBe(false);
    expect(isDestinationMediaUsable({ ...media, websiteRights: "APPROVED", storageReference: null }, "destination")).toBe(true);
  });
  it("blocks REJECTED, foreign owner, changed URL and malformed metadata", () => {
    expect(isDestinationMediaUsable({ ...media, websiteRights: "REJECTED" }, "destination")).toBe(false);
    expect(isDestinationMediaUsable(media, "other")).toBe(false);
    expect(isDestinationMediaUsable({ ...media, url: "https://example.org/foreign.jpg" }, "destination")).toBe(false);
    expect(isDestinationMediaUsable({ ...media, storageReference: "invalid" }, "destination")).toBe(false);
  });
  it("removes application-use capability without discarding asset metadata or altering legacy bytes", () => {
    expect(JSON.parse(withoutWebsiteUse(media.storageReference)!)).toEqual({ provider: "cloudinary", cloud: "fixture", assetId: "asset", publicId: "photo", version: 1, format: "jpg" });
    expect(withoutWebsiteUse(" legacy opaque reference ")).toBe(" legacy opaque reference ");
    expect(withoutWebsiteUse(null)).toBeNull();
  });
  it("derives bounded alt from Destination name, not the filename", () => {
    expect(defaultDestinationImageAlt("Cao nguyên đá Đồng Văn")).toBe("Hình ảnh Cao nguyên đá Đồng Văn");
    expect(defaultDestinationImageAlt("a".repeat(400))).toHaveLength(300);
  });
  it("editorial auto-layout/publish/resolve share upload eligibility and strip revoked or foreign images", () => {
    const context = editorialFixture(undefined, 0);
    const photo = { id: "new-photo", alt: "Hình ảnh điểm đến", caption: null, author: null, sourceUrl: null, isCover: true, ...media,
      storageReference: JSON.stringify({ ...reference, destinationId: context.id }) };
    context.media = [photo, { ...photo, id: "rejected", websiteRights: "REJECTED" }, { ...photo, id: "legacy", storageReference: withoutWebsiteUse(photo.storageReference) }];
    const before = structuredClone(context);
    expect(usableEditorialMedia(context).map(m => m.id)).toEqual(["new-photo"]);
    const layout = autoLayout(context);
    expect(layout.blocks.flatMap(b => b.mediaIds)).toEqual(["new-photo"]);
    expect(() => validateLayoutReferences(layout, context, true)).not.toThrow();
    expect(resolveEditorial(layout, context)?.media.map(m => m.id)).toEqual(["new-photo"]);
    expect(context).toEqual(before);
    context.media[0]!.websiteRights = "REJECTED";
    expect(resolveEditorial(layout, context)?.media).toEqual([]);
    expect(() => validateLayoutReferences(layout, context, true)).toThrow();
  });
});
