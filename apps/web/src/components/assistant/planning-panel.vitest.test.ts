import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlanningClient } from "./planning-client";
import { PlanningExchange, PlanningPanel } from "./planning-panel";
import { EMPTY_PLANNING_NEEDS } from "../../modules/assistant-planning/planning-contract";
import { fixtureNeeds, planningCandidate, fixtureRoutes, planningNow } from "../../test/planning-fixtures";
import { scheduleSelection } from "../../modules/assistant-planning/planning-engine";
const workspace = { conversationId: "chat", version: 0, needs: EMPTY_PLANNING_NEEDS, pendingSaveKey: null, savedTripId: null, context: { type: "GENERAL" as const } };
const render = (client: PlanningClient) => renderToStaticMarkup(createElement(PlanningPanel, { client, available: true, onStarted: () => undefined, conversationId: "chat", context: { type: "GENERAL" } }));
describe("Shared planning panel semantic states", () => {
  it("shows another read-only copy on request without duplicating the save control", async () => {
    const proposal = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a")], fixtureRoutes, planningNow);
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds })
      .mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds, version: 1 })
      .mockResolvedValueOnce({ proposal, selection: { days: [["a"]] }, attempts: [{ status: proposal.status, checks: [] }], repairError: null, version: 2 });
    const client = new PlanningClient("USER:display", call);
    await client.start("chat"); await client.generate(); await client.analyze("Hiển thị lại lịch trình");
    const html = render(client);
    expect(html.match(/class="assistant-planning-proposal"/g)).toHaveLength(2);
    expect(html.match(/>Xác nhận và lưu chuyến đi</g)).toHaveLength(1);
  });
  it("keeps each itinerary card before subsequent edits and appends the revised card below its reply", async () => {
    const first = await scheduleSelection(fixtureNeeds, { days: [["a"]] }, [planningCandidate("a"), planningCandidate("b")], fixtureRoutes, planningNow);
    const second = await scheduleSelection(fixtureNeeds, { days: [["b"]] }, [planningCandidate("a"), planningCandidate("b")], fixtureRoutes, planningNow);
    const generated = (proposal: typeof first, id: string, reply: string, version: number) => ({ proposal, selection: { days: [[id]] }, attempts: [{ status: proposal.status, checks: [] }], repairError: null, version, reply });
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds })
      .mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds, version: 1 }).mockResolvedValueOnce(generated(first, "a", "Đây là lịch đầu tiên.", 2))
      .mockResolvedValueOnce({ intent: "NEEDS", needs: fixtureNeeds, unresolved: [], message: "", followUpMessage: "Mình nhận yêu cầu đổi lịch." })
      .mockResolvedValueOnce({ ...workspace, needs: fixtureNeeds, version: 3 }).mockResolvedValueOnce(generated(second, "b", "Đây là lịch đã chỉnh.", 4));
    const client = new PlanningClient("USER:ordered-cards", call);
    await client.start("chat"); await client.generate();
    await client.analyze("Đổi lịch giúp mình");
    const duringEdit = render(client);
    expect(duringEdit.indexOf("Điểm a")).toBeLessThan(duringEdit.indexOf("Đổi lịch giúp mình"));
    await client.generate();
    const html = render(client);
    expect(html.match(/class="assistant-planning-proposal"/g)).toHaveLength(2);
    expect(html.indexOf("Điểm a")).toBeLessThan(html.indexOf("Đổi lịch giúp mình"));
    expect(html.indexOf("Mình nhận yêu cầu đổi lịch.")).toBeLessThan(html.indexOf("Đây là lịch đã chỉnh."));
    expect(html.indexOf("Đây là lịch đã chỉnh.")).toBeLessThan(html.indexOf("Điểm b"));
    expect(html).toContain("Phiên bản trước");
    expect(html.match(/>Xác nhận và lưu chuyến đi</g)).toHaveLength(1);
    client.reopenHistory();
    expect(render(client)).not.toContain('class="assistant-planning-proposal"');
    expect(render(client)).toContain("Đây là lịch đầu tiên.");
  });
  it("offers companion categories first and only asks the size once a category is known", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["NATURE" as const], pace: "MODERATE" as const } };
    const first = new PlanningClient("USER:companion-options", async () => ({ ...workspace, needs })); await first.start("chat");
    const firstHtml = render(first);
    for (const label of ["Đi một mình", "Đi với người yêu", "Đi với gia đình", "Đi với bạn bè", "Nhóm khác"]) expect(firstHtml).toContain(label);
    expect(firstHtml).not.toContain("Bạn có thể chọn nhiều");
    const family = new PlanningClient("USER:family-count", async () => ({ ...workspace, needs: { ...needs, companionDraft: { type: "FAMILY" } } })); await family.start("chat");
    const countHtml = render(family);
    expect(countHtml).toContain("bao nhiêu người");
    expect(countHtml).toContain("4 người");
    expect(countHtml).not.toContain(">Đi với gia đình</button>");
  });
  it("shows one optional question and quick replies only for that topic", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, interests: ["ADVENTURE" as const] } };
    const client = new PlanningClient("USER:guided-panel", async () => ({ ...workspace, needs })); await client.start("chat");
    const html = render(client);
    expect(html).toContain("Nhịp đi:");
    expect(html).not.toContain("Đi cùng:");
    expect(html).not.toContain("Lưu ý di chuyển:");
    expect(html).not.toContain("Điểm muốn ghé:");
    expect(html).not.toContain("Bỏ qua phần còn lại");
    expect(html).toContain("Bỏ qua câu này");
    expect(html).toContain("Đi thư thả");
    expect(html).not.toContain("Đi một mình");
    expect(html).not.toContain(">Thích mạo hiểm</button>");
    expect(html).not.toContain(">Đúng rồi, tạo đi</button>");
  });
  it("does not render an empty assistant bubble while a question is pending", () => {
    const html = renderToStaticMarkup(createElement(PlanningExchange, { message: { question: "Xe máy", reply: "" } }));
    expect(html).toContain("Xe máy");
    expect(html).not.toContain("Phản hồi của trợ lý");
  });
  it("keeps requirement capture in chat without opening a form", async () => {
    const client = new PlanningClient("USER:a", async () => workspace); await client.start("chat");
    expect(render(client)).not.toContain("<fieldset");
    expect(render(client)).not.toContain('type="date"');
  });
  it("renders the assistant reply once in the conversation", async () => {
    const reply = "Bạn muốn đi mấy ngày?";
    const call = vi.fn().mockResolvedValueOnce(workspace).mockResolvedValueOnce({ intent: "CLARIFY", needs: EMPTY_PLANNING_NEEDS, unresolved: [], message: reply });
    const client = new PlanningClient("USER:a", call); await client.start("chat"); await client.analyze("Tôi muốn tạo hành trình");
    expect(render(client).split(reply)).toHaveLength(2);
  });
  it("requires mandatory needs and shows an explicit Guest auth transition", async () => {
    const guest = new PlanningClient("GUEST:fixture"); await guest.start(null);
    expect(render(guest)).toContain("Đăng nhập để tiếp tục");
    const client = new PlanningClient("USER:a", async () => workspace); await client.start("chat");
    expect(render(client)).toContain("Bạn muốn đi mấy ngày?");
    expect(render(client)).not.toContain("Kiểm tra nhu cầu trước khi tạo hành trình");
  });
  it("a relative proposal exposes each check but cannot enable Save", async () => {
    const needs = { ...fixtureNeeds, requirement: { ...fixtureNeeds.requirement, startDate: null } };
    const proposal = await scheduleSelection(needs, { days: [["a", "b"]] }, [planningCandidate("a"), planningCandidate("b")], fixtureRoutes, planningNow);
    const generated = { proposal, selection: { days: [["a", "b"]] }, attempts: [{ status: proposal.status, checks: [] }], repairError: null, version: 2 };
    const call = vi.fn().mockResolvedValueOnce({ ...workspace, needs }).mockResolvedValueOnce({ ...workspace, needs, version: 1 }).mockResolvedValueOnce(generated);
    const client = new PlanningClient("USER:a", call); await client.start("chat"); await client.generate();
    const html = render(client);
    expect(html).toContain('class="assistant-planning-map"');
    expect(html).toContain("Thu gọn bản đồ");
    expect(html).toContain("Chưa đủ dữ liệu");
    expect(html).toMatch(/disabled=""[^>]*>Xác nhận và lưu chuyến đi/);
    expect(html).toContain("Ngày 1");
    expect(html).toContain("Chưa tính chặng từ nơi xuất phát");
    expect(html).toContain("Cần ngày khởi hành để lưu chuyến đi");
    expect(html.split("Cần ngày cụ thể, giờ tham quan và lịch mở cửa để kiểm tra.")).toHaveLength(2);
    await client.save();
    expect(call).toHaveBeenCalledTimes(3);
    expect(client.getSnapshot().message).toContain("ngày khởi hành");
  });
});
