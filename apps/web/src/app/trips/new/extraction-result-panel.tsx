"use client";

import { Ban, CheckCircle2, CircleAlert, CircleHelp, Sparkles } from "lucide-react";
import type { RefObject } from "react";

import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
} from "@/modules/trip-requirement/trip-requirement-contract";
import type {
  ExtractionResult,
  PreferenceExtractionField,
  FieldExtraction,
} from "@/modules/preference-extraction/preference-extraction-contract";
import type {
  ExtractionSuggestionField,
  ExtractionSuggestions,
} from "@/modules/preference-extraction/apply-extraction";
import { unresolvedTransportMessage } from "@/modules/trip-requirement/transport-safety";
import { formatVietnameseDate } from "@/lib/date-only";

export type ExtractionResultPanelProps = {
  result: ExtractionResult;
  suggestions?: ExtractionSuggestions;
  onFillForm: () => void;
  onUseSuggestion?: (field: ExtractionSuggestionField) => void;
  onDismissSuggestion?: (field: ExtractionSuggestionField) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

const FIELD_LABELS: Record<PreferenceExtractionField, string> = {
  startDate: "Ngày bắt đầu",
  durationDays: "Thời lượng",
  transport: "Phương tiện",
  companions: "Người đồng hành",
  interests: "Sở thích",
  pace: "Nhịp độ",
  mobilityConstraints: "Ràng buộc di chuyển",
};

const STATUS_LABELS = {
  EXTRACTED: "Đã nhận diện",
  AMBIGUOUS: "Cần làm rõ",
  MISSING: "Chưa có thông tin",
  UNSUPPORTED: "Chưa hỗ trợ",
} as const;

function optionLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function statusIcon(status: keyof typeof STATUS_LABELS) {
  if (status === "EXTRACTED") return <CheckCircle2 size={17} aria-hidden="true" />;
  if (status === "AMBIGUOUS") return <CircleAlert size={17} aria-hidden="true" />;
  if (status === "UNSUPPORTED") return <Ban size={17} aria-hidden="true" />;
  return <CircleHelp size={17} aria-hidden="true" />;
}

function formatValue(field: PreferenceExtractionField, extraction: FieldExtraction<unknown>): string | null {
  if (extraction.status !== "EXTRACTED") return null;
  const value = extraction.value;
  switch (field) {
    case "startDate": return formatVietnameseDate(String(value));
    case "durationDays": return `${String(value)} ngày`;
    case "transport": return optionLabel(TRANSPORT_OPTIONS, String(value));
    case "companions": {
      const companions = value as { type: string; groupSize: number };
      return `${optionLabel(COMPANION_OPTIONS, companions.type)} · ${companions.groupSize} người`;
    }
    case "interests":
      return (value as string[]).map((item) => optionLabel(INTEREST_OPTIONS, item)).join(", ");
    case "pace": return optionLabel(PACE_OPTIONS, String(value));
    case "mobilityConstraints": {
      const mobility = value as { flags: string[]; note: string | null };
      return [
        mobility.flags.map((item) => optionLabel(MOBILITY_CONSTRAINT_OPTIONS, item)).join(", "),
        mobility.note,
      ].filter(Boolean).join(" · ") || "Không có ghi chú";
    }
  }
}

function SuggestionActions({
  field,
  onUseSuggestion,
  onDismissSuggestion,
}: {
  field: ExtractionSuggestionField;
  onUseSuggestion?: (field: ExtractionSuggestionField) => void;
  onDismissSuggestion?: (field: ExtractionSuggestionField) => void;
}) {
  return (
    <div className="trip-extraction-suggestion-actions">
      {onUseSuggestion && (
        <button type="button" className="trip-extraction-link-button" onClick={() => onUseSuggestion(field)}>
          Dùng gợi ý này
        </button>
      )}
      {onDismissSuggestion && (
        <button type="button" className="trip-extraction-link-button" onClick={() => onDismissSuggestion(field)}>
          Bỏ gợi ý
        </button>
      )}
    </div>
  );
}

export default function ExtractionResultPanel({
  result,
  suggestions = {},
  onFillForm,
  onUseSuggestion,
  onDismissSuggestion,
  headingRef,
}: ExtractionResultPanelProps) {
  const fields = Object.keys(FIELD_LABELS) as PreferenceExtractionField[];
  const extractedCount = fields.filter((field) => result.fields[field].status === "EXTRACTED").length;
  const pendingSuggestions = Object.values(suggestions).filter((suggestion) => suggestion?.status === "PENDING");

  return (
    <section className="trip-extraction-result" aria-labelledby="trip-extraction-result-title" aria-live="polite">
      <div className="trip-section-heading">
        <div className="trip-heading-icon" aria-hidden="true"><Sparkles size={20} /></div>
        <div>
          <p className="trip-eyebrow">Kết quả phân tích</p>
          <h2 id="trip-extraction-result-title" ref={headingRef} tabIndex={-1}>Thông tin nhận diện được</h2>
        </div>
      </div>

      <p className="trip-extraction-count">Nhận diện được {extractedCount}/7 thông tin.</p>
      {extractedCount === 0 && (
        <p className="trip-extraction-neutral">Chưa nhận diện được thông tin chắc chắn nào. Bạn có thể bổ sung trực tiếp trong biểu mẫu.</p>
      )}
      {result.missingRequired.length > 0 && (
        <p className="trip-extraction-missing">
          Cần bổ sung: {result.missingRequired.map((field) => FIELD_LABELS[field]).join(", ")}.
        </p>
      )}

      <div className="trip-extraction-field-list">
        {fields.map((field) => {
          const extraction = result.fields[field] as FieldExtraction<unknown>;
          const suggestionFields: ExtractionSuggestionField[] = field === "companions"
            ? ["companionType", "companionGroupSize"]
            : field === "mobilityConstraints"
              ? ["mobilityFlags", "mobilityNote"]
              : [field];
          return (
            <article className={`trip-extraction-field trip-extraction-field-${extraction.status.toLowerCase()}`} key={field}>
              <div className="trip-extraction-field-heading">
                <h3>{FIELD_LABELS[field]}</h3>
                <span className="trip-extraction-status">{statusIcon(extraction.status)} {STATUS_LABELS[extraction.status]}</span>
              </div>
              {formatValue(field, extraction) && <p className="trip-extraction-value">{formatValue(field, extraction)}</p>}
              {field === "transport" && extraction.status !== "EXTRACTED" && (
                <p className="trip-extraction-transport-warning" role="status">
                  {unresolvedTransportMessage(extraction.sourceText)}
                </p>
              )}
              {extraction.status !== "EXTRACTED" && extraction.note && <p className="trip-extraction-note">{extraction.note}</p>}
              {extraction.sourceText && <p className="trip-extraction-source">Bạn viết: “{extraction.sourceText}”</p>}
              {extraction.status === "EXTRACTED" && extraction.note && <p className="trip-extraction-note">{extraction.note}</p>}
              {suggestionFields.map((suggestionField) => {
                const suggestion = suggestions[suggestionField];
                if (suggestion?.status !== "PENDING") return null;
                return (
                  <div className="trip-extraction-pending" key={suggestionField}>
                    <p>Gợi ý này khác với giá trị bạn đã nhập.</p>
                    <SuggestionActions field={suggestion.field} onUseSuggestion={onUseSuggestion} onDismissSuggestion={onDismissSuggestion} />
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>

      {result.clarifications.length > 0 && (
        <div className="trip-extraction-clarifications">
          <h3>Cần làm rõ</h3>
          <ul>
            {result.clarifications.map((item, index) => (
              <li key={`${item.field}-${index}`}>
                <span>{item.message}</span>
                <small>Trích đoạn: “{item.sourceText}”</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingSuggestions.length > 0 && (
        <p className="trip-extraction-note">Bạn có thể dùng hoặc bỏ từng gợi ý khác với thông tin đang có trong biểu mẫu.</p>
      )}
      <p className="trip-extraction-disclaimer">AI chỉ gợi ý, bạn cần kiểm tra trước khi dùng. Ngày bắt đầu bắt buộc trước khi xác nhận/lưu chính thức.</p>
      <button type="button" className="trip-submit-button trip-extraction-fill-button" onClick={onFillForm}>
        Điền vào biểu mẫu
      </button>
    </section>
  );
}
