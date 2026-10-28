"use client";
import { lazy, Suspense, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { PlanningClient, getPlanningClient, confirmPlanningPrincipal, type PlanningMessage } from "./planning-client";
import type { QaContext } from "../../modules/ai/qa-contract";
import Link from "next/link";
import { retainPlanningAuthDraft } from "./planning-auth-handoff";
import type { PlanningGenerated } from "../../modules/assistant-planning/planning-contract";
import type { PlannerCheck } from "../../modules/trip-planner/planner-contract";
import { formatVietnameseDate } from "../../lib/date-only";
import { Loader2 } from "lucide-react";
import { currentPlanningPreference, planningPreferenceReplies } from "../../modules/assistant-planning/planning-preferences";
import { hasPlanningDraftSuggestion, type PlanningDraftSuggestion } from "./planning-suggestion-draft";

const ItineraryMap = lazy(() => import("../trip-planner/itinerary-map").then(m => ({ default: m.ItineraryMap })));
export function usePlanningClient(identity: string, conversationId: string | null, generation: number) {
  const instance = useId();
  const client = useMemo(() => getPlanningClient(identity, conversationId, `${instance}:${generation}`), [identity, conversationId, instance, generation]);
  useEffect(() => confirmPlanningPrincipal(identity), [identity]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => { if (conversationId) void client.restore(conversationId); }, [client, conversationId]);
  return { client, state };
}
const clock = (minute: number | null) => minute === null ? "Chưa rõ giờ" : `${Math.floor(minute / 60).toString().padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
const labels: Record<string, string> = { OPENING_HOURS: "Giờ mở cửa", MINIMUM_DURATION: "Thời lượng tham quan", TRAVEL_TIME: "Thời gian di chuyển", SCHEDULE_CONFLICTS: "Lịch không xung đột", MOBILITY: "Khả năng di chuyển", PASS: "Đáp ứng", VIOLATION: "Vi phạm", INSUFFICIENT_DATA: "Chưa đủ dữ liệu" };
function issueGroups(check: PlannerCheck, names: Record<string, string>) {
  const groups = new Map<string, { message: string; places: string[] }>();
  for (const issue of check.issues) {
    const group = groups.get(issue.message) ?? { message: issue.message, places: [] };
    const place = [issue.day ? `Ngày ${issue.day}` : "", issue.destinationId ? names[issue.destinationId] : ""].filter(Boolean).join(" · ");
    if (place && !group.places.includes(place)) group.places.push(place);
    groups.set(issue.message, group);
  }
  return [...groups.values()];
}

export function PlanningPanel({ client, available, onStarted, conversationId, context, inputDraft = "", onSuggestReply, renderMessages = true }: { client: PlanningClient; available: boolean; onStarted: (id: string, context: QaContext) => void; conversationId: string | null; context: QaContext; inputDraft?: string; onSuggestReply?: (suggestion: PlanningDraftSuggestion) => void; renderMessages?: boolean }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const suggestionsHelpId = useId();
  useEffect(() => { if (state.workspace) onStarted(state.workspace.conversationId, state.workspace.context); }, [state.workspace?.conversationId, onStarted]);
  const disabled = !available || state.busy || state.uncertain || !!state.workspace?.pendingSaveKey || !!state.savedTripId;
  const pendingQuestion = state.messages.at(-1)?.reply === "";
  const suggestingPreferences = state.prompt?.kind === "NEED" && state.prompt.field === "preferences";
  return <section className="assistant-planning" aria-label="Lập hành trình trong hội thoại" aria-busy={state.busy}>
    {!state.active ? <button type="button" className="assistant-planning-start" disabled={!available || state.busy} onClick={() => void client.start(conversationId, context)}>Lập hành trình cùng AI</button> : <>
      {state.error && <p role="alert">{state.error}</p>}
      {!client.identity.startsWith("USER:") ? <div className="assistant-planning-auth"><p>{state.message}</p><Link className="assistant-planning-login" href="/login?returnTo=%2Fassistant" onClick={() => { const intent = state.authIntent; retainPlanningAuthDraft(intent?.text ?? "Tôi muốn lập hành trình Hà Giang", intent?.context ?? context); }}>Đăng nhập để tiếp tục</Link><p className="assistant-muted">Bạn vẫn có thể hỏi thông tin ở ô chat. Sau đăng nhập, yêu cầu sẽ được điền lại để bạn xem và gửi tiếp.</p></div> : <>
        {renderMessages && state.messages.map((message, i) => <PlanningExchange message={message} client={client} available={available} key={message.id ?? i}/>)}
        {!pendingQuestion && state.messages.at(-1)?.reply !== state.message && <article className="assistant-message assistant-answer assistant-planning-reply"><span className="assistant-speaker">Trợ lý AI</span><p role="status" aria-live="polite">{state.message}</p></article>}
        {state.busy && <p className="assistant-planning-loading" role="status"><Loader2 size={16} aria-hidden="true"/>Mình đang xem yêu cầu của bạn…</p>}
        {state.uncertain ? <div><button type="button" disabled={!available || state.busy} onClick={() => void client.reconcile()}>Kiểm tra lại kết quả</button>{client.canEditFailedAnalysis() && <button type="button" disabled={!available} onClick={() => client.editFailedAnalysis()}>Sửa yêu cầu</button>}</div> : <>
          <div className="assistant-planning-actions" role="group" aria-label={suggestingPreferences ? "Gợi ý câu trả lời" : "Trả lời nhanh"} aria-describedby={suggestingPreferences ? suggestionsHelpId : undefined}>
            {state.prompt?.kind === "NEED" && state.prompt.field === "startDate" && <button type="button" disabled={disabled} onClick={() => void client.analyze("Chưa chốt ngày")}>Mình chưa chốt ngày</button>}
            {suggestingPreferences && <>
              {planningPreferenceReplies(state.draft).map(reply => <button type="button" disabled={disabled || !onSuggestReply} key={reply.text} title="Thêm vào ô nhập" aria-label={hasPlanningDraftSuggestion(inputDraft, reply) ? `${reply.label} — đã thêm vào ô nhập` : undefined} onClick={() => onSuggestReply?.(reply)}>{reply.label}</button>)}
              <button type="button" disabled={disabled || !onSuggestReply} data-variant="secondary" title="Điền vào ô nhập" onClick={() => onSuggestReply?.({ text: "Bỏ qua câu này" })}>Bỏ qua câu này</button>
            </>}
            {(state.prompt?.kind === "RECAP" || state.prompt?.kind === "REGENERATE") && <button type="button" disabled={disabled} onClick={() => void client.analyze("Đúng rồi, tạo đi")}>Đúng rồi, tạo đi</button>}
            {(state.prompt?.kind === "CHANGE" || state.prompt?.kind === "APPLY_CHANGE") && <button type="button" disabled={disabled} onClick={() => void client.analyze("Đồng ý")}>Đồng ý thay đổi</button>}
            {state.prompt?.kind === "DATE_CHANGE" && <><button type="button" disabled={disabled} onClick={() => void client.analyze("Đồng ý")}>Đúng, đổi ngày như vậy</button><button type="button" disabled={disabled} data-variant="secondary" onClick={() => void client.analyze("Không đổi nữa")}>Giữ thông tin cũ</button></>}
            {state.prompt?.kind === "OPTIONS" && state.prompt.choices.map((choice, i) => <button type="button" disabled={disabled} key={choice.id} onClick={() => void client.chooseOption(i)}>{i + 1}. {choice.name}</button>)}
            {(state.prompt?.kind === "OPTIONS" || state.prompt?.kind === "CHANGE" || state.prompt?.kind === "APPLY_CHANGE") && <button type="button" disabled={disabled} data-variant="secondary" onClick={() => void client.analyze("Không đổi nữa")}>Giữ nguyên</button>}
          </div>
          {suggestingPreferences && <p id={suggestionsHelpId} className="assistant-muted">{currentPlanningPreference(state.draft) === "interests" ? "Bạn có thể chọn nhiều trải nghiệm, viết thêm rồi nhấn Gửi." : "Chọn một gợi ý hoặc viết câu trả lời, rồi nhấn Gửi."}</p>}
          {state.unresolved.map((item, index) => <div className="assistant-planning-actions assistant-planning-unresolved" role="group" aria-label={`Làm rõ điểm đến: ${item.name}`} key={`${item.name}-${index}`}>{item.choices.map(c => <button type="button" disabled={disabled} key={c.id} onClick={() => client.resolve(index, c.id)}>{c.name}</button>)}{!item.choices.length && <p>Chưa tìm được điểm phù hợp. Bạn có thể nói tên khác hoặc bỏ yêu cầu này.</p>}<button type="button" disabled={disabled} data-variant="secondary" onClick={() => client.resolve(index, null)}>Bỏ yêu cầu điểm này</button></div>)}
        </>}

        {state.savedTripId && <div><a href={`/trips/${encodeURIComponent(state.savedTripId)}`}>Mở chuyến đi</a><button type="button" disabled={!available || state.busy} onClick={() => client.beginAnotherPlan()}>Lập chuyến khác từ nhu cầu này</button></div>}
      </>}
    </>}
  </section>;
}

export function PlanningExchange({ message, client, available = true }: { message: PlanningMessage; client?: PlanningClient; available?: boolean }) {
  return <div className="assistant-planning assistant-planning-exchange">
    {message.question && <article className="assistant-message assistant-user" aria-label="Tin nhắn của bạn"><p>{message.question}</p></article>}
    {message.reply && <article className="assistant-message assistant-answer assistant-planning-reply" aria-label="Phản hồi của trợ lý"><span className="assistant-speaker">Trợ lý AI</span><p>{message.reply}</p></article>}
    {message.proposal && client && <PlanningProposalCard client={client} generated={message.proposal} available={available}/>}
  </div>;
}

export function PlanningProposalCard({ client, generated, available }: { client: PlanningClient; generated: PlanningGenerated; available: boolean }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [collapsedProposalId, setCollapsedProposalId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const saveHelpId = useId();
  const isCurrent = state.generated?.proposal.proposalId === generated.proposal.proposalId && state.generated?.version === generated.version;
  const disabled = !available || state.busy || state.uncertain || !!state.workspace?.pendingSaveKey || !!state.savedTripId;
  const expanded = collapsedProposalId !== generated.proposal.proposalId;
  const day = generated.proposal.days[0];
  const missingDate = !generated.proposal.requirement.startDate;
  const names = Object.fromEntries(generated.proposal.days.flatMap(d => d.stops.map(s => [s.destination.id, s.destination.name])));
  const checks = generated.proposal.checks;
  const blockedChecks = checks.filter(c => c.status !== "PASS");
  return <div className="assistant-planning-proposal" data-proposal-id={generated.proposal.proposalId}>
          <header><div><h2>Hành trình của bạn</h2><p className="assistant-muted">{generated.proposal.days.length} ngày · {generated.proposal.requirement.transport === "MOTORCYCLE" ? "Xe máy" : "Ô tô"} · {generated.proposal.days.reduce((sum, d) => sum + d.stops.length, 0)} điểm dừng</p></div><span className="assistant-planning-status">{isCurrent ? state.savedTripId ? "Đã lưu" : "Bản đề xuất hiện tại" : "Phiên bản trước"}</span></header>
          {!isCurrent && <p className="assistant-muted">Phiên bản này được giữ để bạn đối chiếu.</p>}
          {isCurrent && state.changeSummary && <p role="status">{state.changeSummary}</p>}
          {generated.repairError && <p role="alert">{generated.repairError}</p>}
          {isCurrent && !state.savedTripId && !generated.proposal.eligibleForFinalConfirmation && <div className="assistant-planning-readiness" role="note"><strong>{missingDate ? "Cần ngày khởi hành để lưu chuyến đi" : "Lịch trình còn thông tin cần kiểm tra"}</strong><p>{missingDate ? "Bạn vẫn có thể xem và chỉnh bản sơ bộ. Nhắn ngày/tháng/năm khởi hành để mình kiểm tra giờ mở cửa trước khi lưu." : "Mình đã giữ bản đề xuất bên dưới. Bạn mở kết quả kiểm tra để xem phần cần bổ sung hoặc điều chỉnh."}</p></div>}
          <ol className="assistant-planning-days">{generated.proposal.days.map(d => <li key={d.day}><h3>Ngày {d.day}{d.date ? ` · ${formatVietnameseDate(d.date)}` : ""}</h3><ol>{d.stops.map(stop => <li key={stop.destination.id}><span className="assistant-planning-time">{clock(stop.arrivalMinute)}</span><div><a href={`/destinations/${encodeURIComponent(stop.destination.id)}`}>{stop.destination.name}</a><span>Tham quan {stop.visitDurationMinutes} phút{stop.inbound?.status === "VERIFIED" && stop.inbound.durationSeconds != null ? ` · Di chuyển khoảng ${Math.ceil(stop.inbound.durationSeconds / 60)} phút` : ""}</span></div></li>)}</ol>{!d.stops.length && <p>Chưa có điểm phù hợp cho ngày này.</p>}</li>)}</ol>
          <button type="button" aria-expanded={expanded} onClick={() => setCollapsedProposalId(expanded ? generated.proposal.proposalId : null)}>{expanded ? "Thu gọn bản đồ" : "Xem bản đồ hành trình"}</button>
          {expanded && day && <div className="assistant-planning-map"><Suspense fallback={<p role="status">Đang mở bản đồ…</p>}><ItineraryMap day={day} days={generated.proposal.days} selectedDestinationId={selected} focusSelection={false} onSelect={setSelected} overviewOnly/></Suspense></div>}
          <details className="assistant-planning-checks"><summary>Kết quả kiểm tra · {blockedChecks.length ? `${blockedChecks.length} mục cần lưu ý` : "Các mục đều đáp ứng"}</summary><p className="assistant-muted">Đã kiểm tra {generated.attempts.length} phương án · Điều chỉnh tự động {generated.attempts.length - 1}/2 lần.</p><ul className="assistant-planning-validation">{checks.map(check => <li key={check.key} data-status={check.status}><strong>{labels[check.key]}: {labels[check.status]}</strong>{issueGroups(check, names).map(group => <div key={group.message}><p>{group.message}</p>{group.places.length > 0 && <p className="assistant-muted">{group.places.join("; ")}</p>}</div>)}</li>)}</ul></details>
          <details className="assistant-planning-checks"><summary>Lưu ý cho chuyến đi</summary>{generated.proposal.warnings.filter(w => w.code !== "PRELIMINARY_ONLY").map((w, i) => <p className="assistant-muted" key={`${w.code}-${i}`}>{w.message}</p>)}</details>
          {isCurrent && !state.savedTripId && <div className="assistant-planning-save"><button type="button" disabled={disabled || !state.generated || !generated.proposal.eligibleForFinalConfirmation} aria-describedby={!generated.proposal.eligibleForFinalConfirmation ? saveHelpId : undefined} onClick={() => {
            const latest = client.getSnapshot();
            if (latest.generated?.proposal.proposalId === generated.proposal.proposalId && latest.generated?.version === generated.version) void client.save();
          }}>Xác nhận và lưu chuyến đi</button>{!generated.proposal.eligibleForFinalConfirmation && <p id={saveHelpId} className="assistant-muted">{missingDate ? "Chưa thể lưu khi chưa có ngày khởi hành." : "Chỉ lưu được khi lịch trình đáp ứng các kiểm tra bắt buộc."}</p>}</div>}
        </div>;
}
