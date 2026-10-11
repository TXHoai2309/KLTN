import { describe, expect, it } from "vitest";
import { isQaPublicAnswerSafe } from "./qa-public-safety";
import type { QaAnswer } from "./qa-runtime-contract";

const answer = (text: string, title = "Public synthetic source", section = "Verified section"): QaAnswer => ({
  status: "ANSWERED",
  answerParts: [{ text, citationIds: ["c1"] }],
  citations: [{ id: "c1", sourceId: "source_public", title, sourceUrl: null, locators: [{ section }] }],
  unansweredAspects: [],
});

describe("US21 public projection safety", () => {
  it.each([
    "file:///etc/private/source.pdf",
    "C:\\private\\rag\\source.pdf",
    "C:/private/rag/source.pdf",
    "/var/lib/private/source.pdf",
    "\\\\nas01\\share\\source.pdf",
    "//nas01/share/source.pdf",
    "https://private.blob.vercel-storage.com/object?token=secret",
    "/api/admin/rag-documents/private-document/file",
    "rag/private-document/source.pdf",
    "https://storage.invalid/object?sig=secret",
  ])("rejects private path or URL in answer/citation metadata: %s", value => {
    expect(isQaPublicAnswerSafe(answer(value), [])).toBe(false);
    expect(isQaPublicAnswerSafe(answer("Synthetic claim.", value), [])).toBe(false);
    expect(isQaPublicAnswerSafe(answer("Synthetic claim.", "Safe title", value), [])).toBe(false);
  });

  it("allows ordinary approved title, section, and evidence-free insufficient notice", () => {
    expect(isQaPublicAnswerSafe(answer("Synthetic claim."), [])).toBe(true);
    expect(isQaPublicAnswerSafe({ status: "INSUFFICIENT_SOURCE", answerParts: [], citations: [], message: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này." }, [])).toBe(true);
  });
});
