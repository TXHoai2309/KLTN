import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { repairEditorialProposal, neutralEditorialTitles } from "./editorial-proposal-repair";
import { autoLayoutV2, getAllLayoutNodes, resolveEditorial, validateLayoutReferences } from "./editorial-engine";
import { evaluateLayoutQuality } from "./editorial-quality-gate";
import { buildCanonicalContentAst } from "./editorial-ast";
import { acceptedEditorialProposal } from "./editorial-proposal-result";
import { createEditorialAiDiagnostics, EditorialProposalError, editorialFallbackReason } from "./editorial-ai-diagnostics";
import { bacMeContext, bacMeCandidates } from "./__fixtures__/bac-me-v4";
import { khauVaiContext } from "./__fixtures__/khau-vai-v4";
import { EDITORIAL_V2_MAX_ROOT_SECTIONS, type EditorialLayoutV2, type EditorialNodeV2 } from "./editorial-contract";
import EditorialRenderer from "@/components/editorial/editorial-renderer";

const context = bacMeContext, base = autoLayoutV2(context);
const run = (candidate: unknown, current = base, ctx = context) => repairEditorialProposal(JSON.stringify(candidate), current, ctx);
const codes = (l: EditorialLayoutV2) => l.metadata?.repairs?.map(a => a.code) ?? [];
const nodes = (l: EditorialLayoutV2) => getAllLayoutNodes(l) as EditorialNodeV2[];
const assertIntact = (l: EditorialLayoutV2, ctx = context) => {
  expect(evaluateLayoutQuality(l, ctx).metrics.contentPreservationRatio).toBe(1);
  expect(() => validateLayoutReferences(l, ctx, true)).not.toThrow();
};

