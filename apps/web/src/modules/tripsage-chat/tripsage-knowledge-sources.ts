import {
  cleanInlineSourceLine,
  extractSuggestRepliesDirectives,
  STANDALONE_INLINE_SOURCE_LINE_RE,
  stripInlineSourceLines,
} from "./assistant-conversation-contract";
import { formatDocumentSourceTitle } from "./tripsage-chat-context";

/**
 * Deterministic relevance & actual-usage filtering for local RAG knowledge sources (Point 2).
 *
 * Ensures `data-sources` ("Nguồn tài liệu") only displays reviewed documents that are:
 *  1. Above the retrieval similarity threshold (when `score` is supplied) and on-topic for the question, AND
 *  2. Actually used in the grounded (non-"Kiến thức mở rộng") portion of the assistant's reply.
 *
 * General model knowledge under "Kiến thức mở rộng" never borrows unrelated local document citations.
 */

export const KNOWLEDGE_MIN_SCORE = 0.42;

export type KnowledgeCandidate = {
  title: string;
  text: string;
  score?: number;
};

const STOP_WORDS = new Set([
  // Vietnamese generic / stop words
  "toi", "minh", "ban", "anh", "chi", "em", "ho", "chung", "bon", "nguoi", "khach",
  "muon", "can", "nen", "phai", "duoc", "khong", "chua", "dang", "se", "da", "hay", "hoac", "va", "voi", "cua", "cho", "tai", "tu", "den", "ve", "trong", "ngoai", "tren", "duoi", "khi", "neu", "thi", "ma", "la", "co", "nhu", "the", "nao", "bao", "nhieu", "gi", "dau", "sao", "nay", "do", "day", "kia", "mot", "hai", "ba", "cac", "nhung", "nhieu", "it", "rat", "kha", "hon", "nhat", "them", "lai", "luon", "nhe", "nhi", "chao", "oi", "a", "len", "lap",
  // Generic travel/region words that appear in almost every Ha Giang doc
  "ha", "giang", "tinh", "tuyen", "quang", "khu", "vuc", "diem", "dia", "du", "lich", "tham", "quan", "hanh", "trinh", "chuyen", "di", "ngay", "dem", "tai", "lieu", "phuong", "luu", "trai", "nghiem", "thong", "tin", "huong", "dan", "kinh", "cam", "nang", "tri", "thuc", "dac", "biet", "an", "toan",
  // English stop words
  "the", "is", "are", "was", "were", "it", "for", "to", "in", "on", "at", "of", "a", "an", "and", "or", "with", "without", "can", "should", "what", "how", "when", "where", "safe", "about", "from", "there", "their", "this", "that",
]);

/** High-frequency district/generic travel words that cannot serve as standalone topical evidence across unrelated docs. */
const GENERIC_DISTRICT_TOKENS = new Set([
  "meo", "vac", "dong", "van", "quan", "ba", "yen", "minh", "pho", "vung",
  "cao", "nui", "doc", "duong", "thac", "suoi", "hang", "cho", "lang", "nguoi",
  "truyen", "thong", "chup", "anh", "canh", "dep", "thich", "hop", "tranh", "mien",
  "cong", "thoi", "tiet", "mua", "ten", "dinh", "khu",
]);

