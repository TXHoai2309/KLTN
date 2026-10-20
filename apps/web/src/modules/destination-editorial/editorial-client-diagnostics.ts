import { EDITORIAL_V2_MAX_TOTAL_NODES } from "./editorial-contract";

export type EditorialClientFailureStage = "DATA_LOAD" | "DATA_RESPONSE" | "INITIAL_LAYOUT_GENERATION";
export type EditorialClientFailureCode =
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "ADMIN_SESSION_EXPIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "INVALID_ENVELOPE"
  | "INVALID_DTO"
  | "NODE_LIMIT"
  | "LAYOUT_GENERATION_FAILED";

export type EditorialClientFailure = {
  stage: EditorialClientFailureStage;
  code: EditorialClientFailureCode;
  status?: number;
  fieldPath?: string;
  expectedTotalNodes?: number;
  actualTotalNodes?: number;
};

const schemaFields = new Set([
  "available", "reason", "context", "id", "name", "description", "category", "area",
  "latitude", "longitude", "suggestedDurationMinutes", "openingDays", "dayOfWeek", "status",
  "intervals", "opensAt", "closesAt", "media", "sources", "title", "url", "websiteRights",
  "isCover", "storageReference", "draft", "published", "previousPublished", "draftRevision",
  "publishedRevision", "updatedAt", "publishedAt", "contentChanged", "aiConfigured", "schemaVersion",
  "mode", "family", "variant", "design", "typography", "palette", "rhythm", "containerWidth",
  "hero", "composition", "locked", "focalLocked", "sections", "blocks", "children", "type", "hidden",
  "contentRef", "text", "caption", "deck", "emphasis", "headingProvenance", "blockId", "excerpt",
  "mediaIds", "sourceIds", "columns", "columnRatio", "gap", "aspectRatio", "crop", "placement",
  "gallery", "focalX", "focalY", "entries", "label", "qualityScore", "generatedAt", "model", "repairs",
]);
const safeStages = new Set<EditorialClientFailureStage>(["DATA_LOAD", "DATA_RESPONSE", "INITIAL_LAYOUT_GENERATION"]);
const safeCodes = new Set<EditorialClientFailureCode>([
  "NETWORK_ERROR", "REQUEST_TIMEOUT", "ADMIN_SESSION_EXPIRED", "ACCESS_DENIED", "NOT_FOUND", "HTTP_ERROR",
  "INVALID_JSON", "INVALID_ENVELOPE", "INVALID_DTO", "NODE_LIMIT", "LAYOUT_GENERATION_FAILED",
]);

/** Reduce a Zod issue path to known schema names and bounded array indexes only. */
export function safeEditorialSchemaPath(path: readonly PropertyKey[] | undefined): string | undefined {
  if (!path?.length) return undefined;
  const segments = path.slice(0, 12).map(part => {
    if (typeof part === "number") return Number.isInteger(part) && part >= 0 && part <= 999 ? String(part) : "index";
    return typeof part === "string" && schemaFields.has(part) ? part : "field";
  });
  return segments.join(".").slice(0, 128);
}

/** Client diagnostics are console-only. This function has no network or telemetry owner. */
export function recordEditorialClientFailure(
  failure: EditorialClientFailure,
  logger: Pick<Console, "error"> = console,
): void {
  const status = Number.isInteger(failure.status) && failure.status! >= 100 && failure.status! <= 599
    ? failure.status
    : undefined;
  const stage = safeStages.has(failure.stage) ? failure.stage : "DATA_LOAD";
  const code = safeCodes.has(failure.code) ? failure.code : "NETWORK_ERROR";
  const expectedTotalNodes = code === "NODE_LIMIT" ? EDITORIAL_V2_MAX_TOTAL_NODES : undefined;
  const actualTotalNodes = code === "NODE_LIMIT" && Number.isFinite(failure.actualTotalNodes)
    ? Math.min(1000, Math.max(0, Math.floor(failure.actualTotalNodes!)))
    : undefined;
  const fieldPath = failure.fieldPath
    ? safeEditorialSchemaPath(failure.fieldPath.split(".").map(segment => /^\d+$/.test(segment) ? Number(segment) : segment))
    : undefined;
  const event = {
    event: "editorial_client",
    stage,
    code,
    ...(status ? { status } : {}),
    ...(fieldPath ? { fieldPath } : {}),
    ...(expectedTotalNodes !== undefined ? { expectedTotalNodes } : {}),
    ...(actualTotalNodes !== undefined ? { actualTotalNodes } : {}),
  };
  try {
    logger.error(JSON.stringify(event));
  } catch {
    // Diagnostics must never prevent the UI from presenting or recovering from an error.
  }
}

export function editorialFailureRetryAction(failure: EditorialClientFailure): "RELOAD_DATA" | "RETRY_LAYOUT" {
  return failure.stage === "INITIAL_LAYOUT_GENERATION" ? "RETRY_LAYOUT" : "RELOAD_DATA";
}

export function editorialClientFailureMessage(failure: EditorialClientFailure): string {
  if (failure.stage === "INITIAL_LAYOUT_GENERATION") {
    if (failure.code === "NODE_LIMIT") {
      return `Dữ liệu đã tải, nhưng không thể tạo bố cục ban đầu trong giới hạn ${EDITORIAL_V2_MAX_TOTAL_NODES} node. Hãy thử tạo lại bố cục.`;
    }
    return "Dữ liệu đã tải, nhưng không thể tạo bố cục ban đầu. Hãy thử tạo lại bố cục.";
  }

  switch (failure.code) {
    case "NETWORK_ERROR": return "Không kết nối được để tải bản biên tập. Hãy kiểm tra mạng rồi thử lại.";
    case "REQUEST_TIMEOUT": return "Yêu cầu tải bản biên tập quá thời gian. Hãy thử lại.";
    case "ADMIN_SESSION_EXPIRED": return "Phiên Admin không còn hợp lệ. Hãy đăng nhập lại rồi thử lại.";
    case "ACCESS_DENIED": return "Tài khoản hiện tại không có quyền xem bản biên tập.";
    case "NOT_FOUND": return "Không tìm thấy dữ liệu biên tập cho điểm đến này.";
    case "INVALID_JSON":
    case "INVALID_ENVELOPE":
    case "INVALID_DTO": return "Phản hồi dữ liệu biên tập không hợp lệ. Hãy tải lại để thử lại.";
    default: return "Máy chủ chưa thể tải bản biên tập. Hãy thử lại sau.";
  }
}

export function editorialInitialLayoutFailure(error: unknown): EditorialClientFailure {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nodeLimit = value.code === "NODE_LIMIT";
  return {
    stage: "INITIAL_LAYOUT_GENERATION",
    code: nodeLimit ? "NODE_LIMIT" : "LAYOUT_GENERATION_FAILED",
    ...(nodeLimit && Number.isFinite(value.expectedNodeCount) ? { expectedTotalNodes: EDITORIAL_V2_MAX_TOTAL_NODES } : {}),
    ...(nodeLimit && Number.isFinite(value.actualNodeCount) ? { actualTotalNodes: value.actualNodeCount as number } : {}),
  };
}
