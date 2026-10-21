import { editorialStateSchema, type EditorialState } from "./editorial-contract";
import {
  safeEditorialSchemaPath,
  type EditorialClientFailure,
  type EditorialClientFailureCode,
  type EditorialClientFailureStage,
} from "./editorial-client-diagnostics";

export class EditorialClientLoadError extends Error {
  constructor(readonly failure: EditorialClientFailure) {
    super("Editorial data could not be loaded");
    this.name = "EditorialClientLoadError";
  }
}

function failure(
  stage: EditorialClientFailureStage,
  code: EditorialClientFailureCode,
  details: Pick<EditorialClientFailure, "status" | "fieldPath"> = {},
): EditorialClientLoadError {
  return new EditorialClientLoadError({ stage, code, ...details });
}

function isTimeoutError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "TimeoutError");
}

/** Fetch, validate the response envelope and parse the DTO as separate failure stages. */
export async function loadEditorialState(
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EditorialState> {
  let response: Response;
  try {
    response = await fetcher(`/api/admin/destinations/${encodeURIComponent(id)}/editorial`, {
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throw failure("DATA_LOAD", isTimeoutError(error) ? "REQUEST_TIMEOUT" : "NETWORK_ERROR");
  }

  if (!response.ok) {
    const code: EditorialClientFailureCode = response.status === 401 ? "ADMIN_SESSION_EXPIRED"
      : response.status === 403 ? "ACCESS_DENIED"
        : response.status === 404 ? "NOT_FOUND" : "HTTP_ERROR";
    throw failure("DATA_LOAD", code, { status: response.status });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw failure("DATA_RESPONSE", "INVALID_JSON", { status: response.status });
  }

  if (!body || typeof body !== "object" || (body as { success?: unknown }).success !== true || !("data" in body)) {
    throw failure("DATA_RESPONSE", "INVALID_ENVELOPE", { status: response.status });
  }

  const parsed = editorialStateSchema.safeParse((body as { data: unknown }).data);
  if (!parsed.success) {
    throw failure("DATA_RESPONSE", "INVALID_DTO", {
      status: response.status,
      fieldPath: safeEditorialSchemaPath(parsed.error.issues[0]?.path),
    });
  }
  return parsed.data;
}
