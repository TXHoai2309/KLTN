import { afterEach, describe, expect, it, vi } from "vitest";
import Ajv from "ajv";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));
import { autoLayoutV1, autoLayoutV2, getAllLayoutNodes, resolveEditorial } from "./editorial-engine";
import { buildCanonicalContentAst } from "./editorial-ast";
import { compileEditorialLayout } from "./editorial-compiler";
import { createV2JsonSchema, proposeEditorial, validateAiProposalV2 } from "./editorial-ai";
import { createEditorialAiDiagnostics, EditorialProposalError } from "./editorial-ai-diagnostics";
import { editorialLayoutV2Schema, type EditorialLayoutV2, type EditorialNodeV2 } from "./editorial-contract";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { compareLayoutSignatures, getLayoutSignature } from "./editorial-signature";
import { evaluateLayoutQuality } from "./editorial-quality-gate";
import { acceptedEditorialProposal } from "./editorial-proposal-result";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { readEditorialContext, readPublicEditorial, writeEditorial } from "./editorial-service";
import { createHash } from "node:crypto";

const context = editorialFixture("di tích lịch sử", 5);
const base = autoLayoutV2(context);
const ast = buildCanonicalContentAst(context);
const schema = createV2JsonSchema("AUTO", base, ast, context);
const ajv = new Ajv({ strict: false });
const wireCheck = ajv.compile(schema);

