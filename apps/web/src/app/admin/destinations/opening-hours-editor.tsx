"use client";
import React, { useState } from "react";
import {
  Clock3,
  Plus,
  Trash2,
  CircleHelp,
  CircleOff,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  Pencil,
} from "lucide-react";
import {
  weekdayLabels,
  type DestinationInput,
} from "@/modules/destination/destination-contract";

type Days = DestinationInput["openingDays"];

export default function OpeningHoursEditor({
  days,
  errors,
  onChange,
}: {
  days: Days;
  errors: Record<string, string>;
  onChange: (days: Days) => void;
}) {
  const [copyFrom, setCopyFrom] = useState("0");
  const [selectedTargets, setSelectedTargets] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [editingDay, setEditingDay] = useState<number | null>(0);

  function updateDay(index: number, value: Partial<Days[number]>) {
    onChange(days.map((day, i) => (i === index ? { ...day, ...value } : day)));
  }

  function updateTime(
    index: number,
    slot: number,
    key: "opensAt" | "closesAt",
    value: string,
  ) {
    updateDay(index, {
      intervals: days[index]!.intervals.map((item, j) =>
        j === slot ? { ...item, [key]: value } : item,
      ),
    });
  }

  function applySchedule(targetIndices: number[]) {
    if (targetIndices.length === 0) return;
    const source = days[Number(copyFrom)]!;
    const overwriting = targetIndices.some(
      (idx) => days[idx]?.status === "OPEN" && days[idx]?.intervals.length > 0,
    );
    if (
      overwriting &&
      !window.confirm(
        `Áp dụng lịch của ${weekdayLabels[Number(copyFrom)]} cho ${targetIndices.length} ngày đã chọn? Lịch hiện có của các ngày này sẽ bị ghi đè.`,
      )
    ) {
      return;
    }

    onChange(
      days.map((d, i) =>
        targetIndices.includes(i)
          ? {
              ...d,
              status: source.status,
              intervals: source.intervals.map((interval) => ({ ...interval })),
            }
          : d,
      ),
    );
  }

  const formatIntervalsSummary = (day: Days[number]) => {
    if (day.status === "CLOSED") return "Đóng cửa cả ngày";
    if (day.status === "UNKNOWN") return "Chưa có thông tin giờ";
    if (day.intervals.length === 0) return "Chưa nhập khung giờ";
    return day.intervals
      .map((item) => {
        const from = item.opensAt || "--:--";
        const to = item.closesAt || "--:--";
        return `${from} – ${to}`;
      })
      .join(", ");
  };

  return (
    <div className="destination-week af-opening-hours-root">
      {/* ── Schedule Copy Tool Bar ────────────────────────────────────────── */}
      <div
        className="af-hours-copy-card"
        style={{
          border: "1px solid var(--af-line)",
          borderRadius: 10,
          padding: "14px 16px",
          background: "var(--af-surface)",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--af-ink)" }}>
              Sao chép lịch từ
            </span>
            <label htmlFor="hours-copy-from" className="sr-only">
              Sao chép lịch từ ngày
            </label>
            <select
              id="hours-copy-from"
              className="af-select"
              style={{ width: "auto", minHeight: 36, padding: "4px 10px", fontSize: 13 }}
              value={copyFrom}
              onChange={(e) => {
                const src = e.target.value;
                setCopyFrom(src);
                setSelectedTargets(
                  [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== Number(src)),
                );
              }}
            >
              {weekdayLabels.map((label, i) => (
                <option value={i} key={label}>
                  {label} ({days[i]?.status === "OPEN" ? "Mở cửa" : days[i]?.status === "CLOSED" ? "Đóng" : "Chưa rõ"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", maxWidth: "100%" }}>
            <button
              type="button"
              className="af-btn"
              style={{ minHeight: 36, fontSize: 13, padding: "6px 12px" }}
              onClick={() => setShowCopyPanel(!showCopyPanel)}
            >
              <Copy size={14} aria-hidden="true" />
              {showCopyPanel ? "Thu gọn tùy chọn" : "Tùy chọn ngày sao chép…"}
            </button>
            <button
              type="button"
              className="af-btn af-btn-primary"
              style={{ minHeight: 36, fontSize: 13, padding: "6px 14px" }}
              onClick={() => {
                const targets = showCopyPanel
                  ? selectedTargets
                  : [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== Number(copyFrom));
                applySchedule(targets);
              }}
            >
              Áp dụng cho các ngày còn lại
            </button>
          </div>
        </div>

        {/* Selective copy panel */}
        {showCopyPanel && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px dashed var(--af-line)",
              fontSize: 13,
            }}
          >
            <p style={{ margin: "0 0 10px", color: "var(--af-muted)", fontSize: 12 }}>
              Chọn các ngày cần áp dụng lịch từ <strong>{weekdayLabels[Number(copyFrom)]}</strong>:
            </p>

            {/* Presets */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                type="button"
                className="af-btn"
                style={{ minHeight: 28, fontSize: 11, padding: "2px 8px" }}
                onClick={() =>
                  setSelectedTargets([0, 1, 2, 3, 4].filter((i) => i !== Number(copyFrom)))
                }
              >
                Thứ Hai – Thứ Sáu
              </button>
              <button
                type="button"
                className="af-btn"
                style={{ minHeight: 28, fontSize: 11, padding: "2px 8px" }}
                onClick={() =>
                  setSelectedTargets([5, 6].filter((i) => i !== Number(copyFrom)))
                }
              >
                Cuối tuần (T7, CN)
              </button>
              <button
                type="button"
                className="af-btn"
                style={{ minHeight: 28, fontSize: 11, padding: "2px 8px" }}
                onClick={() =>
                  setSelectedTargets([0, 1, 2, 3, 4, 5, 6].filter((i) => i !== Number(copyFrom)))
                }
              >
                Tất cả các ngày
              </button>
              <button
                type="button"
                className="af-btn"
                style={{ minHeight: 28, fontSize: 11, padding: "2px 8px" }}
                onClick={() => setSelectedTargets([])}
              >
                Bỏ chọn
              </button>
            </div>

            {/* Checkboxes per day */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {weekdayLabels.map((lbl, idx) => {
                if (idx === Number(copyFrom)) return null;
                const checked = selectedTargets.includes(idx);
                return (
                  <label
                    key={lbl}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      cursor: "pointer",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: checked ? "var(--af-green-light)" : "var(--af-tint)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedTargets((prev) =>
                          e.target.checked
                            ? [...prev, idx]
                            : prev.filter((i) => i !== idx),
                        );
                      }}
                    />
                    {lbl}
                  </label>
                );
              })}
            </div>

            {selectedTargets.length > 0 && (
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 12,
                  color: "var(--af-green)",
                  fontWeight: 600,
                }}
              >
                Sẽ cập nhật {selectedTargets.length} ngày:{" "}
                {selectedTargets.map((i) => weekdayLabels[i]).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── 7-Day Schedule Overview & Detail Accordion ───────────────────── */}
      <div style={{ display: "grid", gap: 8 }}>
        {days.map((day, index) => {
          const dayErrors = Object.entries(errors).filter(
            ([path]) =>
              path === "openingDays" ||
              path.startsWith(`openingDays.${index}.`) ||
              path === `openingDays.${index}`,
          );
          const isEditing = editingDay === index || dayErrors.length > 0;
          const statusBadge =
            day.status === "OPEN" ? (
              <span className="af-badge af-badge-visible" style={{ fontSize: 11 }}>
                Mở cửa
              </span>
            ) : day.status === "CLOSED" ? (
              <span className="af-badge af-badge-hidden" style={{ fontSize: 11, background: "#fee2e2", color: "#991b1b" }}>
                Đóng cửa
              </span>
            ) : (
              <span className="af-badge af-badge-hidden" style={{ fontSize: 11 }}>
                Chưa có dữ liệu
              </span>
            );

          return (
            <fieldset
              key={day.dayOfWeek}
              className={`destination-day is-${day.status.toLowerCase()}${isEditing ? " is-active-day" : ""}`}
              style={{
                border: "1px solid var(--af-line)",
                borderRadius: 10,
                padding: "12px",
                maxWidth: "100%",
                boxSizing: "border-box",
                background: isEditing
                  ? "var(--af-surface)"
                  : day.status === "OPEN"
                    ? "color-mix(in srgb, var(--af-green-light) 40%, var(--af-surface))"
                    : "var(--af-surface)",
                transition: "all 0.15s ease",
              }}
            >
              <legend className="destination-sr-only">
                {weekdayLabels[index]}
              </legend>

              {/* Compact row header */}
              <div
                className="destination-day-heading"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  cursor: "pointer",
                }}
                onClick={() => setEditingDay(isEditing ? null : index)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, flex: "1 1 auto" }}>
                  <strong style={{ fontSize: 13.5, color: "var(--af-ink)" }}>
                    {weekdayLabels[index]}
                  </strong>
                  {statusBadge}
                  <span
                    className="destination-day-caption"
                    style={{
                      fontSize: 12,
                      color: "var(--af-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                      margin: 0,
                    }}
                  >
                    {formatIntervalsSummary(day)}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    flexShrink: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <label
                    className="destination-sr-only"
                    htmlFor={`status-${index}`}
                  >
                    Trạng thái {weekdayLabels[index]}
                  </label>
                  <select
                    id={`status-${index}`}
                    className="af-select"
                    style={{ width: "auto", minHeight: 36, padding: "4px 8px", fontSize: 13 }}
                    value={day.status}
                    aria-invalid={dayErrors.length > 0}
                    aria-describedby={
                      dayErrors.length ? `day-error-${index}` : undefined
                    }
                    onChange={(event) => {
                      const status = event.target.value as typeof day.status;
                      updateDay(index, {
                        status,
                        intervals:
                          status === "OPEN"
                            ? [{ opensAt: "", closesAt: "" }]
                            : [],
                      });
                      if (status === "OPEN") setEditingDay(index);
                    }}
                  >
                    <option value="OPEN">Mở cửa</option>
                    <option value="CLOSED">Đóng cả ngày</option>
                    <option value="UNKNOWN">Chưa có dữ liệu</option>
                  </select>

                  <button
                    type="button"
                    className="af-btn"
                    style={{ minHeight: 36, padding: "6px 10px", fontSize: 12 }}
                    onClick={() => setEditingDay(isEditing ? null : index)}
                    title={isEditing ? "Thu gọn ngày này" : "Chỉnh sửa khung giờ"}
                    aria-label={`Chỉnh sửa ${weekdayLabels[index]}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    <span className="sr-only">Chỉnh sửa</span>
                  </button>
                </div>
              </div>

              {day.status !== "OPEN" && (
                <p
                  className="destination-day-note"
                  style={{
                    margin: "8px 0 0",
                    fontSize: 12,
                    color: "var(--af-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {day.status === "CLOSED" ? (
                    <CircleOff size={14} aria-hidden="true" />
                  ) : (
                    <CircleHelp size={14} aria-hidden="true" />
                  )}
                  {day.status === "CLOSED"
                    ? "Điểm đến đóng cửa cả ngày này."
                    : "Chưa có dữ liệu. Không được coi là ngày đóng cửa."}
                </p>
              )}

              {/* Detail panel when expanded */}
              {isEditing && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid var(--af-line)",
                  }}
                >
                  {day.status === "OPEN" ? (
                    <div className="destination-day-times" style={{ margin: 0, padding: 0, border: 0 }}>
                      <p style={{ fontSize: 12, color: "var(--af-muted)", margin: "0 0 10px" }}>
                        Khung giờ hoạt động trong ngày:
                      </p>
                      {day.intervals.map((interval, slot) => (
                        <div
                          className="destination-interval"
                          key={slot}
                          style={{
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <div>
                            <label
                              htmlFor={`time-${index}-${slot}-opensAt`}
                              style={{ display: "block", fontSize: 11.5, color: "var(--af-muted)", marginBottom: 4 }}
                            >
                              Bắt đầu {slot + 1}
                            </label>
                            <div className="destination-time-wrap">
                              <Clock3 size={15} aria-hidden="true" />
                              <input
                                type="time"
                                step={60}
                                id={`time-${index}-${slot}-opensAt`}
                                value={interval.opensAt}
                                aria-invalid={dayErrors.length > 0}
                                aria-describedby={
                                  dayErrors.length ? `day-error-${index}` : undefined
                                }
                                onInput={(event) =>
                                  updateTime(
                                    index,
                                    slot,
                                    "opensAt",
                                    event.currentTarget.value,
                                  )
                                }
                                onChange={(event) =>
                                  updateTime(
                                    index,
                                    slot,
                                    "opensAt",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>

                          <span
                            className="destination-time-separator"
                            aria-hidden="true"
                            style={{ textAlign: "center", color: "var(--af-muted)", marginTop: 18 }}
                          >
                            —
                          </span>

                          <div>
                            <label
                              htmlFor={`time-${index}-${slot}-closesAt`}
                              style={{ display: "block", fontSize: 11.5, color: "var(--af-muted)", marginBottom: 4 }}
                            >
                              Kết thúc {slot + 1}
                            </label>
                            <div className="destination-time-wrap">
                              <Clock3 size={15} aria-hidden="true" />
                              {interval.closesAt === "24:00" ? (
                                <input
                                  id={`time-${index}-${slot}-closesAt`}
                                  value="24:00"
                                  readOnly
                                  aria-invalid={dayErrors.length > 0}
                                  aria-describedby={
                                    dayErrors.length
                                      ? `day-error-${index}`
                                      : undefined
                                  }
                                />
                              ) : (
                                <input
                                  type="time"
                                  step={60}
                                  id={`time-${index}-${slot}-closesAt`}
                                  value={interval.closesAt}
                                  aria-invalid={dayErrors.length > 0}
                                  aria-describedby={
                                    dayErrors.length
                                      ? `day-error-${index}`
                                      : undefined
                                  }
                                  onInput={(event) =>
                                    updateTime(
                                      index,
                                      slot,
                                      "closesAt",
                                      event.currentTarget.value,
                                    )
                                  }
                                  onChange={(event) =>
                                    updateTime(
                                      index,
                                      slot,
                                      "closesAt",
                                      event.target.value,
                                    )
                                  }
                                />
                              )}
                            </div>
                            <label className="destination-end-day" style={{ marginTop: 4 }}>
                              <input
                                type="checkbox"
                                aria-label={`Cuối ngày (24:00), khung giờ ${slot + 1} ${weekdayLabels[index]}`}
                                checked={interval.closesAt === "24:00"}
                                onChange={(event) =>
                                  updateTime(
                                    index,
                                    slot,
                                    "closesAt",
                                    event.target.checked ? "24:00" : "",
                                  )
                                }
                              />
                              Cuối ngày (24:00)
                            </label>
                          </div>

                          {day.intervals.length > 1 ? (
                            <button
                              className="destination-remove af-btn af-btn-danger"
                              type="button"
                              style={{ minHeight: 36, width: 36, padding: 0, marginTop: 18 }}
                              aria-label={`Xóa khung giờ ${slot + 1} ${weekdayLabels[index]}`}
                              onClick={() =>
                                updateDay(index, {
                                  intervals: day.intervals.filter(
                                    (_, j) => j !== slot,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          ) : (
                            <span style={{ width: 36 }} />
                          )}
                        </div>
                      ))}

                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button
                          className="destination-add-time af-btn af-btn-dashed"
                          type="button"
                          style={{ minHeight: 34, fontSize: 12.5 }}
                          disabled={day.intervals.length >= 24}
                          onClick={() =>
                            updateDay(index, {
                              intervals: [
                                ...day.intervals,
                                { opensAt: "", closesAt: "" },
                              ],
                            })
                          }
                        >
                          <Plus size={15} aria-hidden="true" />
                          Thêm khung giờ
                        </button>
                        <button
                          type="button"
                          className="af-btn"
                          style={{ minHeight: 34, fontSize: 12.5 }}
                          onClick={() => setEditingDay(null)}
                        >
                          Xong
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p className="destination-day-note" style={{ margin: 0 }}>
                        {day.status === "CLOSED" ? (
                          <CircleOff size={16} aria-hidden="true" />
                        ) : (
                          <CircleHelp size={16} aria-hidden="true" />
                        )}
                        {day.status === "CLOSED"
                          ? "Điểm đến đóng cửa cả ngày này."
                          : "Chưa có dữ liệu. Không được coi là ngày đóng cửa."}
                      </p>
                      <button
                        type="button"
                        className="af-btn"
                        style={{ minHeight: 32, fontSize: 12 }}
                        onClick={() => setEditingDay(null)}
                      >
                        Đóng panel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {dayErrors.length > 0 && (
                <p
                  id={`day-error-${index}`}
                  className="destination-error"
                  role="alert"
                >
                  {[...new Set(dayErrors.map(([, message]) => message))].join(
                    " ",
                  )}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
