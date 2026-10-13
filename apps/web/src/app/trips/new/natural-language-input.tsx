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
}: NaturalLanguageInputProps) {
  const [rawText, setRawText] = useState("");
  const [announcedLength, setAnnouncedLength] = useState(0);
  const [announcedMessage, setAnnouncedMessage] = useState<string | null>(null);
  const textState = useMemo(() => getNaturalLanguageTextState(rawText), [rawText]);
  const isProcessing = status.kind === "analyzing";
  const buttonState = getNaturalLanguageAnalyzeButtonState(textState, isProcessing);
  const validationMessage = status.kind === "invalid"
    ? status.message ?? textStateMessage(textState)
    : textStateMessage(textState);
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
          <p className="trip-eyebrow">Cách khác để bắt đầu</p>
          <h2 id="trip-natural-language-title">Mô tả nhu cầu bằng lời</h2>
        </div>
      </div>
      <p className="trip-natural-language-intro">
        Viết tự nhiên những điều bạn đã hình dung. Biểu mẫu bên dưới vẫn có thể dùng độc lập.
      </p>

      <div className="trip-natural-language-field">
        <label htmlFor="trip-natural-language-text">Bạn muốn chuyến đi như thế nào?</label>
        <p id="trip-natural-language-help" className="trip-help">
          Có thể viết ngày đi, thời lượng, phương tiện, người đồng hành và sở thích.
        </p>
        <textarea
          id="trip-natural-language-text"
          className="trip-textarea trip-natural-language-textarea"
          value={rawText}
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

      <div className="trip-natural-language-examples" aria-label="Câu gợi ý">
        <p className="trip-help">Gợi ý nhanh — bấm để điền vào ô:</p>
        <div className="trip-natural-language-chips">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              className="trip-natural-language-chip"
              onClick={() => setRawText(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <p className="trip-natural-language-privacy">
        Nội dung sẽ được gửi tới dịch vụ AI để phân tích và không được lưu lại trong hệ thống của ứng dụng.
      </p>

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
                  ? "Đã phân tích nhu cầu."
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
          {isProcessing && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
          {displayButtonState.label}
        </Button>
        {displayButtonState.reason && <p className="trip-natural-language-button-reason">{displayButtonState.reason}</p>}
      </div>

      <p className="trip-natural-language-contract-note">
        Tối thiểu {MIN_PREFERENCE_INPUT_LENGTH} và tối đa {MAX_PREFERENCE_INPUT_LENGTH} ký tự. Nội dung dài hơn sẽ được báo lỗi để bạn tự chỉnh sửa.
      </p>
    </section>
  );
}
