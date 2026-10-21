import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialLayoutGenerationError } from "./editorial-engine";
import {
  editorialClientFailureMessage,
  editorialFailureRetryAction,
  editorialInitialLayoutFailure,
  recordEditorialClientFailure,
  safeEditorialSchemaPath,
} from "./editorial-client-diagnostics";

afterEach(() => vi.unstubAllGlobals());

describe("Editorial client diagnostics", () => {
  it("keeps data and initial layout errors distinct and maps retry to the failed stage", () => {
    const dataFailure = { stage: "DATA_RESPONSE", code: "INVALID_DTO" } as const;
    const layoutFailure = editorialInitialLayoutFailure(new EditorialLayoutGenerationError(57));

    expect(editorialFailureRetryAction(dataFailure)).toBe("RELOAD_DATA");
    expect(editorialFailureRetryAction(layoutFailure)).toBe("RETRY_LAYOUT");
    expect(editorialClientFailureMessage(dataFailure)).toContain("Phản hồi dữ liệu");
    expect(editorialClientFailureMessage(layoutFailure)).toContain("Dữ liệu đã tải");
    expect(editorialClientFailureMessage(layoutFailure)).toContain("50 node");
    expect(layoutFailure).toMatchObject({ expectedTotalNodes: 50, actualTotalNodes: 57 });
  });

  it("logs only allowlisted, bounded diagnostic fields and never forwards them", () => {
    const logger = { error: vi.fn() };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    recordEditorialClientFailure({
      stage: "DATA_RESPONSE",
      code: "INVALID_DTO",
      status: 200,
      fieldPath: "context.media.1.description",
      // Extra runtime fields must not escape through the logger.
      ...({ description: "PRIVATE DESTINATION COPY", token: "SESSION SECRET", rawError: "provider payload" } as object),
    } as Parameters<typeof recordEditorialClientFailure>[0], logger);

    expect(logger.error).toHaveBeenCalledOnce();
    const entry = JSON.parse(logger.error.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(entry).toEqual({
      event: "editorial_client",
      stage: "DATA_RESPONSE",
      code: "INVALID_DTO",
      status: 200,
      fieldPath: "context.media.1.description",
    });
    expect(logger.error.mock.calls[0]![0]).not.toContain("PRIVATE DESTINATION COPY");
    expect(logger.error.mock.calls[0]![0]).not.toContain("SESSION SECRET");
    expect(logger.error.mock.calls[0]![0]).not.toContain("provider payload");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds node counts, sanitizes schema paths and tolerates a broken console", () => {
    const logger = { error: vi.fn() };
    recordEditorialClientFailure({
      stage: "INITIAL_LAYOUT_GENERATION",
      code: "NODE_LIMIT",
      expectedTotalNodes: 50,
      actualTotalNodes: 100_000,
      fieldPath: "sections.1000.secret-value",
    }, logger);

    expect(JSON.parse(logger.error.mock.calls[0]![0] as string)).toMatchObject({
      expectedTotalNodes: 50,
      actualTotalNodes: 1000,
      fieldPath: "sections.index.field",
    });
    expect(safeEditorialSchemaPath(["sections", 2, "children", 0, "text"])).toBe("sections.2.children.0.text");
    expect(() => recordEditorialClientFailure({ stage: "DATA_LOAD", code: "NETWORK_ERROR" }, { error: () => { throw new Error("console unavailable"); } })).not.toThrow();
  });
});
