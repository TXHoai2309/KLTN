"use client";

import { Button } from "@KLTN/ui/components/button";
import { LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MAX_PREFERENCE_INPUT_LENGTH,
  MIN_PREFERENCE_INPUT_LENGTH,
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

const EXAMPLE_PROMPTS = [
  "Mình muốn đi 2 ngày bằng ô tô, thích thiên nhiên và thư giãn",
  "Đi xe máy 3 ngày với bạn bè, ưu tiên chụp ảnh và ẩm thực",
  "Gia đình 4 người đi thong thả, tránh đi bộ xa",
  "Mình đi một mình cuối tháng, muốn khám phá bản làng",
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
  const [showExamples, setShowExamples] = useState(false);
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
        <div className="trip-heading-icon" aria-hidden="true"><Sparkles size={20} /></div>
        <div>
          <h2 id="trip-natural-language-title" data-trip-panel-heading tabIndex={-1}>Bạn muốn một chuyến đi thế nào?</h2>
        </div>
      </div>
      <p className="trip-natural-language-intro">
        Viết theo cách của bạn. AI sẽ gợi ý thông tin vào biểu mẫu bên dưới để bạn kiểm tra và chỉnh sửa.
      </p>

      {onContinueManually && (
        <div className="trip-natural-language-manual-path">
          <span>Muốn tự chọn từng mục?</span>
          <button type="button" className="trip-extraction-link-button" onClick={onContinueManually}>
            Nhập bằng biểu mẫu
          </button>
        </div>
      )}

      <div className="trip-natural-language-field">
        <label htmlFor="trip-natural-language-text">Bạn muốn chuyến đi như thế nào?</label>
        <p id="trip-natural-language-help" className="trip-help">
          Có thể viết ngày đi, thời lượng, phương tiện, người đồng hành và sở thích.
        </p>

        {showExamples && (
          <div className="trip-natural-language-examples" aria-label="Câu gợi ý">
            <p className="trip-help">Gợi ý nhanh — bấm để điền vào ô:</p>
            <div className="trip-natural-language-chips">
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
          </div>
        )}

        <textarea
          id="trip-natural-language-text"
          className="trip-textarea trip-natural-language-textarea resize-none"
          value={rawText}
          onFocus={() => setShowExamples(true)}
          onClick={() => setShowExamples(true)}
          onChange={(event) => {
            if (isProcessing) onCancel?.();
            setRawText(event.target.value);
          }}
          placeholder="Ví dụ: Mình đi 3 ngày 2 đêm bằng xe máy với bạn gái, thích chụp ảnh và ăn uống, đi thong thả"
          aria-describedby={`trip-natural-language-help trip-natural-language-count${validationMessage ? " trip-natural-language-error" : ""}`}
          aria-invalid={Boolean(validationMessage)}
        />
        <div className="trip-natural-language-meta">
          <span id="trip-natural-language-count" aria-hidden="true">
            {textState.length}/{MAX_PREFERENCE_INPUT_LENGTH} ký tự
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
          {status.kind === "analyzing" && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
          {status.kind === "success" && <WandSparkles size={18} aria-hidden="true" />}
          <span>
            {status.message ??
              (status.kind === "analyzing"
                ? "Đang chuẩn bị phân tích nhu cầu."
                : status.kind === "success"
                  ? "Đã nhận diện nhu cầu chuyến đi."
                  : "Chưa thể phân tích nhu cầu.")}
          </span>
          {status.kind === "analyzing" && onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="trip-natural-language-cancel">
              Hủy
            </Button>
          )}
        </div>
      )}

      <div className="trip-natural-language-actions">
        <Button
          type="button"
          className="trip-submit-button"
          disabled={displayButtonState.disabled}
          aria-busy={isProcessing}
          onClick={handleAnalyze}
        >
          {isProcessing ? (
            <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={17} aria-hidden="true" />
          )}
          {displayButtonState.label}
        </Button>
        {displayButtonState.reason && <p className="trip-natural-language-button-reason">{displayButtonState.reason}</p>}
      </div>
    </section>
  );
}
