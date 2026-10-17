import type { QaCompletedTurn } from "../../modules/ai/qa-contract";
import { normalizeQaQuestion } from "../../modules/ai/qa-question-understanding";

type MissingTurn = Extract<QaCompletedTurn, { status: "INSUFFICIENT_SOURCE" }>;

// Presentation of a completed missing-source outcome, never factual content or
// another provider call. Match fixed topics only; do not echo user/source text,
// infer travel facts or suggest that the entire corpus has no answer.
export function assistantSourceReply(turn: MissingTurn, question = ""): { explanation: string; nextStep: string } {
  const text = normalizeQaQuestion(question);
  const current = /(?:hôm nay|hiện tại|hiện nay|hiện giờ|mới nhất|bây giờ)/u.test(text);
  let topic = "phần thông tin này";
  let nextStep = "Bạn muốn tìm hiểu cụ thể về vị trí, cảnh quan, văn hóa hay chi phí? Bạn có thể chọn một ý để mình tra cứu tiếp.";
  if (/(?:^|\s)(?:vé|phí|chi phí|giá(?!\s+trị))(?:\s|$)/u.test(text.replace(/đánh giá/gu, ""))) {
    topic = current ? "mức giá đang áp dụng mà bạn hỏi" : "giá vé hoặc chi phí bạn hỏi";
    nextStep = /(?:chung|toàn (?:bộ|khu)|cả (?:khu|vùng))/u.test(text)
      ? "Mình chưa thể kết luận có vé chung hay cộng các loại phí thành một mức giá. Nếu muốn, bạn có thể hỏi riêng vé của một điểm tham quan."
      : "Bạn đang hỏi vé vào cửa chung hay vé của một điểm tham quan cụ thể? Mình sẽ giữ riêng từng loại phí khi tra cứu.";
  } else if (/(?:giờ mở|giờ đóng|giờ hoạt động|mấy giờ|mở cửa|đóng cửa|hoạt động lúc)/u.test(text)) {
    topic = current ? "giờ mở cửa hiện tại bạn hỏi" : "giờ mở cửa bạn hỏi";
    nextStep = "Bạn muốn kiểm tra cho ngày nào? Nếu câu hỏi có nhiều địa điểm, mình có thể tra riêng giờ mở cửa của từng nơi.";
  } else if (/(?:unesco|danh hiệu|xếp hạng|công nhận)/u.test(text)) {
    topic = "danh hiệu hoặc phần giải thích bạn hỏi";
    nextStep = /(?:ý nghĩa|nghĩa là|giải thích)/u.test(text)
      ? "Bạn muốn chuyển sang hỏi tên danh hiệu của địa điểm này không? Phần ý nghĩa vẫn cần thêm tài liệu hỗ trợ."
      : "Bạn có thể hỏi riêng tên danh hiệu hoặc thời điểm được công nhận; mình sẽ trả lời phần nào có đủ căn cứ.";
  } else if (/(?:địa chất|karst|hóa thạch|đá vôi)/u.test(text)) {
    topic = "đặc điểm địa chất bạn hỏi";
    nextStep = "Bạn muốn tìm hiểu riêng về địa hình, đá vôi hay hóa thạch? Mình có thể tiếp tục tra từng ý.";
  } else if (/(?:văn hóa|dân tộc|truyền thống|lễ hội)/u.test(text)) {
    topic = "thông tin văn hóa bạn hỏi";
    nextStep = "Bạn muốn tìm hiểu về cộng đồng dân tộc, phong tục hay lễ hội? Chọn một ý sẽ giúp mình tra cứu sát hơn.";
  } else if (/(?:phù hợp|an toàn|người (?:lớn|cao) tuổi|bậc thang|đi bộ|khuyết tật)/u.test(text)) {
    topic = "điều kiện phù hợp với chuyến đi của bạn";
    nextStep = "Bạn cần hạn chế đi bộ, bậc thang hay có yêu cầu di chuyển nào khác? Mình chưa thể kết luận nơi đó phù hợp hoặc an toàn khi thiếu thông tin này.";
  } else if (/(?:ở đâu|nằm ở đâu|vị trí|địa chỉ)/u.test(text)) {
    topic = "vị trí bạn hỏi";
    nextStep = "Bạn có thể ghi tên đầy đủ của địa điểm hoặc khu vực muốn hỏi để mình tra cứu sát hơn.";
  } else if (current) {
    topic = "thông tin cập nhật tại thời điểm bạn hỏi";
    nextStep = "Mình chưa thể coi thông tin cũ là thông tin còn áp dụng. Bạn có thể nêu rõ mục cần kiểm tra và ngày dự định đi.";
  }
  const explanation = turn.reason === "ANSWER_VERIFICATION"
    ? `Mình đã tìm thấy tài liệu liên quan, nhưng chưa xác minh được câu trả lời về ${topic}. Mình chưa muốn đưa ra một đáp án có thể khiến bạn hiểu sai.`
    : turn.reason === "NO_EVIDENCE"
      ? `Mình chưa tìm thấy tài liệu phù hợp để trả lời về ${topic} trong lần tra cứu này. Điều đó chưa có nghĩa là thông tin ấy không tồn tại.`
      : `Mình chưa có đủ căn cứ để trả lời chắc về ${topic}. Mình không muốn đoán rồi làm bạn lên kế hoạch dựa trên thông tin chưa chính xác.`;
  return { explanation, nextStep };
}
