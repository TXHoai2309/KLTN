import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../server/http/app-error";
import { originSelectionSchema } from "../trip-origin/trip-origin-contract";
import { DAILY_DRIVING_WARNING_HOURS } from "../trip-origin/journey-planner";
import { driveWithRest, restProfileOf, type RestMode } from "../trip-origin/rest-policy";
import { vietnamCoverageAt } from "../trip-origin/vietnam-coverage";
import { haversine } from "../trip-planner/planner-geography";
import type { TripTransport } from "../trip-requirement/trip-requirement-contract";
import { vietnamDateOf } from "../trip-requirement/trip-requirement-readiness";
import { TRIP_HUBS } from "./trip-hubs";

/**
 * Server-only chat origin resolution and HMAC signing (ADR-43 §3).
 * Coordinates stay on the server; candidates sent to the browser are HMAC-signed and verified before confirmation.
 */

export const ORIGIN_CANDIDATE_TTL_MS = 30 * 60 * 1000;
export const MAX_ORIGIN_CANDIDATES = 3;

export const signedOriginCandidateSchema = z.object({
  id: z.string().min(1).max(64),
  label: originSelectionSchema.shape.label,
  latitude: originSelectionSchema.shape.latitude,
  longitude: originSelectionSchema.shape.longitude,
  source: originSelectionSchema.shape.source,
}).strict();
export type SignedOriginCandidate = z.infer<typeof signedOriginCandidateSchema>;

const signedPayloadSchema = z.object({
  v: z.literal(1),
  userId: z.string().min(1).max(128),
  exp: z.number().int().positive(),
  candidates: z.array(signedOriginCandidateSchema).min(1).max(MAX_ORIGIN_CANDIDATES),
}).strict();

export type VerifiedOriginCandidates =
  | { status: "NONE"; candidates: [] }
  | { status: "EXPIRED"; candidates: [] }
  | { status: "VALID"; candidates: SignedOriginCandidate[] };

export const FIXED_HUB_CANDIDATES: readonly SignedOriginCandidate[] = TRIP_HUBS.map(hub => ({
  id: `hub:${hub.id}`,
  label: hub.name,
  latitude: hub.latitude,
  longitude: hub.longitude,
  source: "MANUAL" as const,
}));

const AAD = Buffer.from("KLTN/tripsage-chat/origin-candidates/v1");
const invalid = () => new AppError("INVALID_INPUT", "Nội dung yêu cầu chưa hợp lệ.", 400);

function signingKey(secret: string): Buffer | null {
  if (!secret || secret.length < 16) return null;
  return Buffer.from(hkdfSync("sha256", secret, "KLTN-tripsage-origin", AAD, 32));
}

export function signOriginCandidates(input: {
  userId: string;
  candidates: SignedOriginCandidate[];
  secret: string;
  nowMs: number;
  ttlMs?: number;
}): string | null {
  const key = signingKey(input.secret);
  if (!key) return null;
  const payload = signedPayloadSchema.parse({
    v: 1,
    userId: input.userId,
    exp: Math.floor(input.nowMs + (input.ttlMs ?? ORIGIN_CANDIDATE_TTL_MS)),
    candidates: input.candidates.slice(0, MAX_ORIGIN_CANDIDATES),
  });
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", key).update(`v1.${encoded}`).digest("base64url");
  return `v1.${encoded}.${signature}`;
}

/**
 * Verifies a browser-returned origin candidates token. Tampered, malformed, wrong-user or out-of-Vietnam payloads
 * throw 400 INVALID_INPUT; a legitimately signed but expired token returns EXPIRED so the chat can ask again.
 */
export function verifyOriginCandidatesToken(token: string, userId: string, secret: string, nowMs: number): VerifiedOriginCandidates {
  const key = signingKey(secret);
  if (!key || token.length > 8_192 || !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) throw invalid();
  const [, encoded, sig] = token.split(".");
  if (!encoded || !sig) throw invalid();
  const expected = createHmac("sha256", key).update(`v1.${encoded}`).digest();
  const provided = Buffer.from(sig, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw invalid();
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw invalid(); }
  const parsed = signedPayloadSchema.safeParse(raw);
  if (!parsed.success || parsed.data.userId !== userId) throw invalid();
  if (!parsed.data.candidates.every(item => vietnamCoverageAt(item) === "SUPPORTED")) throw invalid();
  if (parsed.data.exp <= nowMs) return { status: "EXPIRED", candidates: [] };
  return { status: "VALID", candidates: parsed.data.candidates };
}

