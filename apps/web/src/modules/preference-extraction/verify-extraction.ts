import { isValidCalendarDate } from "../trip-requirement/trip-requirement-contract";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import {
  modelOutputSchema,
  verifyModelOutput,
  type ExtractionResult,
  type ModelOutput,
  type PreferenceExtractionField,
} from "./preference-extraction-contract";
import {
  PreferenceExtractionError,
} from "./preference-extraction-errors";

type ExtractionMeta = {
  model: string;
  latencyMs: number;
  inputLength: number;
};

const FIELD_NAMES: readonly PreferenceExtractionField[] = [
  "startDate",
  "durationDays",
  "transport",
  "companions",
  "interests",
  "pace",
  "mobilityConstraints",
];

function normalizeForSourceMatch(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/\s+/gu, " ")
    .trim();
}

function sourceContains(source: string, originalInput: string): boolean {
  const normalizedSource = normalizeForSourceMatch(source);
  const normalizedInput = normalizeForSourceMatch(originalInput);
  return normalizedSource.length > 0 && normalizedInput.includes(normalizedSource);
}

function missingField() {
  return { status: "MISSING" as const, value: null, sourceText: null, note: null };
}

function absoluteDateFromSource(sourceText: string): string | null {
  const normalized = normalizeForSourceMatch(sourceText);
  const iso = normalized.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/u);
  const separated = normalized.match(/(?<!\d)(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?!\d)/u);
  const vietnamese = normalized.match(
    /ngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+nam\s+(\d{4})(?!\d)/u,
  );

  let year: string;
  let month: string;
  let day: string;
  if (iso) {
    [, year, month, day] = iso;
  } else if (separated) {
    [, day, month, year] = separated;
  } else if (vietnamese) {
    [, day, month, year] = vietnamese;
  } else {
    return null;
  }

  const candidate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidCalendarDate(candidate) ? candidate : null;
}

function verifyAbsoluteStartDate(
  raw: ModelOutput["fields"]["startDate"],
  now: Date,
) {
  if (raw.status === "MISSING") return raw;
  if (raw.status !== "EXTRACTED") return raw;

  const parsedSourceDate = absoluteDateFromSource(raw.sourceText);
  if (parsedSourceDate === null || parsedSourceDate !== raw.value) {
    return {
      status: "AMBIGUOUS" as const,
      value: null,
      sourceText: raw.sourceText,
      note: "Ngày bắt đầu chưa ở dạng tuyệt đối đầy đủ và khớp với trích đoạn.",
    };
  }
  if (parsedSourceDate < vietnamDateOf(now)) {
    return {
      status: "UNSUPPORTED" as const,
      value: null,
      sourceText: raw.sourceText,
      note: "Ngày bắt đầu đã ở trong quá khứ theo múi giờ Việt Nam.",
    };
  }
  return raw;
}

function filterFabricatedFields(raw: ModelOutput, originalInput: string): ModelOutput {
  const fields = { ...raw.fields };
  for (const field of FIELD_NAMES) {
    const extraction = fields[field];
    if (
      extraction.status !== "MISSING" &&
      !sourceContains(extraction.sourceText, originalInput)
    ) {
      fields[field] = missingField() as never;
    }
  }
  return { fields };
}

/**
 * Parse and verify one provider response. Provider JSON is never allowed to
 * bypass source-text, absolute-date or US-24 verification.
 */
export function verifyProviderExtraction(
  rawText: string,
  originalInput: string,
  now: Date,
  meta: ExtractionMeta,
): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }

  const checked = modelOutputSchema.safeParse(parsed);
  if (!checked.success) {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }

  const filtered = filterFabricatedFields(checked.data, originalInput);
  filtered.fields.startDate = verifyAbsoluteStartDate(filtered.fields.startDate, now);
  try {
    return verifyModelOutput(filtered, meta);
  } catch {
    throw new PreferenceExtractionError("INVALID_PROVIDER_RESPONSE", false);
  }
}

export const verifyExtraction = verifyProviderExtraction;
export const verifyProviderOutput = verifyProviderExtraction;