/** Specific single-site landmarks whose docs should NOT be cited for general province-wide questions unless asked. */
const SINGLE_LANDMARK_TITLE_PATTERNS: readonly { pattern: RegExp; subjectTokens: readonly string[] }[] = [
  { pattern: /c[oộ]t\s+c[oờ]\s+l[uũ]ng\s+c[uú]/iu, subjectTokens: ["lung cu", "cot co"] },
  { pattern: /chi[eềê]u\s+l[aầ]u\s+thi/iu, subjectTokens: ["chieu lau thi", "ho thau"] },
  { pattern: /c[aă]ng\s+b[aắ]c\s+m[eê]/iu, subjectTokens: ["cang bac me", "bac me"] },
  { pattern: /p[aả]\s+vi/iu, subjectTokens: ["pa vi"] },
  { pattern: /dinh\s+(?:th[uự]\s+h[oọ]\s+v[uươ][oơ]ng|vua\s+m[eè]o)/iu, subjectTokens: ["dinh thu", "vua meo", "sa phin"] },
  { pattern: /ch[oợ]\s+t[iì]nh\s+kh[aâ]u\s+vai/iu, subjectTokens: ["khau vai"] },
  { pattern: /l[oô]\s+l[oô]\s+ch[aả]i/iu, subjectTokens: ["lo lo chai", "lo lo"] },
  { pattern: /n[aặ]m\s+đ[aă]m/iu, subjectTokens: ["nam dam"] },
  { pattern: /h[aạ]\s+th[aà]nh/iu, subjectTokens: ["ha thanh"] },
  { pattern: /l[uù]ng\s+t[aá]m/iu, subjectTokens: ["lung tam", "vai lanh"] },
  { pattern: /s[uủ]ng\s+l[aà]|nh[aà]\s+c[uủ]a\s+pao/iu, subjectTokens: ["sung la", "nha cua pao"] },
  { pattern: /du\s+gi[aà]/iu, subjectTokens: ["du gia"] },
  { pattern: /ho[aà]ng\s+su\s+ph[iì]/iu, subjectTokens: ["hoang su phi", "ruong bac thang", "lua chin"] },
  { pattern: /đ[eè]o\s+m[aã]\s+p[iì]\s+l[eè]ng|m[aã]\s+p[iì]\s+l[eè]ng/iu, subjectTokens: ["ma pi leng", "hanh phuc", "nho que", "tu san"] },
  { pattern: /s[oô]ng\s+nho\s+qu[eế]|h[eẻ]m\s+tu\s+s[aả]n/iu, subjectTokens: ["nho que", "tu san"] },
  { pattern: /c[oổ]ng\s+tr[oờ]i\s+qu[aả]n\s+b[aạ]/iu, subjectTokens: ["cong troi", "hanh phuc"] },
  { pattern: /ph[oố]\s+c[oổ]\s+đ[oồ]ng\s+v[aă]n/iu, subjectTokens: ["pho co", "tong puon"] },
  { pattern: /n[uú]i\s+đ[oô]i/iu, subjectTokens: ["nui doi", "co tien"] },
  { pattern: /th[oô]n\s+tha/iu, subjectTokens: ["thon tha"] },
];

export function foldText(raw: string): string {
  return raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function contentTokens(raw: string, excludeDistrictGeneric = false): Set<string> {
  const folded = foldText(raw);
  const out = new Set<string>();
  for (const word of folded.split(" ")) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    if (excludeDistrictGeneric && GENERIC_DISTRICT_TOKENS.has(word)) continue;
    out.add(word);
  }
  return out;
}

function contentBigrams(raw: string, excludeDistrictGeneric = false): Set<string> {
  const words = foldText(raw).split(" ").filter(w => w.length >= 2);
  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i += 1) {
    const a = words[i]!;
    const b = words[i + 1]!;
    if (STOP_WORDS.has(a) && STOP_WORDS.has(b)) continue;
    if (
      excludeDistrictGeneric &&
      (STOP_WORDS.has(a) || GENERIC_DISTRICT_TOKENS.has(a)) &&
      (STOP_WORDS.has(b) || GENERIC_DISTRICT_TOKENS.has(b))
    ) {
      continue;
    }
    out.add(`${a} ${b}`);
  }
  return out;
}

function isSingleLandmarkDocTitle(title: string): boolean {
  return SINGLE_LANDMARK_TITLE_PATTERNS.some(entry => entry.pattern.test(title));
}

function isUnaskedSingleLandmarkDoc(questionFolded: string, title: string): boolean {
  for (const entry of SINGLE_LANDMARK_TITLE_PATTERNS) {
    if (entry.pattern.test(title)) {
      return !entry.subjectTokens.some(token => questionFolded.includes(token));
    }
  }
  return false;
}

/**
 * Filters retrieved local knowledge excerpts by similarity score (when present) and topic relevance.
 * Drops off-topic chunks before they reach the model or `data-sources`.
 */
