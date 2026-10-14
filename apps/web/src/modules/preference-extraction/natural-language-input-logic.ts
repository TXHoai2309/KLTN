import {
  MAX_PREFERENCE_INPUT_LENGTH,
  MIN_PREFERENCE_INPUT_LENGTH,
  normalizePreferenceInput,
  preferenceInputSchema,
} from "./preference-extraction-contract";

export type NaturalLanguageTextState =
  | {
      status: "TOO_SHORT";
      normalizedText: string;
      length: number;
      message: string;
    }
  | {
      status: "TOO_LONG";
      normalizedText: string;
      length: number;
      message: string;
    }
  | {
      status: "VALID";
      normalizedText: string;
      length: number;
      message: null;
    };

export type NaturalLanguageAnalyzeButtonState = {
  disabled: boolean;
  reason: string | null;
  label: string;
};

/** Count Unicode code points, not UTF-16 code units. */
export function countNaturalLanguageCodePoints(value: string): number {
  return [...value].length;
}

/**
 * Reuse the US25 input schema as the only source of length/normalization
 * rules. The raw textarea value is kept by the component; this result is the
 * normalized value that the next API task should submit.
 */
export function getNaturalLanguageTextState(
  rawValue: string,
): NaturalLanguageTextState {
  const normalizedText = normalizePreferenceInput(rawValue);
  const length = countNaturalLanguageCodePoints(normalizedText);
  const parsed = preferenceInputSchema.safeParse(rawValue);

  if (parsed.success) {
    return { status: "VALID", normalizedText: parsed.data, length, message: null };
  }

  const message = parsed.error.issues[0]?.message ??
    "Nội dung nhu cầu chuyến đi chưa hợp lệ.";
  if (length > MAX_PREFERENCE_INPUT_LENGTH) {
    return { status: "TOO_LONG", normalizedText, length, message };
  }
  // The shared schema currently has only the minimum/maximum text failures.
  // Keep a deterministic fallback if that contract grows another issue later.
  if (length < MIN_PREFERENCE_INPUT_LENGTH) {
    return { status: "TOO_SHORT", normalizedText, length, message };
  }
  return { status: "TOO_SHORT", normalizedText, length, message };
}

export function getNaturalLanguageAnalyzeButtonState(
  textState: NaturalLanguageTextState,
  isProcessing: boolean,
): NaturalLanguageAnalyzeButtonState {
  if (isProcessing) {
    return {
      disabled: true,
      reason: "Đang phân tích nhu cầu…",
      label: "Đang phân tích…",
    };
  }
  if (textState.status === "TOO_SHORT") {
    return {
      disabled: true,
      reason: `Nhập ít nhất ${MIN_PREFERENCE_INPUT_LENGTH} ký tự để phân tích.`,
      label: "Phân tích nhu cầu",
    };
  }
  if (textState.status === "TOO_LONG") {
    return {
      disabled: true,
      reason: `Rút ngắn nội dung còn tối đa ${MAX_PREFERENCE_INPUT_LENGTH} ký tự.`,
      label: "Phân tích nhu cầu",
    };
  }
  return { disabled: false, reason: null, label: "Phân tích nhu cầu" };
}