// Materialize exactly the advertised wire properties, including nullable fields
// and depth-three leaves. AJV validates the real schema independently of Zod.
function wire(layout: EditorialLayoutV2) {
  const node = (n: EditorialNodeV2, nodeSchema: any): any => Object.fromEntries(Object.entries(nodeSchema.properties).map(([key, rule]: [string, any]) => {
    if (key === "children") return [key, (n.children ?? []).map(child => node(child, rule.items))];
    const value = (n as any)[key];
    return [key, value ?? (rule.anyOf ? null : rule.type === "array" ? [] : rule.type === "boolean" ? false : rule.type === "number" ? 50 : rule.enum?.[0] ?? "")];
  }));
  return { schemaVersion: 2, mode: "GENERATIVE", family: layout.family, variant: layout.variant,
    hero: { composition: layout.hero?.composition ?? "EDITORIAL", locked: layout.hero?.locked ?? false },
    design: layout.design, sections: layout.sections.map(n => node(n, schema.properties.sections.items)),
  };
}
function failure(layout: unknown) {
  try { validateAiProposalV2(JSON.stringify(layout), base, context); } catch (error) { return error as EditorialProposalError; }
  throw new Error("Expected validation failure");
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("V4.2 wire/runtime regressions", () => {
  it("never generates or renders the retired preparation panel, even from existing V2 data", () => {
    expect(getAllLayoutNodes(base).some(node => node.type === "VISIT_INFORMATION")).toBe(false);
    expect(schema.properties.sections.items.properties.type.enum).not.toContain("VISIT_INFORMATION");
    const saved: EditorialLayoutV2 = { ...base, sections: [...base.sections, { id: "old-visit", type: "VISIT_INFORMATION", title: "Chuẩn bị cho chuyến đi" }] };
    const before = structuredClone(saved);
    const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolveEditorial(saved, context)! }));
    expect(html).not.toContain("Chuẩn bị cho chuyến đi");
    expect(html).not.toContain("emg-visit");
    expect(saved).toEqual(before);
  });

  it("blocks unsourced titles at every wire depth, retaining the live HYDRATION rejection as defense in depth", () => {
    const candidate = wire(base);
    const invalid = "Một chương lịch sử chưa có trong nội dung nguồn";
    candidate.sections[2] = { ...candidate.sections[2], children: Array.from({ length: 5 }, (_, index) => ({
      ...candidate.sections[1], id: `title-regression-${index}`, mediaIds: [], sourceIds: [], children: [],
    })) };
    candidate.sections[2].children[4].title = invalid;
    // Reproduce the safe path from the Owner's log, without claiming to know its raw title.
    expect(failure(candidate)).toMatchObject({ validationCode: "TITLE_PROVENANCE", fieldPath: "sections.2.children.4.title",
      referenceDetails: { validationStage: "HYDRATION", issueCode: "UNSOURCED_CONTENT" } });
    expect(wireCheck(candidate)).toBe(false);
    expect(wireCheck.errors).toEqual(expect.arrayContaining([expect.objectContaining({ instancePath: "/sections/2/children/4/title", keyword: "enum" })]));
    for (const shape of [schema.properties.sections.items, schema.properties.sections.items.properties.children.items,
      schema.properties.sections.items.properties.children.items.properties.children.items]) {
      const titleCheck = ajv.compile(shape.properties.title);
      expect(titleCheck(invalid)).toBe(false);
      expect(titleCheck("")).toBe(true);
      expect(titleCheck(context.name)).toBe(true);
    }
  });

  it("offers exact canonical and manual headings without allowing manual title provenance to move to a new node", () => {
    const manualBase = structuredClone(base);
    manualBase.sections[1].title = "Tiêu đề do biên tập viên đặt";
    const manualSchema = createV2JsonSchema("AUTO", manualBase, ast, context);
    const titles = manualSchema.properties.sections.items.properties.title.enum!;
    expect(titles).toContain(manualBase.sections[1].title);
    for (const heading of ast.units.filter(unit => unit.type === "CHAPTER_HEADING")) expect(titles).toContain(heading.title ?? heading.text);
    const preserved = wire(manualBase);
    expect(ajv.compile(manualSchema)(preserved)).toBe(true);
    expect(() => validateAiProposalV2(JSON.stringify(preserved), manualBase, context)).not.toThrow();
    preserved.sections[1].id = "moved-manual-heading";
    let rejection: unknown;
    try { validateAiProposalV2(JSON.stringify(preserved), manualBase, context); } catch (error) { rejection = error; }
    expect(rejection).toMatchObject({ validationCode: "TITLE_PROVENANCE", fieldPath: "sections.1.title" });
  });

  it("accepts a real strict wire response for both generation and a current-V4 alternative", () => {
    const generated = wire(base);
    expect(wireCheck(generated), JSON.stringify(wireCheck.errors)).toBe(true);
    const current = validateAiProposalV2(JSON.stringify(generated), base, context);
    const alternative = wire({ ...current, sections: current.sections.map(n => n.type === "IMAGE_MOSAIC" ? { ...n, type: "GALLERY", gallery: "grid" } : n) });
    expect(wireCheck(alternative), JSON.stringify(wireCheck.errors)).toBe(true);
    const next = validateAiProposalV2(JSON.stringify(alternative), current, context);
    expect(editorialLayoutV2Schema.safeParse(next).success).toBe(true);
    expect(compareLayoutSignatures(getLayoutSignature(current), getLayoutSignature(next)).level).toBe("SIGNIFICANT");
  });

  it.each([
    ["columns", 0], ["columns", 5], ["focalX", -1], ["focalY", 101], ["title", "x".repeat(201)],
  ])("rejects %s=%s in both contracts", (field, value) => {
    const candidate = wire(base);
    (candidate.sections[0] as any)[field] = value;
    expect(wireCheck(candidate)).toBe(false);
    expect(editorialLayoutV2Schema.safeParse(candidate).success).toBe(false);
  });

  it("reports a duplicate ID with an exact node path instead of the former root custom issue", () => {
    const candidate = wire(base);
    candidate.sections[1].id = candidate.sections[0].id;
    expect(wireCheck(candidate)).toBe(true); // Global uniqueness cannot be encoded by this JSON grammar.
    const error = failure(candidate);
    expect(error.fieldPath).toBe("sections.1.id");
    expect(error.referenceDetails).toMatchObject({ validationStage: "TREE_CONTRACT", issueCode: "DUPLICATE_NODE_ID" });
  });

  it("reports duplicate media without repairing IDs or silently dropping photos", () => {
    const candidate = wire(base);
    candidate.sections[1].mediaIds = candidate.sections[0].mediaIds;
    const error = failure(candidate);
    expect(error.fieldPath).toBe("sections.1.mediaIds.0");
    expect(error.referenceDetails?.issueCode).toBe("DUPLICATE_MEDIA");
  });

  it("logs safe validation stage/code/path, never raw output or arbitrary messages", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const candidate = wire(base);
    candidate.sections[1].id = candidate.sections[0].id;
    createEditorialAiDiagnostics().failure("PROPOSAL_VALIDATION", failure(candidate));
    const log = JSON.parse(spy.mock.calls[0]![0]);
    expect(log).toMatchObject({ validationStage: "TREE_CONTRACT", issueCode: "DUPLICATE_NODE_ID", nodePath: "sections.1.id" });
    expect(JSON.stringify(log)).not.toContain(context.description);
  });

  it("retains existing AST hashes exactly after separating browser content units", () => {
    for (const unit of ast.units) expect(unit.hash).toBe(createHash("sha256").update((unit.type === "CITATION" ? unit.title! : unit.text).normalize("NFC").trim()).digest("hex").slice(0, 12));
  });

  it("does not count renamed IDs or empty single-column wrappers as body variation", () => {
    const renamed = { ...base, sections: base.sections.map((node, index) => ({ ...node, id: `renamed-${index}` })) };
    expect(compareLayoutSignatures(getLayoutSignature(base), getLayoutSignature(renamed)).level).toBe("SAME");
    const wrapped: EditorialLayoutV2 = { ...base, sections: base.sections.map((n, i) => n.type === "HERO" ? n : { id: `wrapper-${i}`, type: "STACK", children: [n] }) };
    expect(compareLayoutSignatures(getLayoutSignature(base), getLayoutSignature(wrapped)).level).toBe("SAME");
    const titledStack: EditorialLayoutV2 = { ...base, sections: [{ id: "group", type: "STACK", title: "Source heading", children: [{ id: "p", type: "PARAGRAPH", text: "Source paragraph" }] }] };
    const equivalent: EditorialLayoutV2 = { ...titledStack, sections: titledStack.sections.map(node => ({ ...node, type: "CONTAINER" })) };
    expect(compareLayoutSignatures(getLayoutSignature(titledStack), getLayoutSignature(equivalent)).level).toBe("SAME");
  });

  it("rejects invented prose and unverified event/source binding even for an owned source", () => {
    const candidate = structuredClone(base);
    candidate.sections.push({ id: "invented", type: "PARAGRAPH", text: "Nơi này được xây dựng vào năm 1842." });
    expect(failure(candidate).referenceDetails?.issueCode).toBe("UNSOURCED_CONTENT");
    candidate.sections.pop();
    candidate.sections.push({ id: "event", type: "TIMELINE", entries: [{ label: "1842", text: "Sự kiện không được chứng minh.", sourceIds: [context.sources[0]!.id] }] });
    expect(failure(candidate).referenceDetails?.issueCode).toBe("UNVERIFIED_EVENT_SOURCE");
  });

  it("rejects foreign media, partial paragraph loss, and loss of visitor guidance", () => {
    const foreign = structuredClone(base);
    foreign.sections[0]!.mediaIds = ["other-destination-photo"];
    expect(failure(foreign).validationCode).toBe("MEDIA_ELIGIBILITY");
    const truncated = structuredClone(base);
    const intro = truncated.sections.find(n => n.type === "LEAD")!;
    intro.text = intro.text!.slice(0, 45);
    expect(evaluateLayoutQuality(truncated, context).issues.some(i => i.code === "CONTENT_LOSS")).toBe(true);
    const changedPunctuation = structuredClone(base);
    changedPunctuation.sections.find(n => n.type === "LEAD")!.text = changedPunctuation.sections.find(n => n.type === "LEAD")!.text!.replaceAll(".", "!");
    expect(evaluateLayoutQuality(changedPunctuation, context).passed).toBe(false);
    const guidanceContext = { ...context, description: context.description + "\n\nLưu ý kiểm tra điều kiện tham quan trước khi đến." };
    expect(evaluateLayoutQuality(base, guidanceContext).passed).toBe(false);
  });

  it("preserves manual locks at server and client boundaries", () => {
    const locked = structuredClone(base);
    locked.sections[1]!.locked = true;
    const changed = structuredClone(locked);
    changed.sections[1]!.emphasis = "ACCENT";
    expect(() => validateAiProposalV2(JSON.stringify(changed), locked, context)).toThrow();
    expect(acceptedEditorialProposal({ status: "PROPOSED", layout: changed }, locked, context, "AUTO")).toBeNull();
  });
});

