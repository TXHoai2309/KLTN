"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@KLTN/ui/components/button";
import { createIdempotencyKey } from "@/lib/mutation-client";
import {
  applyAiTripEdit,
  parseTripEditApplyValidation,
  previewTripEdit,
  requestAiTripEdit,
} from "@/lib/trip-edit-client";
import type { EditCandidate } from "@/modules/trip-edit/edit-candidate";
import { diffEditCandidate } from "@/modules/trip-edit/edit-candidate";
import {
  beginAiEditApply,
  beginAiEditRecheck,
  beginAiEditRequest,
  canConfirmAiEdit,
  cancelAiEditProposal,
  createAiEditRequestInput,
  createAiEditSession,
  finishAiEditApply,
  finishAiEditRecheck,
  finishAiEditRequest,
  refreshAiEditBase,
  retryUnknownAiEditApply,
  setAiEditMessage,
  type AiEditSession,
} from "@/modules/trip-edit/ai-edit-session";
import { MAX_EDIT_INTENT_MESSAGE_LENGTH } from "@/modules/trip-edit/edit-intent-prompt";
import { TripValidationPanel } from "@/modules/trip-validation/trip-validation-panel";
import styles from "./ai-edit-panel.module.css";

type Props = {
  tripId: string;
  baseRevision: string;
  baselineCandidate: EditCandidate;
  destinationLabels: Record<string, string>;
  onApplied: (baseRevision: string, candidate: EditCandidate) => void;
};

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function describeVisit(
  visit: { destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number },
  dayIndex: number,
  destinationLabels: Record<string, string>,
): string {
  return `${destinationLabels[visit.destinationId] ?? `Điểm đến (${visit.destinationId})`} · Ngày ${dayIndex} · vị trí ${visit.order} · ${minuteLabel(visit.startMinute)} · ${visit.plannedDurationMinutes} phút`;
}

