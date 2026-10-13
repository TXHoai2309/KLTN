"use client";

import { AlertCircle, CheckCircle2, CircleHelp, Lightbulb, MapPin } from "lucide-react";
import { useState } from "react";

import { Button } from "@KLTN/ui/components/button";
import type { ClarificationRequest } from "@/modules/trip-requirement/trip-clarification-rules";
import type { ReviewFieldKey } from "@/modules/trip-requirement/trip-requirement-review";
import { reviewFieldLabel } from "@/modules/trip-requirement/trip-requirement-review";

export type TripClarificationPanelProps = {
  requests: readonly ClarificationRequest[];
  onOpenField: (field: ReviewFieldKey) => void;
  onGoToField: (field: ReviewFieldKey) => void;
  onResolveChoice: (request: ClarificationRequest, value: string) => void;
  onDismissAdvisory: (request: ClarificationRequest) => void;
  choiceErrors?: Readonly<Record<string, string>>;
};

function requestAnchorId(field: ReviewFieldKey): string {
  return `trip-review-field-${field}`;
}

function ClarificationItem({
  request,
  onOpenField,
  onGoToField,
  onResolveChoice,
  onDismissAdvisory,
  choiceErrors,
}: TripClarificationPanelProps & { request: ClarificationRequest }) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const error = choiceErrors?.[request.id];
  const isBlocking = request.severity === "BLOCKING";

  return (
    <li className="trip-clarification-item" data-severity={request.severity}>
      <div className="trip-clarification-item-heading">
        <span className="trip-clarification-icon" aria-hidden="true">
          {isBlocking ? <AlertCircle size={19} /> : <Lightbulb size={19} />}
        </span>
        <strong>{request.question}</strong>
      </div>
      {request.hint && <p className="trip-clarification-hint">{request.hint}</p>}
      {request.sourceText && <p className="trip-clarification-source">Bạn viết: “{request.sourceText}”</p>}

      <div className="trip-clarification-item-actions">
        <a
          className="trip-clarification-link"
          href={`#${requestAnchorId(request.field)}`}
          onClick={(event) => {
            event.preventDefault();
            onGoToField(request.field);
          }}
        >
          <MapPin size={16} aria-hidden="true" /> Đi tới mục {reviewFieldLabel(request.field)}
        </a>

        {request.resolution.type === "ENTER_VALUE" && (
          <>
            <p className="trip-clarification-resolution-help">
              Mở trình nhập dùng chung để điền giá trị, sau đó chọn “Lưu thay đổi”.
            </p>
            <Button
              type="button"
              variant="outline"
              className="trip-secondary-button"
              onClick={() => onOpenField(request.field)}
            >
              Nhập {reviewFieldLabel(request.field)}
            </Button>
          </>
        )}

        {request.resolution.type === "CHOOSE_ONE" && (
          <fieldset className="trip-clarification-choice">
            <legend>Chọn một lựa chọn</legend>
            {request.resolution.options.map((option) => (
              <label key={option.value} className="trip-choice-option">
                <input
                  type="radio"
                  name={`trip-clarification-${request.id}`}
                  value={option.value}
                  checked={selectedChoice === option.value}
                  onChange={() => setSelectedChoice(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {error && <p className="trip-form-error" role="alert">{error}</p>}
            <Button
              type="button"
              className="trip-submit-button"
              disabled={selectedChoice === null}
              onClick={() => {
                if (selectedChoice !== null) onResolveChoice(request, selectedChoice);
              }}
            >
              Lưu lựa chọn
            </Button>
          </fieldset>
        )}

        {request.resolution.type === "SKIP_ALLOWED" && !isBlocking && (
          <Button
            type="button"
            variant="outline"
            className="trip-secondary-button"
            onClick={() => onDismissAdvisory(request)}
          >
            Bỏ qua mục này
          </Button>
        )}
      </div>
    </li>
  );
}

export default function TripClarificationPanel({
  requests,
  onOpenField,
  onGoToField,
  onResolveChoice,
  onDismissAdvisory,
  choiceErrors,
}: TripClarificationPanelProps) {
  if (requests.length === 0) return null;

  const blocking = requests.filter((request) => request.severity === "BLOCKING");
  const advisory = requests.filter((request) => request.severity === "ADVISORY");

  return (
    <section
      className="trip-clarification-panel"
      aria-labelledby="trip-clarification-title"
      data-blocking-count={blocking.length}
      data-advisory-count={advisory.length}
    >
      <div className="trip-clarification-heading">
        <div className="trip-heading-icon" aria-hidden="true"><CircleHelp size={20} /></div>
        <div>
          <h2 id="trip-clarification-title">Cần làm rõ trước khi tạo hành trình</h2>
          <p role="status" aria-live="polite">
            {blocking.length} mục bắt buộc · {advisory.length} mục khuyến nghị
          </p>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="trip-clarification-group" aria-labelledby="trip-clarification-blocking-title">
          <h3 id="trip-clarification-blocking-title"><AlertCircle size={18} aria-hidden="true" /> Bắt buộc</h3>
          <ul className="trip-clarification-list">
            {blocking.map((request) => (
              <ClarificationItem
                key={request.id}
                request={request}
                requests={requests}
                onOpenField={onOpenField}
                onGoToField={onGoToField}
                onResolveChoice={onResolveChoice}
                onDismissAdvisory={onDismissAdvisory}
                choiceErrors={choiceErrors}
              />
            ))}
          </ul>
        </div>
      )}

      {advisory.length > 0 && (
        <div className="trip-clarification-group" aria-labelledby="trip-clarification-advisory-title">
          <h3 id="trip-clarification-advisory-title"><Lightbulb size={18} aria-hidden="true" /> Nên làm rõ</h3>
          <ul className="trip-clarification-list">
            {advisory.map((request) => (
              <ClarificationItem
                key={request.id}
                request={request}
                requests={requests}
                onOpenField={onOpenField}
                onGoToField={onGoToField}
                onResolveChoice={onResolveChoice}
                onDismissAdvisory={onDismissAdvisory}
                choiceErrors={choiceErrors}
              />
            ))}
          </ul>
        </div>
      )}

      {blocking.length === 0 && (
        <p className="trip-clarification-clear" role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden="true" /> Không còn mục bắt buộc nào cần làm rõ.
        </p>
      )}
    </section>
  );
}

