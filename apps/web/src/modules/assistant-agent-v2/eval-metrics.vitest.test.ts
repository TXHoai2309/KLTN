import { describe, expect, it } from "vitest";
import { scoreTranscript, type EvalTurn } from "./eval-metrics";

const turn = (overrides: Partial<EvalTurn>): EvalTurn => ({ user: "x", reply: "ok", goal: "ASK_DURATION", proposalVersion: null, proposalId: null, known: {}, ...overrides });

describe("V2-10 evaluation metrics on recorded transcripts", () => {
  it("counts questions asked before the first proposal and the redundant ones", () => {
    const score = scoreTranscript([
      turn({ user: "lập hành trình", reply: "Bạn dự định đi mấy ngày?" }),
      turn({ user: "2 ngày", reply: "2 ngày thì mình giữ tuyến gọn. Bạn đi ô tô hay xe máy?", goal: "ASK_TRANSPORT", known: { durationDays: 2 } }),
      turn({ user: "xe máy", reply: "Với 2 ngày đi xe máy, mình xếp ngày 1: A. Lịch này chưa lưu, và vì chưa có ngày khởi hành nên giờ mở cửa vẫn cần kiểm tra lại.", goal: "PRESENT_PROPOSAL", proposalVersion: 2, proposalId: "p1", known: { durationDays: 2, transport: "MOTORCYCLE" } }),
      turn({ user: "lập lại lịch", reply: "Bạn đi mấy ngày vậy?", goal: "REFINE_PROPOSAL", proposalVersion: 3, proposalId: "p2", known: { durationDays: 2, transport: "MOTORCYCLE" } }),
    ]);
    expect(score.questionsBeforeProposal).toBe(2); expect(score.redundantQuestions).toBe(1);
  });
  it("flags more than one caveat on a create/change turn and any caveat on an unrelated read-only turn", () => {
    const score = scoreTranscript([
      turn({ reply: "Mình xếp ngày 1: A. Đây là đề xuất sơ bộ, chưa lưu. Một số kiểm tra chưa đủ dữ liệu; cần kiểm tra lại.", goal: "PRESENT_PROPOSAL", proposalVersion: 2, proposalId: "p1" }),
      turn({ user: "đi vậy có mệt không", reply: "Không quá mệt. Lưu ý lịch chưa lưu và giờ mở cửa vẫn cần kiểm tra lại.", goal: "PLANNING_GUIDANCE", proposalVersion: 2, proposalId: "p1" }),
      turn({ user: "lịch này ổn chưa", reply: "Khá cân bằng. Lịch chưa lưu vì chưa có ngày khởi hành.", goal: "PLANNING_GUIDANCE", proposalVersion: 2, proposalId: "p1" }),
    ]);
    expect(score.caveatViolations).toEqual([{ turn: 0, reason: "MORE_THAN_ONE_CAVEAT_ON_CHANGE" }, { turn: 1, reason: "CAVEAT_ON_UNRELATED_READ_ONLY" }]);
  });
  it("counts mechanical openers, technical jargon and lodging fabrication but allows the honest disclaimer", () => {
    const score = scoreTranscript([
      turn({ reply: "Mình ghi nhận bạn đi 2 ngày." }), turn({ reply: "Bạn muốn điều chỉnh cụ thể điều gì?" }),
      turn({ reply: "Capsule version 3 đã đổi, intent PLANNING_GUIDANCE." }),
      turn({ reply: "Bạn nên đặt phòng homestay Hoa Mai." }), turn({ reply: "Đây là gợi ý khu vực, không phải thông tin về khách sạn cụ thể." }),
    ]);
    expect(score.mechanicalPhrases).toBe(2); expect(score.jargonLeaks).toBe(1); expect(score.lodgingFabrication).toBe(1);
  });
  it("detects a read-only turn that changed the proposal", () => {
    const score = scoreTranscript([
      turn({ goal: "PRESENT_PROPOSAL", proposalVersion: 2, proposalId: "p1", reply: "Lịch chưa lưu, chưa có ngày khởi hành." }),
      turn({ goal: "PLANNING_GUIDANCE", proposalVersion: 3, proposalId: "p2", reply: "Khá cân bằng." }),
      turn({ goal: "QA_ANSWER", proposalVersion: 3, proposalId: "p2", reply: "Theo nguồn hiện có, ..." }),
    ]);
    expect(score.readOnlyMutations).toEqual([1]);
  });
  it("ignores the Dev [TEST] prefix in wording metrics", () => {
    const score = scoreTranscript([turn({ reply: "Với 2 ngày, mình xếp ngày 1: [TEST] Quản Bạ. Lịch chưa lưu, và chưa có ngày khởi hành.", goal: "PRESENT_PROPOSAL", proposalVersion: 2, proposalId: "p1" })]);
    expect(score.jargonLeaks).toBe(0); expect(score.caveatViolations).toEqual([]);
  });
  it("does not treat a factual answer's own insufficiency wording as a plan caveat", () => {
    const score = scoreTranscript([turn({ user: "Dinh họ Vương xây năm nào?", reply: "Chưa đủ dữ liệu được xác minh để trả lời câu hỏi này.", goal: "QA_ANSWER", proposalVersion: 2, proposalId: "p1" })]);
    expect(score.caveatViolations).toEqual([]);
  });
  it("counts a polite demand for facts already known as a redundant question", () => {
    const score = scoreTranscript([turn({ reply: "Bạn cho mình biết số ngày và phương tiện, mình sẽ dựng bản đầu.", goal: "PLANNING_GUIDANCE", known: { durationDays: 2, transport: "MOTORCYCLE" } })]);
    expect(score.redundantQuestions).toBe(1);
  });
});
