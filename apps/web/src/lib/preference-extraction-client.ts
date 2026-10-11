import {
  extractionResultSchema,
  type ExtractionResult,
} from "@/modules/preference-extraction/preference-extraction-contract";

export type AnalyzeTripNeedsResult =
  | { kind: "SUCCESS"; result: ExtractionResult }
  | {
      kind: "FAILED";
      status: number;
      code: string;
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | { kind: "NETWORK_ERROR" };

export type AnalyzeTripNeedsResponseInput =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "network" };

const INVALID_RESPONSE_MESSAGE = "Phản hồi phân tích nhu cầu không hợp lệ.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Pure response mapping for the browser adapter. The result schema remains
 * the only source of truth for successful AI output.
 */
export function decideAnalyzeTripNeedsResponse(
  input: AnalyzeTripNeedsResponseInput,
): AnalyzeTripNeedsResult {
  if (input.kind === "network") return { kind: "NETWORK_ERROR" };

  if (
    input.status === 200 &&
    isRecord(input.body) &&
    input.body.success === true &&
    isRecord(input.body.data)
  ) {
    const result = extractionResultSchema.safeParse(input.body.data.result);
    if (result.success) return { kind: "SUCCESS", result: result.data };
    return {
      kind: "FAILED",
      status: 502,
      code: "AI_INVALID_RESPONSE",
      message: INVALID_RESPONSE_MESSAGE,
    };
  }

  const error = isRecord(input.body) && isRecord(input.body.error) ? input.body.error : null;
  const code = error && typeof error.code === "string" ? error.code : "AI_UNAVAILABLE";
  const message = error && typeof error.message === "string"
    ? error.message
    : "Tính năng phân tích nhu cầu hiện chưa sẵn sàng. Bạn vẫn có thể nhập bằng biểu mẫu.";
  const details = error ? stringRecord(error.details && isRecord(error.details) ? error.details.fieldErrors : undefined) : undefined;

  return {
    kind: "FAILED",
    status: input.status >= 400 ? input.status : 502,
    code,
    message,
    ...(details ? { fieldErrors: details } : {}),
  };
}

export async function analyzeTripNeeds(
  text: string,
  signal?: AbortSignal,
): Promise<AnalyzeTripNeedsResult> {
  try {
    const response = await fetch("/api/trip-requirements/analyze", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return decideAnalyzeTripNeedsResponse({ kind: "http", status: response.status, body });
  } catch {
    return { kind: "NETWORK_ERROR" };
  }
}