export function filterRelevantKnowledgeExcerpts(
  question: string,
  candidates: readonly KnowledgeCandidate[],
  options?: { minScore?: number },
): KnowledgeCandidate[] {
  const minScore = options?.minScore ?? KNOWLEDGE_MIN_SCORE;
  const qFolded = foldText(question);
  const qTokens = contentTokens(question, true);

  const isLicenseQuestion = /(?:giay phep lai|bang lai|gplx|\blicense\b|\bpermit\b|\bidp\b|\bforeigner\b|nuoc ngoai)/u.test(qFolded);
  const isMedicalEmergencyQuestion = /(?:cap cuu|tai nan|nga xe|chay mau|chan thuong|benh vien|tram y te|phong kham|\b115\b|so cuu|\baccident\b|\bbleeding\b|\binjur|\bhospital\b|\bemergency\b)/u.test(qFolded);
  const isWeatherPackingQuestion = /(?:thoi tiet|co lanh|nhiet do|mang gi|chuan bi (?:do|trang phuc)|\bweather\b|\bcold\b|\bpack\b|ao am|ao khoac)/u.test(qFolded);
  const monthMatch = /thang\s*(\d{1,2})\b/u.exec(qFolded);
  const askedMonth = monthMatch ? Number(monthMatch[1]) : /\bdecember\b/u.test(qFolded) ? 12 : null;
  const isMotionSicknessOrPassQuestion = /(?:say xe|chong say|carsick|motion sickness|duong deo)/u.test(qFolded);
  const asksAboutPass = /duong deo|deo doc|khuc cua|mountain pass/u.test(qFolded);

  return candidates.filter(item => {
    if (!item.title.trim() || !item.text.trim()) return false;
    if (item.score !== undefined && (!Number.isFinite(item.score) || item.score < minScore)) {
      return false;
    }

    const docFolded = foldText(`${item.title} ${item.text}`);
    const unaskedLandmark = isUnaskedSingleLandmarkDoc(qFolded, item.title);

    // 0. Emergency / injury / hospital lookup: historical road construction or attraction safety docs are off-topic.
    if (isMedicalEmergencyQuestion) {
      return /(?:benh vien|tram y te|phong kham|cap cuu|\b115\b|so cuu|cam mau|co so y te|\bhospital\b|\bclinic\b|\bfirst aid\b)/u.test(docFolded);
    }

    // 1. Strict legal / license questions: local attraction docs without any license terms are off-topic.
    if (isLicenseQuestion) {
      return /(?:giay phep lai|bang lai|gplx|\blicense\b|\bidp\b|cong uoc vienna|xu phat|khach nuoc ngoai|\bforeigner\b)/u.test(docFolded);
    }

    // 2. General weather & packing questions (e.g. L1 "Hà Giang tháng 12 có lạnh không, mang gì?"):
    //    never cite single-landmark guides the user didn't ask about, nor off-season flower/cloud-hunting passages.
    if (isWeatherPackingQuestion) {
      if (unaskedLandmark) return false;
      const hasWeatherOrCold = /(?:nhiet do|thoi tiet|troi lanh|mua lanh|gio ret|suong muoi|suong mu|ao am|ao khoac|trang phuc|giu am)/u.test(docFolded);
      if (!hasWeatherOrCold) return false;
      if (askedMonth !== null) {
        const mentionsAskedMonth = new RegExp(`thang\\s*${askedMonth}\\b|cuoi\\s+nam|mua\\s+dong`, "u").test(docFolded);
        if (!mentionsAskedMonth) return false;
      }
      return true;
    }

    // 3. Motion sickness & mountain pass questions (e.g. L9):
    //    hiking-only landmark safety docs (mossy rocks, bring water, don't litter) are off-topic;
    //    allow mountain-pass hazard guidance (including Mã Pì Lèng pass safety section) while rejecting unrelated landmarks.
    if (isMotionSicknessOrPassQuestion) {
      if (unaskedLandmark && !/m[aã]\s+p[iì]\s+l[eè]ng/iu.test(item.title)) return false;
      const hasMotionSickness = /say xe|chong say/u.test(docFolded);
      const hasPassHazards = asksAboutPass && /(?:duong deo|khuc cua|cua hep|tam nhin|khuat tam nhin|deo doc)/u.test(docFolded);
      if (!hasMotionSickness && !hasPassHazards) return false;
      // Reject generic access-distance paragraphs ("130 km theo QL4C") that don't address pass hazards or carsickness.
      if (!hasMotionSickness && !/(?:khuc cua|tam nhin|khuat tam nhin|sat lo|tron truot)/u.test(docFolded)) return false;
      return true;
    }

    // 4. General topic / destination Q&A:
    if (qTokens.size === 0) return !unaskedLandmark;
    const docTokens = contentTokens(`${item.title} ${item.text}`, true);
    let overlap = 0;
    for (const token of qTokens) {
      if (docTokens.has(token)) overlap += 1;
    }
    const qBigrams = contentBigrams(question, true);
    const docBigrams = contentBigrams(`${item.title} ${item.text}`, true);
    let bigramOverlap = 0;
    for (const bg of qBigrams) {
      if (docBigrams.has(bg)) bigramOverlap += 1;
    }

    if (unaskedLandmark) {
      return bigramOverlap >= 2 || (bigramOverlap >= 1 && overlap >= 3);
    }
    return overlap >= 1 || bigramOverlap >= 1;
  });
}

