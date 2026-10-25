"use client";

import { Button } from "@KLTN/ui/components/button";
import { LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MAX_PREFERENCE_INPUT_LENGTH,
} from "@/modules/preference-extraction/preference-extraction-contract";
import {
  getNaturalLanguageAnalyzeButtonState,
  getNaturalLanguageTextState,
  type NaturalLanguageTextState,
} from "@/modules/preference-extraction/natural-language-input-logic";

export type NaturalLanguageInputStatus =
  | { kind: "idle" }
  | { kind: "invalid"; message?: string }
  | { kind: "analyzing"; message?: string }
  | { kind: "success"; message?: string }
  | { kind: "failure"; message: string };

export type NaturalLanguageInputProps = {
  status: NaturalLanguageInputStatus;
  onAnalyze: (normalizedText: string) => void;
  onCancel?: () => void;
  onContinueManually?: () => void;
};

export const EXAMPLE_PROMPTS = [
  "Đi 3 ngày bằng xe máy với bạn bè, thích chụp ảnh và ẩm thực",
  "Đi 2 ngày bằng ô tô thong thả, thích thiên nhiên và thư giãn",
] as const;

function textStateMessage(textState: NaturalLanguageTextState): string | null {
  return textState.status === "VALID" ? null : textState.message;
}

export default function NaturalLanguageInput({
  status,
  onAnalyze,
  onCancel,
  onContinueManually,
}: NaturalLanguageInputProps) {
  const [rawText, setRawText] = useState("");
  const [announcedLength, setAnnouncedLength] = useState(0);
  const [announcedMessage, setAnnouncedMessage] = useState<string | null>(null);
  const textState = useMemo(() => getNaturalLanguageTextState(rawText), [rawText]);
  const isProcessing = status.kind === "analyzing";
  const buttonState = getNaturalLanguageAnalyzeButtonState(textState, isProcessing);
  const validationMessage = status.kind === "invalid"
    ? status.message ?? textStateMessage(textState)
    : rawText.length > 0 ? textStateMessage(textState) : null;
  const displayButtonState = status.kind === "failure"
    ? { ...buttonState, label: "Thử lại" }
    : status.kind === "success"
      ? { ...buttonState, label: "Phân tích lại" }
      : buttonState;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnouncedLength(textState.length);
      setAnnouncedMessage(validationMessage);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [textState.length, validationMessage]);

  function handleAnalyze() {
    if (buttonState.disabled || textState.status !== "VALID") return;
    onAnalyze(textState.normalizedText);
  }

  return (
    <section className="trip-natural-language" aria-labelledby="trip-natural-language-title">
      <div className="trip-natural-language-heading">
        <div className="trip-natural-language-title-group">
          <Sparkles size={16} className="trip-ai-sparkle-icon" aria-hidden="true" />
          <h2 id="trip-natural-language-title" data-trip-panel-heading tabIndex={-1}>
            Điền nhanh bằng mô tả tự nhiên
          </h2>
        </div>
        <span className="trip-optional">Tùy chọn</span>
      </div>

      <div className="trip-natural-language-field">
        <label htmlFor="trip-natural-language-text" className="trip-sr-only">
          Bạn muốn chuyến đi như thế nào?
        </label>
        <p id="trip-natural-language-help" className="trip-sr-only">
          Có thể viết ngày đi, thời lượng, phương tiện, người đồng hành và sở thích.
        </p>

        <div className="trip-natural-language-input-row">
          <textarea
            id="trip-natural-language-text"
            rows={1}
            className="trip-textarea trip-natural-language-textarea resize-none"
            value={rawText}
            onChange={(event) => {
              if (isProcessing) onCancel?.();
              setRawText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleAnalyze();
              }
            }}
            placeholder="Ví dụ: Đi 3 ngày bằng xe máy với bạn bè, thích chụp ảnh và ẩm thực..."
            aria-describedby={`trip-natural-language-help trip-natural-language-count${validationMessage ? " trip-natural-language-error" : ""}`}
            aria-invalid={Boolean(validationMessage)}
          />
          <Button
            type="button"
            className="trip-submit-button trip-ai-send-btn"
            disabled={displayButtonState.disabled}
            aria-busy={isProcessing}
            onClick={handleAnalyze}
          >
            {isProcessing ? (
              <LoaderCircle className="trip-spinner" size={16} aria-hidden="true" />
            ) : (
              <Sparkles size={16} aria-hidden="true" />
            )}
            <span>{displayButtonState.label}</span>
          </Button>
        </div>

        <div className="trip-natural-language-meta">
          <div className="trip-natural-language-chips" aria-label="Gợi ý mẫu">
            <span className="trip-ai-chips-label">Gợi ý:</span>
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                className="trip-natural-language-chip"
                onClick={() => {
                  setRawText(example);
                  const el = document.getElementById("trip-natural-language-text");
                  if (el) (el as HTMLTextAreaElement).focus();
                }}
              >
                {example}
              </button>
            ))}
          </div>
          <span id="trip-natural-language-count" className="trip-ai-char-count" aria-hidden="true">
            {textState.length}/{MAX_PREFERENCE_INPUT_LENGTH}
          </span>
          <span className="trip-sr-only" role="status" aria-live="polite">
            Đã nhập {announcedLength}/{MAX_PREFERENCE_INPUT_LENGTH} ký tự.
          </span>
        </div>

        {validationMessage && (
          <p id="trip-natural-language-error" className="trip-field-error">
            {validationMessage}
          </p>
        )}
        <span className="trip-sr-only" role="status" aria-live="polite">
          {announcedMessage ?? ""}
        </span>
      </div>

      {(status.kind === "analyzing" || status.kind === "success" || status.kind === "failure") && (
        <div
          className={`trip-natural-language-status trip-natural-language-status-${status.kind}`}
          role={status.kind === "failure" ? "alert" : "status"}
          aria-live="polite"
        >
          {status.kind === "analyzing" && <LoaderCircle className="trip-spinner" size={16} aria-hidden="true" />}
          {status.kind === "success" && <WandSparkles size={16} aria-hidden="true" />}
          <span>
            {status.message ??
              (status.kind === "analyzing"
                ? "Đang chuẩn bị phân tích nhu cầu."
                : status.kind === "success"
                  ? "Đã nhận diện nhu cầu chuyến đi."
                  : "Chưa thể phân tích nhu cầu.")}
          </span>
          {status.kind === "analyzing" && onCancel && (
            <button type="button" onClick={onCancel} className="trip-natural-language-cancel">
              Hủy
            </button>
          )}
        </div>
      )}

      {onContinueManually && (
        <div className="trip-natural-language-manual-path">
          <button type="button" className="trip-extraction-link-button" onClick={onContinueManually}>
            Nhập bằng biểu mẫu
          </button>
        </div>
      )}

      <p className="trip-natural-language-privacy">
        Thông tin chỉ dùng để gợi ý lịch trình trong phiên này, không lưu trữ cá nhân.
      </p>
    </section>
  );
}
