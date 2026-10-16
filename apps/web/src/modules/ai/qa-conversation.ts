import { normalizeQaQuestion } from "./qa-question-understanding";

// Server-authored social text contains no local factual claims. Keep the public
// message allowlist shared with the DTO; model-generated text cannot use it to
// bypass factual grounding. This module is pure and safe for contract imports.
export const QA_CONVERSATION_MESSAGES = {
  greeting: "Xin chào! Mình là trợ lý du lịch Hà Giang. Bạn muốn tìm hiểu điểm đến, văn hóa hay chuẩn bị cho chuyến đi?",
  thanks: "Rất vui được hỗ trợ bạn! Bạn còn muốn tìm hiểu điều gì cho chuyến đi không?",
  goodbye: "Tạm biệt bạn! Khi cần tìm hiểu thêm cho chuyến đi, bạn cứ quay lại trò chuyện nhé.",
  help: "Mình có thể giúp bạn tìm hiểu điểm đến và văn hóa Hà Giang từ tài liệu đã được xác minh, hoặc làm rõ nhu cầu cho chuyến đi. Bạn đang quan tâm điều gì?",
  wellbeing: "Mình sẵn sàng trò chuyện và hỗ trợ bạn. Hôm nay bạn muốn chia sẻ điều gì hoặc tìm hiểu gì về chuyến đi?",
  travel: "Bạn dự định đi mấy ngày, đi cùng ai và thích trải nghiệm như thế nào? Bạn có thể chia sẻ thêm để mình hỗ trợ cụ thể hơn.",
  acknowledgement: "Mình đang lắng nghe. Bạn muốn hỏi tiếp về điểm đến, văn hóa hay nhu cầu cho chuyến đi?",
} as const;
export type QaConversationMessage = typeof QA_CONVERSATION_MESSAGES[keyof typeof QA_CONVERSATION_MESSAGES];

export function qaConversationMessage(question: string): QaConversationMessage | undefined {
  const text = normalizeQaQuestion(question).normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").trim()
    .replace(/\s+(?:nhe|nha|a|nhi)$/u, "");
  // Full-string matches only. "Hi, Đồng Văn ...?" continues through retrieval.
  if (/^(?:hi|hello|hey|xin chao|chao)(?:\s+(?:ban|bot|tro ly|ai|moi nguoi))?$/u.test(text)) return QA_CONVERSATION_MESSAGES.greeting;
  if (/^(?:(?:cam on|cam on nhieu|thank you|thanks)(?:\s+(?:ban|bot|tro ly))?|minh cam on(?: ban)?)$/u.test(text)) return QA_CONVERSATION_MESSAGES.thanks;
  if (/^(?:tam biet|hen gap lai|bye|goodbye|bai bai)(?: ban)?$/u.test(text)) return QA_CONVERSATION_MESSAGES.goodbye;
  if (/^(?:ban la ai|ban ten (?:la )?gi|ban (?:co the )?(?:lam|giup|ho tro)(?: duoc)? (?:gi|nhung gi)|ban (?:co the )?(?:giup|ho tro) (?:minh|toi)(?: duoc)? khong|giup (?:minh|toi)|huong dan su dung)$/u.test(text)) return QA_CONVERSATION_MESSAGES.help;
  if (/^(?:ban (?:co )?khoe khong|hom nay ban the nao|noi chuyen voi (?:minh|toi)(?: di)?|tro chuyen voi (?:minh|toi))$/u.test(text)) return QA_CONVERSATION_MESSAGES.wellbeing;
  if (/^(?:(?:minh|toi) (?:muon|dinh|dang muon) (?:(?:di )?(?:du lich|di choi)(?: (?:o |tai )?ha giang)?|di ha giang)|(?:goi y|tu van)(?: cho (?:minh|toi))?(?: (?:di )?du lich)? ha giang)$/u.test(text)) return QA_CONVERSATION_MESSAGES.travel;
  if (/^(?:ok|okay|oke|vang|da|duoc|dong y)$/u.test(text)) return QA_CONVERSATION_MESSAGES.acknowledgement;
  return undefined;
}
