import type { TripPace } from "../trip-requirement/trip-requirement-contract";

/**
 * Deterministic Vietnamese/ASCII signal detection for S14 (relax-on-add-day) and S6 (gentle/family overnight rules).
 * Never alters `tripInfoSchema`, DB schema, or Constraint Validator invariants.
 */

export function foldSignalText(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const NON_CHILD_BE_COMPOUNDS =
  /\b(?:ban\s+be|be\s+ban|be\s+boi|be\s+mat|be\s+tong|be\s+thui|thit\s+be|be\s+day|be\s+rong|be\s+ngang|be\s+nuoc|be\s+ca|be\s+phao|be\s+suoi|(?:xe|duong|phong|quan|nha|ban|cho|ho|thac|nui|hang|lang|cong|san|cua|lo|ngach|ngo)\s+be)\b/gu;

const NEGATED_CHILD_CLAUSES =
  /\b(?:khong|ko|k|chua)\s+(?:co|di\s+cung|dan(?:\s+theo)?|mang(?:\s+theo)?|kem(?:\s+theo)?)\s+(?:tre\s+em|tre\s+nho|con\s+nho|em\s+be|be)\b/gu;

/**
 * Detects whether any traveler message indicates young children in the group:
 * "bé", "con nhỏ", "trẻ em", "trẻ nhỏ", "em bé", or "X tuổi" with X <= 10.
 * Accent-insensitive with guards against non-child compounds ("bạn bè", "bể bơi", "đường bé") and negations.
 */
export function hasYoungChildSignal(texts: readonly string[]): boolean {
  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const cleaned = foldSignalText(raw)
      .replace(NEGATED_CHILD_CLAUSES, " ")
      .replace(NON_CHILD_BE_COMPOUNDS, " ")
      .replace(/\s+/gu, " ")
      .trim();
    if (!cleaned) continue;

    if (/\b(?:con\s+nho|tre\s+em|tre\s+nho|em\s+be)\b/u.test(cleaned)) {
      return true;
    }

    // Check explicit "X tuổi" with X <= 10 (excluding "trên 10 tuổi" / "10 tuổi trở lên")
    for (const match of cleaned.matchAll(/\b(\d{1,2})\s*tuoi\b/gu)) {
      const age = Number(match[1]);
      if (Number.isInteger(age) && age >= 1 && age <= 10) {
        const before = cleaned.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
        const after = cleaned.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 14);
        if (!/\b(?:tren|hon|tu)\s*$/u.test(before) && !/^\s*tro\s+len\b/u.test(after)) {
          return true;
        }
      }
    }

    // Standalone "bé" (already stripped of "bạn bè", "bể bơi", "xe bé", negated "không có bé", etc.)
    if (/\bbe\b/u.test(cleaned)) {
      return true;
    }
  }
  return false;
}

const NEGATED_RELAX_CLAUSES =
  /\b(?:khong|ko|k|chua|dung)\s+(?:can|phai|muon|thich|ngai|so)\s+(?:di\s+)?(?:thu\s+tha|thong\s+tha|do\s+met|nhe\s+nhang|ve\s+som(?:\s+hon)?|gian\s+lich|muon|khuya)\b/gu;

const RELAX_REASON_PATTERN =
  /\b(?:thu\s+tha|thong\s+tha|do\s+met|bot\s+met|nhe\s+nhang|ve\s+som(?:\s+hon)?|muon\s+qua|qua\s+muon|khuya\s+qua|gian\s+(?:lich|ra|bot|nhip))\b/u;

const GENTLE_PACE_WORDING_PATTERN =
  /\b(?:di\s+thu\s+tha|di\s+thong\s+tha|di\s+nhe\s+nhang|nhe\s+nhang|nhip\s+nhe|it\s+leo\s+treo)\b/u;

/**
 * Detects whether a traveler message asks to relax / slow down / reduce fatigue / return earlier.
 * Explicitly does NOT trigger on casual phrases like "không vội cũng được" or negated clauses like "không cần về sớm".
 */
export function hasRelaxReasonSignal(text: string): boolean {
  if (!text?.trim()) return false;
  const cleaned = foldSignalText(text)
    .replace(NEGATED_RELAX_CLAUSES, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return false;
  return RELAX_REASON_PATTERN.test(cleaned);
}

/**
 * Detects explicit gentle-pace wording in conversation history when `tripInfo.pace` has not been explicitly set.
 * Does NOT trigger on "không vội cũng được" or negated phrases.
 */
export function hasGentlePaceWording(texts: readonly string[]): boolean {
  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const cleaned = foldSignalText(raw)
      .replace(NEGATED_RELAX_CLAUSES, " ")
      .replace(/\s+/gu, " ")
      .trim();
    if (cleaned && GENTLE_PACE_WORDING_PATTERN.test(cleaned)) {
      return true;
    }
  }
  return false;
}

export type RelaxAndFamilySignals = {
  hasYoungChild: boolean;
  hasRelaxReason: boolean;
  isRelaxedPace: boolean;
  /** S6: group has young children or relaxed/gentle pace. */
  gentleFamily: boolean;
  /** S14: durationDays increased AND (hasRelaxReason || isRelaxedPace || hasYoungChild). */
  relaxAddDayMode: boolean;
};

export function detectRelaxAndFamilySignals(input: {
  latestUserText: string;
  userTexts: readonly string[];
  recordedPace?: TripPace;
  effectivePace?: TripPace;
  durationIncreased: boolean;
}): RelaxAndFamilySignals {
  const hasYoungChild = hasYoungChildSignal(input.userTexts);
  const hasRelaxReason = hasRelaxReasonSignal(input.latestUserText);
  const isRelaxedPace =
    input.recordedPace === "RELAXED"
    || input.effectivePace === "RELAXED"
    || (input.recordedPace === undefined && hasGentlePaceWording(input.userTexts));
  const gentleFamily = hasYoungChild || isRelaxedPace;
  const relaxAddDayMode = input.durationIncreased && (hasRelaxReason || isRelaxedPace || hasYoungChild);
  return {
    hasYoungChild,
    hasRelaxReason,
    isRelaxedPace,
    gentleFamily,
    relaxAddDayMode,
  };
}
