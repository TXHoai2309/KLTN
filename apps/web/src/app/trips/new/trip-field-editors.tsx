"use client";

import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";
import {
  AlertTriangle,
  Bike,
  Baby,
  Camera,
  Calendar,
  Car,
  Clock,
  Compass,
  FileEdit,
  Gauge,
  Heart,
  Home,
  Landmark,
  Leaf,
  Mountain,
  PersonStanding,
  Shapes,
  Sparkles,
  User,
  Users,
  Utensils,
  Accessibility,
  Footprints,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useState, type Ref } from "react";
import { VietnameseDateInput } from "@/components/vietnamese-date-input";
import { formatVietnameseDate } from "@/lib/date-only";

import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
} from "@/modules/trip-requirement/trip-requirement-contract";

type CommonEditorProps = {
  idPrefix?: string;
  error?: string;
  errorId: string;
  disabled?: boolean;
};

function EditorError({ error, errorId }: Pick<CommonEditorProps, "error" | "errorId">) {
  if (!error) return null;
  return <p id={errorId} className="trip-field-error" role="alert">{error}</p>;
}

export type StartDateEditorProps = CommonEditorProps & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

export function StartDateEditor({
  idPrefix = "trip",
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: StartDateEditorProps) {
  const [showInput, setShowInput] = useState(Boolean(value) || idPrefix === "trip-review");
  const isCompact = idPrefix === "trip" && !showInput && !value;

  return (
    <div className={`trip-field trip-field-card ${isCompact ? "trip-date-compact-card" : ""}`}>
      {isCompact ? (
        <div className="trip-date-compact-bar">
          <div className="trip-date-compact-info">
            <span className="trip-field-icon-box" aria-hidden="true">
              <Calendar size={16} strokeWidth={2.2} />
            </span>
            <span className="trip-date-compact-label">
              Ngày đi: <strong>Chưa chốt</strong>
            </span>
            <span className="trip-date-divider" aria-hidden="true">·</span>
            <button
              type="button"
              className="trip-date-toggle-btn"
              onClick={() => setShowInput(true)}
            >
              Chọn ngày
            </button>
          </div>
          <span className="trip-optional">Tùy chọn ở bước sơ bộ</span>
          {/* Keep label & input in DOM for accessibility queries if needed */}
          <div className="trip-sr-only">
            <Label htmlFor={`${idPrefix}-start-date`}>Ngày bắt đầu</Label>
            <VietnameseDateInput
              ref={inputRef}
              id={`${idPrefix}-start-date`}
              name="startDate"
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              aria-describedby={`${idPrefix}-start-date-help${error ? ` ${errorId}` : ""}`}
              aria-invalid={Boolean(error)}
            />
            <p id={`${idPrefix}-start-date-help`}>dd/mm/yyyy</p>
          </div>
        </div>
      ) : (
        <>
          <div className="trip-field-label-row">
            <div className="trip-field-title-group">
              <span className="trip-field-icon-box" aria-hidden="true">
                <Calendar size={16} strokeWidth={2.2} />
              </span>
              <Label htmlFor={`${idPrefix}-start-date`} className="trip-field-title">
                Ngày bắt đầu
              </Label>
            </div>
            <div className="trip-date-action-pills">
              {idPrefix === "trip" && value && (
                <button
                  type="button"
                  className="trip-date-clear-pill"
                  onClick={() => {
                    onChange("");
                    setShowInput(false);
                  }}
                  title="Xóa ngày đã chọn, quay về chưa chốt"
                >
                  Chưa chốt ngày (Xóa)
                </button>
              )}
              {idPrefix === "trip" && !value && (
                <button
                  type="button"
                  className="trip-date-clear-pill"
                  onClick={() => setShowInput(false)}
                >
                  Thu gọn
                </button>
              )}
              <span className="trip-optional">Tùy chọn ở bước sơ bộ</span>
            </div>
          </div>
          <VietnameseDateInput
            ref={inputRef}
            id={`${idPrefix}-start-date`}
            name="startDate"
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            autoFocus={autoFocus || (idPrefix === "trip" && showInput)}
            aria-describedby={`${idPrefix}-start-date-help${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
          />
          <p id={`${idPrefix}-start-date-help`} className="trip-help">
            Nhập ngày/tháng/năm (dd/mm/yyyy), ví dụ 20/12/2026. Có thể bỏ trống ở bước đề xuất sơ bộ; cần có trước khi xác nhận và lưu chính thức.
          </p>
        </>
      )}
      <EditorError error={error} errorId={errorId} />
    </div>
  );
}

export type DurationEditorProps = CommonEditorProps & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

const DURATION_CHIPS = [
  { days: "2", label: "2N1Đ", hint: "2 ngày" },
  { days: "3", label: "3N2Đ", hint: "3 ngày" },
  { days: "4", label: "4N3Đ", hint: "4 ngày" },
  { days: "5", label: "5N4Đ", hint: "5 ngày" },
] as const;

export function DurationEditor({
  idPrefix = "trip",
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: DurationEditorProps) {
  return (
    <div className="trip-field trip-field-card">
      <div className="trip-field-label-row">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <Clock size={16} strokeWidth={2.2} />
          </span>
          <Label htmlFor={`${idPrefix}-duration`} className="trip-field-title">
            Thời lượng chuyến đi
          </Label>
        </div>
        <span className="trip-required">Bắt buộc</span>
      </div>

      <div className="trip-duration-chip-group" role="group" aria-label="Gợi ý số ngày">
        {DURATION_CHIPS.map((chip) => {
          const isSelected = value === chip.days;
          return (
            <button
              type="button"
              key={chip.days}
              aria-pressed={isSelected}
              className={`trip-duration-chip ${isSelected ? "trip-duration-chip-active" : ""}`}
              onClick={() => {
                onChange(chip.days);
                onBlur?.();
              }}
            >
              <span className="trip-duration-chip-label">{chip.label}</span>
              <span className="trip-duration-chip-days">{chip.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="trip-input-with-suffix">
        <Input
          ref={inputRef}
          id={`${idPrefix}-duration`}
          name="durationDays"
          type="text"
          inputMode="numeric"
          maxLength={3}
          placeholder="Hoặc nhập số ngày (1–14)"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoFocus={autoFocus}
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={`${idPrefix}-duration-help${error ? ` ${errorId}` : ""}`}
        />
        <span className="trip-input-suffix-text">ngày</span>
      </div>
      <p id={`${idPrefix}-duration-help`} className="trip-help">Số ngày từ 1 đến 14.</p>
      <EditorError error={error} errorId={errorId} />
    </div>
  );
}

export type TransportEditorProps = CommonEditorProps & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  containerRef?: Ref<HTMLFieldSetElement>;
  autoFocus?: boolean;
};

export function TransportEditor({
  idPrefix = "trip",
  value,
  onChange,
  onBlur,
  inputRef,
  containerRef,
  error,
  errorId,
}: TransportEditorProps) {
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");

  return (
    <fieldset
      ref={containerRef}
      id={`${idPrefix}-transport`}
      className="trip-fieldset trip-fieldset-card"
      tabIndex={containerRef ? -1 : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="trip-field-legend">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <Compass size={16} strokeWidth={2.2} />
          </span>
          <span className="trip-field-title">Phương tiện di chuyển</span>
        </div>
        <span className="trip-required">Bắt buộc</span>
      </legend>
      <p className="trip-help">Chọn một phương tiện; hệ thống không tự chọn thay bạn.</p>
      <div className="trip-choice-grid trip-choice-grid-two">
        {TRANSPORT_OPTIONS.map((option, index) => {
          const isSelected = value === option.value;
          return (
            <label className={`trip-choice trip-choice-transport ${isSelected ? "trip-choice-active" : ""}`} key={option.value}>
              <input
                ref={index === 0 ? inputRef : undefined}
                type="radio"
                name={`${idPrefix}-transport`}
                value={option.value}
                checked={value === option.value}
                onChange={(event) => {
                  onChange(event.target.value);
                  setSelectionAnnouncement(`Bạn đã chọn ${option.label}`);
                }}
                onBlur={onBlur}
                aria-required="true"
                aria-invalid={Boolean(error)}
              />
              <span className="trip-choice-content">
                <span className="trip-choice-visual-icon" aria-hidden="true">
                  {option.value === "MOTORCYCLE" ? <Bike size={24} strokeWidth={2.2} /> : <Car size={24} strokeWidth={2.2} />}
                </span>
                <span className="trip-choice-info">
                  <strong className="trip-choice-name">{option.label}</strong>
                  <small className="trip-choice-sub">{option.description}</small>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <EditorError error={error} errorId={errorId} />
      <span className="trip-sr-only" role="status" aria-live="polite">{selectionAnnouncement}</span>
    </fieldset>
  );
}

export type CompanionsEditorProps = CommonEditorProps & {
  typeValue: string;
  groupSizeValue: string;
  onTypeChange: (value: string) => void;
  onGroupSizeChange: (value: string) => void;
  onTypeBlur?: () => void;
  onGroupSizeBlur?: () => void;
  typeError?: string;
  typeErrorId: string;
  groupSizeError?: string;
  groupSizeErrorId: string;
  typeRef?: Ref<HTMLInputElement>;
  groupSizeRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

export function CompanionsEditor({
  idPrefix = "trip",
  typeValue,
  groupSizeValue,
  onTypeChange,
  onGroupSizeChange,
  onTypeBlur,
  onGroupSizeBlur,
  typeError,
  typeErrorId,
  groupSizeError,
  groupSizeErrorId,
  typeRef,
  groupSizeRef,
  autoFocus,
}: CompanionsEditorProps) {
  const needsGroupSize = typeValue === "FAMILY" || typeValue === "FRIENDS" || typeValue === "OTHER";
  const hasError = Boolean(typeError || (needsGroupSize && groupSizeError));

  function handleSelectType(val: string) {
    if (typeValue === val) {
      // Toggle off / deselect
      onTypeChange("");
      onGroupSizeChange("");
      onTypeBlur?.();
      return;
    }
    onTypeChange(val);
    if (val === "SOLO") {
      onGroupSizeChange("1");
    } else if (val === "COUPLE") {
      onGroupSizeChange("2");
    } else {
      const current = Number.parseInt(groupSizeValue, 10);
      if (Number.isNaN(current) || current < 2) {
        onGroupSizeChange("4");
      }
    }
    onTypeBlur?.();
  }

  function adjustGroupSize(delta: number) {
    const current = Number.parseInt(groupSizeValue, 10);
    const base = Number.isNaN(current) || current < 2 ? 4 : current;
    const next = Math.max(2, Math.min(20, base + delta));
    onGroupSizeChange(String(next));
    onGroupSizeBlur?.();
  }

  function getCompanionIcon(val: string) {
    switch (val) {
      case "SOLO":
        return <User size={20} strokeWidth={2} />;
      case "COUPLE":
        return <Heart size={20} strokeWidth={2} />;
      case "FAMILY":
        return <Home size={20} strokeWidth={2} />;
      case "FRIENDS":
        return <Users size={20} strokeWidth={2} />;
      default:
        return <Shapes size={20} strokeWidth={2} />;
    }
  }

  return (
    <fieldset
      id={`${idPrefix}-companion-type`}
      className="trip-fieldset trip-fieldset-card"
      aria-describedby={hasError ? [typeError ? typeErrorId : "", needsGroupSize && groupSizeError ? groupSizeErrorId : ""].filter(Boolean).join(" ") : undefined}
    >
      <legend className="trip-field-legend">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <Users size={16} strokeWidth={2.2} />
          </span>
          <span className="trip-field-title">Người đồng hành</span>
        </div>
        <span className="trip-optional">Tùy chọn</span>
      </legend>
      <p className="trip-help">Chọn nhóm người cùng đi (bấm lại để bỏ chọn). Để trống nếu chưa chốt.</p>

      <div className="trip-choice-grid trip-choice-grid-companions">
        {COMPANION_OPTIONS.map((option, index) => {
          const isSelected = typeValue === option.value;
          return (
            <label
              className={`trip-choice trip-choice-compact ${isSelected ? "trip-choice-active" : ""}`}
              key={option.value}
              title={option.description}
            >
              <input
                ref={index === 0 ? typeRef : undefined}
                type="radio"
                name={`${idPrefix}-companionType`}
                value={option.value}
                checked={isSelected}
                onClick={() => handleSelectType(option.value)}
                onChange={() => {}}
                onBlur={onTypeBlur}
                autoFocus={autoFocus && index === 0}
                aria-invalid={Boolean(typeError)}
                aria-describedby={typeError ? typeErrorId : undefined}
              />
              <span className="trip-choice-content">
                <span className="trip-choice-visual-icon" aria-hidden="true">
                  {getCompanionIcon(option.value)}
                </span>
                <span className="trip-choice-info">
                  <strong className="trip-choice-name">{option.label}</strong>
                  <span className="trip-sr-only">{option.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {needsGroupSize && (
        <div className="trip-field trip-nested-field">
          <div className="trip-field-label-row">
            <Label htmlFor={`${idPrefix}-group-size`}>
              <span className="trip-nested-label-text">Số người trong nhóm</span>
              <span className="trip-optional">Tùy chọn (từ 2 đến 20)</span>
            </Label>
          </div>
          <div className="trip-group-size-controls">
            <button
              type="button"
              className="trip-stepper-button"
              onClick={() => adjustGroupSize(-1)}
              aria-label="Giảm 1 người"
            >
              −
            </button>
            <Input
              ref={groupSizeRef}
              id={`${idPrefix}-group-size`}
              name="companionGroupSize"
              type="text"
              inputMode="numeric"
              placeholder="Số người"
              value={groupSizeValue}
              onChange={(event) => onGroupSizeChange(event.target.value)}
              onBlur={onGroupSizeBlur}
              aria-invalid={Boolean(groupSizeError)}
              aria-describedby={groupSizeError ? groupSizeErrorId : undefined}
            />
            <button
              type="button"
              className="trip-stepper-button"
              onClick={() => adjustGroupSize(1)}
              aria-label="Tăng 1 người"
            >
              +
            </button>
          </div>
          <EditorError error={groupSizeError} errorId={groupSizeErrorId} />
        </div>
      )}

      <EditorError error={typeError} errorId={typeErrorId} />
    </fieldset>
  );
}

export type InterestsEditorProps = CommonEditorProps & {
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

const INTEREST_ICONS: Record<string, LucideIcon> = {
  NATURE: Mountain,
  CULTURE_HISTORY: Landmark,
  ETHNIC_VILLAGES: Home,
  PHOTOGRAPHY: Camera,
  FOOD: Utensils,
  ADVENTURE: Compass,
  RELAXATION: Leaf,
};

export function InterestsEditor({
  idPrefix = "trip",
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: InterestsEditorProps) {
  return (
    <fieldset
      id={`${idPrefix}-interest-first`}
      className="trip-fieldset trip-fieldset-card"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="trip-field-legend">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <Sparkles size={16} strokeWidth={2.2} />
          </span>
          <span className="trip-field-title">Sở thích chuyến đi</span>
        </div>
        <span className="trip-optional">Tùy chọn</span>
        <span className="trip-selection-counter">Đã chọn {value.length} sở thích</span>
      </legend>
      <p className="trip-help">Chọn những trải nghiệm bạn quan tâm. Bạn có thể để trống và bổ sung sau.</p>
      <div className="trip-choice-grid trip-choice-grid-interests">
        {INTEREST_OPTIONS.map((option, index) => {
          const isSelected = value.includes(option.value);
          const Icon = INTEREST_ICONS[option.value] ?? Compass;
          return (
            <label
              className={`trip-choice trip-choice-chip ${isSelected ? "trip-choice-chip-selected" : ""}`}
              key={option.value}
              title={option.description}
            >
              <input
                ref={index === 0 ? inputRef : undefined}
                type="checkbox"
                name="interests"
                value={option.value}
                checked={isSelected}
                onChange={() =>
                  onChange(
                    isSelected
                      ? value.filter((item) => item !== option.value)
                      : [...value, option.value],
                  )
                }
                onBlur={onBlur}
                autoFocus={autoFocus && index === 0}
                aria-invalid={Boolean(error)}
              />
              <span className="trip-chip-content">
                <span className="trip-chip-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="trip-chip-texts">
                  <strong className="trip-chip-title">{option.label}</strong>
                  <span className="trip-sr-only">{option.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <EditorError error={error} errorId={errorId} />
    </fieldset>
  );
}

export type PaceEditorProps = CommonEditorProps & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

const PACE_META: Record<string, { Icon: LucideIcon; spots: string }> = {
  RELAXED: { Icon: Leaf, spots: "1–2 điểm/ngày" },
  LEISURELY: { Icon: Leaf, spots: "1–2 điểm/ngày" },
  MODERATE: { Icon: Gauge, spots: "2–3 điểm/ngày" },
  PACKED: { Icon: Compass, spots: "3–4 điểm/ngày" },
};

export function PaceEditor({
  idPrefix = "trip",
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: PaceEditorProps) {
  return (
    <fieldset
      id={`${idPrefix}-pace`}
      className="trip-fieldset trip-fieldset-card"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="trip-field-legend">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <Gauge size={16} strokeWidth={2.2} />
          </span>
          <span className="trip-field-title">Nhịp độ chuyến đi</span>
        </div>
        <span className="trip-optional">Tùy chọn</span>
      </legend>
      <p className="trip-help">Chọn tốc độ di chuyển mong muốn trên hành trình.</p>
      <div className="trip-choice-grid trip-choice-grid-pace">
        {PACE_OPTIONS.map((option, index) => {
          const isSelected = value === option.value;
          const meta = PACE_META[option.value];
          const Icon = meta?.Icon ?? Compass;
          return (
            <label
              className={`trip-choice trip-choice-pace ${isSelected ? "trip-choice-active" : ""}`}
              key={option.value}
              title={option.description}
            >
              <input
                ref={index === 0 ? inputRef : undefined}
                type="radio"
                name={`${idPrefix}-pace`}
                value={option.value}
                checked={isSelected}
                onClick={() => {
                  if (isSelected) onChange("");
                  else onChange(option.value);
                }}
                onChange={() => {}}
                onBlur={onBlur}
                autoFocus={autoFocus && index === 0}
                aria-invalid={Boolean(error)}
              />
              <span className="trip-choice-content">
                <span className="trip-choice-visual-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="trip-choice-info">
                  <div className="trip-pace-header-line">
                    <strong className="trip-choice-name">{option.label}</strong>
                    {meta?.spots && <span className="trip-pace-spots-tag">{meta.spots}</span>}
                  </div>
                  <span className="trip-sr-only">{option.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <EditorError error={error} errorId={errorId} />
    </fieldset>
  );
}

export type MobilityEditorProps = CommonEditorProps & {
  flags: string[];
  note: string;
  onFlagsChange: (value: string[]) => void;
  onNoteChange: (value: string) => void;
  onFlagsBlur?: () => void;
  onNoteBlur?: () => void;
  flagsError?: string;
  flagsErrorId: string;
  noteError?: string;
  noteErrorId: string;
  inputRef?: Ref<HTMLInputElement>;
  noteRef?: Ref<HTMLTextAreaElement>;
  autoFocus?: boolean;
};

const MOBILITY_ICONS: Record<string, LucideIcon> = {
  AVOID_LONG_WALKING: Footprints,
  NO_STEEP_TERRAIN: Mountain,
  WHEELCHAIR_OR_MOBILITY_AID: Accessibility,
  YOUNG_CHILDREN: Baby,
  SENIORS: PersonStanding,
  MOTION_SICKNESS: Waves,
};

export function MobilityEditor({
  idPrefix = "trip",
  flags,
  note,
  onFlagsChange,
  onNoteChange,
  onFlagsBlur,
  onNoteBlur,
  flagsError,
  flagsErrorId,
  noteError,
  noteErrorId,
  inputRef,
  noteRef,
  autoFocus,
}: MobilityEditorProps) {
  const [showNote, setShowNote] = useState(Boolean(note.trim()) || Boolean(noteError));
  const hasError = Boolean(flagsError || (showNote && noteError));

  return (
    <fieldset
      id={`${idPrefix}-mobility-first`}
      className="trip-fieldset trip-fieldset-card"
      aria-describedby={hasError ? [flagsError ? flagsErrorId : "", showNote && noteError ? noteErrorId : ""].filter(Boolean).join(" ") : undefined}
    >
      <legend className="trip-field-legend">
        <div className="trip-field-title-group">
          <span className="trip-field-icon-box" aria-hidden="true">
            <AlertTriangle size={16} strokeWidth={2.2} />
          </span>
          <span className="trip-field-title">Ràng buộc di chuyển</span>
        </div>
        <span className="trip-optional">Tùy chọn</span>
      </legend>
      <p className="trip-help">Chọn điều cần lưu ý để lịch trình được điều chỉnh địa hình và thời gian phù hợp.</p>

      <div className="trip-choice-grid trip-choice-grid-mobility">
        {MOBILITY_CONSTRAINT_OPTIONS.map((option, index) => {
          const isSelected = flags.includes(option.value);
          const Icon = MOBILITY_ICONS[option.value] ?? Accessibility;
          return (
            <label
              className={`trip-choice trip-choice-mobility-chip ${isSelected ? "trip-choice-active" : ""}`}
              key={option.value}
              title={option.description}
            >
              <input
                ref={index === 0 ? inputRef : undefined}
                type="checkbox"
                name="mobilityFlags"
                value={option.value}
                checked={isSelected}
                onChange={() =>
                  onFlagsChange(
                    isSelected
                      ? flags.filter((item) => item !== option.value)
                      : [...flags, option.value],
                  )
                }
                onBlur={onFlagsBlur}
                autoFocus={autoFocus && index === 0}
                aria-invalid={Boolean(flagsError)}
              />
              <span className="trip-chip-content">
                <span className="trip-chip-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="trip-chip-texts">
                  <strong className="trip-chip-title">{option.label}</strong>
                  <span className="trip-sr-only">{option.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="trip-mobility-note-section">
        {!showNote && !note.trim() ? (
          <button
            type="button"
            className="trip-add-note-btn"
            onClick={() => setShowNote(true)}
          >
            + Thêm ghi chú
          </button>
        ) : (
          <div className="trip-field trip-nested-field">
            <div className="trip-field-label-row">
              <div className="trip-field-title-group">
                <span className="trip-field-icon-box" aria-hidden="true">
                  <FileEdit size={15} strokeWidth={2.2} />
                </span>
                <Label htmlFor={`${idPrefix}-mobility-note`} className="trip-field-title">
                  Ghi chú thêm
                </Label>
              </div>
              <div className="trip-note-header-actions">
                <button
                  type="button"
                  className="trip-note-close-btn"
                  onClick={() => {
                    onNoteChange("");
                    setShowNote(false);
                  }}
                >
                  Xóa / Thu gọn
                </button>
                <span className="trip-optional">Tùy chọn</span>
              </div>
            </div>
            <textarea
              ref={noteRef}
              id={`${idPrefix}-mobility-note`}
              name="mobilityNote"
              className="trip-textarea resize-none"
              value={note}
              maxLength={500}
              placeholder="Ví dụ: Muốn ghé chợ phiên Đồng Văn sáng Chủ Nhật, ưu tiên homestay nhìn ra thung lũng..."
              onChange={(event) => onNoteChange(event.target.value)}
              onBlur={onNoteBlur}
              aria-describedby={`${idPrefix}-mobility-note-help${noteError ? ` ${noteErrorId}` : ""}`}
              aria-invalid={Boolean(noteError)}
            />
            <p id={`${idPrefix}-mobility-note-help`} className="trip-help trip-character-count">
              Còn {500 - note.length} ký tự
            </p>
            <EditorError error={noteError} errorId={noteErrorId} />
          </div>
        )}
      </div>

      <EditorError error={flagsError} errorId={flagsErrorId} />
    </fieldset>
  );
}