function foldVietnamese(text: string): string {
  return text.normalize("NFKD").toLowerCase().replace(/[\p{M}\p{Cf}]/gu, "").replace(/đ/gu, "d").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/gu, " ").trim();
}

const HUB_ALIASES: Record<string, readonly string[]> = {
  "hub:HA_NOI": ["ha noi", "hanoi", "hn", "tp ha noi", "thanh pho ha noi", "ben xe my dinh", "my dinh", "ha noi ben xe my dinh", "ben xe my dinh ha noi"],
  "hub:HA_GIANG_CITY": ["ha giang", "tp ha giang", "thanh pho ha giang", "ben xe phia nam", "ha giang ben xe phia nam", "tp ha giang ben xe phia nam", "ben xe ha giang"],
};

const HUB_SPECIFIC_PATTERNS: Record<string, readonly RegExp[]> = {
  "hub:HA_NOI": [/\b(?:ha\s+noi|hanoi|my\s+dinh)\b/u],
  "hub:HA_GIANG_CITY": [
    /\b(?:tp\s+ha\s+giang|thanh\s+pho\s+ha\s+giang|ben\s+xe\s+(?:phia\s+nam|ha\s+giang))\b/u,
    /\b(?:tap\s+ket(?:\s+(?:o|tai))?|xuat\s+phat\s+tu|bat\s+dau\s+tu|doi\s+sang|doi\s+thanh|chuyen\s+sang|chon|chot)\s+(?:tp\s+)?ha\s+giang\b/u,
  ],
};

/** Hedging or hub-comparison phrases that indicate the traveler has not decided on a fixed hub yet. */
const HUB_UNCERTAIN_CUE = /\b(?:chac(?:\s+la)?|co\s+the|chua\s+chac|du\s+dinh\s+co\s+the)\s+(?:di|bay|len|ra|toi|den|xuat\s+phat|tap\s+ket)\b/u;
const HUB_COMPARISON_CUE = /\b(?:ha\s+noi|hanoi)\s+(?:hay|hoac|or)\s+(?:tp\s+|thanh\s+pho\s+)?ha\s+giang\b|\b(?:tp\s+|thanh\s+pho\s+)?ha\s+giang\s+(?:hay|hoac|or)\s+(?:ha\s+noi|hanoi)\b/u;

/** Explicit travel/transfer/rental patterns that directly designate TP Hà Giang as the starting hub. */
const STATED_HA_GIANG_HUB_PATTERNS: readonly RegExp[] = [
  /\b(?:xe\s+khach|xe\s+giuong\s+nam|limousine|xe\s+co\s+tai\s+xe|xe\s+dich\s+vu)\b[^.?!;]{0,40}\b(?:len|ra|toi|den|ve|di)\s+(?:tp\s+|thanh\s+pho\s+)?ha\s+giang\b/u,
  /\b(?:len|ra|toi|den)\s+(?:tp\s+ha\s+giang|thanh\s+pho\s+ha\s+giang|ben\s+xe\s+(?:phia\s+nam|ha\s+giang))\b/u,
  /\bthue\s+(?:xe\s+may|o\s+to|xe)\s+(?:o|tai)\s+(?:tp\s+ha\s+giang|thanh\s+pho\s+ha\s+giang)\b/u,
];

/** Explicit travel/self-drive/rental patterns that directly designate Hà Nội as the starting hub (only when TP Hà Giang is not stated). */
const STATED_HA_NOI_HUB_PATTERNS: readonly RegExp[] = [
  /\b(?:bay|di\s+may\s+bay|di\s+tau(?:\s+hoa)?|di\s+xe\s+khach|di\s+xe\s+giuong\s+nam)\s+(?:ra|len|toi|den)\s+(?:tp\s+|thanh\s+pho\s+)?(?:ha\s+noi|hanoi)\b/u,
  /\b(?:tu\s+(?:chay|lai)(?:\s+xe(?:\s+may)?)?\s+tu|thue\s+(?:xe\s+may|o\s+to|xe)\s+(?:o|tai))\s+(?:tp\s+|thanh\s+pho\s+)?(?:ha\s+noi|hanoi)\b/u,
];