const MISSING_LOCAL_DOC_DISCLAIMER_RE =
  /(?:t[aà]i\s+li[eệ]u\s+(?:đ[iị]a\s+ph[uươ]ng|hi[eệ]n\s+c[oó]|đ[aã]\s+duy[eệ]t)|approved\s+local\s+(?:docs|documents|knowledge|materials))\s+(?:ch[uư]a|kh[oô]ng|didn'?t|doesn'?t|does\s+not|do\s+not)\s+(?:đ[eề]\s+c[aậ]p|c[oó]\s+n[oộ]i\s+dung|nh[aắ]c|x[aá]c\s+nh[aậ]n|cover|mention)/iu;

/**
 * Strips "Kiến thức mở rộng" / "Expanded knowledge" / "General knowledge" clauses/paragraphs
 * (supporting `:`, `;`, `–`, `—`, `-`, and `*...*` italic wrappers) and "approved docs don't cover X"
 * disclaimers so model-supplied general advice never borrows unrelated local document citations (C3).
 */
export function stripExpandedKnowledgeSections(answerText: string): string {
  const cleanDirectives = extractSuggestRepliesDirectives(answerText).text;
  const paragraphs = cleanDirectives.split(/\n{2,}/u);
  const kept: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    // Drop whole paragraph if it begins with the expanded-knowledge label
    if (
      /^\s*(?:[-*•]\s*)?(?:[*_]{1,2}\s*)?(?:ki[eế]n\s+th[uứ]c\s+m[oở]\s+r[oộ]ng|hi[eể]u\s+bi[eế]t\s+chung|general\s+knowledge|expanded\s+knowledge)(?:\s*[*_]{1,2})?\s*[:;–—-]/iu.test(
        trimmed,
      )
    ) {
      continue;
    }
    // Strip inline expanded-knowledge tail within a paragraph
    const inlineCut = trimmed.search(
      /(?:[*_]{1,2}\s*)?(?:ki[eế]n\s+th[uứ]c\s+m[oở]\s+r[oộ]ng|general\s+knowledge|expanded\s+knowledge)(?:\s*[*_]{1,2})?\s*[:;–—-]/iu,
    );
    const sliced = (inlineCut >= 0 ? trimmed.slice(0, inlineCut) : trimmed).trim();
    if (!sliced || MISSING_LOCAL_DOC_DISCLAIMER_RE.test(sliced)) continue;
    kept.push(sliced);
  }
  return kept.join("\n\n").trim();
}

/**
 * Selects only the titles of retrieved documents whose content is actually reflected in the
 * grounded (non-"Kiến thức mở rộng") portion of the assistant's reply, formatted with proper casing (C3).
 */