describe("V4.2 readable composition", () => {
  it("keeps the compiled presentation inside runtime node/depth/ID bounds with many paragraphs", () => {
    const layout: EditorialLayoutV2 = { schemaVersion: 2, mode: "GENERATIVE", sections: [
      { id: "x".repeat(128), type: "COLUMNS", text: Array.from({ length: 30 }, (_, i) => `Đoạn nguồn ${i} với nội dung được bảo toàn.`).join("\n\n") },
      ...Array.from({ length: 24 }, (_, i) => ({ id: `node-${i}`, type: "SECTION" as const, children: [{ id: `paragraph-${i}`, type: "PARAGRAPH" as const, text: `Nội dung ${i}` }] })),
    ] };
    const resolved = resolveEditorial(layout, context)!;
    expect(editorialLayoutV2Schema.safeParse(resolved.layout).success).toBe(true);
    expect((resolved.layout as EditorialLayoutV2).sections[0]!.text).toContain("Đoạn nguồn 29");
    const deep: EditorialLayoutV2 = { schemaVersion: 2, mode: "GENERATIVE", sections: [{ id: "one", type: "SECTION", children: [{ id: "two", type: "SECTION", children: [{ id: "three", type: "COLUMNS", text: "Đoạn một.\n\nĐoạn hai." }] }] }] };
    expect(editorialLayoutV2Schema.safeParse(resolveEditorial(deep, context)!.layout).success).toBe(true);
  });
  it("keeps a short heading with long prose and stacks an unbalanced grid", () => {
    const layout: EditorialLayoutV2 = { ...base, sections: [{ id: "grid", type: "COLUMNS", columns: 4, children: [
      { id: "heading", type: "HEADING", text: "Nội dung gốc" },
      { id: "long", type: "PARAGRAPH", text: "Đoạn văn nguồn đủ dài. ".repeat(90) },
    ] }] };
    const compiled = compileEditorialLayout(layout, context).nodes[0]!;
    expect(compiled.columns).toBe(1);
    expect(compiled.children).toHaveLength(1);
    expect(compiled.children[0]!.title).toBe("Nội dung gốc");
    const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolveEditorial(layout, context)! }));
    expect(html).toContain("emg-gen-cols-1");
    expect(html).toContain("Nội dung gốc");
  });

  it("uses two columns for balanced chapter groups and a wider text track for medium copy", () => {
    const layout: EditorialLayoutV2 = { ...base, sections: [
      { id: "balanced", type: "GRID", columns: 4, children: [0, 1].map(i => ({ id: `para-${i}`, type: "PARAGRAPH", text: "Nội dung đọc rõ ràng. ".repeat(40) })) },
      { id: "pair", type: "IMAGE_TEXT", text: "Nội dung đọc rõ ràng. ".repeat(40), mediaIds: [context.media[0]!.id] },
    ] };
    const [grid, pair] = compileEditorialLayout(layout, context).nodes;
    expect(grid!.columns).toBe(2);
    expect(grid!.responsiveRules.tabletCols).toBe(1);
    expect(pair!.columnRatio).toBe("TEXT_WIDE");
  });

  it("turns long image/text copy into a full-width photo break without duplicate prose", () => {
    const text = "Nội dung dài cần khoảng đọc rộng. ".repeat(90);
    const layout: EditorialLayoutV2 = { ...base, sections: [{ id: "pair", type: "IMAGE_TEXT", text, mediaIds: [context.media[0]!.id] }] };
    const compiled = compileEditorialLayout(layout, context).nodes[0]!;
    expect(compiled.columns).toBe(1);
    expect(compiled.placement).toBe("full");
    expect(compiled.text).toBe(text.trim());
  });

  it("renders the editorial Hero with the shared cover styling and bounds unknown originals", () => {
    const layout: EditorialLayoutV2 = { ...base, hero: { composition: "EDITORIAL", locked: false } };
    const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolveEditorial(layout, context)! }));
    expect(html).toContain("emg-hero-cover");
    expect(html).not.toContain("emg-hero-editorial");
  });
});