/**
 * Returns the fixed hub id directly designated by a travel/transfer/rental phrase in the traveler's message
 * (e.g. "bay ra Hà Nội rồi đi xe khách lên TP Hà Giang" → "hub:HA_GIANG_CITY",
 * "bay ra Hà Nội rồi tự chạy xe từ Hà Nội" → "hub:HA_NOI").
 * Returns null for vague, hesitant, negated, or ambiguous hub comparisons so the assistant still asks.
 */
export function statedFixedHubId(latestUserText: string): "hub:HA_GIANG_CITY" | "hub:HA_NOI" | null {
  const folded = foldVietnamese(latestUserText);
  if (!folded || hasHardNegation(latestUserText, folded)) return null;
  if (HUB_UNCERTAIN_CUE.test(folded) || HUB_COMPARISON_CUE.test(folded)) return null;
  if (STATED_HA_GIANG_HUB_PATTERNS.some(pattern => pattern.test(folded))) return "hub:HA_GIANG_CITY";
  if (STATED_HA_NOI_HUB_PATTERNS.some(pattern => pattern.test(folded))) return "hub:HA_NOI";
  return null;
}

function mentionsHub(folded: string, hubId: string): boolean {
  return HUB_SPECIFIC_PATTERNS[hubId]?.some(pattern => pattern.test(folded)) ?? false;
}

/** True when the assistant's previous message asked a question that names a fixed hub (so a bare hub name answers it). */
export function assistantOfferedHub(assistantText: string): boolean {
  if (!/[?？]/u.test(assistantText)) return false;
  const folded = foldVietnamese(assistantText);
  return Object.keys(HUB_SPECIFIC_PATTERNS).some(hubId => mentionsHub(folded, hubId));
}

/** Fixed trip hubs are recognized directly without calling external origin search (ADR-43 §3). */
export function matchFixedHub(query: string): SignedOriginCandidate | null {
  const folded = foldVietnamese(query);
  for (const hub of FIXED_HUB_CANDIDATES) {
    if (HUB_ALIASES[hub.id]?.includes(folded)) return hub;
  }
  return null;
}

const ACCENTED_NEGATION = /(?:^|[^\p{L}\p{N}])đừng(?:$|[^\p{L}\p{N}])/u;
const HARD_FOLDED_NEGATION = /\b(?:khong\s+phai|ko\s+phai|k\s+phai|khong\s+dung|ko\s+dung|khong\s+chon|ko\s+chon|khong\s+muon|sai|nham|chon\s+lai|noi\s+khac|cho\s+khac|dia\s+diem\s+khac|huy|bo\s+qua|not\s+this|not\s+that|wrong|different|cancel)\b/u;
const SWITCH_AWAY_NEGATION = /\b(?:doi\s+sang|doi\s+thanh|doi\s+diem)\b/u;
const LEADING_NEGATION = /^(?:khong|ko|k|no|nope|chua|khoan|thoi)(?:\s|$)/u;

const AGREEMENT_CLAUSE = /^(?:(?:da|vang|u|uh|uk|um)\s+)?(?:dung(?:\s+(?:roi|a|nha|nhe|vay|do|day|luon|qua|chinh\s+xac|cho\s+do|cho\s+nay|noi\s+nay))?|chinh\s+xac|chuan(?:\s+(?:roi|luon|qua))?|dong\s+y|ok+|oke+|okay|chot(?:\s+(?:luon|nha|nhe|di|diem\s+nay))?|duoc(?:\s+(?:roi|nha|nhe|day|luon))?|yes|yep|yeah|correct|right|confirm(?:ed)?)(?:\s|$)/u;
const BARE_AFFIRMATION = /^(?:vang|da|u|uh|uk|um)(?:\s+(?:dung(?:\s+roi)?|a|nha|nhe|ok+|oke+|duoc|chot))?$/u;
const HUB_CHOICE_CUE = /\b(?:chon|chot|dong\s+y|dung|bat\s+dau\s+tu|xuat\s+phat\s+tu|tap\s+ket|doi\s+sang|doi\s+thanh|chuyen\s+sang|ok+|oke+|okay|lay)\b/u;

