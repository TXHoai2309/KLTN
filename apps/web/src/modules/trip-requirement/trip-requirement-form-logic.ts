import {
  MAX_DURATION_DAYS,
  MIN_DURATION_DAYS,
  TRANSPORT_VALUES,
  tripRequirementFieldErrors,
  tripRequirementInputSchema,
} from "./trip-requirement-contract";
import type { TripRequirementInput } from "./trip-requirement-contract";
import type { TripRequirementReadiness } from "./trip-requirement-readiness";

export type TripRequirementFormFields = {
  startDate: string;
  durationDays: string;
  transport: string;
  companionType: string;
  companionGroupSize: string;
  interests: string[];
  pace: string;
  mobilityFlags: string[];
  mobilityNote: string;
};

export type TripRequirementEvaluateSuccess = {
  requirement: TripRequirementInput;
  readiness: TripRequirementReadiness;
};

export type EvaluateResponseInput =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "network" };

export type EvaluateResponseDecision =
  | { action: "SUCCESS"; data: TripRequirementEvaluateSuccess }
  | { action: "VALIDATION_ERROR"; fieldErrors: Record<string, string>; message: string }
  | { action: "LOGIN"; message: string }
  | { action: "FORBIDDEN"; message: string }
  | { action: "TECHNICAL_ERROR"; message: string }
  | { action: "NETWORK_ERROR"; message: string };

export type SubmitButtonState = {
  disabled: boolean;
  ariaBusy: boolean;
  label: string;
};

export type TripRequirementValidationFields = Omit<
  TripRequirementFormFields,
  "durationDays" | "transport"
> & {
  durationDays: string | null;
  transport: string | null;
};

const INTEGER_TEXT = /^\d+$/;
const REQUIRED_ERROR_ORDER = ["durationDays", "transport"] as const;
const OPTIONAL_ERROR_ORDER = [
  "startDate",
  "companions.type",
  "companions.groupSize",
  "interests",
  "pace",
  "mobilityConstraints.flags",
  "mobilityConstraints.note",
] as const;

function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize("NFC").trim();
  return normalized === "" ? null : normalized;
}

function parseIntegerOrKeep(value: string | null | undefined): number | string | null {
  const normalized = normalizeText(value);
  if (normalized === null) return null;

  if (!INTEGER_TEXT.test(normalized)) return normalized;

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : normalized;
}

function parseOptionalObjectValue(value: string | null | undefined): string | null {
  return normalizeText(value);
}

function stableErrorRecord(
  errors: Record<string, string>,
): Record<string, string> {
  const ordered: Record<string, string> = {};
  for (const field of [...REQUIRED_ERROR_ORDER, ...OPTIONAL_ERROR_ORDER]) {
    if (errors[field]) ordered[field] = errors[field];
  }
  for (const [field, message] of Object.entries(errors)) {
    if (!ordered[field]) ordered[field] = message;
  }
  return ordered;
}

/**
 * Performs the small, accessible client gate for the two required controls,
 * then asks the shared contract schema to validate optional values. The
 * server remains authoritative and always re-validates the complete payload.
 */
export function validateRequiredFields(
  fields: TripRequirementValidationFields,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const durationText = normalizeText(fields.durationDays);
  let durationForSchema: number = MIN_DURATION_DAYS;

  if (durationText === null) {
    errors.durationDays = "Vui lòng nhập thời lượng chuyến đi (số ngày).";
  } else if (!INTEGER_TEXT.test(durationText)) {
    errors.durationDays = "Thời lượng phải là số nguyên (ví dụ: 3).";
  } else {
    const parsed = Number(durationText);
    if (!Number.isSafeInteger(parsed) || parsed > MAX_DURATION_DAYS) {
      errors.durationDays = `Thời lượng tối đa là ${MAX_DURATION_DAYS} ngày.`;
    } else if (parsed < MIN_DURATION_DAYS) {
      errors.durationDays = "Thời lượng tối thiểu là 1 ngày.";
    } else {
      durationForSchema = parsed;
    }
  }

  const transportText = normalizeText(fields.transport);
  let transportForSchema: (typeof TRANSPORT_VALUES)[number] = TRANSPORT_VALUES[0];
  if (transportText === null) {
    errors.transport = "Vui lòng chọn phương tiện: xe máy hoặc ô tô.";
  } else if (!TRANSPORT_VALUES.includes(transportText as (typeof TRANSPORT_VALUES)[number])) {
    errors.transport = "Hiện chỉ hỗ trợ xe máy hoặc ô tô. Vui lòng chọn lại.";
  } else {
    transportForSchema = transportText as (typeof TRANSPORT_VALUES)[number];
  }

  const contractResult = tripRequirementInputSchema.safeParse({
    ...buildPayload(fields),
    durationDays: durationForSchema,
    transport: transportForSchema,
  });
  if (!contractResult.success) {
    const contractErrors = tripRequirementFieldErrors(contractResult.error);
    for (const field of OPTIONAL_ERROR_ORDER) {
      if (contractErrors[field]) errors[field] = contractErrors[field];
    }
    for (const [field, message] of Object.entries(contractErrors)) {
      if (!REQUIRED_ERROR_ORDER.includes(field as (typeof REQUIRED_ERROR_ORDER)[number])) {
        errors[field] ??= message;
      }
    }
  }

  return stableErrorRecord(errors);
}