export function selectUsedDocumentSources(
  answerText: string,
  candidates: readonly KnowledgeCandidate[],
): string[] {
  if (!candidates.length) return [];
  const withoutDirectives = extractSuggestRepliesDirectives(answerText).text;
  const grounded = stripExpandedKnowledgeSections(withoutDirectives);
  if (!grounded) return [];
  if (MISSING_LOCAL_DOC_DISCLAIMER_RE.test(withoutDirectives) && grounded.length < 40) {
    return [];
  }

  const answerFolded = foldText(grounded);
  const answerTokens = contentTokens(grounded, true);
  const answerBigrams = contentBigrams(grounded, true);

  const used: string[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const formattedTitle = formatDocumentSourceTitle(item.title);
    if (!formattedTitle || seen.has(formattedTitle)) continue;
    const titleTokens = contentTokens(formattedTitle, true);
    const titleBigrams = contentBigrams(formattedTitle, true);
    const textTokens = contentTokens(item.text, true);
    const textBigrams = contentBigrams(item.text, true);

    // 1. Direct mention of the document's distinctive title bigram (e.g. "lung cu", "ma pi leng", "nho que")
    let titleMatch = false;
    for (const bg of titleBigrams) {
      if (answerFolded.includes(bg)) {
        titleMatch = true;
        break;
      }
    }
    if (!titleMatch && titleTokens.size > 0 && titleTokens.size <= 2) {
      titleMatch = [...titleTokens].every(t => answerTokens.has(t));
    }

    // 2. Concrete fact overlap between grounded answer and excerpt text (excluding generic district tokens)
    let tokenOverlap = 0;
    for (const token of textTokens) {
      if (answerTokens.has(token)) tokenOverlap += 1;
    }
    let bigramOverlap = 0;
    for (const bg of textBigrams) {
      if (answerBigrams.has(bg)) bigramOverlap += 1;
    }

    const singleLandmark = isSingleLandmarkDocTitle(formattedTitle);
    const matched = singleLandmark
      ? titleMatch || bigramOverlap >= 1
      : titleMatch || bigramOverlap >= 1 || tokenOverlap >= 3;

    if (matched) {
      seen.add(formattedTitle);
      used.push(formattedTitle);
    }
  }
  return used;
}

export type ReplyLanguage = "vi" | "en";

const HA_GIANG_PROPER_NOUN_RE =
  /(?<![\p{L}\p{N}])(?:hà\s+giang|đồng\s+văn|mèo\s+vạc|quản\s+bạ|yên\s+minh|lũng\s+cú|sông\s+nho\s+quế|nho\s+quế|mã\s+pì\s+lèng|đèo\s+mã\s+pì\s+lèng|hà\s+nội|hải\s+phòng|sủng\s+là|du\s+già|hoàng\s+su\s+phì|pả\s+vi|cổng\s+trời|phố\s+cổ|lô\s+lô\s+chải|thôn\s+tha)(?![\p{L}\p{N}])/giu;
const VIETNAMESE_DIACRITIC_RE = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/iu;
const VIETNAMESE_UNACCENTED_WORDS_RE =
  /\b(?:minh|ban|khong|duoc|ngay|dem|nhieu|giup|cho|voi|cua|nhe|nha|nhi|di|ve|tu|vao|nao|bao|nhieu|lich|xe\s+may|o\s+to|mk|ko|dc)\b/giu;
const ENGLISH_SIGNAL_WORDS_RE =
  /\b(?:is|are|was|were|be|been|the|a|an|for|to|in|on|at|of|with|without|from|by|about|how|what|where|when|why|which|who|can|could|would|should|will|do|does|did|have|has|had|it|this|that|there|we|you|they|my|our|your|safe|foreigner|motorbike|motorcycle|license|vietnamese|trip|plan|itinerary|weather|cold|december|days|nights|budget|visit|stay|food|eat|please|thank|thanks|recommend|need|want|allow|allowed|legal|drive|ride|get|reach|hub)\b/giu;

/**
 * Detects whether a traveler message is English or Vietnamese (default `"vi"`).
 * Strips known accented Hà Giang proper nouns before inspecting diacritics so sentences like
 * `"Can we visit Đồng Văn and Sông Nho Quế in 2 days?"` resolve to `"en"`.
 */