const INDEX_PATTERNS = [
  /^(?:(?:chon|so|cai|lua\s+chon|phuong\s+an|diem|thu)\s*)?(?:1|mot|dau(?:\s+tien)?)(?:\s|$)/u,
  /^(?:(?:chon|so|cai|lua\s+chon|phuong\s+an|diem|thu)\s*)?(?:2|hai)(?:\s|$)/u,
  /^(?:(?:chon|so|cai|lua\s+chon|phuong\s+an|diem|thu)\s*)?(?:3|ba|cuoi(?:\s+cung)?)(?:\s|$)/u,
] as const;

function hasHardNegation(rawText: string, folded: string): boolean {
  const lowerVi = rawText.normalize("NFC").toLocaleLowerCase("vi");
  return ACCENTED_NEGATION.test(lowerVi) || HARD_FOLDED_NEGATION.test(folded) || LEADING_NEGATION.test(folded);
}

function clausesOf(rawText: string): string[] {
  return rawText.split(/[.,;!?\n]+/u).map(foldVietnamese).filter(Boolean);
}

function labelSegments(label: string): string[] {
  return label.split(/[,()\-–]+/u).map(foldVietnamese).filter(seg => seg.length >= 4);
}

const ORIGIN_CUE = String.raw`(?:xuat\s+phat(?:\s+(?:tu|o|tai))?|bat\s+dau(?:\s+(?:tu|o|tai))?|khoi\s+hanh(?:\s+(?:tu|o|tai))?|tu\s+(?:lai|chay)(?:\s+(?:o\s+to|xe(?:\s+may)?))?\s+tu|di\s+tu|dang\s+o|song\s+o|nha(?:\s+minh)?\s+o|o|tai|tu)`;
/** Administrative words a search label adds before the name the traveler typed ("Thành phố Đà Nẵng", "Quận Cầu Giấy"). */
const ADMIN_PREFIX = /^(?:thanh\s+pho|tp|quan|huyen|tinh|thi\s+xa|thi\s+tran|phuong|xa)\s+/u;
const CONTRAST_CUE = /\b(?:nhung|thay\s+vi|hoac|hay|or)\b/u;
const ACCENTED_CONTRAST = /(?:^|[^\p{L}\p{N}])còn(?:$|[^\p{L}\p{N}])/u;
const UNCERTAIN_ORIGIN_CUE = /\b(?:chac(?:\s+la)?|co\s+the|chua\s+chac)\b/u;

function hasContrastOrUncertainty(rawText: string, folded: string): boolean {
  const lowerVi = rawText.normalize("NFC").toLocaleLowerCase("vi");
  return CONTRAST_CUE.test(folded) || ACCENTED_CONTRAST.test(lowerVi) || UNCERTAIN_ORIGIN_CUE.test(folded);
}

/**
 * ADR-46: true when the traveler's latest message names the one searched place as their starting point
 * ("tôi xuất phát từ Đà Nẵng", or just "Đà Nẵng"), so the server can confirm it without a second round-trip.
 * Anything contrasted, negated or ambiguous stays on the two-turn path.
 */
const LOOSE_AGREEMENT = /(?:^|\s)(?:ok+|oke+|okay|dong\s+y|xac\s+nhan|chot|duoc|vang|uh|uk|yes)(?:\s|$)/u;
/**
 * One-turn origin confirmation (owner decision 2026-11-22: never ask the same place twice).
 * True when the latest message names the searched place or plainly agrees, without a hard "no" or a contrast ("nhưng", "hay").
 */
export function namesOrAgreesOrigin(latestUserText: string, query: string): boolean {
  const folded = foldVietnamese(latestUserText);
  const place = foldVietnamese(query);
  if (!folded || folded.length > 500 || hasHardNegation(latestUserText, folded) || hasContrastOrUncertainty(latestUserText, folded)) return false;
  if (place.length >= 3 && folded.includes(place)) return true;
  // Also match when the query is "Quận, Thành phố" and the message states "ở Thành phố (Quận)" (Bug 3).
  const queryParts = query.split(/[,()\-–]+/u).map(part => foldVietnamese(part).replace(ADMIN_PREFIX, "").trim()).filter(part => part.length >= 3);
  if (queryParts.length >= 2 && queryParts.every(part => folded.includes(part))) return true;
  return folded.length <= 160 && LOOSE_AGREEMENT.test(folded);
}