async function inMemoryFixture() {
  const store = v3TestStore();
  const created = await writeDestination(new Headers(), { name: context.name, description: context.description,
    area: context.area, category: context.category, latitude: context.latitude, longitude: context.longitude,
    openingDays: context.openingDays, suggestedDurationMinutes: context.suggestedDurationMinutes, minimumDurationMinutes: 20,
  }, "create", null, store.deps);
  if (created.status !== "SUCCESS") throw new Error("Fixture setup failed");
  const id = created.data.id;
  const row = store.rows().get(id);
  row.media.push(...context.media.map((m, position) => ({ ...m, position, destinationId: id, rightsEvidence: "Fixture permission" })));
  row.sources.push(...context.sources.map(source => ({ ...source, rightsEvidence: "Fixture permission" })));
  const ctx = await readEditorialContext(id, store.deps.database);
  return { store, id, row, ctx, current: autoLayoutV2(ctx) };
}

describe("V4.2 alternative service, without network or database writes", () => {
  it("preserves V1 → V2 draft/publish/rollback and exact idempotent replay in an in-memory store", async () => {
    const f = await inMemoryFixture();
    const db = f.store.deps.database as any;
    let record: any = null;
    db.$executeRaw = async () => 1;
    db.destinationEditorial = {
      findUnique: async () => record && structuredClone(record),
      create: async ({ data }: any) => (record = { published: null, previousPublished: null, publishedRevision: 0, publishedAt: null, updatedAt: new Date(), ...structuredClone(data) }),
      update: async ({ data }: any) => (record = { ...record, ...structuredClone(data), updatedAt: new Date() }),
    };
    f.row.visibility = "VISIBLE";
    const legacy = autoLayoutV1(f.ctx);
    const destinationBefore = structuredClone(f.row);
    const saveBody = { action: "SAVE", expectedRevision: 0, layout: legacy };
    const first = await writeEditorial(new Headers(), saveBody, "v42-save-legacy", f.id, f.store.deps);
    const replay = await writeEditorial(new Headers(), saveBody, "v42-save-legacy", f.id, f.store.deps);
    expect(first.status).toBe("SUCCESS");
    expect(replay).toMatchObject({ status: "SUCCESS", replayed: true });
    expect(record.draftRevision).toBe(1);
    await writeEditorial(new Headers(), { action: "PUBLISH", expectedRevision: 1, reviewed: true }, "v42-publish-legacy", f.id, f.store.deps);
    await writeEditorial(new Headers(), { action: "SAVE", expectedRevision: 2, layout: f.current }, "v42-save-generative", f.id, f.store.deps);
    await writeEditorial(new Headers(), { action: "PUBLISH", expectedRevision: 3, reviewed: true }, "v42-publish-generative", f.id, f.store.deps);
    expect((await readPublicEditorial(f.id, db))?.layout.schemaVersion).toBe(2);
    expect(record.previousPublished.schemaVersion).toBe(1);
    await writeEditorial(new Headers(), { action: "ROLLBACK", expectedRevision: 4, reviewed: true }, "v42-rollback", f.id, f.store.deps);
    expect((await readPublicEditorial(f.id, db))?.layout.schemaVersion).toBe(1);
    expect(record.draft.schemaVersion).toBe(2);
    await writeEditorial(new Headers(), { action: "RESTORE_DRAFT", expectedRevision: 5 }, "v42-restore-draft", f.id, f.store.deps);
    expect(record.draft.schemaVersion).toBe(1);
    expect(f.row).toEqual(destinationBefore);
  });
});
