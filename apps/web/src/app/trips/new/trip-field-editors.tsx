"use client";

import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";
import { useState, type Ref } from "react";

import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
} from "@/modules/trip-requirement/trip-requirement-contract";

type CommonEditorProps = {
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
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: StartDateEditorProps) {
  return (
    <div className="trip-field">
      <Label htmlFor="trip-start-date">Ngày bắt đầu <span className="trip-optional">Tùy chọn ở bước sơ bộ</span></Label>
      <Input
        ref={inputRef}
        id="trip-start-date"
        name="startDate"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-describedby={`trip-start-date-help${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
      />
      <p id="trip-start-date-help" className="trip-help">Có thể bỏ trống ở bước đề xuất sơ bộ; cần có trước khi xác nhận và lưu chính thức.</p>
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

export function DurationEditor({
  value,
  onChange,
  onBlur,
  inputRef,
  autoFocus,
  error,
  errorId,
}: DurationEditorProps) {
  return (
    <div className="trip-field">
      <Label htmlFor="trip-duration">Thời lượng chuyến đi <span className="trip-required">Bắt buộc</span></Label>
      <Input
        ref={inputRef}
        id="trip-duration"
        name="durationDays"
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-required="true"
        aria-invalid={Boolean(error)}
        aria-describedby={`trip-duration-help${error ? ` ${errorId}` : ""}`}
      />
      <p id="trip-duration-help" className="trip-help">Số ngày từ 1 đến 14.</p>
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
      id="trip-transport"
      className="trip-fieldset"
      tabIndex={containerRef ? -1 : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>Phương tiện di chuyển <span className="trip-required">Bắt buộc</span></legend>
      <p className="trip-help">Chọn một phương tiện; hệ thống không tự chọn thay bạn.</p>
      <div className="trip-choice-grid trip-choice-grid-two">
        {TRANSPORT_OPTIONS.map((option, index) => (
          <label className="trip-choice" key={option.value}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="radio"
              name="transport"
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
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
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
  const hasError = Boolean(typeError || groupSizeError);
  return (
    <fieldset id="trip-companion-type" className="trip-fieldset" aria-describedby={hasError ? [typeError ? typeErrorId : "", groupSizeError ? groupSizeErrorId : ""].filter(Boolean).join(" ") : undefined}>
      <legend>Người đồng hành <span className="trip-optional">Tùy chọn</span></legend>
      <div className="trip-choice-grid trip-choice-grid-wrap">
        <label className="trip-choice trip-choice-compact">
          <input
            type="radio"
            name="companionType"
            value=""
            checked={typeValue === ""}
            onChange={() => onTypeChange("")}
            autoFocus={autoFocus}
          />
          <span><strong>Chưa chọn</strong></span>
        </label>
        {COMPANION_OPTIONS.map((option, index) => (
          <label className="trip-choice trip-choice-compact" key={option.value}>
            <input
              ref={index === 0 ? typeRef : undefined}
              type="radio"
              name="companionType"
              value={option.value}
              checked={typeValue === option.value}
              onChange={(event) => onTypeChange(event.target.value)}
              onBlur={onTypeBlur}
              autoFocus={autoFocus && index === 0}
              aria-invalid={Boolean(typeError)}
              aria-describedby={typeError ? typeErrorId : undefined}
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </div>
      <div className="trip-field trip-nested-field">
        <Label htmlFor="trip-group-size">Số người trong nhóm <span className="trip-optional">Tùy chọn</span></Label>
        <Input
          ref={groupSizeRef}
          id="trip-group-size"
          name="companionGroupSize"
          type="text"
          inputMode="numeric"
          value={groupSizeValue}
          disabled={!typeValue}
          onChange={(event) => onGroupSizeChange(event.target.value)}
          onBlur={onGroupSizeBlur}
          aria-invalid={Boolean(groupSizeError)}
          aria-describedby={groupSizeError ? groupSizeErrorId : undefined}
        />
      </div>
      <EditorError error={typeError} errorId={typeErrorId} />
      <EditorError error={groupSizeError} errorId={groupSizeErrorId} />
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

export function InterestsEditor({ value, onChange, onBlur, inputRef, autoFocus, error, errorId }: InterestsEditorProps) {
  return (
    <fieldset id="trip-interest-first" className="trip-fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Sở thích chuyến đi <span className="trip-optional">Tùy chọn</span></legend>
      <p className="trip-help">Chọn những trải nghiệm bạn quan tâm nhất, tối đa 8 sở thích.</p>
      <div className="trip-choice-grid trip-choice-grid-wrap">
        {INTEREST_OPTIONS.map((option, index) => (
          <label className="trip-choice" key={option.value}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="checkbox"
              name="interests"
              value={option.value}
              checked={value.includes(option.value)}
              onChange={() => onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value])}
              onBlur={onBlur}
              autoFocus={autoFocus && index === 0}
              aria-invalid={Boolean(error)}
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
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

export function PaceEditor({ value, onChange, onBlur, inputRef, autoFocus, error, errorId }: PaceEditorProps) {
  return (
    <fieldset id="trip-pace" className="trip-fieldset" aria-describedby={error ? errorId : undefined}>
      <legend>Nhịp độ chuyến đi <span className="trip-optional">Tùy chọn</span></legend>
      <div className="trip-choice-grid trip-choice-grid-wrap">
        <label className="trip-choice trip-choice-compact">
          <input type="radio" name="pace" value="" checked={value === ""} onChange={() => onChange("")} autoFocus={autoFocus} />
          <span><strong>Chưa chọn</strong><small>Để hệ thống gợi ý.</small></span>
        </label>
        {PACE_OPTIONS.map((option, index) => (
          <label className="trip-choice trip-choice-compact" key={option.value}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="radio"
              name="pace"
              value={option.value}
              checked={value === option.value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={onBlur}
              autoFocus={autoFocus && index === 0}
              aria-invalid={Boolean(error)}
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
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

export function MobilityEditor({
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
  const hasError = Boolean(flagsError || noteError);
  return (
    <fieldset id="trip-mobility-first" className="trip-fieldset" aria-describedby={hasError ? [flagsError ? flagsErrorId : "", noteError ? noteErrorId : ""].filter(Boolean).join(" ") : undefined}>
      <legend>Ràng buộc di chuyển <span className="trip-optional">Tùy chọn</span></legend>
      <p className="trip-help">Chọn điều cần lưu ý để đề xuất phù hợp hơn.</p>
      <div className="trip-choice-grid trip-choice-grid-wrap">
        {MOBILITY_CONSTRAINT_OPTIONS.map((option, index) => (
          <label className="trip-choice" key={option.value}>
            <input
              ref={index === 0 ? inputRef : undefined}
              type="checkbox"
              name="mobilityFlags"
              value={option.value}
              checked={flags.includes(option.value)}
              onChange={() => onFlagsChange(flags.includes(option.value) ? flags.filter((item) => item !== option.value) : [...flags, option.value])}
              onBlur={onFlagsBlur}
              autoFocus={autoFocus && index === 0}
              aria-invalid={Boolean(flagsError)}
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </div>
      <div className="trip-field trip-nested-field">
        <Label htmlFor="trip-mobility-note">Ghi chú thêm <span className="trip-optional">Tùy chọn</span></Label>
        <textarea
          ref={noteRef}
          id="trip-mobility-note"
          name="mobilityNote"
          className="trip-textarea"
          value={note}
          maxLength={500}
          onChange={(event) => onNoteChange(event.target.value)}
          onBlur={onNoteBlur}
          aria-describedby={`trip-mobility-note-help${noteError ? ` ${noteErrorId}` : ""}`}
          aria-invalid={Boolean(noteError)}
        />
        <p id="trip-mobility-note-help" className="trip-help trip-character-count">Còn {500 - note.length} ký tự</p>
      </div>
      <EditorError error={flagsError} errorId={flagsErrorId} />
      <EditorError error={noteError} errorId={noteErrorId} />
    </fieldset>
  );
}