/** Same place as an origin already confirmed earlier in the conversation. */
export function sameOriginPlace(confirmedLabel: string, query: string): boolean {
  const label = foldVietnamese(confirmedLabel);
  const primary = foldVietnamese(confirmedLabel.split(/[,()\-–]+/u)[0] ?? "");
  const place = foldVietnamese(query);
  const queryPrimary = foldVietnamese(query.split(/[,()\-–]+/u)[0] ?? "");
  if (place.length < 3) return false;
  return label.includes(place) || (primary.length >= 3 && place.includes(primary)) || (queryPrimary.length >= 3 && label.includes(queryPrimary));
}

export function statesSoleOrigin(latestUserText: string, candidate: { label: string }): boolean {
  const folded = foldVietnamese(latestUserText);
  if (!folded || folded.length > 500 || hasHardNegation(latestUserText, folded) || hasContrastOrUncertainty(latestUserText, folded)) return false;
  const full = foldVietnamese(candidate.label.split(/[,()\-–]+/u)[0] ?? "");
  const names = [...new Set([full, full.replace(ADMIN_PREFIX, "")])].filter(name => name.length >= 4);
  return names.some(name => {
    if (folded === name) return true;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    // Exact short statement or multi-sentence trip brief: "Mình ở Hà Nội (Cầu Giấy), ...", "xuất phát từ Cầu Giấy", "từ Cầu Giấy đi"
    const directCue = new RegExp(String.raw`(?:^|\s)${ORIGIN_CUE}\s+(?:[a-z0-9]+\s+){0,4}${escaped}(?:\s|$)`, "u");
    const fromGoCue = new RegExp(String.raw`(?:^|\s)tu\s+${escaped}\s+di(?:\s|$)`, "u");
    return directCue.test(folded) || fromGoCue.test(folded);
  });
}

/**
 * Pure gate for `confirmOrigin` (ADR-43 §3, analogous to `permitsRemember`).
 * Allows confirmation only when the latest user message explicitly agrees with the sole candidate,
 * matches/taps this candidate's label, or unambiguously selects it among 2-3 candidates.
 */
export function permitsOriginConfirmation(
  latestUserText: string,
  candidate: { id: string; label: string },
  pool: readonly { id: string; label: string }[],
  options: { fromPreviousTurn: boolean; hubOffered?: boolean },
): boolean {
  const folded = foldVietnamese(latestUserText);
  const label = foldVietnamese(candidate.label);
  if (!folded || !label) return false;
  if (hasHardNegation(latestUserText, folded)) return false;

  // Exact button tap or full label inclusion (never ambiguous against another candidate).
  if (folded === label) return true;
  if (folded === `bat dau tu ${label}` || folded === `xuat phat tu ${label}` || folded === `chon ${label}`) return true;
  if (folded.includes(label) && !pool.some(other => other.id !== candidate.id && folded.includes(foldVietnamese(other.label)))) {
    return true;
  }

  if (options.fromPreviousTurn) {
    if (SWITCH_AWAY_NEGATION.test(folded)) return false;
    if (pool.length === 1) {
      return clausesOf(latestUserText).some(clause => AGREEMENT_CLAUSE.test(clause) || BARE_AFFIRMATION.test(clause));
    }
    const index = pool.findIndex(item => item.id === candidate.id);
    if (index >= 0 && index < INDEX_PATTERNS.length && INDEX_PATTERNS[index]!.test(folded)) return true;
    const segments = labelSegments(candidate.label);
    const otherSegments = new Set(pool.filter(other => other.id !== candidate.id).flatMap(other => labelSegments(other.label)));
    const uniqueSegments = segments.filter(seg => !otherSegments.has(seg));
    if (uniqueSegments.some(seg => folded.includes(seg)) && !pool.some(other => other.id !== candidate.id && labelSegments(other.label).some(seg => !segments.includes(seg) && folded.includes(seg)))) {
      return true;
    }
    return false;
  }

  // Fixed hub directly designated by a travel/transfer/rental verb in the latest message
  // (e.g. "đi xe khách lên TP Hà Giang", "bay ra Hà Nội rồi tự chạy xe từ Hà Nội") confirms immediately
  // in the same turn without an extra confirmation round; TP Hà Giang takes priority in multi-leg transfers.
  if (HUB_SPECIFIC_PATTERNS[candidate.id]) {
    const statedHub = statedFixedHubId(latestUserText);
    if (statedHub) return statedHub === candidate.id;
  }

  // Fixed hub selected directly without a prior findOrigin round-trip requires an explicit choice/switch cue + hub name
  // (bare "đi từ Hà Nội" stays false so Turn 1 restates and Turn 2 confirms).
  // When the assistant's previous message asked which hub to use, naming exactly one hub ("Hà Nội nhé") is the choice itself.
  if (!HUB_SPECIFIC_PATTERNS[candidate.id] || !(options.hubOffered || HUB_CHOICE_CUE.test(folded))) return false;
  const matchesMine = mentionsHub(folded, candidate.id);
  const matchesOther = pool.some(other => other.id !== candidate.id && mentionsHub(folded, other.id));
  return matchesMine && !matchesOther;
}