/**
 * Converts the deliberately string-based form state into the API boundary.
 * Only plain integer text is converted to a number. Invalid numeric text is
 * retained so the server contract can return the authoritative field error.
 */
export function buildPayload(
  fields: TripRequirementFormFields | TripRequirementValidationFields,
): Record<string, unknown> {
  const companionType = parseOptionalObjectValue(fields.companionType);
  const companionGroupSize = parseIntegerOrKeep(fields.companionGroupSize);
  const companions =
    companionType === null
      ? null
      : { type: companionType, groupSize: companionGroupSize };

  const mobilityNote = parseOptionalObjectValue(fields.mobilityNote);
  const mobilityConstraints =
    fields.mobilityFlags.length === 0 && mobilityNote === null
      ? null
      : { flags: [...fields.mobilityFlags], note: mobilityNote };

  return {
    startDate: normalizeText(fields.startDate),
    durationDays: parseIntegerOrKeep(fields.durationDays),
    transport: parseOptionalObjectValue(fields.transport),
    companions,
    interests: [...fields.interests],
    pace: parseOptionalObjectValue(fields.pace),
    mobilityConstraints,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== "string") {
    return fallback;
  }
  return body.error.message;
}

export function mapFieldErrors(details: unknown): Record<string, string> {
  if (!isRecord(details) || !isRecord(details.fieldErrors)) return {};

  return Object.fromEntries(
    Object.entries(details.fieldErrors).map(([field, message]) => [
      field,
      typeof message === "string" ? message : "Thông tin trường này chưa hợp lệ.",
    ]),
  );
}

function isEvaluateSuccessData(value: unknown): value is TripRequirementEvaluateSuccess {
  if (!isRecord(value)) return false;
  return isRecord(value.requirement) && isRecord(value.readiness);
}

/** Maps the shared API envelope to UI actions without mutating form state. */
export function decideEvaluateResponse(
  input: EvaluateResponseInput,
): EvaluateResponseDecision {
  if (input.kind === "network") {
    return {
      action: "NETWORK_ERROR",
      message: "Không thể kết nối để đánh giá nhu cầu. Dữ liệu vẫn được giữ lại, hãy thử lại.",
    };
  }

  const { status, body } = input;
  if (status === 200 && isRecord(body) && body.success === true && isEvaluateSuccessData(body.data)) {
    return { action: "SUCCESS", data: body.data };
  }

  const apiError = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = apiError && typeof apiError.code === "string" ? apiError.code : null;
  const message = errorMessage(body, "Không thể xử lý yêu cầu lúc này.");

  if (status === 400 && code === "VALIDATION_ERROR") {
    return {
      action: "VALIDATION_ERROR",
      fieldErrors: mapFieldErrors(apiError?.details),
      message,
    };
  }

  if (status === 401 || code === "UNAUTHENTICATED") {
    return {
      action: "LOGIN",
      message: "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại; bạn sẽ cần nhập lại nhu cầu.",
    };
  }

  if (status === 403 || code === "FORBIDDEN") {
    return { action: "FORBIDDEN", message: "Bạn không có quyền sử dụng chức năng lập hành trình." };
  }

  return {
    action: "TECHNICAL_ERROR",
    message:
      status >= 500
        ? "Hệ thống chưa thể đánh giá nhu cầu lúc này. Dữ liệu vẫn được giữ lại, hãy thử lại."
        : message,
  };
}

export function getSubmitButtonState(isPending: boolean): SubmitButtonState {
  return {
    disabled: isPending,
    ariaBusy: isPending,
    label: isPending ? "Đang xem lại…" : "Xem lại nhu cầu",
  };
}

export function shouldApplyRequestResponse(
  requestSequence: number,
  currentSequence: number,
  mounted: boolean,
): boolean {
  return mounted && requestSequence === currentSequence;
}
