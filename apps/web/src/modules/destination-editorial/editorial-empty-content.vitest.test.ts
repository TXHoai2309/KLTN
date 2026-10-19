import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorialRenderer from "@/components/editorial/editorial-renderer";
import { editorialBlockSchema, type EditorialBlock, type EditorialContext, type EditorialLayout, type EditorialLayoutV1 } from "./editorial-contract";
import { editorialFixture } from "./__fixtures__/editorial-fixture";
import { autoLayout, resolveEditorial, resolveEditorialDisplay, validateLayoutReferences } from "./editorial-engine";
import { editorialValue, editorialVisitData } from "./editorial-display-policy";
import { validateAiProposal } from "./editorial-ai";
import { EditorialProposalError, createEditorialAiDiagnostics } from "./editorial-ai-diagnostics";
import { acceptedEditorialProposal } from "./editorial-proposal-result";

const block = (id: string, type: EditorialBlock["type"], extra = {}) => editorialBlockSchema.parse({ id, type, ...extra });
function sparse() {
  return { ...editorialFixture(undefined, 0), area: "", category: "", description: "", suggestedDurationMinutes: null, latitude: NaN, longitude: NaN, sources: [] } satisfies EditorialContext;
}
const layoutFor = (c: EditorialContext): EditorialLayoutV1 => ({ ...autoLayout(c), blocks: [block("hero", "HERO", { title: c.name }), block("intro", "INTRO"), block("text", "TEXT_SECTION"), block("facts", "HIGHLIGHT_FACTS"), block("visit", "VISIT_INFORMATION"), block("map", "MAP"), block("sources", "SOURCES"), block("photos", "IMAGE_GALLERY"), block("split", "IMAGE_TEXT_SPLIT")] });
const htmlFor = (c: EditorialContext, layout: EditorialLayout) => { const editorial = resolveEditorial(layout, c); return editorial ? renderToStaticMarkup(React.createElement(EditorialRenderer, { data: c, editorial })) : ""; };
const proposal = (base: EditorialLayoutV1) => ({ family: base.family, variant: base.variant, design: { typography: "MODERN", palette: "SLATE", rhythm: "COMPACT" }, blocks: base.blocks.map(b => ({ id: b.id, title: b.title, mediaIds: [...b.mediaIds], placement: b.placement, crop: b.crop, gallery: b.gallery, deck: b.deck ?? "", hidden: b.hidden, composition: "KEEP", emphasis: b.emphasis ?? "STANDARD" })) });