/** Slim D17: quick-reply options offered immediately when the traveler's home city is far from Hà Giang. */
export const FAR_HOME_TRANSPORT_CHIPS = [
  "Đi máy bay ra Hà Nội",
  "Đi tàu hỏa ra Hà Nội",
  "Đi xe khách ra Hà Nội",
] as const;

/** Straight-line distance threshold (km) from both fixed hubs beyond which driving directly is impractical (~450+ km road). */
export const FAR_HUB_DISTANCE_KM = 350;

const FAR_HOME_CITY_ALIASES = [
  "da nang", "tp da nang", "thanh pho da nang",
  "ho chi minh", "tp ho chi minh", "tphcm", "tp hcm", "hcm", "sai gon", "saigon", "sg",
  "can tho", "tp can tho", "nha trang", "khanh hoa", "hue", "thua thien hue",
  "da lat", "lam dong", "quy nhon", "binh dinh", "vung tau", "ba ria vung tau",
  "buon ma thuot", "dak lak", "pleiku", "gia lai", "phu quoc", "kien giang",
  "hoi an", "quang nam", "quang ngai", "phu yen", "tuy hoa", "phan thiet", "binh thuan",
  "dong nai", "bien hoa", "binh duong", "long an", "tien giang", "an giang", "ca mau",
  "dong thap", "vinh long", "ben tre", "soc trang", "bac lieu", "tra vinh", "hau giang",
  "tay ninh", "binh phuoc", "kon tum", "dak nong", "quang binh", "dong hoi", "quang tri",
  "ha tinh", "nghe an", "vinh",
] as const;

/** True when coordinates are too far from both fixed hubs (Hà Nội & TP Hà Giang) to drive straight there. */
export function isFarFromHubs(point: { latitude: number; longitude: number }): boolean {
  return TRIP_HUBS.every(hub => haversine(point, hub) >= FAR_HUB_DISTANCE_KM);
}

/** True when a place name clearly refers to a Central/Southern Vietnam city/province far from Hà Giang. */
export function isFarHomeCityName(place: string): boolean {
  const folded = foldVietnamese(place);
  if (!folded || matchFixedHub(place)) return false;
  return FAR_HOME_CITY_ALIASES.some(alias => {
    if (folded === alias) return true;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u").test(folded);
  });
}

