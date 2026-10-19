/**
 * Deterministic, offline title generator for AI conversations.
 * Extracts clean, natural, human-friendly titles in Vietnamese without LLM calls.
 */
export function generateConversationTitle(rawQuestion: string, maxLength = 60): string {
  if (!rawQuestion) return "Cuộc hội thoại mới";

  let text = rawQuestion.normalize("NFC").trim();
  if (!text) return "Cuộc hội thoại mới";

  // Remove common question prefixes in Vietnamese
  const prefixPatterns = [
    /^(?:bạn ơi[,.\s]*)*(?:cho\s+(?:mình|tôi|em|anh|chị)\s+hỏi\s+(?:về|là|xem|rằng)?\s*)/iu,
    /^(?:làm\s+ơn\s+)?cho\s+hỏi\s+(?:về|là|xem|rằng)?\s*/iu,
    /^(?:bạn\s+ơi[,.\s]+)/iu,
    /^(?:hãy\s+)?giới\s+thiệu\s+(?:ngắn\s+gọn\s+)?về\s*/iu,
    /^(?:hãy\s+)?cho\s+(?:mình|tôi|em|anh|chị|biết)\s+(?:biết\s+)?về\s*/iu,
    /^(?:tìm\s+hiểu\s+(?:thêm\s+)?về\s*)/iu,
    /^(?:thông\s+tin\s+về\s*)/iu,
    /^(?:mình\s+muốn\s+hỏi\s+(?:về)?\s*)/iu,
    /^(?:tôi\s+muốn\s+biết\s+(?:về)?\s*)/iu,
  ];

  for (const pattern of prefixPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, "").trim();
      break;
    }
  }

  // Remove trailing question marks or punctuation
  text = text.replace(/[?.!,:;…]+$/u, "").trim();

  if (!text) return "Cuộc hội thoại mới";

  // Capitalize first character
  const firstChar = text.charAt(0).toLocaleUpperCase("vi");
  text = firstChar + text.slice(1);

  // Truncate cleanly at word boundary if exceeding maxLength
  if (text.length > maxLength) {
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.5) {
      text = `${truncated.slice(0, lastSpace).trim()}…`;
    } else {
      text = `${truncated.trim()}…`;
    }
  }

  return text || "Cuộc hội thoại mới";
}