describe("repair then hard-validate V4", () => {
  it("accepts a sparse-source layout below the 12-root AI target without inventing content", () => {
    const sparseContext = { ...context, description: "Một điểm đến giữa núi non.", media: [], sources: [] };
    const sparseLayout = autoLayoutV2(sparseContext);
    expect(sparseLayout.sections.length).toBeLessThan(12);
    const repaired = run(sparseLayout, sparseLayout, sparseContext);
    expect(repaired.sections.length).toBeLessThan(12);
    expect(repaired.sections.flatMap(node => [node.title, node.text, ...(node.children ?? []).map(child => child.text ?? "")]).join(" ")).not.toMatch(/Dấu ấn lịch sử|Không gian văn hóa|Hành trình khám phá/);
    expect(acceptedEditorialProposal({ status: "PROPOSED", outcome: "PROPOSED_NEW", layout: repaired }, sparseLayout, sparseContext, "AUTO")).toEqual(repaired);
  });
  it.each(neutralEditorialTitles)("permits neutral editorial heading %s without inventing a claim", title => {
    const candidate = structuredClone(base); candidate.sections.push({ id: "neutral", type: "SECTION", title });
    expect(nodes(run(candidate)).some(n => n.title === title)).toBe(true);
  });
  it("replaces an unsupported factual heading by its canonical chapter title", () => {
    const candidate = bacMeCandidates(context)[0]!;
    const p = candidate.sections.flatMap(n => n.children ?? []).find(n => n.contentRef?.startsWith("ast-para-"))!;
    p.title = "Được xây dựng vào năm 1842 bởi người chưa xác minh";
    const result = run(candidate);
    expect(JSON.stringify(result.sections)).not.toContain("1842");
    expect(codes(result)).toContain("TITLE_NORMALIZED"); assertIntact(result);
  });
  it.each([context, khauVaiContext])("downgrades unsupported timeline and restores exact narrative for $name", ctx => {
    const b = autoLayoutV2(ctx), canonical = buildCanonicalContentAst(ctx).units.find(u => u.type === "PARAGRAPH")!;
    const candidate = { ...b, sections: [{ id: "event", type: "TIMELINE", contentRef: canonical.id, entries: [{ label: "1842", text: canonical.text, sourceIds: [] }, { label: "1888", text: "Một khẳng định lịch sử hoàn toàn bịa đặt.", sourceIds: [ctx.sources[0]!.id] }] }] };
    const result = run(candidate, b, ctx);
    expect(nodes(result).find(n => n.id === "event")?.type).toBe("SECTION");
    expect(nodes(result).every(n => !n.entries?.length)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/1842|1888|hoàn toàn bịa đặt/);
    assertIntact(result, ctx);
  });
  it("retains only reviewed event/source bindings, never assigns all sources to an event", () => {
    const b = structuredClone(base);
    b.sections.push({ id: "reviewed", type: "TIMELINE", entries: [{ label: "Đã biên tập", text: "Mục do Admin duyệt", sourceIds: [context.sources[0]!.id] }] });
    const result = run(b, b);
    expect(nodes(result).find(n => n.id === "reviewed")?.entries).toEqual(b.sections.at(-1)!.entries);
  });
  it("repairs the exact live entries path without logging event prose", () => {
    const candidate = structuredClone(base);
    candidate.sections[4] = { id: "bad-timeline", type: "TIMELINE", entries: [{ label: "Private fake date", text: "Private fabricated event", sourceIds: ["unknown"] }] };
    const result = run(candidate);
    expect(result.metadata?.repairs).toContainEqual({ code: "UNVERIFIED_EVENT_DOWNGRADED", nodePath: "sections.4.entries" });
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    createEditorialAiDiagnostics().repaired(result.metadata!.repairs!);
    expect(JSON.stringify(spy.mock.calls)).toContain("PROPOSAL_REPAIRED");
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Private|fabricated event/); spy.mockRestore();
    assertIntact(result);
  });
  it("removes foreign/rejected media, deduplicates owned media and preserves eligible originals", () => {
    const ctx = { ...context, media: [...context.media, { ...context.media[0]!, id: "rejected", websiteRights: "REJECTED" }] };
    const candidate = structuredClone(base);
    candidate.sections.push({ id: "photos", type: "GALLERY", mediaIds: [context.media[0]!.id, "rejected", "foreign", "https://attacker.test/photo"] });
    const result = run(candidate, base, ctx), ids = nodes(result).flatMap(n => n.mediaIds ?? []);
    expect(ids).not.toEqual(expect.arrayContaining(["foreign", "rejected", "https://attacker.test/photo"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(context.media.length); assertIntact(result, ctx);
  });
  it("removes invalid source/claim references and hydrates canonical source listings", () => {
    const candidate = structuredClone(base);
    candidate.sections[1]!.sourceIds = [context.sources[0]!.id, "foreign"];
    candidate.sections.find(n => n.type === "SOURCES")!.sourceIds = ["fabricated"];
    const result = run(candidate);
    expect(nodes(result).find(n => n.type === "SOURCES")?.sourceIds).toEqual(context.sources.map(s => s.id));
    expect(nodes(result).find(n => n.id === candidate.sections[1]!.id)?.sourceIds).toEqual([]);
    expect(codes(result)).toContain("SOURCE_REFERENCE_REMOVED"); assertIntact(result);
  });
  it("recovers contentRef only by exact canonical text, otherwise restores omitted AST units", () => {
    const candidate = structuredClone(base); candidate.sections[1]!.contentRef = "ast-typo";
    const recovered = run(candidate);
    expect(nodes(recovered).find(n => n.id === candidate.sections[1]!.id)?.contentRef).toBe("ast-intro");
    expect(codes(recovered)).toContain("CONTENT_REF_RECOVERED");
    candidate.sections = [{ id: "nothing", type: "PARAGRAPH", contentRef: "ast-fictional", text: "Một sự kiện hoàn toàn bịa đặt." }];
    const restored = run(candidate);
    expect(JSON.stringify(restored)).not.toContain("hoàn toàn bịa đặt");
    expect(codes(restored)).toEqual(expect.arrayContaining(["CONTENT_REF_REMOVED", "UNSOURCED_TEXT_REMOVED", "HERO_RESTORED", "CANONICAL_CONTENT_RESTORED"])); assertIntact(restored);
  });
  it("normalizes nullable/default fields, ratios, coordinates and duplicate IDs without using IDs as diversity", () => {
    const candidate: any = structuredClone(base);
    candidate.sections[1] = { ...candidate.sections[1], title: null, caption: null, children: null, columns: 100, focalX: -20, placement: "invalid", crop: "invalid", deck: "A fake unsupported deck" };
    candidate.sections[2].id = candidate.sections[1].id;
    candidate.design = { typography: null, rhythm: "BAD", palette: null, containerWidth: null };
    const result = run(candidate);
    expect(nodes(result).find(n => n.id === candidate.sections[1].id)).toMatchObject({ columns: 4, focalX: 0, crop: "original", deck: "" });
    expect(codes(result)).toEqual(expect.arrayContaining(["PRESENTATION_DEFAULT", "NULLABLE_DEFAULT", "DUPLICATE_ID_REPAIRED"])); assertIntact(result);
  });
  it("converts unrenderable roles locally while keeping their canonical copy, media and children", () => {
    const candidate = structuredClone(base);
    candidate.sections[1] = { ...candidate.sections[1], type: "FACTS", mediaIds: [context.media[1]!.id] };
    const result = run(candidate);
    expect(nodes(result).find(n => n.id === candidate.sections[1]!.id)?.type).toBe("SECTION");
    expect(codes(result)).toContain("PRIMITIVE_DOWNGRADED"); assertIntact(result);
  });
  it("deduplicates canonical prose while preserving missing content and all original manual/hidden subtrees", () => {
    const b = structuredClone(base);
    b.sections.push({ id: "manual", type: "SECTION", locked: true, title: "Tiêu đề biên tập riêng", text: "Văn bản được biên tập thủ công." }, { id: "hidden", type: "SECTION", hidden: true, text: "Không hiển thị lại" });
    const candidate = structuredClone(base); candidate.sections.push({ ...candidate.sections[1]!, id: "duplicate" });
    const result = run(candidate, b);
    expect(nodes(result).find(n => n.id === "manual")).toMatchObject(b.sections.at(-2)!);
    expect(nodes(result).find(n => n.id === "hidden")).toMatchObject(b.sections.at(-1)!);
    expect(nodes(result).filter(n => n.text === base.sections[1]!.text)).toHaveLength(1);
    assertIntact(result);
  });
  it("restores focal/composition locks and rejects an unsafe locked reference rather than changing it", () => {
    const b = structuredClone(base); b.hero = { composition: "EDITORIAL", locked: true, focalLocked: true };
    const result = run({ ...b, hero: { composition: "PANORAMA", locked: false }, sections: b.sections.map(n => n.type === "HERO" ? { ...n, mediaIds: [], focalX: 0 } : n) }, b);
    expect(result.hero).toEqual(b.hero); expect(nodes(result)[0]!.mediaIds).toEqual(b.sections[0]!.mediaIds);
    b.sections[0]!.locked = true; b.sections[0]!.mediaIds = ["foreign"];
    expect(() => run(base, b)).toThrow();
  });
  it.each(["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"])("hard-rejects executable content %s", text => {
    expect(() => run({ ...base, sections: [{ id: "injected", type: "PARAGRAPH", text }] })).toThrow();
  });
  it("rejects unknown keys, invalid JSON and bounded-tree overflow", () => {
    expect(() => run({ ...base, css: "body{}" })).toThrow();
    expect(() => repairEditorialProposal("broken", base, context)).toThrow();
    expect(() => run({ ...base, sections: Array.from({ length: EDITORIAL_V2_MAX_ROOT_SECTIONS + 1 }, (_, i) => ({ id: `x-${i}`, type: "SECTION" })) })).toThrow();
  });
  it("never promotes a partial legend excerpt to historical prose", () => {
    const b = autoLayoutV2(khauVaiContext);
    const result = run({ ...b, sections: [{ id: "fake-excerpt", type: "PARAGRAPH", text: "một câu chuyện tình được lưu truyền" }] }, b, khauVaiContext);
    expect(nodes(result).find(n => n.id === "fake-excerpt")).toBeUndefined();
    expect(JSON.stringify(result)).toContain("không phải sự kiện lịch sử đã được xác minh");
    assertIntact(result, khauVaiContext);
  });
  it("keeps more than ten eligible sources in bounded listings, without assigning any to a claim", () => {
    const ctx = { ...context, sources: Array.from({ length: 23 }, (_, i) => ({ ...context.sources[0]!, id: `source-${i}` })) };
    const b = autoLayoutV2(ctx), result = run(b, b, ctx);
    const listings = nodes(result).filter(n => n.type === "SOURCES");
    expect(listings.every(n => n.sourceIds!.length <= 10)).toBe(true);
    expect(new Set(listings.flatMap(n => n.sourceIds!)).size).toBe(23);
    assertIntact(result, ctx);
  });
  it("compacts restoration when a candidate nearly fills the bounded node budget", () => {
    const candidate = { ...base, sections: [{ id: "root", type: "SECTION", children: Array.from({ length: 5 }, (_, i) => ({ id: `group-${i}`, type: "SECTION", children: Array.from({ length: 8 }, (_, j) => ({ id: `caption-${i}-${j}`, type: "PARAGRAPH", title: neutralEditorialTitles[j % 5] })) })) }] };
    const result = run(candidate);
    expect(getAllLayoutNodes(result).length).toBeLessThanOrEqual(50);
    assertIntact(result);
  });
  it("rejects an AI proposal with more than 50 raw nodes before repair", () => {
    const current = structuredClone(base);
    current.design!.palette = current.design!.palette === "FOREST" ? "SLATE" : "FOREST";
    current.sections[1]!.locked = true;
    const before = structuredClone(current);
    const candidate: any = structuredClone(current);
    // Build exactly 51 raw nodes while keeping each parent within its 10-child bound.
    candidate.sections = Array.from({ length: 5 }, (_, i) => ({
      id: `overflow-root-${i}`,
      type: "SECTION",
      children: Array.from({ length: i === 4 ? 6 : 10 }, (_, j) => ({
          id: `overflow-node-${i}-${j}`,
          type: "PARAGRAPH",
          title: neutralEditorialTitles[j % 5],
          text: "",
          mediaIds: [],
          sourceIds: [],
          children: [],
      })),
    }));
    let failure: unknown;
    try { run(candidate, current); } catch (error) { failure = error; }
    expect(failure).toEqual(expect.objectContaining({
      validationCode: "SCHEMA",
      referenceDetails: expect.objectContaining({ issueCode: "NODE_LIMIT" }),
    }));
    expect((failure as EditorialProposalError).referenceDetails?.limitCounts).toMatchObject({
      expectedRootSections: 50,
      actualRootSections: 5,
      expectedTotalNodes: 50,
      actualTotalNodes: 51,
    });
    expect(editorialFallbackReason(failure as EditorialProposalError, "test-correlation")).toContain("50 node toàn cây");
    expect(acceptedEditorialProposal({ status: "FALLBACK", layout: current }, current, context, "AUTO")).toBeNull();
    expect(current).toEqual(before);
  });
  it("reports root-section overflow separately from whole-tree overflow", () => {
    const candidate = { ...base, sections: Array.from({ length: 51 }, (_, index) => ({ id: `root-${index}`, type: "SECTION", text: "", children: [] })) };
    let failure: unknown;
    try { run(candidate); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ referenceDetails: { issueCode: "SECTION_LIMIT" } });
    expect((failure as EditorialProposalError).referenceDetails?.limitCounts).toMatchObject({
      expectedRootSections: 50,
      actualRootSections: 51,
      expectedTotalNodes: 50,
      actualTotalNodes: 51,
    });
    const reason = editorialFallbackReason(failure as EditorialProposalError, "test-correlation");
    expect(reason).toContain("50 root node");
    expect(reason).toContain("test-correlation");
  });
  it("keeps explicit canonical hide intent intact when 100% visible preservation is impossible", () => {
    const b = structuredClone(base); b.sections[1]!.hidden = true;
    expect(() => run(base, b)).toThrow();
    expect(b.sections[1]!.hidden).toBe(true);
  });
  it("does not let AI impersonate a manual lock or hide canonical content", () => {
    const candidate = structuredClone(base); candidate.sections[1]!.locked = true; candidate.sections[1]!.hidden = true;
    const result = run(candidate);
    expect(nodes(result).find(n => n.id === candidate.sections[1]!.id)).toMatchObject({ locked: false, hidden: false });
    expect(codes(result)).toEqual(expect.arrayContaining(["AI_LOCK_REMOVED", "AI_HIDDEN_REMOVED"]));
    assertIntact(result);
  });
  it("deduplicates a referenced paragraph already included in an existing multi-paragraph section", () => {
    const candidate = structuredClone(base);
    const group = candidate.sections.find(n => n.text?.includes("\n\n"))!;
    expect(group).toBeDefined();
    const unit = buildCanonicalContentAst(context).units.find(u => u.type === "PARAGRAPH" && group.text!.includes(u.text))!;
    candidate.sections.push({ id: "repeated-ref", type: "PARAGRAPH", contentRef: unit.id });
    const result = run(candidate);
    expect(nodes(result).find(n => n.id === "repeated-ref")).toBeUndefined();
    assertIntact(result);
  });
  it("restores an omitted Hero even when its previous image and ID are reused elsewhere", () => {
    const result = run({ ...base, sections: [{ id: "hero", type: "GALLERY", mediaIds: context.media.map(m => m.id) }] });
    expect(result.sections[0]!.type).toBe("HERO");
    const ids = nodes(result).flatMap(n => n.mediaIds ?? []);
    expect(new Set(ids).size).toBe(ids.length); assertIntact(result);
  });
  it("removes stale heading provenance locally when changing to a neutral heading", () => {
    const candidate = structuredClone(base);
    const node = candidate.sections.find(n => n.headingProvenance)!;
    expect(node).toBeDefined(); node.title = "Hành trình khám phá";
    const result = run(candidate);
    expect(codes(result)).toContain("HEADING_REFERENCE_REMOVED"); assertIntact(result);
  });
  it("does not turn a source listing into evidence for canonical prose when downgrading its role", () => {
    const candidate = structuredClone(base);
    candidate.sections.push({ id: "bad-source-role", type: "SOURCES", contentRef: "ast-intro" });
    // Let this node own the intro so its wrong role is actually repaired.
    candidate.sections = candidate.sections.filter(n => n.id !== "intro");
    const result = run(candidate);
    expect(nodes(result).find(n => n.id === "bad-source-role")?.sourceIds).toEqual([]);
    assertIntact(result);
  });
  it.each([context, khauVaiContext])("renders every repaired canonical unit for $name without requiring a timeline", ctx => {
    const b = autoLayoutV2(ctx), candidate = { ...b, sections: [{ id: "opening", type: "HERO", title: ctx.name }, { id: "legend", type: "TIMELINE", entries: [{ label: "1777", text: "Truyền thuyết được khẳng định sai là lịch sử.", sourceIds: ctx.sources.map(s => s.id) }] }] };
    const result = run(candidate, b, ctx);
    const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: ctx, editorial: resolveEditorial(result, ctx)! }));
    expect(html).not.toContain("1777"); expect(html).not.toContain("emg-timeline");
    const rendered = exact(html.replace(/<[^>]*>/g, " "));
    for (const unit of buildCanonicalContentAst(ctx).units.filter(u => u.provenance.sourceField === "description")) expect(rendered).toContain(exact(unit.text));
    expect(acceptedEditorialProposal({ status: "PROPOSED", outcome: "ALTERNATIVE_MINOR", layout: result }, b, ctx, "AUTO", "ALTERNATIVE")).not.toBeNull();
  });
});

function exact(s: string) { return s.normalize("NFC").replace(/\s+/g, " ").trim(); }