describe("Smart empty content is a reversible shared display projection", () => {
  it.each(["", " ", "Chưa có dữ liệu", "Đang cập nhật", "Không có thông tin", "N/A", "undefined", "null"])("recognizes exact optional sentinel %s without stripping prose", value => {
    expect(editorialValue(value)).toBe("");
    expect(editorialValue("Ghi chú: chưa có dữ liệu về lối đi")).not.toBe("");
  });
  it("hides empty optional sections without placeholders, empty headings, lists or image slots", () => {
    const c = sparse(), layout = layoutFor(c), before = structuredClone(layout), html = htmlFor(c, layout);
    expect(resolveEditorial(layout, c)!.layout.blocks.map(b => b.id)).toEqual(["hero"]);
    expect(html).not.toMatch(/Chưa có dữ liệu|Đang cập nhật|Không có thông tin|N\/A|undefined|null|<h2|<dl|<ul|<img|emg-map|emg-visit/);
    expect(layout).toEqual(before);
    expect(resolveEditorialDisplay(layout, c).issues).toContainEqual({ blockId: "facts", reason: "EMPTY_CONTENT" });
  });
  it("restores blocks from the same unchanged draft after canonical fields/media/sources are added", () => {
    const c = sparse(), layout = layoutFor(c), full = editorialFixture();
    layout.blocks.find(b => b.id === "photos")!.mediaIds = ["photo-0"];
    layout.blocks.find(b => b.id === "sources")!.sourceIds = ["source"];
    const before = structuredClone(layout);
    expect(htmlFor(c, layout)).not.toContain("<img");
    const restored = resolveEditorial(layout, full)!;
    expect(restored.layout.blocks.map(b => b.id)).toEqual(expect.arrayContaining(["facts", "visit", "map", "sources", "photos"]));
    expect(layout).toEqual(before);
  });
  it("renders partial Facts only and never a missing duration", () => {
    const c = sparse(); c.category = "thiên nhiên";
    const html = htmlFor(c, layoutFor(c));
    expect(html).toContain("Loại hình"); expect(html).not.toContain("Khu vực</span>"); expect(html).not.toContain("Nhịp tham quan"); expect(html).not.toContain("Thời lượng gợi ý");
  });
  it("does not create a separate visit section just to repeat the area already in Facts", () => {
    const c = sparse(); c.area = "Hà Giang";
    const html = htmlFor(c, layoutFor(c));
    expect(html).toContain("emg-facts"); expect(html).not.toContain("emg-visit");
  });
  it("retains valid 24:00 end times and suppresses repeated source sections only in the projection", () => {
    const c = editorialFixture(), layout = autoLayout(c);
    c.openingDays[0] = { dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "13:00", closesAt: "24:00" }] };
    layout.blocks.push(block("source-copy", "SOURCES", { sourceIds: ["source"] }));
    expect(editorialVisitData(c).hours[0]!.value).toBe("13:00–24:00");
    expect(resolveEditorial(layout, c)!.layout.blocks.filter(b => b.type === "SOURCES")).toHaveLength(1);
    expect(layout.blocks.filter(b => b.type === "SOURCES")).toHaveLength(2);
  });
  it("keeps operating-day data available without rendering the retired travel preparation panel", () => {
    const c = sparse(); c.openingDays = [{ dayOfWeek: "SUNDAY", status: "CLOSED", intervals: [] }, { dayOfWeek: "MONDAY", status: "UNKNOWN", intervals: [] }, { dayOfWeek: "TUESDAY", status: "OPEN", intervals: [{ opensAt: "08:00", closesAt: "17:00" }] }];
    const html = htmlFor(c, layoutFor(c));
    expect(editorialVisitData(c).hours.map(day => day.label)).toEqual(["Chủ Nhật", "Thứ Ba"]);
    expect(html).not.toContain("Chuẩn bị cho chuyến đi"); expect(html).not.toContain("emg-visit"); expect(html).not.toContain("08:00–17:00");
    c.openingDays = [{ dayOfWeek: "MONDAY", status: "OPEN", intervals: [{ opensAt: "25:00", closesAt: "17:00" }] }];
    expect(editorialVisitData(c).hours).toEqual([]);
  });
  it.each([[NaN, 105], [91, 105], [23, 181], [Infinity, 105]])("hides invalid map (%s,%s) without changing map data", (latitude, longitude) => {
    const c = { ...editorialFixture(), latitude, longitude };
    expect(resolveEditorial(layoutFor(c), c)!.layout.blocks.some(b => b.type === "MAP")).toBe(false);
  });
  it("does not reinsert manually hidden visit/map blocks or duplicate canonical information", () => {
    const c = editorialFixture(), layout = layoutFor(c);
    layout.blocks.find(b => b.id === "visit")!.hidden = true;
    layout.blocks.find(b => b.id === "map")!.hidden = true;
    layout.blocks.push(block("extra-facts", "HIGHLIGHT_FACTS"));
    const html = htmlFor(c, layout);
    expect(html).not.toContain("emg-visit"); expect(html).not.toContain("emg-map"); expect(html.match(/class="emg-facts"/g)).toHaveLength(1);
    expect(resolveEditorialDisplay(layout, c).issues).toContainEqual({ blockId: "visit", reason: "ADMIN_HIDDEN" });
    expect(layout.blocks).toHaveLength(10);
  });
  it("keeps heading-only sections and valid manual prose, falling back to text when media becomes unavailable", () => {
    const c = sparse(), layout = layoutFor(c);
    layout.blocks.find(b => b.id === "text")!.title = "Một góc nhìn riêng";
    Object.assign(layout.blocks.find(b => b.id === "split")!, { text: "Nội dung riêng được Admin nhập.", mediaIds: ["foreign"] });
    const html = htmlFor(c, layout);
    expect(html).toContain("Một góc nhìn riêng"); expect(html).toContain("Nội dung riêng"); expect(html).not.toContain("emg-split"); expect(html).not.toContain("<img");
  });
  it("does not display revoked media or unapproved/invalid sources", () => {
    const c = editorialFixture(), layout = autoLayout(c);
    c.media.forEach(m => { m.websiteRights = "REJECTED"; }); c.sources[0]!.websiteRights = "REJECTED";
    const html = htmlFor(c, layout);
    expect(html).not.toContain("<img"); expect(html).not.toContain("Nguồn tham khảo");
  });
});

