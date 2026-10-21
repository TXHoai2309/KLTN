import "server-only";
import { z } from "zod";
import { createQaJsonProvider, QA_DEFAULT_MODEL, type QaProviderOptions } from "./qa-json-provider";
import type { QaHistoryTurn } from "./qa-runtime-contract";
import type { QaResolvedContext } from "./qa-destination-context";
import {
  type QaQuestionUnderstanding,
  deterministicQuestionUnderstanding,
} from "./qa-question-understanding";
import { qaStage } from "./qa-diagnostics";

export interface QaQuestionUnderstander {
  understand(input: {
    question: string;
    history?: readonly QaHistoryTurn[];
    context?: QaResolvedContext;
    signal?: AbortSignal;
  }): Promise<QaQuestionUnderstanding>;
}

const questionUnderstandingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "targetSubjects",
    "intent",
    "attributes",
    "temporalConstraint",
    "conditions",
    "searchQuery",
    "ambiguous",
    "clarificationQuestion",
  ],
  properties: {
    targetSubjects: {
      type: "array",
      items: { type: "string" },
      description: "Danh sách địa danh hoặc chủ thể du lịch Hà Giang cụ thể được hỏi (vd: ['Làng văn hóa du lịch cộng đồng Hạ Thành', 'Hạ Thành']). Giữ đúng tên riêng.",
    },
    intent: {
      type: "string",
      enum: ["OVERVIEW", "ADMISSION", "OPENING_HOURS", "CULTURE", "HISTORY", "DIRECTIONS", "SCHEDULE", "COMPARISON", "OTHER"],
      description: "Ý định hỏi chính của người dùng.",
    },
    attributes: {
      type: "array",
      items: { type: "string" },
      description: "Các khía cạnh hoặc thuộc tính được hỏi (vd: ['nhà sàn', 'homestay', 'văn hóa Tày']).",
    },
    temporalConstraint: {
      type: ["string", "null"],
      description: "Mốc năm, thời gian hoặc mùa vụ nếu người dùng có nêu cụ thể (vd: '2026', 'tháng 10').",
    },
    conditions: {
      type: "array",
      items: { type: "string" },
      description: "Điều kiện, phủ định hoặc đối tượng cụ thể (vd: ['không mất phí', 'trẻ em', 'tự túc']).",
    },
    searchQuery: {
      type: "string",
      description: "Truy vấn tìm kiếm tối ưu cho retrieval, chứa tên địa danh và nhu cầu tìm kiếm, giữ nguyên số liệu và phủ định.",
    },
    ambiguous: {
      type: "boolean",
      description: "True nếu câu hỏi hoàn toàn thiếu chủ thể và không thể xác định được từ bối cảnh hay lịch sử.",
    },
    clarificationQuestion: {
      type: ["string", "null"],
      description: "Nếu ambiguous=true, câu hỏi làm rõ đối tượng bằng tiếng Việt ngắn gọn lịch sự.",
    },
  },
};

const understandingValidationSchema = z.object({
  targetSubjects: z.array(z.string()).max(10),
  intent: z.enum(["OVERVIEW", "ADMISSION", "OPENING_HOURS", "CULTURE", "HISTORY", "DIRECTIONS", "SCHEDULE", "COMPARISON", "OTHER"]),
  attributes: z.array(z.string()).max(10),
  temporalConstraint: z.string().nullable().optional(),
  conditions: z.array(z.string()).max(10),
  searchQuery: z.string().min(1).max(500),
  ambiguous: z.boolean(),
  clarificationQuestion: z.string().nullable().optional(),
}).strict();

export function createQaQuestionUnderstander(options: QaProviderOptions = {}): QaQuestionUnderstander {
  const provider = createQaJsonProvider({
    ...options,
    providerPhase: "QUESTION_UNDERSTANDING",
    model: options.model ?? QA_DEFAULT_MODEL,
    maxOutputTokens: 600,
  });

  return {
    async understand(input) {
      const history = input.history ?? [];
      const context = input.context ?? { type: "GENERAL" };
      const deterministic = deterministicQuestionUnderstanding(input.question, history, context);

      const systemPrompt = `Bạn là hệ thống AI phân tích và hiểu câu hỏi về du lịch Hà Giang (Việt Nam).
Nhiệm vụ của bạn:
1. Xác định đúng chủ thể điểm đến/địa danh Hà Giang được người dùng hỏi đến (targetSubjects). Giữ đúng tên riêng, chữ hoa, tên viết tắt hoặc tên đầy đủ.
2. Xác định ý định (intent) và thông tin cụ thể cần tìm (attributes).
3. Giữ nguyên số liệu, mốc năm/thời gian (temporalConstraint), điều kiện, đối tượng và từ phủ định (conditions: vd 'không...', 'chưa...').
4. Nếu câu hỏi là câu nối tiếp ('ở đó', 'nơi này', 'còn giá vé?'), hãy dùng câu hỏi của người dùng trong lịch sử (history) hoặc bối cảnh điểm đến (context) để xác định chủ thể. Không dùng câu trả lời cũ làm căn cứ thực tế.
5. Nếu người dùng nêu địa danh mới (vd 'Còn Đồng Văn thì sao?'), địa danh mới thay thế chủ thể cũ.
6. NGUYÊN TẮC BẮT BUỘC: KHÔNG tự sinh dữ kiện trả lời. KHÔNG bịa đặt thông tin. KHÔNG thêm địa danh không liên quan (ví dụ nếu hỏi Hạ Thành, tuyệt đối không thêm Đồng Văn vào targetSubjects).
7. Nếu câu hỏi hoàn toàn mơ hồ, không có chủ thể cả trong câu hỏi lẫn lịch sử/bối cảnh, hãy đặt ambiguous=true và clarificationQuestion='Bạn muốn hỏi về điểm đến nào?'.`;

      const userContent = JSON.stringify({
        question: input.question,
        context: context.type === "DESTINATION" ? { destinationName: context.name } : { type: "GENERAL" },
        recentUserQuestions: history.slice(-4).map(h => h.question),
      });

      try {
        const result = await provider.request(
          {
            name: "qa_question_understanding",
            schema: questionUnderstandingSchema,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            signal: input.signal,
          },
          val => understandingValidationSchema.parse(val),
        );

        const combinedSubjects = [...new Set([...result.targetSubjects, ...deterministic.targetSubjects])];
        return {
          targetSubjects: combinedSubjects.length > 0 ? combinedSubjects : result.targetSubjects,
          intent: result.intent,
          attributes: result.attributes,
          temporalConstraint: result.temporalConstraint ?? deterministic.temporalConstraint,
          conditions: [...new Set([...result.conditions, ...deterministic.conditions])],
          searchQuery: result.searchQuery || deterministic.searchQuery,
          ambiguous: result.ambiguous && deterministic.ambiguous,
          clarificationQuestion: result.clarificationQuestion ?? deterministic.clarificationQuestion,
        };
      } catch {
        // Fallback limited to deterministic understanding, no retries to provider
        return deterministic;
      }
    },
  };
}
