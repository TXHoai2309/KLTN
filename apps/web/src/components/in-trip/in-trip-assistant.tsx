"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useId, useRef, useState } from "react";

import ManualLocationPicker from "@/components/in-trip/manual-location-picker";
import { requestBrowserLocation } from "@/modules/in-trip/browser-location";
import {
  createLocationFlowState,
  getLocationFlowMessage,
  transitionLocationFlow,
  type LocationFlowEvent,
  type LocationFlowState,
} from "@/modules/in-trip/location-flow";
import {
  normalizeInTripLocation,
  type InTripLocation,
} from "@/modules/in-trip/in-trip-location";
import {
  beginInTripApply,
  beginInTripPreview,
  canSubmitInTripReplan,
  canConfirmInTrip,
  cancelInTripProposal,
  beginInTripReplan,
  createInTripAssistantState,
  finishInTripApply,
  finishInTripPreview,
  finishInTripReplan,
  IN_TRIP_NEED_MAX_LENGTH,
  retryUnknownInTripApply,
  updateInTripAssistantInput,
  validateInTripNeed,
  type InTripVisitSummary,
} from "@/modules/in-trip/in-trip-session";
import { diffEditCandidate, type EditCandidate } from "@/modules/trip-edit/edit-candidate";
import { applyInTrip, previewInTrip, requestInTripReplan } from "@/lib/in-trip-client";
import { createIdempotencyKey } from "@/lib/mutation-client";
import { TripValidationPanel } from "@/modules/trip-validation/trip-validation-panel";
import type { SplitTripStatus } from "@/modules/in-trip/split-trip";
import styles from "./in-trip-assistant.module.css";

type Props = {
  tripId: string;
  baseRevision: string;
  initialCandidate: EditCandidate;
  destinationLabels: Record<string, string>;
  status: SplitTripStatus;
  completed: InTripVisitSummary[];
  remaining: InTripVisitSummary[];
};