export default function AiEditPanel({
  tripId,
  baseRevision,
  baselineCandidate,
  destinationLabels,
  onApplied,
}: Props) {
  const router = useRouter();
  const [session, setSession] = useState<AiEditSession>(() => createAiEditSession(baseRevision, baselineCandidate));
  const sessionRef = useRef(session);
  const [announcement, setAnnouncement] = useState("");

  function commit(next: AiEditSession) {
    sessionRef.current = next;
    setSession(next);
  }

  useEffect(() => {
    if (baseRevision === sessionRef.current.baseRevision) return;
    commit(refreshAiEditBase(sessionRef.current, baseRevision, baselineCandidate));
  }, [baseRevision, baselineCandidate]);

  async function submitRequest(resolution?: { selectedVisitId?: string; selectedDestinationId?: string }) {
    const current = sessionRef.current;
    const sending = beginAiEditRequest(current);
    if (sending === current) return;
    commit(sending);
    setAnnouncement("Đang tạo đề xuất bằng AI.");
    const outcome = await requestAiTripEdit(
      tripId,
      createAiEditRequestInput(sending, resolution),
    );
    const finished = finishAiEditRequest(sessionRef.current, outcome);
    commit(finished);
    setAnnouncement(finished.status === "PROPOSED"
      ? "Đã nhận đề xuất. Hành trình chưa được thay đổi."
      : finished.status === "NEEDS_CLARIFICATION"
        ? "Cần thêm thông tin để tạo đề xuất."
        : finished.error?.message ?? "Chưa thể tạo đề xuất.");
  }

  async function handleApply() {
    const current = sessionRef.current;
    const sending = current.status === "UNKNOWN"
      ? retryUnknownAiEditApply(current)
      : beginAiEditApply(current, createIdempotencyKey());
    if (sending.status !== "APPLYING" || !sending.pendingApply) return;
    commit(sending);
    setAnnouncement("Đang xác nhận và cập nhật hành trình.");
    const pending = sending.pendingApply;
    const outcome = await applyAiTripEdit(tripId, pending.payload, pending.idempotencyKey);
    const rejectedValidation = outcome.status === "FAILED" && outcome.error.code === "TRIP_VALIDATION_FAILED"
      ? parseTripEditApplyValidation(outcome.error.details)
      : null;
    const finished = finishAiEditApply(sending, outcome, rejectedValidation);
    commit(finished);

    if (outcome.status === "SUCCESS") {
      onApplied(finished.baseRevision, finished.baselineCandidate);
      setAnnouncement("Đã áp dụng đề xuất vào hành trình.");
      return;
    }
    if (outcome.status === "UNKNOWN") {
      setAnnouncement("Chưa xác định được kết quả cập nhật. Hãy thử lại cùng yêu cầu; mã xác nhận được giữ nguyên.");
      return;
    }

    setAnnouncement(outcome.error.message);
    if (outcome.error.code === "TRIP_REVISION_CONFLICT") router.refresh();
  }

  async function handleRecheck() {
    const checking = beginAiEditRecheck(sessionRef.current);
    if (checking === sessionRef.current || checking.result?.status !== "PROPOSED") return;
    commit(checking);
    setAnnouncement("Đang kiểm tra lại đề xuất hiện tại.");
    const outcome = await previewTripEdit(tripId, {
      baseRevision: checking.baseRevision,
      candidate: checking.result.candidate,
    });
    const finished = finishAiEditRecheck(sessionRef.current, outcome);
    commit(finished);
    setAnnouncement(finished.status === "PROPOSED"
      ? "Đã kiểm tra lại đề xuất."
      : finished.error?.message ?? "Chưa thể kiểm tra lại đề xuất.");
    if (outcome.kind === "FAILED" && outcome.code === "TRIP_REVISION_CONFLICT") router.refresh();
  }

  function handleCancel() {
    const cancelled = cancelAiEditProposal(sessionRef.current);
    commit(cancelled);
    setAnnouncement("Đã bỏ đề xuất. Hành trình đã lưu không thay đổi.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitRequest();
  }

  const proposal = session.result?.status === "PROPOSED" ? session.result : null;
  const clarification = session.result?.status === "NEEDS_CLARIFICATION" ? session.result : null;
  const diff = proposal ? diffEditCandidate(session.baselineCandidate, proposal.candidate) : null;
  const pending = session.status === "SENDING" || session.status === "CHECKING" || session.status === "APPLYING" || session.status === "UNKNOWN";
  const canConfirm = canConfirmAiEdit(session);

  return (
    <section className={styles.panel} aria-labelledby="ai-edit-heading">
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Đề xuất bằng hội thoại</p>
          <h2 id="ai-edit-heading">Chỉnh sửa với AI</h2>
          <p className={styles.description}>AI chỉ tạo phương án để bạn xem và quyết định.</p>
        </div>
        {proposal && <span className={styles.badge}>Đề xuất chưa áp dụng</span>}
      </header>

      <form className={styles.form} onSubmit={handleSubmit} noValidate aria-busy={pending}>
        <label className={styles.label} htmlFor="ai-edit-message">Bạn muốn thay đổi điều gì?</label>
        <textarea
          id="ai-edit-message"
          className={`${styles.message} resize-none`}
          value={session.message}
          onChange={(event) => commit(setAiEditMessage(sessionRef.current, event.target.value))}
          maxLength={MAX_EDIT_INTENT_MESSAGE_LENGTH}
          rows={3}
          aria-required="true"
          disabled={pending}
          aria-describedby="ai-edit-message-help"
        />
        <div className={styles.formFooter}>
          <p id="ai-edit-message-help" className={styles.hint}>
            Tối đa {MAX_EDIT_INTENT_MESSAGE_LENGTH} ký tự. Yêu cầu được gửi riêng cho hành trình này.
          </p>
          <Button type="submit" disabled={pending || !session.message.trim()}>
            {session.status === "SENDING" ? "Đang gửi…" : "Gửi yêu cầu"}
          </Button>
        </div>
      </form>

      <p className={styles.liveStatus} aria-live="polite" aria-atomic="true" role="status">
        {announcement}
      </p>

      {session.error && (
        <div className={styles.error} role="alert">
          <p>{session.error.message}</p>
          {session.error.code === "TRIP_REVISION_CONFLICT" && (
            <p>Đang tải lại phiên bản hành trình mới nhất. Đề xuất được giữ để bạn kiểm tra lại.</p>
          )}
        </div>
      )}

      {clarification && (
        <section className={styles.result} aria-labelledby="ai-edit-clarification-heading">
          <h3 id="ai-edit-clarification-heading">Cần làm rõ</h3>
          <p>{clarification.clarification.prompt}</p>
          {clarification.clarification.choices && clarification.clarification.choices.length > 0 && (
            <ul className={styles.choiceList}>
              {clarification.clarification.choices.map((choice, index) => (
                <li key={`${choice.label}-${index}`}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => void submitRequest(choice.resolution)}
                  >
                    {choice.label}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {proposal && diff && (
        <section className={styles.result} aria-labelledby="ai-edit-proposal-heading">
          <h3 id="ai-edit-proposal-heading">Phương án đề xuất</h3>
          {diff.added.length + diff.removed.length + diff.updated.length === 0 &&
            Object.keys(diff.tripChanges).length === 0 ? (
              <p>Không có thay đổi so với hành trình hiện tại.</p>
            ) : (
              <ul className={styles.diffList}>
                {diff.added.map((visit) => <li key={`added-${visit.visitId}`}>
                  <strong>Thêm:</strong> {describeVisit(visit, visit.dayIndex, destinationLabels)}
                </li>)}
                {diff.removed.map((visit) => <li key={`removed-${visit.visitId}`}>
                  <strong>Xóa:</strong> {describeVisit(visit, visit.dayIndex, destinationLabels)}
                </li>)}
                {diff.updated.map((change) => <li key={`updated-${change.visitId}`}>
                  <strong>Điều chỉnh:</strong> {describeVisit(change.before, change.before.dayIndex, destinationLabels)}
                  {" → "}{describeVisit(change.after, change.after.dayIndex, destinationLabels)}
                </li>)}
                {Object.entries(diff.tripChanges).map(([field, change]) => {
                  const labels: Record<string, string> = {
                    startDate: "Ngày bắt đầu",
                    durationDays: "Số ngày",
                    transport: "Phương tiện",
                  };
                  return <li key={`trip-${field}`}>
                    <strong>{labels[field] ?? "Hành trình"}:</strong> {String(change?.before ?? "—")} → {String(change?.after ?? "—")}
                  </li>;
                })}
              </ul>
            )}

          <TripValidationPanel
            validation={{ ...proposal.validation, canConfirm }}
            actionLabel={session.status === "UNKNOWN" ? "Thử lại cùng yêu cầu" : "Xác nhận"}
            onConfirm={handleApply}
            pending={session.status === "APPLYING"}
          />

          {session.status === "UNKNOWN" && (
            <p className={styles.hint}>Yêu cầu chưa có kết quả cuối cùng. Nút xác nhận sẽ gửi lại nguyên payload với cùng Idempotency-Key.</p>
          )}
          {(session.status === "APPLY_FAILED" || session.status === "ERROR") && (
            <Button type="button" variant="outline" onClick={() => void handleRecheck()}>
              Kiểm tra lại đề xuất
            </Button>
          )}
          <Button type="button" variant="outline" disabled={pending} onClick={handleCancel}>
            Hủy đề xuất
          </Button>
        </section>
      )}
    </section>
  );
}
