import { z } from "zod";
import { createIdempotencyKey } from "../../lib/mutation-client";
import { EMPTY_PLANNING_NEEDS, planningAnalysisSchema, planningGeneratedSchema, planningWorkspaceSchema, type PlanningAnalysis, type PlanningGenerated, type PlanningNeeds, type PlanningRequest, type PlanningWorkspace, type PlanningEdit, type PlanningDialogueContext, type PlanningCheckpoint } from "../../modules/assistant-planning/planning-contract";
import { currentPlanningPreference, explicitlySkipsPreferences, skipPlanningPreference } from "../../modules/assistant-planning/planning-preferences";
import type { QaContext } from "../../modules/ai/qa-contract";
import { asksToDisplayPlanning, choiceIndex, editNeeds, explicitlyDefersPlanningDate, needsRecap, nextNeedsPrompt, normalizePlanningReply, otherDayTimingChanges, planningConfirmationTarget, planningReply, proposalReply, selectionNames, type PlanningPrompt } from "../../modules/assistant-planning/planning-dialogue";

export class PlanningClientError extends Error { constructor(message: string, readonly status: number, readonly code: string) { super(message); } }
export async function planningFetch(body: string, key: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher("/api/ai/planning", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body, signal: AbortSignal.timeout(115_000) });
  const envelope = await response.json() as { success?: boolean; data?: unknown; error?: { code?: string; message?: string } };
  if (!response.ok || envelope.success !== true) throw new PlanningClientError(envelope.error?.message ?? "Không thể hoàn tất yêu cầu. Hãy thử lại.", response.status, envelope.error?.code ?? "PLANNING_UNAVAILABLE");
  return envelope.data;
}
type SaveResult = { status: string; data?: { tripId: string }; error?: { message?: string } };
const saveSchema = z.object({ save: z.discriminatedUnion("status", [z.object({ status: z.literal("SUCCESS"), data: z.object({ tripId: z.string().min(1) }) }), z.object({ status: z.literal("FAILED"), error: z.object({ message: z.string() }) }), z.object({ status: z.literal("UNKNOWN") })]) });
export type PlanningMessage = { id?: string; question: string; reply: string; at?: number; afterQaTurnId?: string | null; proposal?: PlanningGenerated; proposalReadOnly?: boolean };
export type PlanningClientState = {
  active: boolean; workspace: PlanningWorkspace | null; draft: PlanningNeeds; generated: PlanningGenerated | null;
  unresolved: PlanningAnalysis["unresolved"]; busy: boolean; message: string; error: string | null;
  messages: PlanningMessage[]; savedTripId: string | null; uncertain: boolean; changeSummary: string | null;
  editingFrom: PlanningGenerated | null; editInstruction: string | null;
  prompt: PlanningPrompt | null; dateDeferred: boolean; preferencesDone: boolean; interrupted: boolean;
  authIntent?: { text: string; context: QaContext };
};
const initial = (): PlanningClientState => ({ active: false, workspace: null, draft: structuredClone(EMPTY_PLANNING_NEEDS), generated: null, unresolved: [], busy: false, message: "Bạn muốn đi mấy ngày?", error: null, messages: [], savedTripId: null, uncertain: false, changeSummary: null, editingFrom: null, editInstruction: null, prompt: { kind: "NEED", field: "durationDays" }, dateDeferred: false, preferencesDone: false, interrupted: false });
export class PlanningClient {
  private state = initial();
  private listeners = new Set<() => void>();
  private pending: { body: string; key: string; action: PlanningRequest["action"] } | null = null;
  private epoch = 0;
  private qaBoundary: string | null = null;
  private publicTurns: NonNullable<PlanningDialogueContext["publicTurns"]> = [];
  private confirmedEdit: PlanningEdit | undefined;
  private editBase: { needs: PlanningNeeds; proposal: PlanningGenerated; version: number; discardRejected?: boolean } | null = null;
  private stagedProposal: PlanningGenerated | null = null;
  private cancelReviewRequested = false;
  private dialogueDepth = 0;
  private dialogueDirty = false;
  private persistedExchanges = new Set<string>();
  private checkpointPending: { body: string; key: string } | null = null;
  constructor(readonly identity: string, private call: typeof planningFetch = planningFetch) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(update: Partial<PlanningClientState>) { this.state = { ...this.state, ...update }; this.listeners.forEach(l => l()); }
  private say(question: string, reply: string, prompt: PlanningPrompt | null = null, proposal?: PlanningGenerated, proposalReadOnly = false) {
    const last = this.state.messages.at(-1);
    const snapshot = proposal ? { proposal: structuredClone(proposal), ...(proposalReadOnly ? { proposalReadOnly: true } : {}) } : {};
    const messages = last?.reply === "" ? [...this.state.messages.slice(0, -1), { ...last, reply, ...snapshot }] : [...this.state.messages, { id: createIdempotencyKey(), question, reply, at: Date.now(), afterQaTurnId: this.qaBoundary, ...snapshot }];
    this.dialogueDirty = true;
    this.patch({ message: reply, prompt, interrupted: false, messages });
  }
  private queueQuestion(question: string) {
    const last = this.state.messages.at(-1);
    if (last?.reply === "" && last.question === question) return;
    this.patch({ active: true, messages: [...this.state.messages, { id: createIdempotencyKey(), question, reply: "", at: Date.now(), afterQaTurnId: this.qaBoundary }] });
  }
  private async withDialogue<T>(work: () => Promise<T>): Promise<T> {
    this.dialogueDepth++;
    try { return await work(); }
    finally { this.dialogueDepth--; if (!this.dialogueDepth && !this.state.uncertain && !this.state.error) await this.persistDialogue(); }
  }
  private async persistDialogue() {
    const workspace = this.state.workspace;
    if (!workspace || workspace.dialogueRevision === undefined || this.state.busy || (!this.dialogueDirty && !this.checkpointPending)) return;
    const checkpoint: PlanningCheckpoint = { needs: this.state.draft, unresolved: this.state.unresolved, resume: this.state.generated || this.state.editingFrom || ["OPTIONS", "CHANGE", "APPLY_CHANGE", "SAVE", "REGENERATE"].includes(this.state.prompt?.kind ?? "") ? "REGENERATE" : "NEEDS", ...(this.state.prompt?.kind === "DATE_CHANGE" ? { dateConfirmation: this.state.prompt.needs } : {}) };
    const exchanges = this.state.messages.filter(turn => turn.id && turn.reply && !this.persistedExchanges.has(turn.id)).map(turn => ({ id: turn.id!, question: turn.question.slice(0, 1000), reply: turn.reply.slice(0, 4000), at: turn.at ?? Date.now(), afterQaTurnId: turn.afterQaTurnId ?? null })).slice(0, 40);
    this.checkpointPending ??= { body: JSON.stringify({ action: "CHECKPOINT", conversationId: workspace.conversationId, version: workspace.version, revision: workspace.dialogueRevision, checkpoint, exchanges }), key: createIdempotencyKey() };
    const pending = this.checkpointPending;
    await this.task(async () => {
      const result = z.object({ dialogueRevision: z.number().int().nonnegative() }).parse(await this.guardedCall(pending.body, pending.key));
      const request = JSON.parse(pending.body) as Extract<PlanningRequest, { action: "CHECKPOINT" }>;
      request.exchanges.forEach(turn => this.persistedExchanges.add(turn.id));
      this.checkpointPending = null;
      this.dialogueDirty = false;
      this.patch({ workspace: { ...this.state.workspace!, dialogueRevision: result.dialogueRevision, checkpoint: request.checkpoint } });
    });
    if (this.state.error) this.patch({ error: `Tin nhắn chưa được xác nhận lưu. ${this.state.error}` });
  }
  async send(text: string, conversationId: string | null, context: QaContext = { type: "GENERAL" }): Promise<"QA" | "HANDLED"> {
    if (this.state.busy || this.state.uncertain) return "HANDLED";
    if (!this.identity.startsWith("USER:")) {
      if (!isPlanningRequest(text)) return "QA";
      this.patch({ authIntent: { text: text.slice(0, 1000), context } });
      await this.start(conversationId, context);
      return this.publicQuestion(text) !== text ? "QA" : "HANDLED";
    }
    this.queueQuestion(text);
    if (!this.state.workspace) await this.start(conversationId, context);
    if (!this.state.workspace || this.state.uncertain || this.state.error) return "HANDLED";
    return this.analyze(text);
  }
  setPublicDialogue(turns: NonNullable<PlanningDialogueContext["publicTurns"]>) { this.publicTurns = turns.slice(-3).map(t => ({ question: t.question.slice(0, 1000), answer: t.answer.slice(0, 1200) })); }
  publicQuestion(text: string) {
    if (this.identity.startsWith("USER:") || !isPlanningRequest(text)) return text;
    // A mixed message can contain an independent public question. Keep the full
    // original intent for login and submit only that question through public QA.
    return text.split(/[;\n]+|(?<=[.!?])\s+|,\s*/u).find(part => !isPlanningRequest(part) && /có gì|ở đâu|bao nhiêu|giờ mở cửa|giá vé|lịch sử|như thế nào|là gì/iu.test(part))?.trim() || text;
  }
  setQaBoundary(turnId: string | null) { this.qaBoundary = turnId; }
  private advance(question: string, composed?: string) {
    if (this.state.unresolved.length) { this.say(question, `Mình cần làm rõ điểm ${this.state.unresolved[0]!.name}. Bạn chọn một tên bên dưới hoặc bỏ yêu cầu điểm này nhé.`); return; }
    const next = nextNeedsPrompt(this.state.draft, this.state.dateDeferred, this.state.preferencesDone, this.state.workspace?.today);
    this.say(question, composed || next.message, next.prompt);
  }
  invalidate() { this.epoch++; this.pending = null; this.checkpointPending = null; this.persistedExchanges.clear(); this.dialogueDirty = false; this.confirmedEdit = undefined; this.editBase = null; this.stagedProposal = null; this.cancelReviewRequested = false; this.qaBoundary = null; this.publicTurns = []; this.state = initial(); this.listeners.forEach(l => l()); }
  reopenHistory() {
    if (this.state.busy || this.state.uncertain || this.state.workspace?.pendingSaveKey) return;
    this.confirmedEdit = undefined; this.editBase = null; this.stagedProposal = null;
    const expiredProposal = !!(this.state.generated || this.state.editingFrom || this.state.workspace?.checkpoint?.resume === "REGENERATE");
    const next = nextNeedsPrompt(this.state.draft, this.state.dateDeferred, this.state.preferencesDone, this.state.workspace?.today);
    this.patch({ generated: null, editingFrom: null, editInstruction: null, messages: this.state.messages.map(({ proposal: _proposal, ...message }) => message), prompt: this.state.savedTripId || this.state.workspace?.pendingSaveKey ? null : expiredProposal ? { kind: "REGENERATE" } : next.prompt, interrupted: false, message: this.state.savedTripId ? "Chuyến này đã lưu. Bạn có thể mở lại chuyến đi." : expiredProposal ? `${needsRecap(this.state.draft)}\nBạn muốn tạo lại hành trình từ nhu cầu này không?` : next.message });
  }
  editFailedAnalysis() {
    if (this.state.busy || this.pending?.action !== "ANALYZE") return;
    this.pending = null;
    this.patch({ uncertain: false, error: null, message: "Bạn có thể sửa yêu cầu trong ô chat rồi gửi lại." });
  }
  canEditFailedAnalysis() { return this.pending?.action === "ANALYZE" && !this.state.busy; }
  async beginAnotherPlan() { return this.withDialogue(async () => this.beginAnotherPlanTurn()); }
  private beginAnotherPlanTurn() {
    if (this.state.busy || this.state.uncertain || !this.state.savedTripId) return;
    this.confirmedEdit = undefined; this.editBase = null; this.stagedProposal = null;
    this.patch({ savedTripId: null, generated: null, editingFrom: null, editInstruction: null, prompt: { kind: "RECAP" }, interrupted: false });
    this.say("Lập chuyến khác từ nhu cầu này", needsRecap(this.state.draft), { kind: "RECAP" });
  }
  private async guardedCall(body: string, key: string) {
    const epoch = this.epoch;
    const result = await this.call(body, key);
    if (epoch !== this.epoch) throw new Error("Superseded planning session");
    return result;
  }
  private async run(request: PlanningRequest): Promise<unknown> {
    const epoch = this.epoch;
    const pending = this.pending ?? { body: JSON.stringify(request), key: createIdempotencyKey(), action: request.action };
    this.pending = pending;
    const result = await this.guardedCall(pending.body, pending.key);
    if (epoch !== this.epoch) throw new Error("Superseded planning session");
    return result;
  }
  private async task(work: () => Promise<void>) {
    if (this.state.busy) return;
    const epoch = this.epoch;
    this.patch({ busy: true, error: null });
    try { await work(); if (epoch === this.epoch && !this.state.uncertain) this.pending = null; }
    catch (error) {
      if (epoch !== this.epoch) return;
      const uncertain = !(error instanceof PlanningClientError) || error.status >= 500;
      this.patch({ active: true, error: error instanceof Error ? error.message : "Chưa thể hoàn tất yêu cầu.", uncertain });
      if (!uncertain) { this.pending = null; this.cancelReviewRequested = false; this.confirmedEdit = undefined; }
    } finally { if (epoch === this.epoch) this.patch({ busy: false }); }
  }
  async start(conversationId: string | null, context: QaContext = { type: "GENERAL" }) {
    if (!this.identity.startsWith("USER:")) { this.patch({ active: true, error: null, message: "Mình có thể tư vấn thông tin Hà Giang ngay tại đây. Để lên hành trình theo nhu cầu và lưu chuyến đi, bạn đăng nhập nhé.", authIntent: this.state.authIntent ?? { text: "Tôi muốn lập hành trình Hà Giang", context } }); return; }
    await this.task(async () => {
      const workspace = planningWorkspaceSchema.parse(await this.run({ action: "START", conversationId, context }));
      planningClients.set(`${this.identity}:${workspace.conversationId}`, this);
      const next = nextNeedsPrompt(workspace.needs, !!workspace.needs.dateDeferred, !!workspace.needs.preferencesDone, workspace.today);
      this.patch({ workspace, active: true, draft: workspace.needs, dateDeferred: !!workspace.needs.dateDeferred, preferencesDone: !!workspace.needs.preferencesDone, savedTripId: workspace.savedTripId, uncertain: !!workspace.pendingSaveKey, prompt: workspace.pendingSaveKey || workspace.savedTripId ? null : next.prompt, message: workspace.pendingSaveKey ? "Có lần lưu chưa rõ kết quả. Kiểm tra lại trước khi tạo hành trình khác." : workspace.savedTripId ? "Chuyến này đã lưu. Bạn có thể hỏi thêm hoặc mở chuyến đi để chỉnh sửa." : next.message });
    });
  }
  async restore(conversationId: string) {
    if (!this.identity.startsWith("USER:") || this.state.workspace) return;
    const epoch = this.epoch;
    this.patch({ busy: true });
    try {
      const workspace = planningWorkspaceSchema.parse(await this.call(JSON.stringify({ action: "READ", conversationId }), createIdempotencyKey()));
      if (epoch !== this.epoch) return;
      const checkpoint = workspace.checkpoint;
      const draft = checkpoint?.needs ?? workspace.needs;
      const next = nextNeedsPrompt(draft, !!draft.dateDeferred, !!draft.preferencesDone, workspace.today);
      const expiredProposal = checkpoint?.resume === "REGENERATE" || !checkpoint && !!workspace.version;
      const expiredDate = !!workspace.today && (!!draft.requirement.startDate && draft.requirement.startDate < workspace.today || !!draft.departureWindow && draft.departureWindow.to < workspace.today);
      workspace.exchanges?.forEach(turn => this.persistedExchanges.add(turn.id));
      this.patch({ active: true, workspace, draft, messages: workspace.exchanges ?? [], unresolved: checkpoint?.unresolved ?? [], dateDeferred: !!draft.dateDeferred, preferencesDone: !!draft.preferencesDone, savedTripId: workspace.savedTripId, uncertain: !!workspace.pendingSaveKey, prompt: workspace.pendingSaveKey || workspace.savedTripId ? null : expiredDate ? next.prompt : expiredProposal ? { kind: "REGENERATE" } : checkpoint?.dateConfirmation ? { kind: "DATE_CHANGE", needs: checkpoint.dateConfirmation } : next.prompt, message: workspace.pendingSaveKey ? "Lần lưu trước chưa rõ kết quả. Hãy kiểm tra lại." : workspace.savedTripId ? "Chuyến này đã lưu. Mở chuyến đi để xem hoặc chỉnh sửa." : expiredDate ? next.message : expiredProposal ? `${needsRecap(draft)}\nBạn muốn tạo lại hành trình từ nhu cầu này không?` : workspace.exchanges?.at(-1)?.reply ?? next.message });
    } catch (error) { if (!(error instanceof PlanningClientError && error.status === 404) && epoch === this.epoch) this.patch({ error: error instanceof Error ? error.message : "Không đọc được nhu cầu." }); }
    finally { if (epoch === this.epoch) this.patch({ busy: false }); }
  }
  updateDraft(draft: PlanningNeeds) {
    if (this.state.busy || this.state.uncertain || this.state.workspace?.pendingSaveKey) return;
    this.patch({ draft, editingFrom: this.state.generated ?? this.state.editingFrom, generated: null, savedTripId: null, error: null, prompt: null });
  }
  async resolve(index: number, id: string | null) { return this.withDialogue(async () => this.resolveTurn(index, id)); }
  private resolveTurn(index: number, id: string | null) {
    const item = this.state.unresolved[index]; if (!item || this.state.busy || this.state.uncertain) return;
    if (id && !item.choices.some(c => c.id === id)) return;
    const draft = structuredClone(this.state.draft);
    if (id) {
      if (item.remove) {
        draft.requiredDestinationIds = draft.requiredDestinationIds.filter(value => value !== id);
        draft.preferredDestinationIds = draft.preferredDestinationIds.filter(value => value !== id);
        draft.excludedDestinationIds = [...new Set([...(draft.excludedDestinationIds ?? []), id])];
      } else {
        const target = item.required ? draft.requiredDestinationIds : draft.preferredDestinationIds;
        if (!target.includes(id)) target.push(id);
        if (draft.excludedDestinationIds) draft.excludedDestinationIds = draft.excludedDestinationIds.filter(value => value !== id);
      }
      draft.destinationNames[id] = item.choices.find(c => c.id === id)!.name;
    }
    this.patch({ draft, generated: null, editingFrom: this.state.generated ?? this.state.editingFrom, unresolved: this.state.unresolved.filter((_, i) => i !== index) });
    this.advance(id ? `Chọn ${draft.destinationNames[id]}` : "Bỏ yêu cầu điểm này");
  }
  async analyze(text: string, interpretedReply?: "CONFIRM" | "CANCEL" | "CREATE" | "SAVE"): Promise<"QA" | "HANDLED"> { return this.withDialogue(() => this.analyzeTurn(text, interpretedReply)); }
  private showItinerary(text: string) {
    const current = this.state.generated;
    if (current) {
      this.say(text, this.state.savedTripId ? "Đây là lịch trình chuyến đi đã lưu của bạn nhé. Bạn có thể mở chuyến đi để xem chi tiết." : "Đây là lịch trình hiện tại của bạn nhé. Bản này chưa lưu; bạn có thể xem lại hoặc nhắn mình phần muốn chỉnh.", this.state.prompt, current, true);
    } else if (this.state.savedTripId) {
      this.say(text, "Chuyến này đã được lưu rồi nhé. Bạn bấm Mở chuyến đi bên dưới để xem đầy đủ lịch trình.", this.state.prompt);
    } else if (this.state.editingFrom) {
      this.say(text, "Đây là phương án trước để bạn đối chiếu. Thay đổi đang chờ chưa được áp dụng; mình vẫn cần kiểm tra lại trước khi lưu nhé.", this.state.prompt, this.state.editingFrom, true);
    } else {
      this.advance(text);
    }
  }
  private async analyzeTurn(text: string, interpretedReply?: "CONFIRM" | "CANCEL" | "CREATE" | "SAVE"): Promise<"QA" | "HANDLED"> {
    if (!this.state.workspace || this.state.busy || this.state.uncertain) return "HANDLED";
    this.queueQuestion(text);
    const prompt = this.state.prompt;
    const target = interpretedReply === "CREATE" || interpretedReply === "SAVE" ? interpretedReply : planningConfirmationTarget(text);
    const reply = target ? "CONFIRM" : interpretedReply ?? planningReply(text);
    if (asksToDisplayPlanning(text)) { this.showItinerary(text); return "HANDLED"; }
    if (target === "CREATE" && (this.state.generated || this.state.savedTripId)) { this.showItinerary(text); return "HANDLED"; }
    if (target === "SAVE" && prompt?.kind !== "SAVE") {
      this.say(text, this.state.savedTripId ? "Chuyến này đã lưu rồi nhé. Bạn có thể mở chuyến đi bên dưới." : "Mình cần hoàn thành và kiểm tra lịch trình trước khi lưu. Bạn xem câu hỏi đang chờ bên trên nhé.", prompt);
      return "HANDLED";
    }
    if (!this.state.savedTripId) {
      if (reply === "CANCEL") {
        if (prompt?.kind === "NEED" && prompt.field === "preferences" && /^(khong|khong nhe)$/.test(normalizePlanningReply(text))) {
          const field = currentPlanningPreference(this.state.draft);
          if (field === "mobility" || field === "destinations") { this.patch({ draft: skipPlanningPreference(this.state.draft, field) }); this.advance(text); }
          else this.say(text, "Bạn muốn bỏ qua câu này phải không? Bạn có thể chọn Bỏ qua câu này hoặc nhắn rõ ý mình nhé.", prompt);
          return "HANDLED";
        }
        if (prompt?.kind === "DATE_CHANGE") { this.advance(text, `Mình giữ thông tin ngày khởi hành trước đó nhé.\n${nextNeedsPrompt(this.state.draft, this.state.dateDeferred, this.state.preferencesDone, this.state.workspace.today).message}`); return "HANDLED"; }
        this.confirmedEdit = undefined;
        this.stagedProposal = null;
        if (this.editBase) await this.cancelEdit(text);
        else this.say(text, this.state.generated || this.state.editingFrom ? "Mình giữ nguyên hành trình và hủy đề nghị đang chờ. Bạn muốn điều chỉnh gì tiếp?" : "Mình dừng tạo hành trình ở đây. Bạn có thể nhắn nhu cầu mới khi muốn tiếp tục.");
        return "HANDLED";
      }
      if (reply === "SKIP" && prompt?.kind === "NEED" && ["startDate", "preferences"].includes(prompt.field)) {
        if (prompt.field === "startDate" && this.state.draft.requirement.startDate) {
          const needs = { ...this.state.draft, requirement: { ...this.state.draft.requirement, startDate: null }, dateDeferred: true };
          this.say(text, "Bạn muốn bỏ ngày đã chốt và xem bản sơ bộ trước đúng không?", { kind: "DATE_CHANGE", needs }); return "HANDLED";
        }
        if (prompt.field === "startDate" && this.state.draft.departureWindow && this.state.workspace.today && this.state.draft.departureWindow.to < this.state.workspace.today) this.patch({ draft: { ...this.state.draft, departureWindow: undefined } });
        if (prompt.field === "startDate") this.patch({ dateDeferred: true, draft: { ...this.state.draft, dateDeferred: true } });
        else if (explicitlySkipsPreferences(text)) this.patch({ preferencesDone: true, draft: { ...this.state.draft, preferencesDone: true } });
        else { const field = currentPlanningPreference(this.state.draft); if (field) this.patch({ draft: skipPlanningPreference(this.state.draft, field) }); }
        this.advance(text); return "HANDLED";
      }
      const unresolved = this.state.unresolved[0];
      if (unresolved) {
        const index = choiceIndex(text, unresolved.choices);
        if (index >= 0 && unresolved.choices[index]) { await this.resolve(0, unresolved.choices[index]!.id); return "HANDLED"; }
      }
      if (prompt?.kind === "OPTIONS") {
        const index = choiceIndex(text, prompt.choices);
        if (index >= 0 || (reply === "CONFIRM" && prompt.choices.length === 1 && !this.state.interrupted)) { await this.chooseOption(index >= 0 ? index : 0); return "HANDLED"; }
      }
      if (reply === "CONFIRM") {
        if (this.state.draft.requirement.startDate && this.state.workspace.today && this.state.draft.requirement.startDate < this.state.workspace.today && prompt?.kind !== "DATE_CHANGE") { this.advance(text); return "HANDLED"; }
        if ((this.state.interrupted && !(target === "CREATE" && (prompt?.kind === "RECAP" || prompt?.kind === "REGENERATE") || target === "SAVE" && prompt?.kind === "SAVE")) || !prompt || prompt.kind === "NEED" || prompt.kind === "OPTIONS") {
          this.say(text, prompt?.kind === "OPTIONS" ? "Bạn muốn chọn phương án số mấy?" : prompt && this.state.interrupted ? `Bạn muốn xác nhận thao tác trước đó đúng không?\n${this.state.message}` : "Bạn muốn mình tạo hành trình, chỉnh điểm nào hay lưu chuyến đi?", prompt); return "HANDLED";
        }
        if ((prompt.kind === "SAVE" || prompt.kind === "CHANGE" || prompt.kind === "APPLY_CHANGE") && prompt.version !== this.state.workspace.version) { this.say(text, "Hành trình đã đổi. Mình cần kiểm tra và gợi ý lại trước khi áp dụng lựa chọn cũ."); return "HANDLED"; }
        if (prompt.kind === "DATE_CHANGE") {
          this.patch({ draft: prompt.needs, generated: null, editingFrom: this.state.generated ?? this.state.editingFrom, dateDeferred: !!prompt.needs.dateDeferred });
          this.advance(text); return "HANDLED";
        }
        if (this.state.draft.requirement.startDate && this.state.workspace.today && this.state.draft.requirement.startDate < this.state.workspace.today) { this.advance(text); return "HANDLED"; }
        if ((prompt.kind === "RECAP" || prompt.kind === "REGENERATE") && !this.state.draft.requirement.startDate && !this.state.dateDeferred) { this.advance(text); return "HANDLED"; }
        if (prompt.kind === "SAVE") await this.save(text);
        else if (prompt.kind === "CHANGE") await this.applyEdit(prompt.edit, text);
        else if (prompt.kind === "APPLY_CHANGE") { if (this.stagedProposal) this.acceptProposal(this.stagedProposal, text, true); }
        else await this.generate(undefined, text);
        return "HANDLED";
      }
    }
    let qa = false;
    let semanticReply: "CONFIRM" | "CANCEL" | "CREATE" | "SAVE" | undefined;
    await this.task(async () => {
      const w = this.state.workspace!;
      const rejectedReview = this.editBase?.discardRejected;
      const inputDraft = rejectedReview ? this.editBase!.needs : this.state.draft;
      const analysis = planningAnalysisSchema.parse(await this.run({ action: "ANALYZE", conversationId: w.conversationId, version: w.version, text, draft: inputDraft, unresolved: this.state.unresolved, dialogue: { question: this.state.message.slice(0, 4000), field: prompt?.kind === "NEED" ? prompt.field : null, ...(prompt?.kind === "NEED" && prompt.field === "preferences" ? { preferenceField: currentPlanningPreference(inputDraft) } : {}), recent: this.state.messages.filter(m => m.reply).slice(-8).map(({ question, reply }) => ({ question: question.slice(0, 1000), reply: reply.slice(0, 4000) })), publicTurns: this.publicTurns, current: (this.state.generated ?? this.state.editingFrom)?.selection ?? null } }));
      if (analysis.intent === "DISPLAY") { this.showItinerary(text); return; }
      if (analysis.intent === "QA") { qa = true; this.patch({ interrupted: true, messages: this.state.messages.slice(0, -1) }); return; }
      if (this.state.savedTripId) {
        this.patch({ error: "Chuyến này đã lưu. Mở chuyến đi để chỉnh sửa, hoặc chọn Lập chuyến khác." });
        return;
      }
      if (analysis.replyAction && analysis.replyAction !== "NONE" && !analysis.dateConfirmation && !analysis.operation && !analysis.unresolved.length && !analysis.dateDeferred && !analysis.preferencesSkipped && JSON.stringify(analysis.needs) === JSON.stringify(inputDraft)) { semanticReply = analysis.replyAction; return; }
      if (analysis.intent === "CLARIFY") {
        if (JSON.stringify(analysis.needs) !== JSON.stringify(this.state.draft)) {
          if (this.state.generated) this.editBase ??= { needs: structuredClone(this.state.draft), proposal: this.state.generated, version: w.version };
          this.patch({ draft: analysis.needs, generated: null, editingFrom: this.state.generated ?? this.state.editingFrom });
        }
        this.say(text, analysis.followUpMessage || analysis.message, analysis.dateConfirmation ? { kind: "DATE_CHANGE", needs: analysis.dateConfirmation } : prompt); return;
      }
      if (rejectedReview) { this.patch({ draft: inputDraft }); this.editBase = { ...this.editBase!, discardRejected: false }; this.confirmedEdit = undefined; this.stagedProposal = null; }
      if (analysis.operation && (this.state.generated ?? this.state.editingFrom)) { this.offerOperation(text, analysis); return; }
      if (this.state.generated && JSON.stringify(analysis.needs) !== JSON.stringify(this.state.draft)) this.editBase ??= { needs: structuredClone(this.state.draft), proposal: this.state.generated, version: w.version };
      this.patch({ draft: analysis.needs, unresolved: analysis.unresolved, editingFrom: this.state.generated ?? this.state.editingFrom, editInstruction: analysis.intent === "EDIT" ? text : this.state.editInstruction, generated: null, dateDeferred: analysis.needs.dateDeferred ?? (this.state.dateDeferred || !!analysis.dateDeferred && explicitlyDefersPlanningDate(text, prompt?.kind === "NEED" && prompt.field === "startDate")), preferencesDone: analysis.needs.preferencesDone ?? (this.state.preferencesDone || !!analysis.preferencesSkipped) });
      this.advance(text, analysis.followUpMessage);
    });
    if (semanticReply && !this.state.uncertain) return this.analyze(text, semanticReply);
    return qa ? "QA" : "HANDLED";
  }
  private async cancelEdit(question: string) {
    const base = this.editBase, workspace = this.state.workspace;
    if (!base || !workspace) return;
    if (base.version === workspace.version) {
      this.patch({ draft: base.needs, generated: base.proposal, editingFrom: null, editInstruction: null });
      this.editBase = null;
      this.say(question, "Mình đã hủy thay đổi và giữ nguyên hành trình trước đó. Bạn muốn chỉnh gì tiếp?"); return;
    }
    this.cancelReviewRequested = true;
    await this.task(async () => {
      const restored = planningWorkspaceSchema.parse(await this.run({ action: "REVIEW", conversationId: workspace.conversationId, version: workspace.version, needs: base.needs }));
      this.patch({ workspace: restored, draft: restored.needs, generated: null, editingFrom: base.proposal, editInstruction: null });
      this.editBase = null; this.cancelReviewRequested = false;
      this.say(question, `Mình đã hủy thay đổi và khôi phục nhu cầu trước đó. Phương án trước được giữ để đối chiếu; cần tạo và kiểm tra lại trước khi lưu.\n${needsRecap(restored.needs)}`, { kind: "RECAP" });
    });
  }
  private offerOperation(text: string, analysis: PlanningAnalysis) {
    const current = this.state.generated ?? this.state.editingFrom;
    const operation = analysis.operation!;
    if (!current || !operation.day || !current.selection.days[operation.day - 1]) { this.say(text, "Bạn muốn điều chỉnh ngày mấy trong hành trình? Mình sẽ giữ các ngày còn lại."); return; }
    const names = selectionNames(current);
    const targets = current.selection.days[operation.day - 1]!.filter(id => operation.targetName && normalizePlanningReply(names[id] ?? "") === normalizePlanningReply(operation.targetName));
    const targetId = targets.length === 1 ? targets[0]! : null;
    if (["REMOVE", "REPLACE"].includes(operation.kind) && !targetId) { this.say(text, `Bạn muốn ${operation.kind === "REMOVE" ? "bỏ" : "thay"} điểm nào ở ngày ${operation.day}? ${current.selection.days[operation.day - 1]!.map(id => names[id]).join(", ")}.`); return; }
    const version = this.state.workspace!.version;
    if (operation.kind === "REMOVE" || operation.kind === "REPLAN_DAY") {
      const edit: PlanningEdit = { kind: operation.kind, day: operation.day, targetId, destinationId: null };
      this.say(text, operation.kind === "REMOVE" ? `Mình sẽ bỏ ${names[targetId!]} khỏi ngày ${operation.day}, giữ các điểm khác và kiểm tra lại. Bạn đồng ý không?` : `Mình sẽ đề xuất lại ngày ${operation.day}, giữ các ngày khác và các điểm bắt buộc. Bạn đồng ý không?`, { kind: "CHANGE", edit, version }); return;
    }
    let choices = analysis.options ?? [];
    if (operation.destinationName) {
      const exact = choices.filter(c => normalizePlanningReply(c.name) === normalizePlanningReply(operation.destinationName!));
      if (exact.length) choices = exact;
    }
    if (!choices.length) { this.say(text, "Mình chưa tìm được điểm mới có đủ dữ liệu để gợi ý trong yêu cầu này. Bạn có thể đổi ngày, sở thích hoặc thử phương án khác; mình giữ nguyên hành trình."); return; }
    this.say(text, `${operation.kind === "REPLACE" ? `Để thay ${names[targetId!]}` : "Để thêm một điểm"} vào ngày ${operation.day}, bạn có thể chọn:\n${choices.map((c, i) => `${i + 1}. ${c.name} — ${c.reason}`).join("\n")}\n${analysis.mandatoryAddition ? "Điểm bạn chọn sẽ là điểm bắt buộc. " : ""}Bạn chọn phương án nào? Mình sẽ kiểm tra lại lịch trước khi áp dụng.`, { kind: "OPTIONS", operation: { ...operation, targetName: targetId ? names[targetId]! : null }, choices, version, required: !!analysis.mandatoryAddition });
  }
  async chooseOption(index: number) { return this.withDialogue(() => this.chooseOptionTurn(index)); }
  private async chooseOptionTurn(index: number) {
    const prompt = this.state.prompt;
    if (this.state.busy || this.state.uncertain || prompt?.kind !== "OPTIONS" || !prompt.choices[index]) return;
    if (prompt.version !== this.state.workspace?.version) { this.say("", "Lựa chọn này thuộc phương án cũ. Hãy yêu cầu gợi ý lại."); return; }
    const current = this.state.generated ?? this.state.editingFrom;
    if (!current) return;
    const names = selectionNames(current), choice = prompt.choices[index]!;
    const targetId = Object.keys(names).find(id => names[id] === prompt.operation.targetName) ?? null;
    this.patch({ draft: { ...this.state.draft, destinationNames: { ...this.state.draft.destinationNames, [choice.id]: choice.name } } });
    await this.applyEdit({ kind: prompt.operation.kind, day: prompt.operation.day!, targetId, destinationId: choice.id, required: prompt.required }, `Chọn ${index + 1}: ${choice.name}`);
  }
  private async applyEdit(edit: PlanningEdit, question: string) {
    const current = this.state.generated ?? this.state.editingFrom;
    if (!current) return;
    const names = { ...this.state.draft.destinationNames, ...selectionNames(current) };
    this.editBase ??= { needs: structuredClone(this.state.draft), proposal: current, version: this.state.workspace!.version };
    this.confirmedEdit = edit;
    this.patch({ draft: editNeeds(this.state.draft, edit, names), editingFrom: current, generated: null, prompt: null, editInstruction: `${edit.kind} ngày ${edit.day}; chỉ thay phần được yêu cầu, giữ các ngày còn lại.` });
    await this.generate(edit, question);
  }
  private acceptProposal(generated: PlanningGenerated, question: string, changed: boolean) {
    this.patch({ generated, editingFrom: null, editInstruction: null, changeSummary: changed ? "Đã cập nhật phần được yêu cầu và kiểm tra lại. Xem các ngày bên dưới." : null });
    this.editBase = null; this.stagedProposal = null;
    const message = generated.reply || proposalReply(generated);
    this.say(question, message, generated.proposal.eligibleForFinalConfirmation ? { kind: "SAVE", version: this.state.workspace!.version } : null, generated);
  }
  async generate(edit?: PlanningEdit, question = "Tạo hành trình theo nhu cầu đã xác nhận") { return this.withDialogue(() => this.generateTurn(edit, question)); }
  private async generateTurn(edit?: PlanningEdit, question = "Tạo hành trình theo nhu cầu đã xác nhận") {
    if (!this.state.workspace || this.state.unresolved.length || this.state.uncertain) return;
    edit ??= this.confirmedEdit;
    await this.task(async () => {
      let w = this.state.workspace!;
      const prior = this.state.generated ?? this.state.editingFrom;
      const instruction = this.state.editInstruction ?? "Tạo hành trình theo nhu cầu đã xác nhận; giữ thứ tự trước nếu có thể.";
      w = planningWorkspaceSchema.parse(await this.run({ action: "REVIEW", conversationId: w.conversationId, version: w.version, needs: { ...this.state.draft, preferencesDone: true } }));
      this.pending = null;
      this.patch({ workspace: w, generated: null, draft: w.needs, preferencesDone: !!w.needs.preferencesDone, savedTripId: null });
      if (this.editBase) this.editBase = { ...this.editBase, discardRejected: true };
      const generated = planningGeneratedSchema.parse(await this.run({ action: "GENERATE", conversationId: w.conversationId, version: w.version, previous: prior?.selection ?? null, instruction, ...(edit ? { edit } : {}) }));
      const version = generated.version ?? w.version;
      this.confirmedEdit = undefined;
      this.patch({ workspace: { ...w, version } });
      if (edit && (generated.proposal.status === "NO_FEASIBLE_ITINERARY" || generated.proposal.requirement.startDate && !generated.proposal.eligibleForFinalConfirmation)) {
        this.say(question, `Phương án này chưa đủ điều kiện áp dụng. ${generated.proposal.checks.filter(c => c.status !== "PASS").flatMap(c => c.issues.map(i => i.message)).slice(0, 3).join(" ")} Mình giữ phương án trước để đối chiếu; bạn muốn thử điểm khác hoặc điều chỉnh nhu cầu không?`); return;
      }
      const timingChanges = edit && prior ? otherDayTimingChanges(prior, generated, edit.day) : [];
      if (timingChanges.length) {
        this.stagedProposal = generated;
        this.say(question, `Việc đổi ngày ${edit!.day} còn làm thay đổi giờ đến ở ngày khác do chặng chuyển ngày:\n${timingChanges.join("\n")}\nMình chưa áp dụng. Bạn có đồng ý với cả thay đổi giờ này không?`, { kind: "APPLY_CHANGE", version }); return;
      }
      this.acceptProposal(generated, question, !!prior);
    });
  }
  async save(question = "Xác nhận lưu chuyến đi") { return this.withDialogue(() => this.saveTurn(question)); }
  private async saveTurn(question = "Xác nhận lưu chuyến đi") {
    if (!this.state.workspace || !this.state.generated || this.state.savedTripId || (this.state.uncertain && this.pending?.action !== "SAVE")) return;
    if (!this.state.generated.proposal.eligibleForFinalConfirmation) {
      this.say(question, !this.state.generated.proposal.requirement.startDate ? "Bạn cho mình ngày khởi hành trước nhé. Mình cần ngày cụ thể để kiểm tra giờ mở cửa rồi mới lưu được chuyến đi." : "Lịch trình còn mục chưa đáp ứng hoặc thiếu dữ liệu kiểm tra nên chưa thể lưu. Bạn xem chi tiết bên dưới để điều chỉnh nhé.", !this.state.generated.proposal.requirement.startDate ? { kind: "NEED", field: "startDate" } : null);
      return;
    }
    await this.task(async () => {
      const w = this.state.workspace!;
      const { save } = saveSchema.parse(await this.run({ action: "SAVE", conversationId: w.conversationId, version: w.version, confirm: true, proposal: this.state.generated!.proposal }));
      const result: SaveResult = save;
      if (result.status === "SUCCESS") { this.patch({ savedTripId: result.data!.tripId, uncertain: false, prompt: null }); this.say(question, "Đã lưu chuyến đi thành công. Bạn có thể mở chuyến đi bên dưới."); }
      else if (result.status === "UNKNOWN") this.patch({ uncertain: true, error: "Chưa rõ kết quả lưu. Kiểm tra lại cùng thao tác." });
      else this.patch({ uncertain: false, error: result.error?.message ?? "Chưa lưu được chuyến đi." });
    });
  }
  async reconcile() { return this.withDialogue(() => this.reconcileTurn()); }
  private async reconcileTurn() {
    if (this.checkpointPending) { this.patch({ uncertain: false, error: null }); await this.persistDialogue(); return; }
    if (this.pending?.action === "SAVE" && this.state.generated) { await this.save(); return; }
    if (this.pending) {
      const request = JSON.parse(this.pending.body) as PlanningRequest;
      this.patch({ uncertain: false });
      if (request.action === "START") { await this.start(request.conversationId, request.context); return; }
      if (request.action === "ANALYZE") { await this.analyze(request.text); return; }
      if (request.action === "REVIEW") { if (this.cancelReviewRequested) await this.cancelEdit("Không đổi nữa"); else await this.generate(); return; }
      if (request.action === "GENERATE") {
        await this.task(async () => {
          const workspace = planningWorkspaceSchema.parse(await this.guardedCall(JSON.stringify({ action: "READ", conversationId: request.conversationId }), createIdempotencyKey()));
          this.pending = null;
          this.confirmedEdit = undefined;
          this.patch({ workspace, generated: null, uncertain: false, prompt: { kind: "REGENERATE" }, message: "Đã kiểm tra trạng thái. Lựa chọn trước đã hết hiệu lực. Bạn muốn tạo lại hành trình từ nhu cầu này không?" });
        });
        return;
      }
    }
    if (!this.state.workspace) return;
    await this.task(async () => {
      const result = z.object({ workspace: planningWorkspaceSchema, message: z.string().optional() }).parse(await this.guardedCall(JSON.stringify({ action: "RECONCILE", conversationId: this.state.workspace!.conversationId }), createIdempotencyKey()));
      const workspace = result.workspace;
      this.patch({ workspace, draft: workspace.needs, dateDeferred: !!workspace.needs.dateDeferred, preferencesDone: !!workspace.needs.preferencesDone, savedTripId: workspace.savedTripId, uncertain: !!workspace.pendingSaveKey, prompt: workspace.savedTripId || workspace.pendingSaveKey ? null : { kind: "REGENERATE" }, message: result.message ?? (workspace.savedTripId ? "Đã lưu chuyến đi thành công." : workspace.pendingSaveKey ? "Đang đối soát lần lưu trước." : "Đã kiểm tra trạng thái. Bạn muốn tạo lại từ nhu cầu này không?"), error: workspace.pendingSaveKey ? "Kết quả vẫn chưa rõ. Chưa thể tạo lần lưu mới; hãy kiểm tra lại." : null });
    });
  }
}
const planningClients = new Map<string, PlanningClient>();
export function getPlanningClient(identity: string, conversationId: string | null, instance: string) {
  // Guest QA can acquire a conversation ID after the invitation. Keep that
  // in-memory invitation in the same chat; a new chat still changes instance.
  const key = `${identity}:${identity.startsWith("USER:") ? conversationId ?? instance : instance}`;
  let client = planningClients.get(key);
  if (!client) { client = new PlanningClient(identity); planningClients.set(key, client); }
  return client;
}
export function confirmPlanningPrincipal(identity: string) {
  if (!/^(USER|GUEST):/.test(identity)) return;
  for (const [key, client] of planningClients) if (client.identity !== identity) { client.invalidate(); planningClients.delete(key); }
}
export function reopenPlanningHistory(identity: string, conversationId: string) {
  planningClients.get(`${identity}:${conversationId}`)?.reopenHistory();
}
export const isPlanningRequest = (text: string) => /(?:lập|lên|tạo|lên kế hoạch|sắp xếp).{0,30}(?:hành trình|hành trinh|hành hình di chuyển|hình trình|lịch trình|chuyến đi|kế hoạch)|(?:muốn|dự định|định|giúp).{0,30}(?:đi|du lịch).{0,40}\d+\s*ngày/iu.test(text);
