import { describe, expect, it } from "vitest";
import { autoLayout, resolveEditorial } from "./editorial-engine";
import { validateAiProposal } from "./editorial-ai";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { editorialLayoutSchema, editorialProposalInputSchema, typeStyles, colorStyles, rhythms } from "./editorial-contract";

const context = editorialFixture();
const base = { ...autoLayout(context), family: "VILLAGE_CULTURE" as const, variant: "EDITORIAL" as const };
const proposal = () => ({ family: base.family, variant: base.variant, design: { typography: "MODERN", palette: "SLATE", rhythm: "COMPACT" }, blocks: base.blocks.map(b => ({ id: b.id, mediaIds: b.mediaIds, title: b.title, placement: b.placement, crop: "wide", gallery: "grid" })) });

describe("Editorial art direction without executable styling", () => {
  it("keeps all old v1 layouts valid without adding design fields on read", () => {
    expect(editorialLayoutSchema.parse(base)).toEqual(base);
    expect(editorialProposalInputSchema.parse({ layout: base }).direction).toBe("KEEP");
  });
  it("allows each supported typography, palette and rhythm through draft/public resolution", () => {
    for (const typography of typeStyles) for (const palette of colorStyles) for (const rhythm of rhythms) {
      const layout = editorialLayoutSchema.parse({ ...base, design: { typography, palette, rhythm } });
      expect(resolveEditorial(layout, context)?.layout.design).toEqual(layout.design);
    }
  });
  it("accepts AI design, crop and gallery choices while preserving all prose, IDs and source citations", () => {
    const before = structuredClone(context), next = validateAiProposal(JSON.stringify(proposal()), base, context, "KEEP");
    expect(next.design).toEqual(proposal().design);
    expect(next.blocks.map(b => b.id)).toEqual(base.blocks.map(b => b.id));
    expect(next.blocks.map(b => [b.text, b.caption, b.sourceIds, b.hidden, b.entries, b.focalX, b.focalY])).toEqual(base.blocks.map(b => [b.text, b.caption, b.sourceIds, b.hidden, b.entries, b.focalX, b.focalY]));
    expect(context).toEqual(before);
  });
  it("enforces the selected family and variant on the server, not just in the prompt", () => {
    const changed = { ...proposal(), family: "JOURNEY_EDITORIAL", variant: "SPLIT" };
    expect(() => validateAiProposal(JSON.stringify(changed), base, context, "KEEP")).toThrow();
    expect(validateAiProposal(JSON.stringify(changed), base, context, "AUTO")).toMatchObject({ family: "JOURNEY_EDITORIAL", variant: "SPLIT" });
  });
  it.each([{ typography: "url(https://evil.example/font)" }, { css: "body{display:none}" }, { palette: "#fff" }])("rejects untrusted/executable design %j", override => {
    const raw = { ...proposal(), design: { ...proposal().design, ...override } };
    expect(() => validateAiProposal(JSON.stringify(raw), base, context)).toThrow();
    expect(editorialLayoutSchema.safeParse({ ...base, design: raw.design }).success).toBe(false);
  });
  it("deterministic reflow retains the Admin's family, variant and manually tuned design", () => {
    const seed = validateAiProposal(JSON.stringify(proposal()), base, context, "KEEP");
    expect(autoLayout(context, seed)).toMatchObject({ family: seed.family, variant: seed.variant, design: seed.design });
  });
  it("rejects foreign/revoked media even with valid art direction", () => {
    for (const id of ["foreign", "photo-0"]) {
      const current = structuredClone(context); current.media[0]!.websiteRights = "REJECTED";
      const bad = proposal(); bad.blocks[0]!.mediaIds = [id];
      expect(() => validateAiProposal(JSON.stringify(bad), base, current, "KEEP")).toThrow();
    }
  });
});
