import { describe, expect, it } from "vitest";

import { isConfirmedRagUploadResult } from "./rag-upload-form";

describe("RAG upload confirmation contract", () => {
  it("accepts only the operation-specific confirmed upload payload", () => {
    expect(isConfirmedRagUploadResult({
      id: "rag-1",
      originalFileName: "ha-giang.pdf",
      sourceTitle: "Nguồn Hà Giang",
      status: "UPLOADED",
      retrievalEligible: false,
    })).toBe(true);

    for (const invalid of [
      {},
      { id: "rag-1", status: "UPLOADED", retrievalEligible: false },
      { id: "rag-1", originalFileName: "x.pdf", sourceTitle: "Nguồn", status: "APPROVED", retrievalEligible: false },
      { id: "rag-1", originalFileName: "x.pdf", sourceTitle: "Nguồn", status: "UPLOADED", retrievalEligible: true },
    ]) {
      expect(isConfirmedRagUploadResult(invalid)).toBe(false);
    }
  });
});
