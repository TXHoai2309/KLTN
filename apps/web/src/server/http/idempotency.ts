import { createHash } from "node:crypto";

import type { Database, Prisma } from "@KLTN/db";

import type { MutationError, MutationOutcome } from "../../lib/mutation-contract";
import { AppError } from "./app-error";

const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_IDEMPOTENCY_SCOPE_LENGTH = 300;

type IdempotencyRecord = {
  requestHash: string;
  responseJson: string;
};

type IdempotentWriteOptions<T> = {
  database: Database;
  /** Authenticated user or tenant whose write is being performed. */
  actorId: string;
  /** Stable operation name, for example `trip:create`. */
  operation: string;
  key: string;
  /** The validated request data. Object keys are sorted before hashing. */
  input: unknown;
  /**
   * Keep every database write inside this transaction. Do not perform external
   * side effects here because the transaction may be retried after UNKNOWN.
   */
  execute: (transaction: Prisma.TransactionClient) => Promise<T>;
};

const unknownOutcome = (): MutationOutcome<never> => ({
  status: "UNKNOWN",
  error: {
    code: "OPERATION_STATUS_UNKNOWN",
    message:
      "Chưa thể xác định thao tác đã hoàn tất hay chưa. Hãy thử lại với cùng Idempotency-Key.",
  },
  retryWithSameKey: true,
});

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key")?.trim();

  if (!key) {
    throw new AppError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Thiếu header Idempotency-Key",
      400,
    );
  }

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new AppError(
      "IDEMPOTENCY_KEY_INVALID",
      `Idempotency-Key không được dài quá ${MAX_IDEMPOTENCY_KEY_LENGTH} ký tự`,
      400,
    );
  }

  return key;
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AppError(
        "IDEMPOTENCY_INPUT_INVALID",
        "Dữ liệu idempotency phải là JSON thuần",
        400,
      );
    }

    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );

    return `{${entries
      .map(([key, entryValue]) => {
        return `${JSON.stringify(key)}:${canonicalJson(entryValue)}`;
      })
      .join(",")}}`;
  }

  throw new AppError(
    "IDEMPOTENCY_INPUT_INVALID",
    "Dữ liệu idempotency phải là JSON thuần",
    400,
  );
}

function toRequestHash(input: unknown): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function toJsonResponse<T>(value: T): { json: string; data: T } {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw new TypeError("Mutation result is not JSON serializable");
    }

    return { json, data: JSON.parse(json) as T };
  } catch {
    throw new AppError(
      "MUTATION_RESULT_INVALID",
      "Kết quả thao tác ghi phải chuyển được thành JSON",
      500,
    );
  }
}

function resolveExisting<T>(
  record: IdempotencyRecord,
  requestHash: string,
): MutationOutcome<T> {
  if (record.requestHash !== requestHash) {
    return {
      status: "FAILED",
      httpStatus: 409,
      error: {
        code: "IDEMPOTENCY_KEY_REUSED",
        message:
          "Idempotency-Key này đã được dùng cho một nội dung request khác",
      },
    };
  }

  try {
    return {
      status: "SUCCESS",
      data: JSON.parse(record.responseJson) as T,
      replayed: true,
    };
  } catch {
    return unknownOutcome();
  }
}

function toKnownFailure(error: AppError): MutationOutcome<never> {
  const failure: MutationError = {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };

  return {
    status: "FAILED",
    httpStatus: error.status,
    error: failure,
  };
}

function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

type ReplayOptions = Pick<IdempotentWriteOptions<never>, "database" | "actorId" | "operation" | "key" | "input">;

function prepareIdentity({ actorId, operation, key, input }: ReplayOptions):
  { scope: string; requestHash: string } | MutationOutcome<never> {
  const scope = JSON.stringify([actorId, operation]);

  if (
    !actorId.trim() ||
    !operation.trim() ||
    scope.length > MAX_IDEMPOTENCY_SCOPE_LENGTH
  ) {
    return {
      status: "FAILED",
      httpStatus: 500,
      error: {
        code: "IDEMPOTENCY_SCOPE_INVALID",
        message: "Idempotency scope không hợp lệ",
      },
    };
  }

  if (!key.trim() || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      status: "FAILED",
      httpStatus: 400,
      error: {
        code: "IDEMPOTENCY_KEY_INVALID",
        message: "Idempotency-Key không hợp lệ",
      },
    };
  }

  let requestHash: string;
  try {
    requestHash = toRequestHash(input);
  } catch (error) {
    if (isAppError(error)) return toKnownFailure(error);
    return unknownOutcome();
  }

  return { scope, requestHash };
}

/** Caller authenticates and validates ownership first. Lookup errors never mean absence. */
export async function preflightIdempotentReplay<T>(options: ReplayOptions):
  Promise<MutationOutcome<T> | { status: "ABSENT" }> {
  const identity = prepareIdentity(options);
  if ("status" in identity) return identity;
  try {
    const record = await options.database.idempotencyRecord.findUnique({
      where: { scope_key: { scope: identity.scope, key: options.key } },
      select: { requestHash: true, responseJson: true },
    });
    return record ? resolveExisting<T>(record, identity.requestHash) : { status: "ABSENT" };
  } catch { return unknownOutcome(); }
}

/**
 * Runs a database write and its successful response record atomically.
 * Only successful outcomes are persisted; failed transactions can be retried
 * with the same key. Unknown outcomes must also be retried with that same key.
 */
export async function executeIdempotentWrite<T>(
  options: IdempotentWriteOptions<T>,
): Promise<MutationOutcome<T>> {
  const { database, actorId, operation, key, input, execute } = options;
  const identity = prepareIdentity(options);
  if ("status" in identity) return identity;
  const { scope, requestHash } = identity;

  try {
    const existing = await database.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
      select: { requestHash: true, responseJson: true },
    });

    if (existing) return resolveExisting<T>(existing, requestHash);
  } catch {
    return unknownOutcome();
  }

  try {
    return await database.$transaction(async (transaction) => {
      await transaction.idempotencyRecord.create({
        data: { scope, key, requestHash, responseJson: "null" },
      });

      const result = await execute(transaction);
      const response = toJsonResponse(result);

      await transaction.idempotencyRecord.update({
        where: { scope_key: { scope, key } },
        data: { responseJson: response.json },
      });

      return {
        status: "SUCCESS",
        data: response.data,
        replayed: false,
      };
    });
  } catch (error) {
    // A concurrent request may have committed the same key while this one ran.
    try {
      const existing = await database.idempotencyRecord.findUnique({
        where: { scope_key: { scope, key } },
        select: { requestHash: true, responseJson: true },
      });

      if (existing) return resolveExisting<T>(existing, requestHash);
    } catch {
      return unknownOutcome();
    }

    if (isAppError(error)) return toKnownFailure(error);

    console.error("Idempotent write outcome is unknown:", error);
    return unknownOutcome();
  }
}
