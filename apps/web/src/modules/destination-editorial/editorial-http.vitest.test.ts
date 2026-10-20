import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createEditorialProposalHandler } from "./editorial-http";
import { v3TestStore } from "../destination/__fixtures__/v3-store";

describe("Editorial proposal API diagnostics", () => {
  it("logs a safe section-limit failure and preserves the existing API response envelope", async () => {
    const store = v3TestStore();
    const client = vi.fn(() => null);
    const handler = createEditorialProposalHandler(store.deps, client);
    const privateText = "PRIVATE DESTINATION DESCRIPTION";
    const request = new Request("http://localhost/api/admin/destinations/example/editorial/propose", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ layout: { schemaVersion: 2, sections: Array.from({ length: 51 }, (_, index) => ({ id: `private-${index}`, type: "SECTION", text: privateText })) } }),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handler(request, { params: Promise.resolve({ id: "example" }) });
      expect(response.status).toBe(400);
      expect(response.headers.get("X-Editorial-Ai-Request-Id")).toMatch(/^[0-9a-f-]{36}$/i);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_EDITORIAL_AI" } });
      expect(client).not.toHaveBeenCalled();
      const event = JSON.parse(String(log.mock.calls[0]![0]));
      expect(event).toMatchObject({ event: "editorial_api", stage: "EDITORIAL_PROPOSAL_REQUEST", code: "INVALID_EDITORIAL_AI", issueCode: "SECTION_LIMIT", expectedRootSections: 50, actualRootSections: 51, expectedTotalNodes: 50, actualTotalNodes: 51 });
      expect(event.correlationId).toBe(response.headers.get("X-Editorial-Ai-Request-Id"));
      expect(String(log.mock.calls[0]![0])).not.toContain(privateText);
      expect(String(log.mock.calls[0]![0])).not.toContain("private-");
    } finally { log.mockRestore(); }
  });
});