export function detectReplyLanguage(text: string | null | undefined): ReplyLanguage {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "vi";
  const withoutProperNouns = trimmed.replace(HA_GIANG_PROPER_NOUN_RE, " ");
  const words = withoutProperNouns.split(/\s+/u).filter(Boolean);
  const viDiacriticWords = words.filter(word => VIETNAMESE_DIACRITIC_RE.test(word)).length;
  const viUnaccentedHits = (withoutProperNouns.match(VIETNAMESE_UNACCENTED_WORDS_RE) ?? []).length;
  const viHits = viDiacriticWords * 2 + viUnaccentedHits;
  const enHits = (withoutProperNouns.match(ENGLISH_SIGNAL_WORDS_RE) ?? []).length;
  if (enHits >= 2 && viHits === 0) return "en";
  if (enHits >= 3 && enHits > viHits * 2) return "en";
  return "vi";
}

export function expandedKnowledgeLabel(lang: ReplyLanguage): string {
  return lang === "en" ? "General knowledge" : "Kiến thức mở rộng";
}

export function normalizeExpandedKnowledgeLanguage(line: string, lang: ReplyLanguage): string {
  if (lang !== "en") return line;
  return line.replace(
    /((?:^|\n)\s*(?:[-*•]\s*)?(?:[*_]{1,2})?)\s*ki[eế]n\s+th[uứ]c\s+m[oở]\s+r[oộ]ng(?=\s*[:–—;\-*_])/giu,
    "$1General knowledge",
  );
}

/**
 * Strips self-inserted "Nguồn tài liệu:" / "Nguồn:" / "Source:" prose lines and trailing tails
 * when the UI renders structured `data-sources` cards separately (B2 / C4).
 * Preserves normal mid-sentence uses of "nguồn" (e.g. "nguồn thu nhập", "nguồn nước").
 */
