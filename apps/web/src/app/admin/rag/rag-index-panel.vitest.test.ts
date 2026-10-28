import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("./rag-index-panel.css", () => ({}));

import { RagIndexPanel } from "./rag-index-panel";

it("offers manual indexing for a newly uploaded document without a job", () => {
  const html = renderToStaticMarkup(React.createElement(RagIndexPanel, { documentId: "rag-1", status: "UPLOADED" }));
  expect(html).toContain(">Lập chỉ mục</button>");
  expect(html).toContain("Đang tải trạng thái");
  expect(html).not.toContain("Tự động lập chỉ mục");
});
