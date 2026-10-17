"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { createIdempotencyKey } from "@/lib/mutation-client";
import { applyTripEdit, parseTripEditApplyValidation, previewTripEdit } from "@/lib/trip-edit-client";
import { useUnsavedChanges } from "@/components/admin/use-unsaved-changes";
import {
  startDestinationRequest,
  type DestinationRequestState,
} from "@/modules/destination/destination-search-client";
import {
  diffEditCandidate,
  type EditCandidate,
} from "@/modules/trip-edit/edit-candidate";
import {
  areEditCandidatesEqual,
  beginEditPreview,
  canConfirmEditPreview,
  EMPTY_EDIT_PREVIEW_STATE,
  finishEditPreview,
  invalidateEditPreviewForCandidateChange,
  type EditPreviewState,
} from "@/modules/trip-edit/edit-preview-state";
import {
  beginEditApply,
  cancelEditApply,
  clearEditApplyFailure,
  createEditApplyState,
  finishEditApply,
  retryUnknownEditApply,
  updateEditApplyCandidate,
  type EditApplyState,
} from "@/modules/trip-edit/edit-apply-state";
import {
  addVisitToEditSession,
  createEditSession,
  moveVisitDownInEditSession,
  moveVisitToDayInEditSession,
  moveVisitUpInEditSession,
  removeVisitFromEditSession,
  setVisitDurationInEditSession,
  setVisitTimeInEditSession,
  type EditSession,
} from "@/modules/trip-edit/edit-session";
import { TripValidationPanel } from "@/modules/trip-validation/trip-validation-panel";
import type { ValidationFinding } from "@/modules/trip-validation/trip-validation";
import styles from "./edit-trip.module.css";

type Props = {
  tripId: string;
  baseRevision: string;
  initialCandidate: EditCandidate;
  destinationLabels: Record<string, string>;
};

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function minuteValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const groupLabels: Record<ValidationFinding["group"], string> = {
  openingHours: "Giờ hoạt động",
  minimumDuration: "Thời lượng tham quan tối thiểu",
  travelTime: "Thời gian di chuyển",
  scheduleConflict: "Xung đột thời gian",
};

function findingVisitIds(finding: ValidationFinding): string[] {
  return [...new Set([
    finding.affectedVisitId,
    ...(finding.visitIds ?? []),
    finding.fromVisitId,
    finding.toVisitId,
  ].filter((id): id is string => Boolean(id)))];
}

function visitDescription(
  visit: { destinationId: string; startMinute: number; plannedDurationMinutes: number; order: number },
  dayIndex: number,
  label: string,
): string {
  return `${label} · Ngày ${dayIndex} · vị trí ${visit.order} · ${minuteLabel(visit.startMinute)} · ${visit.plannedDurationMinutes} phút`;
}