export function stripRedundantInlineSourceLines(raw: string, options?: { lang?: ReplyLanguage }): string {
  const lang = options?.lang ?? "vi";
  return stripInlineSourceLines(raw)
    .split("\n")
    .map(line => normalizeExpandedKnowledgeLanguage(line, lang))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const SOURCE_TRIGGERS_FOLDED = [
  "nguon tai lieu",
  "nguon tham khao",
  "nguon:",
  "tai lieu tham khao",
  "source:",
  "sources:",
  "reference:",
  "references:",
];

function couldStartSourceLabel(rawCandidate: string, lang: ReplyLanguage = "vi"): boolean {
  const stripped = rawCandidate.replace(/^[\s>#\-*•(\[_—–]+/u, "");
  if (!stripped) return true;
  if (STANDALONE_INLINE_SOURCE_LINE_RE.test(rawCandidate)) return true;
  const folded = stripped
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/đ/gu, "d");
  if (
    lang === "en" &&
    ("kien thuc mo rong".startsWith(folded) || /^kien thuc mo rong(?:\s*[*_]{1,2})?\s*$/u.test(folded))
  ) {
    return true;
  }
  return (
    SOURCE_TRIGGERS_FOLDED.some((trigger) => trigger.startsWith(folded)) ||
    /^(?:nguon(?:\s+tai\s+lieu(?:\s+tham\s+khao)?|\s+tham\s+khao)?|tai\s+lieu\s+tham\s+khao|sources?|references?)\s*[*_]{0,2}\s*[:：]/u.test(
      folded,
    )
  );
}

function couldStartDirectiveFence(rawCandidate: string): boolean {
  const trimmed = rawCandidate.trimStart();
  if (!trimmed) return false;
  return trimmed === ":" || trimmed === "::" || trimmed.startsWith(":::");
}

/**
 * Stateful streaming filter that removes redundant inline source lines and `:::...` directive fences
 * (extracting valid `:::suggest_replies` quick-reply arrays) without stalling normal text chunks (B2 / B3 / C1 / C4).
 */
export function createInlineSourceStreamFilter(options?: { lang?: ReplyLanguage }) {
  const lang = options?.lang ?? "vi";
  let pendingLine = "";
  let flushedCurrentLine = false;
  let consecutiveBlankLines = 0;
  let inDirectiveBlock = false;
  let directiveBuffer = "";
  const extractedReplies: string[] = [];

  const collectDirectiveReplies = (rawBlock: string) => {
    const parsed = extractSuggestRepliesDirectives(rawBlock);
    if (parsed.replies.length > 0 && extractedReplies.length === 0) {
      extractedReplies.push(...parsed.replies);
    }
  };

  const formatCompletedLine = (lineWithNewline: boolean, line: string): string => {
    const wasFlushedMidLine = flushedCurrentLine;
    if (lineWithNewline) flushedCurrentLine = false;
    if (inDirectiveBlock) {
      directiveBuffer += `${line}\n`;
      if (/^[ \t]*:::[ \t]*$/u.test(line)) {
        collectDirectiveReplies(directiveBuffer);
        inDirectiveBlock = false;
        directiveBuffer = "";
      }
      return "";
    }
    if (/^[ \t]*:::/u.test(line)) {
      if (/^[ \t]*:::[ \t]*[a-zA-Z0-9_-]+[ \t]+[\s\S]*:::[ \t]*$/u.test(line)) {
        collectDirectiveReplies(line);
        return "";
      }
      inDirectiveBlock = true;
      directiveBuffer = `${line}\n`;
      return "";
    }
    if (wasFlushedMidLine && /^\s*\(/u.test(line)) {
      const cleanedTail = normalizeExpandedKnowledgeLanguage(cleanInlineSourceLine(line), lang);
      if (!cleanedTail) {
        return lineWithNewline && consecutiveBlankLines <= 1 ? "\n" : "";
      }
      consecutiveBlankLines = 0;
      return lineWithNewline ? `${cleanedTail}\n` : cleanedTail;
    }
    if (STANDALONE_INLINE_SOURCE_LINE_RE.test(line)) return "";
    const cleaned = normalizeExpandedKnowledgeLanguage(
      cleanInlineSourceLine(line),
      lang,
    );
    if (!cleaned && !line.trim()) {
      consecutiveBlankLines += 1;
      return lineWithNewline && consecutiveBlankLines <= 1 ? "\n" : "";
    }
    consecutiveBlankLines = 0;
    return lineWithNewline ? `${cleaned}\n` : cleaned;
  };

  return {
    push(delta: string): string {
      pendingLine += delta;
      let out = "";

      while (true) {
        const nlIdx = pendingLine.indexOf("\n");
        if (nlIdx === -1) break;
        const rawLine = pendingLine.slice(0, nlIdx).replace(/\r$/u, "");
        pendingLine = pendingLine.slice(nlIdx + 1);
        out += formatCompletedLine(true, rawLine);
      }

      if (inDirectiveBlock) return out;

      if (pendingLine && !couldStartDirectiveFence(pendingLine) && !couldStartSourceLabel(pendingLine, lang)) {
        const normalized = normalizeExpandedKnowledgeLanguage(pendingLine, lang);
        pendingLine = normalized;
        let holdStart = pendingLine.length;
        const tailBoundaryRe = /(?:[.!?…]\s+|\s+(?=\(|[—–]\s+))/gu;
        let match: RegExpExecArray | null;
        while ((match = tailBoundaryRe.exec(pendingLine)) !== null) {
          const isSentenceBoundary = /^[.!?…]/u.test(match[0]);
          const holdFrom = isSentenceBoundary ? match.index + match[0].length : match.index;
          const candidateTail = pendingLine.slice(match.index + match[0].length);
          if (!candidateTail || couldStartSourceLabel(candidateTail, lang)) {
            holdStart = holdFrom;
            break;
          }
        }
        if (holdStart > 0) {
          out += pendingLine.slice(0, holdStart);
          pendingLine = pendingLine.slice(holdStart);
          flushedCurrentLine = true;
          consecutiveBlankLines = 0;
        }
      }
      return out;
    },
    end(): string {
      if (inDirectiveBlock || /^[ \t]*:::/u.test(pendingLine)) {
        collectDirectiveReplies(`${directiveBuffer}${pendingLine}`);
        inDirectiveBlock = false;
        directiveBuffer = "";
        pendingLine = "";
        return "";
      }
      if (!pendingLine) return "";
      const remaining = pendingLine;
      pendingLine = "";
      return formatCompletedLine(false, remaining);
    },
    takeReplies(): string[] {
      return [...extractedReplies];
    },
  };
}
