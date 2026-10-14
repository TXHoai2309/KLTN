import { TRANSPORT_VALUES, type TripTransport } from "./trip-requirement-contract";

export type TransportExtractionCandidate = {
  status: "EXTRACTED" | "AMBIGUOUS" | "MISSING" | "UNSUPPORTED";
  value: unknown;
  /** Optional marker for a verifier that downgraded an apparent extraction. */
  downgraded?: boolean;
};

/**
 * The only extraction-to-transport mapping allowed on the client.
 * Unsupported, ambiguous, missing, downgraded or malformed values stay empty.
 */
export function resolveTransportCandidateFromExtraction(
  field: TransportExtractionCandidate,
): TripTransport | null {
  if (field.status !== "EXTRACTED" || field.downgraded === true) return null;
  return (TRANSPORT_VALUES as readonly unknown[]).includes(field.value)
    ? field.value as TripTransport
    : null;
}

export const UNRESOLVED_TRANSPORT_AI_NOTE =
  "Gợi ý ban đầu của AI: không xác định được phương tiện hỗ trợ";

export function unresolvedTransportMessage(sourceText: string | null): string {
  const source = sourceText?.normalize("NFC").trim() || "chưa được nêu rõ";
  return `Phương tiện bạn nhắc tới (“${source}”) hiện chưa được hỗ trợ. Hệ thống chỉ hỗ trợ xe máy hoặc ô tô — vui lòng tự chọn.`;
}