export default function EditTripClient({ tripId, baseRevision, initialCandidate, destinationLabels }: Props) {
  const [session, setSession] = useState<EditSession>(() => createEditSession(initialCandidate));
  const [applyState, setApplyState] = useState<EditApplyState>(() => createEditApplyState(baseRevision, initialCandidate));
  const [previewState, setPreviewState] = useState<EditPreviewState>(EMPTY_EDIT_PREVIEW_STATE);
  const [destinations, setDestinations] = useState<DestinationRequestState>({ status: "loading" });
  const [addedDestinationLabels, setAddedDestinationLabels] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState("");
  const [targetDayIndex, setTargetDayIndex] = useState(initialCandidate.days[0]?.dayIndex ?? 1);
  const [position, setPosition] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  const [timingDrafts, setTimingDrafts] = useState<Record<string, { startTime: string; duration: string }>>({});
  const [moveDayDrafts, setMoveDayDrafts] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");
  const candidateRef = useRef(session.candidate);
  const applyStateRef = useRef(applyState);
  const previewRequestSequence = useRef(0);

  function commitApplyState(next: EditApplyState) {
    applyStateRef.current = next;
    setApplyState(next);
  }

  const applyInProgress = applyState.status === "SENDING" || applyState.status === "UNKNOWN";
  const markSafeToLeave = useUnsavedChanges(
    !areEditCandidatesEqual(applyState.candidate, applyState.baselineCandidate),
    applyInProgress,
  );

  function commitSession(next: EditSession) {
    if (applyStateRef.current.pending) return;
    const changed = !areEditCandidatesEqual(session.candidate, next.candidate);
    candidateRef.current = next.candidate;
    if (changed) {
      previewRequestSequence.current += 1;
      setPreviewState((current) => invalidateEditPreviewForCandidateChange(
        session.candidate,
        next.candidate,
        current,
      ));
    }
    setSession(next);
    commitApplyState(updateEditApplyCandidate(applyStateRef.current, next.candidate));
  }

  async function handleCheck() {
    const freshState = clearEditApplyFailure(applyStateRef.current);
    if (freshState.status === "SENDING" || freshState.status === "UNKNOWN") return;
    commitApplyState(freshState);
    const requestedCandidate = freshState.candidate;
    const requestedRevision = freshState.baseRevision;
    const requestSequence = ++previewRequestSequence.current;
    setPreviewState(beginEditPreview());
    const outcome = await previewTripEdit(tripId, { baseRevision: requestedRevision, candidate: requestedCandidate });
    if (requestSequence !== previewRequestSequence.current) return;
    setPreviewState(finishEditPreview(candidateRef.current, requestedCandidate, outcome, requestedRevision));
  }

  async function handleApply() {
    const current = applyStateRef.current;
    let sending: EditApplyState;

    if (current.status === "UNKNOWN") {
      sending = retryUnknownEditApply(current);
    } else {
      if (current.status !== "IDLE") return;
      if (
        !canConfirmEditPreview(current.candidate, previewState) ||
        previewState.result?.baseRevision !== current.baseRevision
      ) return;
      sending = beginEditApply(current, createIdempotencyKey());
    }
    if (sending.status !== "SENDING" || !sending.pending) return;

    commitApplyState(sending);
    setAnnouncement("");
    const pending = sending.pending;
    const outcome = await applyTripEdit(tripId, pending.payload, pending.idempotencyKey);
    const rejectedValidation = outcome.status === "FAILED" && outcome.error.code === "TRIP_VALIDATION_FAILED"
      ? parseTripEditApplyValidation(outcome.error.details)
      : null;
    const finished = finishEditApply(sending, outcome, rejectedValidation);
    commitApplyState(finished);

    if (outcome.status === "SUCCESS") {
      const appliedSession = createEditSession(finished.candidate);
      candidateRef.current = finished.candidate;
      setSession(appliedSession);
      setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
      setAnnouncement("Đã áp dụng phương án vào hành trình.");
      return;
    }

    if (outcome.status === "UNKNOWN") {
      setAnnouncement("Chưa xác định được kết quả lưu. Hãy thử lại cùng yêu cầu; không chỉnh sửa phương án lúc này.");
      return;
    }

    setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
    setAnnouncement(outcome.error.message);
  }

  function discardAndLeave() {
    const discarded = cancelEditApply(applyStateRef.current);
    if (discarded.pending) return;
    previewRequestSequence.current += 1;
    candidateRef.current = discarded.candidate;
    setSession(createEditSession(discarded.candidate));
    setPreviewState(EMPTY_EDIT_PREVIEW_STATE);
    commitApplyState(discarded);
    setAnnouncement("");
    markSafeToLeave();
  }

  function handleCancelKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === "Enter") discardAndLeave();
  }

  const previewCanConfirm = canConfirmEditPreview(session.candidate, previewState)
    && previewState.result?.baseRevision === applyState.baseRevision;
  const editDirty = !areEditCandidatesEqual(applyState.candidate, applyState.baselineCandidate);
  const previewDiff = previewState.result
    ? diffEditCandidate(applyState.baselineCandidate, previewState.result.candidate)
    : null;
  const previewFindings = previewState.result
    ? [
        ...previewState.result.validation.groups.openingHours.findings,
        ...previewState.result.validation.groups.minimumDuration.findings,
        ...previewState.result.validation.groups.travelTime.findings,
        ...previewState.result.validation.groups.scheduleConflict.findings,
      ].filter((finding) => finding.status === "VIOLATION")
    : [];

  function labelForDestination(destinationId: string): string {
    return destinationLabels[destinationId]
      ?? addedDestinationLabels[destinationId]
      ?? visibleDestinations.find((item) => item.id === destinationId)?.name
      ?? "Điểm đến không còn hiển thị";
  }

  useEffect(() => {
    const params = new URLSearchParams();
    const normalizedQuery = query.trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    return startDestinationRequest(params, setDestinations);
  }, [query]);

  const visibleDestinations = destinations.status === "ready" ? destinations.data.items : [];
  const currentDestinationId = visibleDestinations.some((item) => item.id === selectedDestinationId)
    ? selectedDestinationId
    : visibleDestinations[0]?.id ?? "";
  const targetDay = session.candidate.days.find((day) => day.dayIndex === targetDayIndex)
    ?? session.candidate.days[0]!;
  const maxPosition = targetDay.visits.length + 1;

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = visibleDestinations.find((item) => item.id === currentDestinationId);
    const startMinute = minuteValue(startTime);
    const plannedDurationMinutes = duration.trim() ? Number(duration) : Number.NaN;
    if (!destination || startMinute === null || !Number.isInteger(plannedDurationMinutes)) {
      setAnnouncement("Chọn điểm đến, giờ bắt đầu và thời lượng hợp lệ.");
      return;
    }

    try {
      const next = addVisitToEditSession(session, targetDay.dayIndex, {
        visitId: crypto.randomUUID(),
        destinationId: destination.id,
        startMinute,
        plannedDurationMinutes,
      }, Number(position));
      commitSession(next);
      setAddedDestinationLabels((current) => ({
        ...current,
        [destination.id]: `${destination.name} · ${destination.area}`,
      }));
      setAnnouncement(`Đã thêm ${destination.name} vào ngày ${targetDay.dayIndex}. Chưa áp dụng.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể thêm điểm đến này.");
    }
  }

  function handleRemove(visitId: string, dayIndex: number, label: string) {
    try {
      const next = removeVisitFromEditSession(session, visitId);
      commitSession(next);
      setAnnouncement(`Đã xóa ${label} khỏi ngày ${dayIndex}. Chưa áp dụng.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể xóa điểm đến này.");
    }
  }

  function handleReorder(visitId: string, direction: "up" | "down") {
    try {
      const next = direction === "up"
        ? moveVisitUpInEditSession(session, visitId)
        : moveVisitDownInEditSession(session, visitId);
      commitSession(next);
      setAnnouncement(direction === "up" ? "Đã chuyển điểm lên trước. Chưa áp dụng." : "Đã chuyển điểm xuống sau. Chưa áp dụng.");
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể đổi thứ tự điểm đến.");
    }
  }

  function handleMoveDay(visitId: string, targetDayIndex: number) {
    try {
      const next = moveVisitToDayInEditSession(session, visitId, targetDayIndex);
      commitSession(next);
      setAnnouncement(`Đã chuyển điểm đến ngày ${targetDayIndex}. Chưa áp dụng.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Không thể chuyển điểm đến sang ngày đã chọn.");
    }
  }

  function handleSaveTiming(event: FormEvent<HTMLFormElement>, visitId: string) {
    event.preventDefault();
    const visit = session.candidate.days.flatMap((day) => day.visits).find((item) => item.visitId === visitId);
    if (!visit) {
      setAnnouncement("Không tìm thấy điểm đến trong phương án.");
      return;
    }
    const draft = timingDrafts[visitId] ?? {
      startTime: minuteLabel(visit.startMinute),
      duration: String(visit.plannedDurationMinutes),
    };

    try {
      const durationInput = draft.duration.trim() ? Number(draft.duration) : Number.NaN;
      let next = createEditSession(session.candidate);
      if (Number.isInteger(durationInput) && durationInput < visit.plannedDurationMinutes) {
        next = setVisitDurationInEditSession(next, visitId, draft.duration);
        next = setVisitTimeInEditSession(next, visitId, draft.startTime);
      } else {
        next = setVisitTimeInEditSession(next, visitId, draft.startTime);
        next = setVisitDurationInEditSession(next, visitId, draft.duration);
      }
      commitSession(next);
      setTimingDrafts((current) => {
        const updated = { ...current };
        delete updated[visitId];
        return updated;
      });
      setAnnouncement("Đã cập nhật giờ và thời lượng. Chưa áp dụng.");
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Giờ bắt đầu hoặc thời lượng không hợp lệ.");
    }
  }

  return (
    <main className={styles.page} lang="vi">
      <Link className={styles.backLink} href={`/trips/${tripId}` as Route}>
        ← Trở về hành trình
      </Link>

      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Chỉnh sửa hành trình</p>
          <h1>Điều chỉnh các điểm đến</h1>
          <p>Thay đổi chỉ cập nhật vào hành trình sau khi bạn xác nhận phương án đã kiểm tra.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.status} aria-label={editDirty ? "Phương án chưa áp dụng" : undefined}>
            {editDirty ? "Chưa áp dụng" : "Đã lưu"}
          </span>
          {applyInProgress ? (
            <button className={styles.cancelLink} type="button" disabled aria-disabled="true">Hủy chỉnh sửa</button>
          ) : (
            <Link
              className={styles.cancelLink}
              href={`/trips/${tripId}` as Route}
              onPointerDown={(event) => { if (event.button === 0) discardAndLeave(); }}
              onKeyDown={handleCancelKeyDown}
            >
              Hủy chỉnh sửa
            </Link>
          )}
        </div>
      </header>

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="edit-add-heading" inert={applyInProgress}>
          <h2 id="edit-add-heading">Thêm điểm đến</h2>
          <form className={styles.form} onSubmit={handleAdd}>
            <label className={styles.field}>
              <span>Tìm điểm đến công khai</span>
              <input
                type="search"
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nhập tên điểm đến"
                aria-describedby="destination-request-status"
              />
            </label>

            <label className={styles.field}>
              <span>Điểm đến</span>
              <select
                value={currentDestinationId}
                onChange={(event) => setSelectedDestinationId(event.target.value)}
                disabled={destinations.status !== "ready" || visibleDestinations.length === 0}
                required
              >
                {visibleDestinations.length === 0 && <option value="">Không có điểm phù hợp</option>}
                {visibleDestinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name} · {destination.area}
                  </option>
                ))}
              </select>
            </label>

            <p className={styles.requestStatus} id="destination-request-status" role="status" aria-live="polite">
              {destinations.status === "loading" && "Đang tải điểm đến công khai…"}
              {destinations.status === "error" && "Không tải được điểm đến. Hãy thử tìm lại."}
              {destinations.status === "ready" && visibleDestinations.length === 0 && "Không tìm thấy điểm đến công khai phù hợp."}
              {destinations.status === "ready" && visibleDestinations.length > 0 && `${visibleDestinations.length} điểm đến công khai.`}
            </p>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Ngày thêm</span>
                <select
                  value={targetDay.dayIndex}
                  onChange={(event) => {
                    const dayIndex = Number(event.target.value);
                    setTargetDayIndex(dayIndex);
                    const day = session.candidate.days.find((item) => item.dayIndex === dayIndex);
                    setPosition(String((day?.visits.length ?? 0) + 1));
                  }}
                >
                  {session.candidate.days.map((day) => (
                    <option key={day.dayIndex} value={day.dayIndex}>Ngày {day.dayIndex}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Vị trí chèn</span>
                <select value={Math.min(Number(position), maxPosition)} onChange={(event) => setPosition(event.target.value)}>
                  {Array.from({ length: maxPosition }, (_, index) => index + 1).map((index) => (
                    <option key={index} value={index}>Vị trí {index}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Giờ bắt đầu</span>
                <input type="time" step={60} value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Thời lượng (phút)</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  required
                />
              </label>
            </div>

            <button className={styles.primaryButton} type="submit" disabled={!currentDestinationId || destinations.status !== "ready"}>
              Thêm vào phương án
            </button>
          </form>
        </section>

        <section className={styles.candidate} aria-labelledby="candidate-heading">
          <div className={styles.candidateHeading}>
            <div><h2 id="candidate-heading">Phương án chỉnh sửa</h2><p>Phương án chỉ được lưu vào hành trình sau khi xác nhận.</p></div>
            <span className={styles.status}>Chưa áp dụng</span>
          </div>

          <p className={styles.announcement} role="status" aria-live="polite">{announcement}</p>
          <div className={styles.previewActions}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={previewState.status === "CHECKING" || applyInProgress}
              onClick={() => void handleCheck()}
            >
              {previewState.status === "CHECKING" ? "Đang kiểm tra…" : "Kiểm tra"}
            </button>
            <p className={styles.previewMessage} role="status" aria-live="polite">
              {previewState.status === "IDLE" && "Kiểm tra để xem khác biệt và kết quả Validator."}
              {previewState.status === "CHECKING" && "Đang kiểm tra phương án. Bạn vẫn có thể tiếp tục chỉnh sửa."}
              {previewState.status === "FAILED" && previewState.error?.message}
              {previewState.status === "NETWORK_ERROR" && "Mất kết nối khi kiểm tra. Phương án vẫn được giữ lại; hãy thử lại."}
              {previewState.status === "TIMEOUT" && "Kiểm tra quá thời gian chờ. Phương án vẫn được giữ lại; hãy thử lại."}
              {previewState.status === "PREVIEWED" && "Kết quả bên dưới chỉ áp dụng cho phương án hiện tại."}
            </p>
          </div>

          <div className={styles.days} inert={applyInProgress}>
            {session.candidate.days.map((day) => (
              <section className={styles.day} key={day.dayIndex} aria-labelledby={`candidate-day-${day.dayIndex}`}>
                <h3 id={`candidate-day-${day.dayIndex}`}>Ngày {day.dayIndex}</h3>
                {day.visits.length === 0 ? <p className={styles.empty}>Chưa có điểm đến trong ngày này.</p> : (
                  <ol className={styles.visitList}>
                    {day.visits.map((visit) => {
                      const label = labelForDestination(visit.destinationId);
                      const otherDays = session.candidate.days.filter((item) => item.dayIndex !== day.dayIndex);
                      const preferredMoveDay = moveDayDrafts[visit.visitId];
                      const moveDayIndex = otherDays.some((item) => item.dayIndex === preferredMoveDay)
                        ? preferredMoveDay!
                        : otherDays[0]?.dayIndex;
                      const timingDraft = timingDrafts[visit.visitId] ?? {
                        startTime: minuteLabel(visit.startMinute),
                        duration: String(visit.plannedDurationMinutes),
                      };
                      return (
                        <li className={styles.visit} key={visit.visitId}>
                          <div className={styles.visitHeader}>
                            <div className={styles.visitText}>
                              <strong>{label}</strong>
                              <span>Thứ tự {visit.order} · {minuteLabel(visit.startMinute)} · {visit.plannedDurationMinutes} phút</span>
                            </div>
                            <div className={styles.orderControls} aria-label={`Đổi thứ tự ${label}`}>
                              <button
                                className={styles.smallButton}
                                type="button"
                                aria-label={`Chuyển ${label} lên trước`}
                                disabled={visit.order === 1}
                                onClick={() => handleReorder(visit.visitId, "up")}
                              >Lên</button>
                              <button
                                className={styles.smallButton}
                                type="button"
                                aria-label={`Chuyển ${label} xuống sau`}
                                disabled={visit.order === day.visits.length}
                                onClick={() => handleReorder(visit.visitId, "down")}
                              >Xuống</button>
                            </div>
                          </div>
                          {otherDays.length > 0 && (
                            <div className={styles.moveControls}>
                              <label className={styles.compactField}>
                                <span>Chuyển sang ngày</span>
                                <select
                                  aria-label={`Chọn ngày chuyển ${label} đến`}
                                  value={moveDayIndex ?? ""}
                                  onChange={(event) => setMoveDayDrafts((current) => ({
                                    ...current,
                                    [visit.visitId]: Number(event.target.value),
                                  }))}
                                >
                                  {otherDays.map((target) => (
                                    <option key={target.dayIndex} value={target.dayIndex}>Ngày {target.dayIndex}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className={styles.smallButton}
                                type="button"
                                disabled={moveDayIndex === undefined}
                                onClick={() => moveDayIndex !== undefined && handleMoveDay(visit.visitId, moveDayIndex)}
                              >Chuyển ngày</button>
                            </div>
                          )}
                          <form className={styles.timingForm} onSubmit={(event) => handleSaveTiming(event, visit.visitId)}>
                            <label className={styles.compactField}>
                              <span>Giờ bắt đầu</span>
                              <input
                                type="time"
                                step={60}
                                value={timingDraft.startTime}
                                onChange={(event) => setTimingDrafts((current) => ({
                                  ...current,
                                  [visit.visitId]: { ...timingDraft, startTime: event.target.value },
                                }))}
                                required
                              />
                            </label>
                            <label className={styles.compactField}>
                              <span>Thời lượng (phút)</span>
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                step={1}
                                value={timingDraft.duration}
                                onChange={(event) => setTimingDrafts((current) => ({
                                  ...current,
                                  [visit.visitId]: { ...timingDraft, duration: event.target.value },
                                }))}
                                required
                              />
                            </label>
                            <button className={styles.smallButton} type="submit">Cập nhật giờ</button>
                          </form>
                          <button
                            className={styles.removeButton}
                            type="button"
                            aria-label={`Xóa điểm đến thứ ${visit.order} (${label}) khỏi ngày ${day.dayIndex}`}
                            onClick={() => handleRemove(visit.visitId, day.dayIndex, label)}
                          >Xóa</button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            ))}
          </div>

          {previewState.status === "PREVIEWED" && previewState.result && previewDiff && (
            <div className={styles.previewResults}>
              <section className={styles.previewSection} aria-labelledby="edit-diff-heading">
                <h2 id="edit-diff-heading">Khác biệt so với hành trình đã lưu</h2>
                {previewDiff.added.length + previewDiff.removed.length + previewDiff.updated.length === 0
                  && Object.keys(previewDiff.tripChanges).length === 0
                  ? <p className={styles.empty}>Không có thay đổi so với hành trình đã lưu.</p>
                  : (
                    <ul className={styles.diffList}>
                      {previewDiff.added.map((visit) => (
                        <li key={`added-${visit.visitId}`}>
                          <strong>Thêm:</strong> {visitDescription(visit, visit.dayIndex, labelForDestination(visit.destinationId))}
                        </li>
                      ))}
                      {previewDiff.removed.map((visit) => (
                        <li key={`removed-${visit.visitId}`}>
                          <strong>Xóa:</strong> {visitDescription(visit, visit.dayIndex, labelForDestination(visit.destinationId))}
                        </li>
                      ))}
                      {previewDiff.updated.map((change) => (
                        <li key={`updated-${change.visitId}`}>
                          <strong>Điều chỉnh:</strong>{" "}
                          {visitDescription(change.before, change.before.dayIndex, labelForDestination(change.before.destinationId))}
                          {" → "}
                          {visitDescription(change.after, change.after.dayIndex, labelForDestination(change.after.destinationId))}
                        </li>
                      ))}
                      {Object.entries(previewDiff.tripChanges).map(([field, change]) => (
                        <li key={`trip-${field}`}>
                          <strong>{field}:</strong> {String(change?.before ?? "—")} → {String(change?.after ?? "—")}
                        </li>
                      ))}
                    </ul>
                  )}
              </section>

              <TripValidationPanel
                validation={{ ...previewState.result.validation, canConfirm: previewCanConfirm }}
                actionLabel={applyState.status === "UNKNOWN" ? "Thử lại cùng yêu cầu" : "Xác nhận"}
                onConfirm={handleApply}
                pending={applyState.status === "SENDING"}
              />

              {previewFindings.length > 0 && (
                <section className={styles.previewSection} aria-labelledby="finding-context-heading">
                  <h2 id="finding-context-heading">Điểm đến và ngày liên quan đến vi phạm</h2>
                  <ul className={styles.diffList}>
                    {previewFindings.map((finding, index) => {
                      const related = findingVisitIds(finding).flatMap((visitId) => {
                        const location = previewState.result!.candidate.days
                          .flatMap((day) => day.visits.map((visit) => ({ dayIndex: day.dayIndex, visit })))
                          .find(({ visit }) => visit.visitId === visitId);
                        return location
                          ? [`${labelForDestination(location.visit.destinationId)} · Ngày ${location.dayIndex}`]
                          : [];
                      });
                      return (
                        <li key={`${finding.group}-${finding.reasonCode}-${index}`}>
                          <strong>{groupLabels[finding.group]}:</strong>{" "}
                          {related.length > 0 ? related.join("; ") : finding.message}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          )}

          {applyState.validation && (
            <section className={styles.previewResults} aria-label="Kết quả kiểm tra khi áp dụng">
              <h2>Kết quả kiểm tra khi áp dụng</h2>
              <p className={styles.previewMessage} role="status">{applyState.error?.message}</p>
              <TripValidationPanel validation={{ ...applyState.validation, canConfirm: false }} />
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
