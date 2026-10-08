import { qaRequestSchema, qaResponseSchema, type QaCompletedTurn, type QaRequest } from "../../modules/ai/qa-contract";

export type AssistantAttempt = Readonly<{
  id: string;
  generation: number;
  identity: string;
  payload: QaRequest;
  body: string;
  key: string;
}>;
export type AssistantTransportResult =
  | { kind: "response"; body: unknown; httpStatus: number }
  | { kind: "networkAmbiguity" };
export interface AssistantTransport {
  send(attempt: AssistantAttempt, signal: AbortSignal): Promise<AssistantTransportResult>;
}
export type AttemptPhase = "sending" | "failed" | "unknown" | "malformed";
export type ConfirmedTurn = { question: string; response: QaCompletedTurn };
export type AssistantState = {
  generation: number;
  identity: string;
  draft: string;
  validation: string | null;
  turns: readonly ConfirmedTurn[];
  conversationId: string | null;
  parentTurnId: string | null;
  pending: { attempt: AssistantAttempt; phase: AttemptPhase; message: string } | null;
};

export function initialAssistantState(identity: string, generation = 0): AssistantState {
  return { generation, identity, draft: "", validation: null, turns: [], conversationId: null, parentTurnId: null, pending: null };
}
export function hasUnresolvedAttempt(state: AssistantState): boolean {
  return !!state.pending && state.pending.phase !== "failed";
}

// Keyboard policy is shared by the actual composer and deterministic tests.
export function shouldSendOnEnter(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode?: number }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

/** One local session; no history/identity persistence and no implicit transport. */
export class AssistantController {
  private state: AssistantState;
  private listeners = new Set<() => void>();
  private dispatch = 0;
  private abort: AbortController | null = null;
  constructor(private transport: AssistantTransport | null, identity: string, private makeKey: () => string) {
    this.state = initialAssistantState(identity);
  }
  getSnapshot = (): AssistantState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(state: AssistantState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  setDraft(draft: string) { this.update({ ...this.state, draft, validation: null }); }
  submit(): boolean {
    if (!this.transport || hasUnresolvedAttempt(this.state)) return false;
    const parsed = qaRequestSchema.safeParse(this.state.conversationId
      ? { question: this.state.draft, conversationId: this.state.conversationId, parentTurnId: this.state.parentTurnId }
      : { question: this.state.draft, context: { type: "GENERAL" } });
    if (!parsed.success) {
      this.update({ ...this.state, validation: "Nhập câu hỏi từ 1 đến 2000 ký tự UTF-16 (sau khi bỏ khoảng trắng và chuẩn hóa)." });
      return false;
    }
    const key = this.makeKey();
    const payload = Object.freeze(parsed.data);
    const attempt: AssistantAttempt = Object.freeze({ id: key, key, payload, body: JSON.stringify(payload), generation: this.state.generation, identity: this.state.identity });
    this.update({ ...this.state, draft: "", validation: null, pending: { attempt, phase: "sending", message: "Đang gửi — chưa xác nhận." } });
    void this.send(attempt);
    return true;
  }
  retry(): boolean {
    const pending = this.state.pending;
    if (!pending || !["unknown", "malformed"].includes(pending.phase) || !this.transport) return false;
    this.update({ ...this.state, pending: { ...pending, phase: "sending", message: "Đang xác nhận lại cùng lượt hỏi…" } });
    void this.send(pending.attempt);
    return true;
  }
  editFailed() {
    if (this.state.pending?.phase !== "failed") return;
    this.update({ ...this.state, draft: this.state.pending.attempt.payload.question, pending: null, validation: null });
  }
  newConversation(confirmedAbandon = false): boolean {
    if (hasUnresolvedAttempt(this.state) && !confirmedAbandon) return false;
    this.invalidate();
    this.update(initialAssistantState(this.state.identity, this.state.generation + 1));
    return true;
  }
  changeIdentity(identity: string) {
    if (identity === this.state.identity) return;
    this.invalidate();
    this.update(initialAssistantState(identity, this.state.generation + 1));
  }
  dispose() { this.invalidate(); }
  private invalidate() {
    this.dispatch++;
    this.abort?.abort(); // Client cancellation never implies backend cancellation.
    this.abort = null;
  }
  private async send(attempt: AssistantAttempt) {
    const dispatch = ++this.dispatch;
    this.abort = new AbortController();
    let result: AssistantTransportResult;
    try { result = await this.transport!.send(attempt, this.abort.signal); }
    catch { result = { kind: "networkAmbiguity" }; }
    if (dispatch !== this.dispatch || attempt.generation !== this.state.generation || attempt.identity !== this.state.identity || this.state.pending?.attempt.id !== attempt.id) return;
    this.abort = null;
    if (result.kind === "networkAmbiguity") {
      this.setAttemptPhase("unknown", "Chưa nhận được xác nhận. Lượt hỏi có thể đã được lưu; hãy thử xác nhận lại.");
      return;
    }
    const parsed = qaResponseSchema.safeParse(result.body);
    if (!parsed.success) { this.malformed(); return; }
    const response = parsed.data;
    if (response.operationStatus === "SUCCESS") {
      const turn = response.data;
      if (result.httpStatus !== 200 || (this.state.conversationId && turn.conversationId !== this.state.conversationId) || turn.context.type !== "GENERAL") { this.malformed(); return; }
      const existing = this.state.turns.find((item) => item.response.conversationId === turn.conversationId && item.response.turnId === turn.turnId);
      // A duplicate may acknowledge only the identical submitted question/head.
      if (existing && (existing.question !== attempt.payload.question || this.state.parentTurnId !== turn.turnId)) { this.malformed(); return; }
      this.update({ ...this.state, conversationId: turn.conversationId, parentTurnId: turn.turnId, pending: null,
        turns: existing ? this.state.turns : [...this.state.turns, { question: attempt.payload.question, response: turn }] });
    } else if (response.operationStatus === "UNKNOWN") {
      if (result.httpStatus !== 503) { this.malformed(); return; }
      this.setAttemptPhase("unknown", "Chưa xác định kết quả lưu lượt hỏi. Thử xác nhận lại sẽ giữ nguyên câu hỏi và mã yêu cầu.");
    } else {
      if (result.httpStatus < 400 || result.httpStatus > 599) { this.malformed(); return; }
      this.setAttemptPhase("failed", response.error.message);
    }
  }
  private malformed() {
    this.setAttemptPhase("malformed", "Phản hồi không hợp lệ nên không thể hiển thị. Chưa xác định lượt đã được lưu; hãy thử xác nhận lại.");
  }
  private setAttemptPhase(phase: AttemptPhase, message: string) {
    if (this.state.pending) this.update({ ...this.state, pending: { ...this.state.pending, phase, message } });
  }
}
