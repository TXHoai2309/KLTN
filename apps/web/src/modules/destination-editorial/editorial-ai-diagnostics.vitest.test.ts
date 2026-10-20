import { describe, expect, it, vi } from "vitest";
import { editorialLayoutDiagnosticCounts, editorialLayoutLimitIssue, recordEditorialApiFailure } from "./editorial-ai-diagnostics";

describe("safe Editorial API diagnostics", () => {
  it("reports bounded root and recursive node counts without reading or logging prose", () => {
    const secretText = "PRIVATE DESTINATION DESCRIPTION and session token";
    const tooManyRoots = { schemaVersion: 2, sections: Array.from({ length: 51 }, (_, index) => ({ id: `private-node-${index}`, type: "SECTION", title: secretText, text: secretText })) };
    const counts = editorialLayoutDiagnosticCounts(tooManyRoots)!;
    expect(counts).toEqual({ expectedRootSections: 50, actualRootSections: 51, expectedTotalNodes: 50, actualTotalNodes: 51 });
    expect(editorialLayoutLimitIssue(counts)).toBe("SECTION_LIMIT");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const correlationId = recordEditorialApiFailure("EDITORIAL_SAVE", "INVALID_EDITORIAL", counts, undefined, "layout.sections.50.id");
      const log = String(spy.mock.calls[0]![0]);
      expect(JSON.parse(log)).toMatchObject({ event: "editorial_api", correlationId, stage: "EDITORIAL_SAVE", code: "INVALID_EDITORIAL", issueCode: "SECTION_LIMIT", expectedRootSections: 50, actualRootSections: 51, expectedTotalNodes: 50, actualTotalNodes: 51, fieldPath: "layout.sections.50.id" });
      expect(log).not.toContain(secretText);
      expect(log).not.toContain("private-node");
      expect(log).not.toContain("token");
    } finally { spy.mockRestore(); }
  });

  it("distinguishes whole-tree overflow when root sections remain in range", () => {
    const data = { schemaVersion: 2, sections: Array.from({ length: 5 }, (_, index) => ({ id: `root-${index}`, children: Array.from({ length: 10 }, (_, child) => ({ id: `child-${index}-${child}` })) })) };
    const counts = editorialLayoutDiagnosticCounts(data)!;
    expect(counts).toMatchObject({ expectedRootSections: 50, actualRootSections: 5, expectedTotalNodes: 50, actualTotalNodes: 55 });
    expect(editorialLayoutLimitIssue(counts)).toBe("NODE_LIMIT");
  });

  it("counts malformed over-depth descendants within the bounded diagnostic traversal", () => {
    let node: Record<string, unknown> = { id: "deepest" };
    for (let index = 0; index < 50; index++) node = { id: `node-${index}`, children: [node] };
    const counts = editorialLayoutDiagnosticCounts({ sections: [node] })!;
    expect(counts).toMatchObject({ actualRootSections: 1, actualTotalNodes: 51 });
    expect(editorialLayoutLimitIssue(counts)).toBe("NODE_LIMIT");
  });

  it("caps pathological count traversal and sanitizes unsupported code/path values", () => {
    const counts = editorialLayoutDiagnosticCounts({ sections: Array.from({ length: 1100 }, () => ({})) })!;
    expect(counts).toMatchObject({ actualRootSections: 1000, actualTotalNodes: 1000, countsCapped: true });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      recordEditorialApiFailure("EDITORIAL_GET", "private token value", counts, undefined, "sections.private-destination");
      const log = String(spy.mock.calls[0]![0]);
      expect(JSON.parse(log)).toMatchObject({ code: "EDITORIAL_FAILURE", countsCapped: true });
      expect(log).not.toContain("private token value");
      expect(log).not.toContain("private-destination");
    } finally { spy.mockRestore(); }
  });
});
