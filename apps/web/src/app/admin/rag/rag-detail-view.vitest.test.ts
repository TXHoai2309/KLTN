import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("./rag-review.css", () => ({}));
vi.mock("./rag-index-panel.css", () => ({}));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: any) => React.createElement("a", { href, ...props }, children) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("./rag-index-panel", () => ({
  RagIndexPanel: () => React.createElement("section", { className: "destination-card rag-index-card", "aria-labelledby": "rag-index-heading" }, React.createElement("h2", { id: "rag-index-heading" }, "Lập chỉ mục AI")),
}));

import { RagDetailView } from "./rag-review-ui";

const mockUploadedDoc = {
  id: "rag-test-1",
  originalFileName: "bao-cao-ha-giang.pdf",
  sourceTitle: "Báo cáo văn hóa Hà Giang",
  fileType: "PDF" as const,
  mimeType: "application/pdf",
  sizeBytes: 2048576,
  sourceUrl: "https://example.com/doc",
  author: "Sở VHTT",
  topic: "Lễ hội",
  locality: "Đồng Văn",
  uploadedById: "admin-1",
  status: "UPLOADED" as const,
  retrievalEligible: false,
  publicQaApproved: false,
  publicQaEligible: false,
  ineligibilityReason: "STATUS_NOT_INDEXED" as const,
  deletedAt: null,
  allowedActions: ["START_REVIEW", "DISABLE"] as any[],
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
};

it("renders sections in correct lifecycle order: File -> Source -> Status Management -> Indexing -> Public QA", () => {
  const html = renderToStaticMarkup(
    React.createElement(RagDetailView, { id: "rag-test-1", initialDocument: mockUploadedDoc }),
  );

  const fileIdx = html.indexOf('id="rag-file-title"');
  const sourceIdx = html.indexOf('id="rag-source-title"');
  const statusIdx = html.indexOf('id="rag-actions-title"');
  const indexIdx = html.indexOf('id="rag-index-heading"');
  const publicQaIdx = html.indexOf('id="rag-public-qa-title"');

  expect(fileIdx).toBeGreaterThan(-1);
  expect(sourceIdx).toBeGreaterThan(fileIdx);
  expect(statusIdx).toBeGreaterThan(sourceIdx);
  expect(indexIdx).toBeGreaterThan(statusIdx);
  expect(publicQaIdx).toBeGreaterThan(indexIdx);
});

it("renders review popup modal with document details, download button, and approve action", () => {
  const html = renderToStaticMarkup(
    React.createElement(RagDetailView, { id: "rag-test-1", initialDocument: mockUploadedDoc }),
  );

  // Status management card has start review button
  expect(html).toContain("Bắt đầu kiểm duyệt");

  // Review modal dialog is present in markup
  expect(html).toContain("rag-review-dialog");
  expect(html).toContain("Kiểm duyệt tài liệu RAG");
  expect(html).toContain("bao-cao-ha-giang.pdf");
  expect(html).toContain("Báo cáo văn hóa Hà Giang");
  expect(html).toContain("Sở VHTT");
  expect(html).toContain("Tải tệp gốc để xem và đối soát nội dung");
  expect(html).toContain('/api/admin/rag-documents/rag-test-1/file');
  expect(html).toContain("Phê duyệt tài liệu");
  expect(html).toContain("Hủy / Để duyệt sau");
});