/** Approximate geographic centers for distant Vietnam cities (system-level distance estimate when routing is unavailable). */
const FAR_CITY_CENTERS: readonly { aliases: readonly string[]; latitude: number; longitude: number }[] = [
  { aliases: ["ho chi minh", "tphcm", "tp hcm", "hcm", "sai gon", "saigon"], latitude: 10.7769, longitude: 106.7009 },
  { aliases: ["da nang"], latitude: 16.0544, longitude: 108.2022 },
  { aliases: ["can tho"], latitude: 10.0452, longitude: 105.7469 },
  { aliases: ["hue", "thua thien hue"], latitude: 16.4637, longitude: 107.5909 },
  { aliases: ["nha trang", "khanh hoa"], latitude: 12.2388, longitude: 109.1967 },
  { aliases: ["da lat", "lam dong"], latitude: 11.9404, longitude: 108.4583 },
  { aliases: ["quy nhon", "binh dinh"], latitude: 13.7829, longitude: 109.2197 },
  { aliases: ["vung tau", "ba ria vung tau"], latitude: 10.346, longitude: 107.0843 },
  { aliases: ["buon ma thuot", "dak lak"], latitude: 12.6667, longitude: 108.05 },
  { aliases: ["pleiku", "gia lai"], latitude: 13.9833, longitude: 108.0 },
  { aliases: ["phu quoc", "kien giang"], latitude: 10.227, longitude: 103.957 },
  { aliases: ["vinh", "nghe an"], latitude: 18.6796, longitude: 105.6813 },
  { aliases: ["ha tinh"], latitude: 18.3428, longitude: 105.9057 },
  { aliases: ["dong hoi", "quang binh"], latitude: 17.4689, longitude: 106.6223 },
  { aliases: ["quang tri"], latitude: 16.75, longitude: 107.185 },
  { aliases: ["quang nam", "hoi an"], latitude: 15.8801, longitude: 108.338 },
  { aliases: ["quang ngai"], latitude: 15.1214, longitude: 108.8044 },
  { aliases: ["tuy hoa", "phu yen"], latitude: 13.0955, longitude: 109.3209 },
  { aliases: ["phan thiet", "binh thuan"], latitude: 10.9289, longitude: 108.1021 },
  { aliases: ["bien hoa", "dong nai"], latitude: 10.9574, longitude: 106.8427 },
  { aliases: ["binh duong"], latitude: 10.9804, longitude: 106.6519 },
  { aliases: ["ca mau"], latitude: 9.1768, longitude: 105.1524 },
];

export function lookupFarCityPoint(place: string): { latitude: number; longitude: number } | null {
  const folded = foldVietnamese(place);
  if (!folded) return null;
  for (const city of FAR_CITY_CENTERS) {
    if (city.aliases.some(alias => folded === alias || new RegExp(`(?:^|\\s)${alias.replace(/\s+/gu, "\\s+")}(?:\\s|$)`, "u").test(folded))) {
      return { latitude: city.latitude, longitude: city.longitude };
    }
  }
  return null;
}

const DIRECT_SELF_DRIVE_PATTERNS: readonly RegExp[] = [
  /\b(?:chay|lai|phuot)\s+(?:xe\s+may|o\s+to|xe)\s+thang\b/u,
  /\btu\s+(?:chay|lai)(?:\s+(?:xe\s+may|o\s+to|xe))?\s+(?:thang\s+)?(?:tu\s+.{2,35}\s+)?(?:ra|len|toi|den)\s+ha\s+giang\b/u,
  /\b(?:chay|lai|di)\s+(?:xe\s+may|o\s+to)\s+thang\s+(?:ra|len|toi|den)\s+ha\s+giang\b/u,
];
const INDIRECT_ACCESS_PATTERNS = /\b(?:bay|may\s+bay|tau\s+hoa|di\s+tau|xe\s+khach|xe\s+giuong\s+nam|thue\s+xe(?:\s+may|\s+o\s+to)?\s+(?:o|tai))\b/u;

/** Bug 5: true when the traveler explicitly asks to drive/ride straight from a far home city to Hà Giang. */
export function wantsDirectDriveFromHome(text: string): boolean {
  const folded = foldVietnamese(text);
  if (!folded || INDIRECT_ACCESS_PATTERNS.test(folded)) return false;
  return DIRECT_SELF_DRIVE_PATTERNS.some(pattern => pattern.test(folded));
}

export type MinimumSelfDriveEstimate = {
  oneWayKm: number;
  oneWayDrivingHours: number;
  oneWayTotalHoursWithRest: number;
  maxDailyDrivingHours: number;
  oneWayTravelDays: number;
  roundTripMinDays: number;
};

/**
 * Bug 5: deterministic minimum-days calculation for self-driving from a distant home city to Hà Giang and back.
 * Uses the rest policy's daily driving cap (`DAILY_DRIVING_WARNING_HOURS`: 6h/day motorbike, 8h/day car)
 * and `driveWithRest` break durations.
 */