function timeLabel(startMinute: number): string {
  const hour = Math.floor(startMinute / 60);
  const minute = startMinute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function InTripVisitList({
  visits,
  kind,
}: {
  visits: InTripVisitSummary[];
  kind: "completed" | "remaining";
}) {
  const completed = kind === "completed";
  return (
    <section className={`${styles.visitGroup} ${completed ? styles.completed : styles.remaining}`}>
      <div className={styles.visitGroupHeading}>
        <span className={styles.timelineMark} aria-hidden="true" />
        <div>
          <h2>{completed ? "Đã qua giờ theo lịch" : "Sẽ được đề xuất lại"}</h2>
          {completed && <span className={styles.lockBadge}>Đã khóa</span>}
          <p>
            {completed
              ? "Đây là mốc giờ trong kế hoạch; lượt được giữ nguyên và hệ thống không xác nhận bạn đã thực sự tham quan."
              : "Các lượt này vẫn còn trong phạm vi có thể sắp xếp lại."}
          </p>
        </div>
      </div>
      {visits.length === 0 ? (
        <p className={styles.emptyVisits}>{completed ? "Chưa có lượt nào qua giờ theo lịch." : "Không còn lượt nào trong phần lịch này."}</p>
      ) : (
        <ol className={styles.visitList}>
          {visits.map(visit => (
            <li className={styles.visit} key={visit.visitId}>
              <span className={styles.visitTime}>{timeLabel(visit.startMinute)}</span>
              <div className={styles.visitContent}>
                <h3>{visit.destinationName}</h3>
                <p>{visit.area ? `${visit.area} · ` : ""}Ngày {visit.dayIndex} · {visit.localDate}</p>
                <p>{visit.plannedDurationMinutes} phút · vị trí {visit.order}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function proposalDestinationLabel(destinationId: string, labels: Record<string, string>): string {
  return labels[destinationId] ?? `Điểm đến mới (${destinationId.slice(0, 8)})`;
}

function proposalVisitDescription(
  visit: { destinationId: string; dayIndex: number; startMinute: number; plannedDurationMinutes: number; order: number },
  labels: Record<string, string>,
): string {
  return `${proposalDestinationLabel(visit.destinationId, labels)} · Ngày ${visit.dayIndex}, ${timeLabel(visit.startMinute)}, ${visit.plannedDurationMinutes} phút, lượt ${visit.order}`;
}

export default function InTripAssistant({
  tripId,
  baseRevision,
  initialCandidate,
  destinationLabels,
  status,
  completed,
  remaining,
}: Props) {
  const nav = useRouter();
  const headingId = useId();
  const needId = useId();
  const helpId = useId();
  const errorId = useId();
  const countId = useId();
  const proposalHeadingId = useId();
  const [assistantState, setAssistantState] = useState(() => createInTripAssistantState(status));
  const assistantStateRef = useRef(assistantState);
  assistantStateRef.current = assistantState;
  const { session, proposal } = assistantState;
  const [locationFlow, setLocationFlow] = useState<LocationFlowState>(() => createLocationFlowState());
  const flowRef = useRef(locationFlow);
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [accumulatedResolution, setAccumulatedResolution] = useState<{
    selectedVisitId?: string;
    selectedDestinationId?: string;
    selectedDestinationLabel?: string;
    selectedDayIndex?: number;
  }>({});
  const requestSequence = useRef(0);
  const needValidation = validateInTripNeed(session.need);
  const needError = session.need.length > 0 && !needValidation.valid
    ? needValidation.reason === "TOO_LONG"
      ? `Nhu cầu không được vượt quá ${IN_TRIP_NEED_MAX_LENGTH} ký tự.`
      : "Hãy nhập nhu cầu mới của bạn."
    : "";

  function dispatchLocation(event: LocationFlowEvent): LocationFlowState {
    const next = transitionLocationFlow(flowRef.current, event);
    flowRef.current = next;
    setLocationFlow(next);
    return next;
  }

  function setSelectedLocation(location: InTripLocation | null) {
    requestSequence.current += 1;
    setAccumulatedResolution({});
    setAssistantState(current => {
      const next = updateInTripAssistantInput(current, { location });
      assistantStateRef.current = next;
      return next;
    });
  }

  function updateNeed(need: string) {
    requestSequence.current += 1;
    setAccumulatedResolution({});
    const boundedNeed = [...need].slice(0, IN_TRIP_NEED_MAX_LENGTH).join("");
    setAssistantState(current => {
      const next = updateInTripAssistantInput(current, { need: boundedNeed });
      assistantStateRef.current = next;
      return next;
    });
  }

  async function requestProposal(resolution?: {
    selectedVisitId?: string;
    selectedDestinationId?: string;
    selectedDayIndex?: number;
  }) {
    if (!canSubmitInTripReplan(assistantStateRef.current)) return;
    const location = assistantStateRef.current.session.location;
    const need = validateInTripNeed(assistantStateRef.current.session.need);
    if (!location || !need.valid) return;

    const requestId = ++requestSequence.current;
    const requestingState = beginInTripReplan(assistantStateRef.current);
    assistantStateRef.current = requestingState;
    setAssistantState(requestingState);

    const outcome = await requestInTripReplan(tripId, {
      baseRevision,
      location,
      need: need.normalized,
      ...(resolution ? {
        resolution: {
          ...(resolution.selectedVisitId ? { selectedVisitId: resolution.selectedVisitId } : {}),
          ...(resolution.selectedDestinationId ? { selectedDestinationId: resolution.selectedDestinationId } : {}),
          ...(resolution.selectedDayIndex !== undefined ? { selectedDayIndex: resolution.selectedDayIndex } : {}),
        },
      } : {}),
    });
    if (requestSequence.current !== requestId) return;

    const next = finishInTripReplan(assistantStateRef.current, outcome);
    assistantStateRef.current = next;
    setAssistantState(next);

    if (outcome.kind === "RESPONSE" && outcome.data.status === "PROPOSED") {
      setAccumulatedResolution({});
      await runPreview(next, requestId);
    }
  }

  async function runPreview(state: typeof assistantState, requestId = ++requestSequence.current) {
    const checking = beginInTripPreview(state);
    if (checking === state || state.proposal.status !== "PROPOSED" || !state.session.location) return;
    assistantStateRef.current = checking;
    setAssistantState(checking);
    const result = await previewInTrip(tripId, {
      baseRevision,
      candidate: state.proposal.result.candidate,
      location: state.session.location,
      mandatoryEndpoint: state.proposal.result.mandatoryEndpoint,
    });
    if (requestSequence.current !== requestId) return;
    const next = finishInTripPreview(assistantStateRef.current, result);
    assistantStateRef.current = next;
    setAssistantState(next);
  }

  async function runApply(state: typeof assistantState) {
    if (state.apply.status !== "APPLYING") return;
    const pending = state.apply.pending;
    const result = await applyInTrip(tripId, pending.payload, pending.idempotencyKey);
    const next = finishInTripApply(state, result);
    setAssistantState(current => {
      const updated = current.apply.status === "APPLYING" ? next : current;
      assistantStateRef.current = updated;
      return updated;
    });
    if (result.status === "SUCCESS") {
      setAnnouncement("Đã áp dụng phương án thành công. Đang mở chi tiết chuyến đi.");
      nav.replace(`/trips/${tripId}` as Route);
      nav.refresh();
    }
  }

  function confirmProposal() {
    const next = beginInTripApply(assistantState, baseRevision, createIdempotencyKey());
    if (next === assistantState) return;
    setAssistantState(next);
    void runApply(next);
  }

  function retryApply() {
    const next = retryUnknownInTripApply(assistantState);
    if (next === assistantState) return;
    setAssistantState(next);
    void runApply(next);
  }

  function cancelProposal() {
    requestSequence.current += 1;
    setAccumulatedResolution({});
    setAssistantState(current => cancelInTripProposal(current));
    setAnnouncement("Đã hủy đề xuất. Hành trình đã lưu không thay đổi.");
  }

  function checkedTimeLabel(value: string): string {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(value));
  }

  async function chooseGpsLocation() {
    if (status === "ALL_COMPLETED") return;
    const pending = dispatchLocation({ type: "REQUEST_GPS" });
    if (pending.status !== "requesting") return;

    setSelectedLocation(null);
    setManualPickerOpen(false);
    setLocationError("");
    setAnnouncement("");
    const geolocation = typeof navigator === "undefined" ? null : navigator.geolocation;
    const result = await requestBrowserLocation(geolocation);
    const next = dispatchLocation({ type: "GPS_RESULT", requestId: pending.requestId, result });
    if (next.status !== "gps_ok" || result.status !== "OK") return;

    try {
      setSelectedLocation(normalizeInTripLocation({
        source: "GPS",
        latitude: next.location.latitude,
        longitude: next.location.longitude,
        accuracyMeters: next.location.accuracyMeters,
        capturedAt: new Date(next.location.capturedAt).toISOString(),
      }));
    } catch {
      setLocationError("Không thể dùng vị trí GPS vừa nhận. Hãy thử lại hoặc chọn vị trí thủ công.");
    }
  }

  function chooseManualLocation() {
    if (status === "ALL_COMPLETED") return;
    dispatchLocation({ type: "SELECT_MANUAL" });
    setSelectedLocation(null);
    setManualPickerOpen(true);
    setLocationError("");
    setAnnouncement("");
  }

  function updateManualLocation(coordinates: { latitude: number; longitude: number }) {
    try {
      setSelectedLocation(normalizeInTripLocation({
        source: "MANUAL",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        accuracyMeters: null,
        capturedAt: new Date().toISOString(),
      }));
      setLocationError("");
      setAnnouncement("Đã chọn vị trí thủ công.");
    } catch {
      setSelectedLocation(null);
      setLocationError("Vị trí chưa hợp lệ. Hãy chọn lại trên bản đồ hoặc nhập tọa độ hợp lệ.");
    }
  }

  function handleReplan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestProposal();
  }

  const canRequest = canSubmitInTripReplan(assistantState);
  const isRequesting = proposal.status === "REQUESTING";
  const mutationPending = assistantState.apply.status === "APPLYING" || assistantState.apply.status === "UNKNOWN";
  const canConfirm = canConfirmInTrip(assistantState);
  const shownValidation = assistantState.apply.status === "FAILED" && assistantState.apply.validation
    ? assistantState.apply.validation
    : assistantState.validation.status === "CHECKED"
      ? assistantState.validation.data.validation
      : assistantState.validation.status === "FAILED"
        ? assistantState.validation.data?.validation
        : undefined;
  const shownCheckedAt = assistantState.apply.status === "FAILED" && assistantState.apply.checkedAt
    ? assistantState.apply.checkedAt
    : assistantState.validation.status === "CHECKED"
      ? assistantState.validation.data.checkedAt
      : assistantState.validation.status === "FAILED"
        ? assistantState.validation.data?.checkedAt
        : undefined;

  return (
    <main className={styles.page} aria-labelledby={headingId}>
      <div className={styles.content}>
        <Link className={styles.backLink} {...{ href: `/trips/${tripId}` as Route }}>← Quay lại chuyến đi</Link>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Hỗ trợ trong chuyến đi</p>
          <h1 id={headingId}>Trợ lý hành trình</h1>
          <p>Cho biết vị trí hiện tại và điều bạn cần thay đổi. Phần lịch đã qua giờ được giữ riêng để bạn dễ đối chiếu.</p>
        </header>

        {status === "ALL_COMPLETED" && (
          <section className={styles.completedNotice} role="status" aria-live="polite">
            <h2>Không còn lượt trong lịch để đề xuất lại</h2>
            <p>Toàn bộ lượt theo lịch đã qua giờ kết thúc dự kiến. Điều này không xác nhận bạn đã thực sự tham quan.</p>
          </section>
        )}

        <div className={styles.timeline}>
          <InTripVisitList visits={completed} kind="completed" />
          <InTripVisitList visits={remaining} kind="remaining" />
        </div>

        {status !== "ALL_COMPLETED" && (
          <form className={styles.form} noValidate onSubmit={handleReplan}>
            <section className={styles.step} aria-labelledby={`${headingId}-location`}>
              <p className={styles.stepLabel}>Bước 1</p>
              <h2 id={`${headingId}-location`}>Bạn đang ở đâu?</h2>
              <p className={styles.help}>Vị trí chỉ được giữ tạm trên trang này. GPS chỉ chạy khi bạn bấm nút.</p>
              <div className={styles.locationActions}>
                <button className={styles.primaryButton} type="button" onClick={chooseGpsLocation}
                  disabled={locationFlow.status === "requesting" || isRequesting || mutationPending}>
                  {locationFlow.status === "requesting" ? "Đang lấy vị trí…" : "Dùng vị trí GPS"}
                </button>
                <button className={styles.secondaryButton} type="button" onClick={chooseManualLocation} disabled={isRequesting || mutationPending}>
                  Chọn vị trí thủ công
                </button>
              </div>
              <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
                {locationError || announcement || getLocationFlowMessage(locationFlow)}
              </p>
              {session.location && (
                <p className={styles.selectedLocation}>
                  Đã chọn vị trí {session.location.source === "GPS" ? "GPS" : "thủ công"}.
                </p>
              )}
              {manualPickerOpen && (
                <ManualLocationPicker
                  coordinates={session.location?.source === "MANUAL"
                    ? { latitude: session.location.latitude, longitude: session.location.longitude }
                    : null}
                  onChange={updateManualLocation}
                />
              )}
            </section>

            <section className={`${styles.step} ${!session.location ? styles.stepWaiting : ""}`} aria-labelledby={`${headingId}-need`}>
              <p className={styles.stepLabel}>Bước 2</p>
              <h2 id={`${headingId}-need`}>Bạn cần thay đổi điều gì?</h2>
              <label className={styles.fieldLabel} htmlFor={needId}>Nhu cầu mới</label>
              <textarea
                id={needId}
                className={`${styles.textarea} resize-none`}
                value={session.need}
                onChange={event => updateNeed(event.target.value)}
                disabled={!session.location || isRequesting || mutationPending}
                aria-invalid={Boolean(needError)}
                aria-describedby={`${helpId} ${countId}${needError ? ` ${errorId}` : ""}`}
              />
              <p className={styles.help} id={helpId}>
                Ví dụ: “Tôi muốn nghỉ ăn trưa gần vị trí hiện tại”. Tối đa {IN_TRIP_NEED_MAX_LENGTH} ký tự.
              </p>
              {needError && <p className={styles.fieldError} id={errorId}>{needError}</p>}
              <p className={styles.counter} id={countId}>{[...session.need].length}/{IN_TRIP_NEED_MAX_LENGTH}</p>
            </section>

            <section className={styles.submitArea} aria-labelledby={`${headingId}-action`}>
              <p className={styles.stepLabel}>Bước 3</p>
              <h2 id={`${headingId}-action`}>Đề xuất thay đổi</h2>
              <button className={styles.submitButton} type="submit" disabled={!canRequest}>
                {isRequesting ? "Đang tạo đề xuất…" : "Đề xuất lại"}
              </button>
              {!canRequest && !isRequesting && <p className={styles.help}>Chọn vị trí và nhập nhu cầu để tiếp tục.</p>}
              <p className={styles.privacyNote}>Vị trí và nhu cầu được gửi trong yêu cầu riêng tư để tạo đề xuất; chúng không được lưu trong lịch sử chuyến đi.</p>
            </section>
          </form>
        )}

        {proposal.status !== "IDLE" && (
          <section className={styles.proposalPanel} aria-labelledby={proposalHeadingId} aria-busy={isRequesting}>
            <h2 id={proposalHeadingId}>Kết quả đề xuất lại</h2>
            {proposal.status === "REQUESTING" && (
              <p className={styles.proposalStatus} role="status" aria-live="polite">Đang tạo đề xuất. Vị trí và nhu cầu đang được giữ tạm trên trang này.</p>
            )}
            {proposal.status === "PROPOSED" && (() => {
              const diff = diffEditCandidate(initialCandidate, proposal.result.candidate);
              return (
                <div className={styles.proposalContent}>
                  <p className={styles.proposalBadge}>Đề xuất chưa áp dụng</p>
                  <p className={styles.proposalStatus}>Phương án cần được Validator kiểm tra trước khi xác nhận.</p>
                  <section className={styles.lockedVisits} aria-label="Phần đã qua giờ theo lịch được khóa">
                    <strong>Phần đã qua giờ theo lịch · Đã khóa</strong>
                    <p>{proposal.result.completedVisitIds.length} lượt được giữ nguyên, không thể chỉnh sửa trong đề xuất này.</p>
                  </section>
                  <h3>Khác biệt so với hành trình hiện tại</h3>
                  {diff.added.length + diff.removed.length + diff.updated.length === 0 ? (
                    <p className={styles.help}>Đề xuất không thay đổi các lượt trong hành trình.</p>
                  ) : (
                    <ul className={styles.diffList}>
                      {diff.added.map(visit => (
                        <li key={`added-${visit.visitId}`}><strong>Thêm:</strong> {proposalVisitDescription(visit, destinationLabels)}</li>
                      ))}
                      {diff.removed.map(visit => (
                        <li key={`removed-${visit.visitId}`}><strong>Bỏ:</strong> {proposalVisitDescription(visit, destinationLabels)}</li>
                      ))}
                      {diff.updated.map(change => (
                        <li key={`updated-${change.visitId}`}>
                          <strong>Điều chỉnh:</strong> {proposalVisitDescription(change.before, destinationLabels)}
                          <span className={styles.diffArrow} aria-hidden="true"> → </span>
                          {proposalVisitDescription(change.after, destinationLabels)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {proposal.result.mandatoryEndpoint && (
                    <section className={styles.endpointNotice}>
                      <h3>Điểm kết thúc bắt buộc</h3>
                      <p>{proposalDestinationLabel(proposal.result.mandatoryEndpoint.destinationId, destinationLabels)} · Hạn {proposal.result.mandatoryEndpoint.deadline}</p>
                      <p>Chưa kiểm tra khả thi thời gian; cần Validator xác nhận ở bước tiếp theo.</p>
                    </section>
                  )}
                </div>
              );
            })()}
            {proposal.status === "NEEDS_CLARIFICATION" && (
              <div className={styles.proposalContent}>
                {accumulatedResolution.selectedDestinationLabel && (
                  <div style={{ marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.375rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.875rem", color: "#166534" }}>
                      Đã chọn: <strong>{accumulatedResolution.selectedDestinationLabel}</strong>
                    </span>
                    <button
                      type="button"
                      style={{ fontSize: "0.75rem", color: "#047857", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                      disabled={isRequesting}
                      onClick={() => {
                        setAccumulatedResolution({});
                        void requestProposal();
                      }}
                    >
                      (Đổi điểm khác)
                    </button>
                  </div>
                )}
                <p className={styles.proposalStatus} role="status" aria-live="polite">{proposal.result.clarification.prompt}</p>
                {proposal.result.clarification.choices && proposal.result.clarification.choices.length > 0 && (
                  <div className={styles.clarificationChoices} role="group" aria-label="Lựa chọn làm rõ">
                    {proposal.result.clarification.choices.map((choice, index) => (
                      <button
                        key={`${choice.label}-${index}`}
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isRequesting}
                        onClick={() => {
                          const merged = { ...accumulatedResolution, ...choice.resolution };
                          if (choice.resolution.selectedDestinationId) {
                            merged.selectedDestinationLabel = choice.label;
                          }
                          setAccumulatedResolution(merged);
                          void requestProposal(merged);
                        }}
                      >
                        {isRequesting ? "Đang xử lý…" : choice.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {proposal.status === "ALL_COMPLETED" && (
              <p className={styles.proposalStatus} role="status" aria-live="polite">Không còn lượt theo lịch chưa hoàn thành để đề xuất lại.</p>
            )}
            {proposal.status === "AI_ERROR" && (
              <p className={styles.proposalError} role="alert" aria-live="assertive">{proposal.message}</p>
            )}
            {proposal.status === "NETWORK_ERROR" && (
              <p className={styles.proposalError} role="alert" aria-live="assertive">Không kết nối được tới máy chủ. Vị trí và nhu cầu vẫn được giữ; hãy thử lại.</p>
            )}
            {proposal.status === "TIMEOUT" && (
              <p className={styles.proposalError} role="alert" aria-live="assertive">Yêu cầu đã hết thời gian chờ. Vị trí và nhu cầu vẫn được giữ; hãy thử lại.</p>
            )}
            {proposal.status === "FAILED" && (
              <p className={styles.proposalError} role="alert" aria-live="assertive">{proposal.message}</p>
            )}
            {proposal.status === "PROPOSED" && (
              <div className={styles.proposalActions}>
                <p className={styles.help}>Hệ thống sẽ kiểm tra lại các ràng buộc ngay khi bạn xác nhận.</p>
                {assistantState.validation.status === "CHECKING" && (
                  <p className={styles.proposalStatus} role="status" aria-live="polite">Đang kiểm tra phương án…</p>
                )}
                {assistantState.validation.status === "FAILED" && (
                  <p className={styles.proposalError} role="alert" aria-live="assertive">{assistantState.validation.message}</p>
                )}
                {assistantState.apply.status === "FAILED" && (
                  <p className={styles.proposalError} role="alert" aria-live="assertive">
                    {assistantState.apply.message}{assistantState.apply.code ? ` (${assistantState.apply.code})` : ""}
                  </p>
                )}
                {assistantState.apply.status === "UNKNOWN" && (
                  <div className={styles.proposalError} role="status" aria-live="polite">
                    <p>Chưa xác định được kết quả xác nhận. Hãy thử lại cùng yêu cầu; không tạo xác nhận mới.</p>
                    <button className={styles.secondaryButton} type="button" onClick={retryApply}>Thử lại xác nhận</button>
                  </div>
                )}
                {shownCheckedAt && <p className={styles.checkedAt}>Kiểm tra lúc {checkedTimeLabel(shownCheckedAt)}</p>}
                {shownValidation && (
                  <TripValidationPanel
                    validation={shownValidation}
                    onConfirm={canConfirm ? confirmProposal : undefined}
                    pending={assistantState.apply.status === "APPLYING"}
                    actionLabel="Xác nhận"
                  />
                )}
                <div className={styles.proposalButtonRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={mutationPending || assistantState.validation.status === "CHECKING"}
                    onClick={() => void runPreview(assistantState)}
                  >
                    {assistantState.validation.status === "CHECKING" ? "Đang kiểm tra…" : "Kiểm tra lại"}
                  </button>
                  <button className={styles.secondaryButton} type="button" disabled={mutationPending} onClick={cancelProposal}>
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
