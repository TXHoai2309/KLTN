import "server-only";
import type { MemoryInput } from "./memory-contract";

const sensitiveTerms = [
  /\b(?:mat\s*khau|mat\s*ma|ma\s*pin|ma\s*xac\s*thuc|otp|password|passphrase|credentials?|secret|token|api\s*key|khoa\s*(?:api|bi mat|rieng tu)|private\s*key)\b/u,
  /\b(?:(?:credit|debit)\s*card|the\s*tin\s*dung|so\s*the|(?:bank\s*)?account\s*(?:number|no)|tai\s*khoan\s*(?:ngan\s*hang|thanh\s*toan)|so\s*tai\s*khoan)\b/u,
  /\b(?:cccd|cmnd|can\s*cuoc|chung\s*minh\s*nhan\s*dan|ho\s*chieu|passport|social\s*security|national\s*(?:id|insurance)|driver'?s\s*licen[cs]e|giay\s*phep\s*lai\s*xe|date of birth|ngay sinh)\b/u,
  /\b(?:home\s*address|(?:i|we) live at|dia\s*chi\s*(?:nha|thuong\s*tru|cu\s*tru)|nha\s*(?:toi|minh|em)\s*(?:o|tai)|so\s*nha|phone\s*(?:number|no)|so\s*(?:dien\s*thoai|dt)|dien\s*thoai\s*(?:cua|lien\s*he)|e[\s-]*mail|thu\s*dien\s*tu)\b/u,
  /\b(?:suc\s*khoe|benh\s*(?:an|ly|nen|su)|di\s*ung|chan\s*doan|hiv|tieu\s*duong|tram\s*cam|mang\s*thai|huyet\s*ap|ung\s*thu|medical|diagnos(?:is|ed)|allerg(?:y|ic|ies)|pregnan\w*|diabetes|cancer|prescription|don thuoc)\b/u,
  /\b(?:religio\w*|ton\s*giao|tin\s*nguong|theo\s*dao|dao\s*phat|buddhis\w*|christia\w*|muslim|islam|catholi\w*|cong\s*giao|chinh\s*tri|dang\s*phai|politic\w*|vote\s*for)\b/u,
];
const streetAddress = /\b\d{1,5}[a-z]?(?:\/\d{1,5})?\s+(?:[a-z][a-z-]*\s+){1,8}(?:street|avenue|road|lane|boulevard|ward|district)\b|\b\d{1,5}[a-z]?(?:\/\d{1,5})?\s+(?:[a-z][a-z-]*\s+){0,7}[a-z][a-z-]*,\s*(?:phuong|quan|huyen|xa)\b/u;
const sensitiveShape = /[\w.!#$%&'*+/=?^_{}|~-]+\s*@\s*[^\s@]+\.[\p{L}]{2,}|(?:\d[()\s.+-]*){7,}\d*|\b(?:sk-|gh[pousr]_|xox[baprs]-|AKIA|eyJ)[\w.-]+|\b[0-9a-f]{24,}\b|\b[a-z0-9_-]{32,}\b/iu;

const foldVietnamese = (text: string) => text.normalize("NFKD").toLowerCase()
  .replace(/[\p{M}\p{Cf}]/gu, "").replace(/đ/gu, "d").replace(/\s+/gu, " ").trim();

export function isSensitiveMemory(text: string): boolean {
  const folded = foldVietnamese(text);
  const terms = folded.replace(/[._-]+/gu, " ");
  return sensitiveTerms.some(pattern => pattern.test(terms)) || sensitiveShape.test(folded) || streetAddress.test(folded);
}

/** Preserve accents in deduplication so distinct Vietnamese words stay distinct. */
export function normalizeMemory(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("vi").replace(/[\p{P}\p{S}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim();
}

const explicit = /(?:^|[.!?]\s+)(?:(?:hay|vui long|lam on)\s+)?(?:nho\s+(?:giup|ho|rang|luu)|hay nho|ghi nho|luu lai|remember|please remember|save this)\b(?:\s+(?:giup toi|giup minh|that))?\s*[:,-]?\s*(.+)$/u;
const doNotRemember = /\b(?:(?:dung|khong)\s+(?:nho|luu|ghi nho)|do not (?:remember|save)|don'?t (?:remember|save)|never (?:remember|save))\b/u;
const tripTopic = /\b(?:di du lich|chuyen di|hanh trinh|xe may|xe dap|o to|xe khach|tau hoa|may bay|di bo|leo nui|trekking|cam trai|khach san|homestay|nha nghi|diem den|an chay|an thuan chay|an kieng|hai san|an cay|ngan sach|gio khoi hanh|travel|trip|motorbike|motorcycle|hiking|camping|vegetarian|vegan|hotels?|hostels?|budget|flights?)\b/u;
const preferenceCue = /\b(?:thich|uu tien|muon|tranh|chi di|chi an|chi o|khong di|khong an|khong o|khong leo|can|prefer|avoid|only|never|like|dislike|want|need|no hiking)\b/u;
const standingPreference = /^(?:(?:toi|minh|em|i)\s+)?(?:an chay|an thuan chay|am vegetarian|am vegan|vegan|vegetarian|di xe may|ride a motorbike)[.!]?$/u;

function containsCompleteClause(text: string, quote: string) {
  return normalizeMemory(text) === quote ||
    text.split(/(?:[.!?;]\s+|\r?\n+)/u).some(clause => normalizeMemory(clause) === quote);
}

/** Allow only a quote from the latest user message, never material supplied by the model or recalled data. */
export function permitsRemember(input: MemoryInput, latestUserText: string): boolean {
  const quote = normalizeMemory(input.content);
  const source = foldVietnamese(latestUserText);
  if (!quote || isSensitiveMemory(input.content) || isSensitiveMemory(latestUserText) || doNotRemember.test(source)) return false;
  const request = explicit.exec(source);
  if (request && containsCompleteClause(request[1]!, normalizeMemory(foldVietnamese(input.content))) &&
      (` ${normalizeMemory(latestUserText)} `).includes(` ${quote} `)) return true;
  const cue = foldVietnamese(input.content);
  return input.kind !== "NOTE" && containsCompleteClause(latestUserText, quote)
    && (standingPreference.test(cue) || (tripTopic.test(cue) && preferenceCue.test(cue)));
}