describe("AI validation and atomic proposal application", () => {
  it("accepts canonical Hero name without assigning paragraph provenance to the name", () => {
    const c = editorialFixture(), base = autoLayout(c); base.blocks[0]!.title = "Tên mở đầu được Admin nhập";
    const p = proposal(base); p.blocks[0]!.title = c.name;
    const next = validateAiProposal(JSON.stringify(p), base, c, "KEEP");
    expect(next.blocks[0]!.title).toBe(c.name); expect(next.blocks[0]!.headingProvenance).toBeUndefined();
    expect(() => validateLayoutReferences(next, c, true)).not.toThrow();
  });
  it("accepts unchanged existing section labels without treating them as new extracted headings", () => {
    const c = editorialFixture(), base = autoLayout(c); base.blocks.find(b => b.type === "MAP")!.title = "Bản đồ";
    expect(() => validateAiProposal(JSON.stringify(proposal(base)), base, c, "KEEP")).not.toThrow();
  });
  it.each(["schema", "duplicate", "missing", "foreign", "unproven", "font", "hidden", "direction"])("rejects %s atomically with an allowlisted validation code/path", mode => {
    const c = editorialFixture(), base = autoLayout(c), before = structuredClone(base), p = proposal(base);
    if (mode === "schema") Object.assign(p, { injection: "private-content" });
    if (mode === "duplicate") p.blocks[1]!.id = p.blocks[0]!.id;
    if (mode === "missing") p.blocks.pop();
    if (mode === "foreign") p.blocks[0]!.mediaIds = ["foreign"];
    if (mode === "unproven") p.blocks[0]!.title = "Invented fact";
    if (mode === "font") p.design.typography = "unsafe";
    if (mode === "hidden") p.blocks[1]!.hidden = true;
    if (mode === "direction") p.variant = base.variant === "SPLIT" ? "PANORAMA" : "SPLIT";
    expect(() => validateAiProposal(JSON.stringify(p), base, c, "KEEP")).toThrow(EditorialProposalError);
    expect(base).toEqual(before);
    expect(acceptedEditorialProposal({ status: "FALLBACK", outcome: "VALIDATION_FAILED", layout: autoLayout(c) }, base, c, "KEEP")).toBeNull();
  });
  it("client gate rejects even a PROPOSED envelope with duplicate IDs, foreign media or changed source prose", () => {
    const c = editorialFixture(), base = autoLayout(c);
    for (const mutation of [ (b: EditorialLayoutV1) => { b.blocks[1]!.id = b.blocks[0]!.id; }, (b: EditorialLayoutV1) => { b.blocks[0]!.mediaIds = ["foreign"]; }, (b: EditorialLayoutV1) => { b.blocks[1]!.text += " injected"; } ]) {
      const next = structuredClone(base); mutation(next);
      expect(acceptedEditorialProposal({ status: "PROPOSED", layout: next }, base, c, "KEEP")).toBeNull();
    }
  });
  it("repeated auto → AI → auto → AI retains manual IDs/content and never grows blocks or utility sections", () => {
    const c = editorialFixture(); let current = autoLayout(c);
    const manual = block("manual", "TEXT_SECTION", { title: "Nét riêng", text: "Nội dung do Admin biên tập riêng.", sourceIds: ["source"] });
    current.blocks.push(manual);
    const count = current.blocks.length;
    for (let i = 0; i < 6; i++) {
      current = autoLayout(c, current);
      expect(current.blocks).toHaveLength(count);
      expect(current.blocks.find(b => b.id === "manual")).toMatchObject(manual);
      expect(current.blocks.findIndex(b => b.id === "manual")).toBeLessThan(current.blocks.findIndex(b => b.type === "MAP"));
      const proposed = validateAiProposal(JSON.stringify(proposal(current)), current, c, "KEEP");
      current = acceptedEditorialProposal({ status: "PROPOSED", outcome: "PROPOSED", layout: proposed }, current, c, "KEEP")!;
      expect(current).not.toBeNull();
      for (const type of ["INTRO", "HIGHLIGHT_FACTS", "VISIT_INFORMATION", "MAP"]) expect(current.blocks.filter(b => b.type === type)).toHaveLength(1);
    }
  });
  it("preserves edited generated blocks with their own IDs/provenance and empty manual blocks across reflow", () => {
    const c = editorialFixture(), base = autoLayout(c), edited = base.blocks.find(b => b.type === "IMAGE_TEXT_SPLIT")!;
    edited.text = "Nội dung riêng đã được chỉnh tay.";
    base.blocks.push(block("manual-empty", "TEXT_SECTION"));
    const next = autoLayout(c, base);
    expect(next.blocks.filter(b => b.id === edited.id)).toHaveLength(1); expect(next.blocks.find(b => b.id === edited.id)!.text).toBe(edited.text);
    expect(next.blocks.some(b => b.id === "manual-empty")).toBe(true);
  });
  it("reuses manually replaced Hero/utility IDs rather than adding duplicate generated blocks", () => {
    const c = editorialFixture(), base = autoLayout(c);
    base.blocks = base.blocks.map(b => ["HERO", "MAP", "VISIT_INFORMATION"].includes(b.type) ? { ...b, id: `manual-${b.type}`, hidden: b.type === "MAP" } : b);
    const next = autoLayout(c, base);
    expect(() => validateLayoutReferences(next, c, false)).not.toThrow();
    for (const type of ["HERO", "MAP", "VISIT_INFORMATION"]) expect(next.blocks.filter(b => b.type === type)).toHaveLength(1);
    expect(next.blocks.find(b => b.id === "manual-MAP")!.hidden).toBe(true);
    expect(autoLayout(c, next)).toEqual(next);
  });
  it("does not leak content, hostile field keys or actual IDs through diagnostic paths", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    try { const diagnostics = createEditorialAiDiagnostics(); diagnostics.failure("PROPOSAL_VALIDATION", new EditorialProposalError("SCHEMA", ["blocks", 1, "private-content", Symbol("secret")]));
      const log = String(spy.mock.calls[0]![0]); expect(log).not.toMatch(/private-content|secret/); expect(JSON.parse(log)).toMatchObject({ code: "PROPOSAL_INVALID", validationCode: "SCHEMA", fieldPath: "blocks.1.field.field", correlationId: diagnostics.correlationId });
    } finally { spy.mockRestore(); }
  });
});
