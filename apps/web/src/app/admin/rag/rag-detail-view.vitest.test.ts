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
  allowedActions: ["DISABLE"] as any[],
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
};

it("renders status management and its disable action after indexing and public QA", () => {
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
  expect(indexIdx).toBeGreaterThan(sourceIdx);
  expect(publicQaIdx).toBeGreaterThan(indexIdx);
  expect(statusIdx).toBeGreaterThan(publicQaIdx);
  expect(html.indexOf("Vô hiệu hóa")).toBeGreaterThan(publicQaIdx);
});

it("shows the original source and automatic indexing without manual review actions", () => {
  const html = renderToStaticMarkup(
    React.createElement(RagDetailView, { id: "rag-test-1", initialDocument: mockUploadedDoc }),
  );

  expect(html).toContain("Chờ lập chỉ mục");
  expect(html).toContain("Lập chỉ mục AI");
  expect(html).toContain("bao-cao-ha-giang.pdf");
  expect(html).toContain("Báo cáo văn hóa Hà Giang");
  expect(html).toContain("Sở VHTT");
  expect(html).toContain("Tải tài liệu gốc để xem");
  expect(html).toContain('/api/admin/rag-documents/rag-test-1/file');
  expect(html).not.toContain("Bắt đầu kiểm duyệt");
  expect(html).not.toContain("Phê duyệt tài liệu");
  expect(html).not.toContain("Cho phép AI sử dụng công khai");
});

it("shows public AI status, source confirmation, then the grant action", () => {
  const html = renderToStaticMarkup(React.createElement(RagDetailView, {
    id: "rag-test-1",
    initialDocument: {
      ...mockUploadedDoc,
      status: "INDEXED",
      ineligibilityReason: "NOT_PUBLIC_APPROVED",
      allowedActions: ["DISABLE", "ENABLE_PUBLIC_QA"],
    },
  }));

  const statusIdx = html.indexOf("Sẵn sàng cấp quyền");
  const conditionIdx = html.indexOf("Điều kiện kỹ thuật:");
  const confirmIdx = html.indexOf("Tôi đã mở và đối soát tệp gốc");
  const buttonIdx = html.indexOf("Cho phép AI sử dụng công khai");
  expect(statusIdx).toBeGreaterThan(-1);
  expect(conditionIdx).toBeGreaterThan(statusIdx);
  expect(confirmIdx).toBeGreaterThan(conditionIdx);
  expect(buttonIdx).toBeGreaterThan(confirmIdx);
  expect(html).toContain('class="rag-public-qa-confirm"');
  expect(html).toContain('class="rag-public-qa-submit"');
});
