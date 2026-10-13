import { AppError } from "../../server/http/app-error";

import {
  TRANSPORT_OPTIONS,
  TRANSPORT_VALUES,
  type TripTransport,
} from "./trip-requirement-contract";

/**
 * PROPOSED — pending product owner confirmation. This is the single keyword
 * table for the MVP transport policy. It is reused by source verification and
 * the extraction prompt; it is not a canonical enum or a value mapper.
 */
export const TRANSPORT_KEYWORDS = {
  MOTORCYCLE: [
    "xe máy",
    "xe số",
    "xe ga",
    "mô tô",
    "moto",
    "motorbike",
    "motorcycle",
    "scooter",
  ],
  CAR: ["ô tô", "oto", "xe hơi", "xe 4 chỗ", "xe 7 chỗ", "car"],
  UNSUPPORTED: [
    "xe đạp điện",
    "xe đạp",
    "xe buýt",
    "bus",
    "xe khách",
    "limousine",
    "taxi",
    "grab",
    "be",
    "xanh sm",
    "tàu hỏa",
    "tàu thủy",
    "tàu",
    "train",
    "máy bay",
    "flight",
    "đi bộ",
    "trekking-bộ",
    "trekking",
    "thuyền",
    "xe ôm công nghệ",
  ],
  AMBIGUOUS: [
    "đi xe",
    "tự lái",
    "phương tiện cá nhân",
    "thuê xe",
    "xe riêng",
  ],
} as const;

export const SUPPORTED_TRANSPORTS = TRANSPORT_VALUES;
export const SUPPORTED_TRANSPORT_LABELS_VI = Object.fromEntries(
  TRANSPORT_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<TripTransport, string>;

export const TRANSPORT_UNSUPPORTED_ERROR_MESSAGE =
  "MVP hiện chỉ hỗ trợ xe máy hoặc ô tô. Vui lòng chọn một trong hai.";

export type TransportTextKind =
  | "MOTORCYCLE"
  | "CAR"
  | "UNSUPPORTED"
  | "AMBIGUOUS"
  | "CONFLICT"
  | "NONE";

export type TransportTextClassification = {
  kind: TransportTextKind;
  matched: string[];
};

function normalizeTransportText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedKeyword(value: string): string {
  return normalizeTransportText(value);
}

function matchesKeyword(text: string, keyword: string): boolean {
  const normalized = normalizedKeyword(keyword);
  return normalized.length > 0 && ` ${text} `.includes(` ${normalized} `);
}

function matchedKeywords(
  text: string,
  keywords: readonly string[],
): string[] {
  const matched = keywords
    .filter((keyword) => matchesKeyword(text, keyword))
    .sort((left, right) => normalizedKeyword(right).length - normalizedKeyword(left).length);

  // A phrase such as "xe đạp điện" should be reported once, not as both the
  // longer phrase and its shorter component "xe đạp".
  return matched.filter(
    (keyword, index) =>
      !matched.some(
        (longer, longerIndex) =>
          longerIndex !== index &&
          normalizedKeyword(longer).length > normalizedKeyword(keyword).length &&
          ` ${normalizedKeyword(longer)} `.includes(` ${normalizedKeyword(keyword)} `),
      ),
  );
}

function hasInstructionLikeTransportText(text: string): boolean {
  // Treat model-control wording as non-preference data. This is deliberately
  // conservative: it prevents phrases such as "mặc định dùng ô tô" from
  // certifying a transport value during post-verification.
  return /(?:mac dinh|tra|transport|ignore|system)\b.*(?:o to|oto|car|motorcycle|airplane)/u.test(text);
}

function hasExplicitPreferenceText(text: string): boolean {
  return /(?:di|bang|cho chuyen di|nguoi dung noi|cau that la)\s+(?:xe may|xe so|xe ga|mo to|moto|motorbike|motorcycle|scooter|o to|oto|xe hoi|xe 4 cho|xe 7 cho|car)/u.test(text);
}

function isMobilityConstraintMention(text: string, keyword: string): boolean {
  const normalized = normalizedKeyword(keyword);
  if (normalized === "di bo") {
    return /(?:han che|tranh|khong)\s+di bo/u.test(text);
  }
  // "be" is a ride-hailing brand in the policy, but after accent removal it
  // is also the Vietnamese word "bé". Keep the common child phrase intact.
  return normalized === "be" && /(?:em|tre|con)\s+be/u.test(text);
}

/** Classifies only explicit source wording; it never maps an alias to a value. */
export function classifyTransportText(text: string): TransportTextClassification {
  if (typeof text !== "string") return { kind: "NONE", matched: [] };
  const normalized = normalizeTransportText(text);
  if (normalized.length === 0) return { kind: "NONE", matched: [] };
  if (hasInstructionLikeTransportText(normalized) && !hasExplicitPreferenceText(normalized)) {
    return { kind: "AMBIGUOUS", matched: [] };
  }

  const motorcycle = matchedKeywords(normalized, TRANSPORT_KEYWORDS.MOTORCYCLE);
  const car = matchedKeywords(normalized, TRANSPORT_KEYWORDS.CAR);
  const unsupported = matchedKeywords(normalized, TRANSPORT_KEYWORDS.UNSUPPORTED)
    .filter((keyword) => !isMobilityConstraintMention(normalized, keyword));
  let ambiguous = matchedKeywords(normalized, TRANSPORT_KEYWORDS.AMBIGUOUS);

  // "đi xe máy" is explicit enough; the generic phrase is not an additional
  // conflict. Other ambiguous wording remains conservative when combined
  // with a supported vehicle and is therefore not used to select one.
  ambiguous = ambiguous.filter(
    (keyword) => !(normalizedKeyword(keyword) === "di xe" && (motorcycle.length > 0 || car.length > 0 || unsupported.length > 0)),
  );

  const supported = [...motorcycle, ...car];
  if ((motorcycle.length > 0 && car.length > 0) || (supported.length > 0 && unsupported.length > 0)) {
    return { kind: "CONFLICT", matched: [...supported, ...unsupported, ...ambiguous] };
  }
  if (supported.length > 0 && ambiguous.length > 0) {
    return { kind: "AMBIGUOUS", matched: [...supported, ...ambiguous] };
  }
  if (motorcycle.length > 0) return { kind: "MOTORCYCLE", matched: motorcycle };
  if (car.length > 0) return { kind: "CAR", matched: car };
  if (unsupported.length > 0) return { kind: "UNSUPPORTED", matched: unsupported };
  if (ambiguous.length > 0) return { kind: "AMBIGUOUS", matched: ambiguous };
  return { kind: "NONE", matched: [] };
}

export function assertSupportedTransportValue(value: unknown): TripTransport {
  if ((SUPPORTED_TRANSPORTS as readonly unknown[]).includes(value)) {
    return value as TripTransport;
  }
  throw new AppError(
    "TRANSPORT_UNSUPPORTED",
    TRANSPORT_UNSUPPORTED_ERROR_MESSAGE,
    422,
  );
}