export function computeMinimumSelfDriveDays(input: {
  oneWayDistanceKm: number;
  oneWayDrivingSeconds: number;
  transport: TripTransport;
  sightseeingDays?: number;
  restMode?: RestMode;
}): MinimumSelfDriveEstimate {
  const oneWayKm = Math.max(1, Math.round(input.oneWayDistanceKm));
  const drivingSeconds = Math.max(60, Math.round(input.oneWayDrivingSeconds));
  const restMinutes = driveWithRest(drivingSeconds, 0, restProfileOf({ transport: input.transport, restMode: input.restMode })).restMinutes;
  const oneWayDrivingHours = Math.round((drivingSeconds / 3600) * 10) / 10;
  const oneWayTotalHoursWithRest = Math.round(((drivingSeconds + restMinutes * 60) / 3600) * 10) / 10;
  const maxDailyDrivingHours = DAILY_DRIVING_WARNING_HOURS[input.transport];
  const oneWayTravelDays = Math.max(1, Math.ceil(oneWayDrivingHours / maxDailyDrivingHours));
  const sightseeing = Math.max(1, Math.min(14, Math.round(input.sightseeingDays ?? 2)));
  const roundTripMinDays = oneWayTravelDays * 2 + sightseeing;
  return {
    oneWayKm,
    oneWayDrivingHours,
    oneWayTotalHoursWithRest,
    maxDailyDrivingHours,
    oneWayTravelDays,
    roundTripMinDays,
  };
}

/** Deterministic road-distance & driving-time fallback from coordinates when live routing is unavailable (never arbitrary text). */
export function estimateRoadFromCoordinates(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  transport: TripTransport,
): { distanceKm: number; drivingSeconds: number } {
  // Vietnamese North–South highway + mountain pass winding factor (~1.38x great-circle)
  const straightKm = haversine(from, to);
  const distanceKm = Math.max(1, Math.round(straightKm * 1.38));
  const avgKmh = transport === "CAR" ? 55 : 45;
  const drivingSeconds = Math.round((distanceKm / avgKmh) * 3600);
  return { distanceKm, drivingSeconds };
}

const TENTATIVE_DATE_CUE = /\b(?:khoang|tam|du\s+kien|chung|quanh)\b/u;

/**
 * Slim D18: extracts a concrete stated calendar date (dd/mm, dd-mm, dd/mm/yyyy, "ngày dd tháng mm") from user text.
 * Leaves vague windows without a specific day ("giữa tháng sau", "đầu tháng 12") as null.
 */
export function extractStatedDateFromText(
  text: string,
  now: Date,
): { date: string; tentative: boolean } | null {
  const normalized = text.normalize("NFC");
  const slashMatch = /(?:^|[^\d])(\d{1,2})\s*[/\-]\s*(\d{1,2})(?:\s*[/\-]\s*(\d{4}))?(?!\d)/u.exec(normalized);
  const wordMatch = /(?:ng[aà]y\s+)?(\d{1,2})\s+th[aá]ng\s+(\d{1,2})(?:\s+n[aă]m\s+(\d{4}))?/iu.exec(normalized);
  const match = slashMatch ?? wordMatch;
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const todayIso = vietnamDateOf(now);
  const [todayY, todayM, todayD] = todayIso.split("-").map(Number) as [number, number, number];
  let year = match[3] ? Number(match[3]) : todayY;
  if (!match[3] && (month < todayM || (month === todayM && day < todayD))) {
    year += 1;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (iso < todayIso) return null;

  const prefix = foldVietnamese(normalized.slice(Math.max(0, match.index - 24), match.index + match[0].length));
  return { date: iso, tentative: TENTATIVE_DATE_CUE.test(prefix) };
}

/** True when quick replies are solely asking the traveler to confirm a date they already stated. */
export function isDateConfirmationOnlyReplies(replies: readonly string[]): boolean {
  if (!replies.length) return false;
  const folded = replies.map(foldVietnamese);
  const hasConfirmDate = folded.some(item => /\b(?:dung|chot|xac\s+nhan)\b.*\b(?:di|bay|ngay|\d{1,2})\b/u.test(item));
  const hasChangeDate = folded.some(item => /\b(?:chon\s+ngay\s+khac|doi\s+ngay)\b/u.test(item));
  return hasConfirmDate && hasChangeDate;
}
