import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { autoLayout, resolveEditorial } from "./editorial-engine";
import { editorialLayoutSchema, type EditorialLayout, type EditorialLayoutV1 } from "./editorial-contract";
import { editorialHeroPlan, heroDeck, heroFocalLocked, preservesHeroLocks } from "./editorial-hero";
import { validateAiProposal } from "./editorial-ai";
import { acceptedEditorialProposal } from "./editorial-proposal-result";
import { compareLayoutSignatures, getLayoutSignature } from "./editorial-signature";
import EditorialPhoto from "@/components/editorial/editorial-photo";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));

function proposal(base: EditorialLayoutV1, composition = base.variant) {
  return { family: base.family, variant: base.variant, heroComposition: composition, blocks: base.blocks.map(b => ({ id: b.id, mediaIds: b.mediaIds, placement: b.placement, focalX: b.focalX, focalY: b.focalY, crop: b.crop })) };
}
describe("Premium Hero safety and backward compatibility", () => {
  it("keeps old V1 JSON and maps every saved variant without rewriting it", () => {
    const c = editorialFixture(), base = autoLayout(c), image = resolveEditorial(base, c)!.media[0]!;
    for (const variant of ["PANORAMA", "SPLIT", "EDITORIAL"] as const) {
      const old = { ...base, variant };
      const before = JSON.stringify(old);
      expect(editorialLayoutSchema.parse(old)).not.toHaveProperty("hero");
      expect(editorialHeroPlan(old, image).composition).toBe(variant);
      expect(JSON.stringify(old)).toBe(before);
    }
  });
  it("adapts small and portrait originals without changing the saved choice", () => {
    const c = editorialFixture(), base = autoLayout(c), image = resolveEditorial(base, c)!.media[0]!;
    base.hero = { composition: "PANORAMA", locked: true };
    expect(editorialHeroPlan(base, { ...image, width: 565, height: 353 })).toMatchObject({ requested: "PANORAMA", composition: "EDITORIAL", limited: true });
    expect(editorialHeroPlan(base, { ...image, width: 1400, height: 1900 }).composition).toBe("SPLIT");
    expect(base.hero).toEqual({ composition: "PANORAMA", locked: true });
    expect(editorialHeroPlan(base).composition).toBe("EDITORIAL");
  });
  it("does not invent dimensions for unknown images and warns without assuming quality", () => {
    const c = editorialFixture(), base = autoLayout(c), image = resolveEditorial(base, c)!.media[0]!;
    expect(editorialHeroPlan(base, { ...image, width: undefined, height: undefined })).toMatchObject({ reason: "UNKNOWN_RESOLUTION", composition: "EDITORIAL" });
  });
  it("limits rendered Hero to source width, retains original crop and focal point", () => {
    const c = editorialFixture(), base = autoLayout(c), image = { ...resolveEditorial(base, c)!.media[0]!, width: 400, height: 250 };
    const html = renderToStaticMarkup(React.createElement(EditorialPhoto, { media: image, block: { ...base.blocks[0]!, crop: "original", focalX: 24, focalY: 68 }, priority: true }));
    expect(html).toContain("max-width:400px"); expect(html).toContain("object-position:24% 68%"); expect(html).toContain("emg-crop-original"); expect(html).toContain('fetchPriority="high"');
  });
  it("hides long, repeated or lead-derived decks while preserving input", () => {
    const block = autoLayout(editorialFixture()).blocks[0]!;
    expect(heroDeck({ ...block, deck: "Hà Giang" }, "Nho Quế", "Hà Giang", "Hà Giang")).toBe("");
    expect(heroDeck({ ...block, deck: "Dòng dẫn trong nội dung" }, "Nho Quế", "Hà Giang", "Hà Giang", "Dòng dẫn trong nội dung đã có ở lời dẫn.")).toBe("");
    expect(heroDeck({ ...block, deck: "x".repeat(131) }, "Nho Quế", "", "")).toBe("");
    expect(heroDeck({ ...block, deck: "Những triền núi mở ra trong sương sớm" }, "Nho Quế", "", "")).toBe("Những triền núi mở ra trong sương sớm");
  });
  it("retains a legacy 131–180 character Hero paragraph below the opening instead of losing it", () => {
    const c = editorialFixture(), base = autoLayout(c);
    const text = "Đây là đoạn văn biên tập đã lưu trong phần mở đầu, cần được giữ đầy đủ khi vượt giới hạn dòng dẫn ngắn. Nội dung gốc vẫn còn nguyên vẹn.";
    expect(text.length).toBeGreaterThan(130); expect(text.length).toBeLessThanOrEqual(180);
    base.blocks[0]!.text = text;
    const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: c, editorial: resolveEditorial(base, c)! }));
    expect(html.split(text)).toHaveLength(2);
    expect(html).not.toContain('class="emg-deck"');
  });
  it("server and client reject AI overriding a composition lock in AUTO", () => {
    const c = editorialFixture(), base = autoLayout(c);
    base.hero = { composition: "SPLIT", locked: true };
    expect(() => validateAiProposal(JSON.stringify(proposal(base, "EDITORIAL")), base, c, "AUTO")).toThrow();
    const next = { ...base, hero: { composition: "EDITORIAL" as const, locked: false } };
    expect(acceptedEditorialProposal({ status: "PROPOSED", layout: next }, base, c, "AUTO")).toBeNull();
  });
  it("AI can choose a distinct Hero while keeping family and article variant", () => {
    const c = editorialFixture(), base = autoLayout(c);
    const next = validateAiProposal(JSON.stringify(proposal(base, "EDITORIAL")), base, c, "KEEP");
    expect(next.variant).toBe(base.variant); expect(next.family).toBe(base.family); expect(next.hero?.composition).toBe("EDITORIAL");
    expect(compareLayoutSignatures(getLayoutSignature(base), getLayoutSignature(next)).level).toBe("SIGNIFICANT");
    expect(acceptedEditorialProposal({ status: "PROPOSED", layout: next }, base, c, "KEEP", "ALTERNATIVE")).toEqual(next);
  });
  it("preserves manual and legacy focal/crop/media, with explicit unlock available", () => {
    const c = editorialFixture(), base = autoLayout(c);
    base.blocks[0]!.focalX = 24;
    expect(heroFocalLocked(base)).toBe(true);
    const raw = proposal(base); raw.blocks[0]!.focalX = 65;
    expect(() => validateAiProposal(JSON.stringify(raw), base, c)).toThrow();
    const next = structuredClone(base); next.blocks[0]!.crop = "portrait";
    expect(preservesHeroLocks(base, next)).toBe(false);
    base.hero = { composition: base.variant, locked: false, focalLocked: false };
    expect(heroFocalLocked(base)).toBe(false);
    expect(validateAiProposal(JSON.stringify(raw), base, c).blocks[0]!.focalX).toBe(65);
  });
  it("does not accept a newly chosen cinematic Hero with inadequate dimensions", () => {
    const c = editorialFixture(), base = autoLayout(c);
    base.variant = "EDITORIAL";
    c.media[0]!.storageReference = JSON.stringify({ ...JSON.parse(c.media[0]!.storageReference!), width: 400, height: 250 });
    expect(() => validateAiProposal(JSON.stringify(proposal(base, "PANORAMA")), base, c)).toThrow();
    expect(validateAiProposal(JSON.stringify(proposal(base, "EDITORIAL")), base, c).hero?.composition).toBe("EDITORIAL");
  });
  it("rejects REJECTED/foreign Hero references without leaking or duplicating media", () => {
    const c = editorialFixture(), base = autoLayout(c), raw = proposal(base);
    raw.blocks[0]!.mediaIds = ["another-destination-image"];
    expect(() => validateAiProposal(JSON.stringify(raw), base, c)).toThrow();
    c.media[0]!.websiteRights = "REJECTED"; raw.blocks[0]!.mediaIds = [c.media[0]!.id];
    expect(() => validateAiProposal(JSON.stringify(raw), base, c)).toThrow();
    expect(resolveEditorial(base, c)!.media.some(m => m.id === c.media[0]!.id)).toBe(false);
  });
  it("regeneration preserves manual Hero settings and optional fields", () => {
    const c = editorialFixture(), base = autoLayout(c);
    base.hero = { composition: "EDITORIAL", locked: true, focalLocked: true };
    base.blocks[0]!.focalY = 68;
    const next = autoLayout(c, base);
    expect(next.hero).toEqual(base.hero); expect(next.blocks[0]!.focalY).toBe(68);
    expect(preservesHeroLocks(base, next)).toBe(true);
  });
});
