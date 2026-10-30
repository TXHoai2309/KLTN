import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DestinationAssistantPanel } from "./destination-assistant-panel";
import { AssistantRuntimeChat } from "./assistant-runtime-chat";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
// Auth still resolving: no identity is verified yet.
vi.mock("../../lib/auth-client", () => ({ authClient: { useSession: () => ({ data: null, isPending: true, error: null }) } }));

describe("Ticket 04: one chat everywhere", () => {
  it("assistant page shows the V2 loading state before identity, never the V1 chat", () => {
    const markup = renderToStaticMarkup(createElement(AssistantRuntimeChat, {}));
    expect(markup).toContain('data-runtime="v2"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("assistant-sidebar");
  });
  it("destination panel shows the V2 loading state before identity, keeping dialog semantics", () => {
    const markup = renderToStaticMarkup(createElement(DestinationAssistantPanel, { destinationId: "d1", destinationName: "Đồng Văn", isOpen: true, onClose: () => {} }));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('data-runtime="v2"');
    expect(markup).not.toContain("destination-panel-header");
  });
});
