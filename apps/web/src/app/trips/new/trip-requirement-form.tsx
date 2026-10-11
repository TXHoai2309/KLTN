"use client";

import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { Label } from "@KLTN/ui/components/label";
import { LoaderCircle, Route, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { claimSubmission, releaseSubmission } from "@/lib/auth-submission-guard";
import { authorizationFeedback } from "@/lib/authorization-feedback";
import { buildAuthLoginHref } from "@/lib/auth-return-to";
import {
  COMPANION_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_CONSTRAINT_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
  type CompanionType,
  type MobilityConstraint,
  type TripInterest,
  type TripPace,
  type TripRequirementInput,
  type TripTransport,
} from "@/modules/trip-requirement/trip-requirement-contract";
import TripReadinessStatus from "./trip-readiness-status";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";
import {
  buildPayload,
  decideEvaluateResponse,
  getSubmitButtonState,
  shouldApplyRequestResponse,
  validateRequiredFields,
  type TripRequirementFormFields,
} from "@/modules/trip-requirement/trip-requirement-form-logic";

type FieldErrors = Record<string, string>;

type EvaluationResult = {
  requirement: TripRequirementInput;
  readiness: TripRequirementReadiness;
};

const INITIAL_FIELDS: TripRequirementFormFields = {
  startDate: "",
  durationDays: "",
  transport: "",
  companionType: "",
  companionGroupSize: "",
  interests: [],
  pace: "",
  mobilityFlags: [],
  mobilityNote: "",
};

const FIELD_LABELS: Record<string, string> = {
  startDate: "Ngày bắt đầu",
  durationDays: "Số ngày chuyến đi",
  transport: "Phương tiện di chuyển",
  "companions.type": "Loại nhóm đồng hành",
  "companions.groupSize": "Số người trong nhóm",
  interests: "Sở thích chuyến đi",
  pace: "Nhịp độ chuyến đi",
  "mobilityConstraints.flags": "Ràng buộc di chuyển",
  "mobilityConstraints.note": "Ghi chú di chuyển",
};

const ERROR_ORDER = [
  "durationDays",
  "transport",
  "startDate",
  "companions.type",
  "companions.groupSize",
  "interests",
  "pace",
  "mobilityConstraints.flags",
  "mobilityConstraints.note",
] as const;

function fieldErrorId(field: string): string {
  return `trip-error-${field.replaceAll(".", "-")}`;
}

function orderedErrors(errors: FieldErrors): Array<[string, string]> {
  const ordered: Array<[string, string]> = [];
  for (const field of ERROR_ORDER) {
    if (errors[field]) ordered.push([field, errors[field]]);
  }
  for (const [field, message] of Object.entries(errors)) {
    if (field !== "_form" && !ERROR_ORDER.includes(field as (typeof ERROR_ORDER)[number])) {
      ordered.push([field, message]);
    }
  }
  return ordered;
}

function fieldTargetId(field: string): string {
  return {
    durationDays: "trip-duration",
    transport: "trip-transport",
    startDate: "trip-start-date",
    "companions.type": "trip-companion-type",
    "companions.groupSize": "trip-group-size",
    interests: "trip-interest-first",
    pace: "trip-pace",
    "mobilityConstraints.flags": "trip-mobility-first",
    "mobilityConstraints.note": "trip-mobility-note",
  }[field] ?? "trip-form";
}

function optionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function errorFor(errors: FieldErrors, field: string): string | null {
  return errors[field] ?? null;
}

function Summary({ requirement }: { requirement: TripRequirementInput }) {
  const companions = requirement.companions
    ? `${optionLabel(COMPANION_OPTIONS, requirement.companions.type)} · ${requirement.companions.groupSize} người`
    : "Chưa chọn";
  const interests = requirement.interests.length
    ? requirement.interests.map((value) => optionLabel(INTEREST_OPTIONS, value)).join(", ")
    : "Chưa chọn";
  const mobility = requirement.mobilityConstraints
    ? [
        requirement.mobilityConstraints.flags
          .map((value) => optionLabel(MOBILITY_CONSTRAINT_OPTIONS, value))
          .join(", "),
        requirement.mobilityConstraints.note,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Chưa chọn";

  return (
    <section className="trip-summary" aria-labelledby="trip-summary-title">
      <div className="trip-section-heading">
        <div className="trip-heading-icon" aria-hidden="true"><Sparkles size={20} /></div>
        <div>
          <p className="trip-eyebrow">Đã chuẩn hóa từ hệ thống</p>
          <h2 id="trip-summary-title">Nhu cầu của bạn</h2>
        </div>
      </div>
      <dl className="trip-summary-list">
        <div><dt>Ngày bắt đầu</dt><dd>{requirement.startDate ?? "Chưa chọn — sẽ dùng Ngày 1, Ngày 2…"}</dd></div>
        <div><dt>Thời lượng</dt><dd>{requirement.durationDays} ngày</dd></div>
        <div><dt>Phương tiện</dt><dd>{optionLabel(TRANSPORT_OPTIONS, requirement.transport)}</dd></div>
        <div><dt>Người đồng hành</dt><dd>{companions}</dd></div>
        <div><dt>Sở thích</dt><dd>{interests}</dd></div>
        <div><dt>Nhịp độ</dt><dd>{requirement.pace ? optionLabel(PACE_OPTIONS, requirement.pace) : "Chưa chọn — để hệ thống gợi ý"}</dd></div>
        <div><dt>Di chuyển</dt><dd>{mobility}</dd></div>
      </dl>
    </section>
  );
}

function FieldError({ field, errors }: { field: string; errors: FieldErrors }) {
  const message = errorFor(errors, field);
  if (!message) return null;
  return <p id={fieldErrorId(field)} className="trip-field-error" role="alert">{message}</p>;
}

function clearFieldErrors(errors: FieldErrors, field: string): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => key !== field && !key.startsWith(`${field}.`)),
  );
}

export default function TripRequirementForm() {
  const [fields, setFields] = useState<TripRequirementFormFields>(INITIAL_FIELDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState<EvaluationResult | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const submissionLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(false);
  const focusFirstErrorRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!focusFirstErrorRef.current) return;
    focusFirstErrorRef.current = false;
    const firstField = orderedErrors(errors)[0]?.[0];
    if (!firstField) return;
    const element = fieldRefs.current[firstField] ?? fieldRefs.current[firstField.split(".")[0]!];
    element?.focus();
  }, [errors]);

  function updateField<K extends keyof TripRequirementFormFields>(
    field: K,
    value: TripRequirementFormFields[K],
    errorField = String(field),
  ) {
    const nextFields = { ...fields, [field]: value };
    setFields(nextFields);
    if (hasSubmitted) {
      setErrors(validateRequiredFields(nextFields));
    } else if (touched.has(errorField)) {
      const nextValidation = validateRequiredFields(nextFields);
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, errorField);
        if (nextValidation[errorField]) nextErrors[errorField] = nextValidation[errorField];
        return nextErrors;
      });
    } else {
      setErrors((current) => clearFieldErrors(current, errorField));
    }
    setFeedback(null);
  }

  function handleFieldBlur(field: string) {
    setTouched((current) => new Set(current).add(field));
    const nextValidation = validateRequiredFields(fields);
    if (hasSubmitted || !nextValidation[field]) {
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, field);
        if (nextValidation[field]) nextErrors[field] = nextValidation[field];
        return nextErrors;
      });
    } else {
      setErrors((current) => {
        const nextErrors = clearFieldErrors(current, field);
        nextErrors[field] = nextValidation[field];
        return nextErrors;
      });
    }
  }

  function toggleListValue<K extends "interests" | "mobilityFlags">(
    field: K,
    value: string,
  ) {
    const values = fields[field];
    const next = values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    updateField(field, next, field === "interests" ? "interests" : "mobilityConstraints.flags");
  }

  async function submit() {
    if (!claimSubmission(submissionLock)) return;

    const clientErrors = validateRequiredFields(fields);
    if (Object.keys(clientErrors).length > 0) {
      setHasSubmitted(true);
      setErrors(clientErrors);
      setFeedback(null);
      focusFirstErrorRef.current = true;
      releaseSubmission(submissionLock);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = ++sequenceRef.current;
    setPending(true);
    setFeedback(null);
    setErrors({});

    try {
      const response = await fetch("/api/trip-requirements/evaluate", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(fields)),
        signal: controller.signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const decision = decideEvaluateResponse({ kind: "http", status: response.status, body });
      if (!shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) return;

      if (decision.action === "SUCCESS") {
        setReview(decision.data);
        return;
      }
      if (decision.action === "VALIDATION_ERROR") {
        setHasSubmitted(true);
        setErrors(decision.fieldErrors);
        setFeedback(decision.message);
        focusFirstErrorRef.current = true;
        return;
      }
      if (decision.action === "LOGIN") {
        setFeedback(decision.message);
        window.location.assign(buildAuthLoginHref("/trips/new"));
        return;
      }
      if (decision.action === "FORBIDDEN") {
        setFeedback(authorizationFeedback(403) ?? decision.message);
        return;
      }
      if ("message" in decision) setFeedback(decision.message);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) {
        const decision = decideEvaluateResponse({ kind: "network" });
        if ("message" in decision) setFeedback(decision.message);
      }
    } finally {
      releaseSubmission(submissionLock);
      if (shouldApplyRequestResponse(sequence, sequenceRef.current, mountedRef.current)) setPending(false);
    }
  }

  const button = getSubmitButtonState(pending);
  if (review) {
    return (
      <main className="trip-form-page" lang="vi">
        <div className="trip-form-intro">
          <p className="trip-eyebrow">Lập hành trình</p>
          <h1>Kiểm tra nhu cầu chuyến đi</h1>
          <p>Hệ thống đã chuẩn hóa thông tin bạn cung cấp. Bạn có thể quay lại chỉnh sửa bất cứ lúc nào.</p>
        </div>
        <Summary requirement={review.requirement} />
        <TripReadinessStatus readiness={review.readiness} />
        <p className="trip-next-step"><Route size={17} aria-hidden="true" /> Bước lập hành trình sẽ được thêm ở chức năng tiếp theo.</p>
        <Button type="button" variant="outline" className="trip-secondary-button" onClick={() => setReview(null)}>Chỉnh sửa</Button>
      </main>
    );
  }

  const formError = errors._form;
  const fieldErrorEntries = orderedErrors(errors);
  return (
    <main className="trip-form-page" lang="vi">
      <div className="trip-form-intro">
        <p className="trip-eyebrow">Lập hành trình</p>
        <h1>Chia sẻ nhu cầu chuyến đi</h1>
        <p>Cho chúng tôi biết cách bạn muốn khám phá Hà Giang. Thông tin này chỉ dùng trong phiên hiện tại để tạo đề xuất sơ bộ.</p>
      </div>

      <form className="trip-form" onSubmit={(event) => { event.preventDefault(); void submit(); }} noValidate>
        {fieldErrorEntries.length > 0 && (
          <div className="trip-error-summary" role="alert" aria-live="polite">
            <p>Có {fieldErrorEntries.length} trường cần kiểm tra.</p>
            <ul>
              {fieldErrorEntries.map(([field]) => (
                <li key={field}>
                  <a href={`#${fieldTargetId(field)}`}>
                    {FIELD_LABELS[field] ?? field}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {formError && <p className="trip-form-error" role="alert">{formError}</p>}

        <div className="trip-form-grid">
          <div className="trip-field">
            <Label htmlFor="trip-start-date">Ngày bắt đầu <span className="trip-optional">Tùy chọn ở bước sơ bộ</span></Label>
            <Input
              ref={(element) => { fieldRefs.current.startDate = element; }}
              id="trip-start-date"
              name="startDate"
              type="date"
              value={fields.startDate}
              onChange={(event) => updateField("startDate", event.target.value)}
              onBlur={() => handleFieldBlur("startDate")}
              aria-describedby={`trip-start-date-help${errors.startDate ? ` ${fieldErrorId("startDate")}` : ""}`}
              aria-invalid={Boolean(errors.startDate)}
            />
            <p id="trip-start-date-help" className="trip-help">Có thể bỏ trống ở bước đề xuất sơ bộ; cần có trước khi xác nhận và lưu chính thức.</p>
            <FieldError field="startDate" errors={errors} />
          </div>

          <div className="trip-field">
            <Label htmlFor="trip-duration">Thời lượng chuyến đi <span className="trip-required">Bắt buộc</span></Label>
            <Input
              ref={(element) => { fieldRefs.current.durationDays = element; }}
              id="trip-duration"
              name="durationDays"
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={fields.durationDays}
              onChange={(event) => updateField("durationDays", event.target.value)}
              onBlur={() => handleFieldBlur("durationDays")}
              aria-required="true"
              aria-invalid={Boolean(errors.durationDays)}
              aria-describedby={`trip-duration-help${errors.durationDays ? ` ${fieldErrorId("durationDays")}` : ""}`}
            />
            <p id="trip-duration-help" className="trip-help">Số ngày từ 1 đến 14.</p>
            <FieldError field="durationDays" errors={errors} />
          </div>
        </div>

        <fieldset id="trip-transport" className="trip-fieldset" aria-describedby={errors.transport ? fieldErrorId("transport") : undefined}>
          <legend>Phương tiện di chuyển <span className="trip-required">Bắt buộc</span></legend>
          <p className="trip-help">Chọn một phương tiện; hệ thống không tự chọn thay bạn.</p>
          <div className="trip-choice-grid trip-choice-grid-two">
            {TRANSPORT_OPTIONS.map((option) => (
              <label className="trip-choice" key={option.value}>
                <input
                  ref={(element) => { fieldRefs.current.transport = element; }}
                  type="radio"
                  name="transport"
                  value={option.value}
                  checked={fields.transport === option.value}
                  onChange={(event) => updateField("transport", event.target.value as TripTransport)}
                  onBlur={() => handleFieldBlur("transport")}
                  aria-required="true"
                  aria-invalid={Boolean(errors.transport)}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <FieldError field="transport" errors={errors} />
        </fieldset>

        <fieldset id="trip-companion-type" className="trip-fieldset" aria-describedby={errors["companions.type"] || errors["companions.groupSize"] ? [errors["companions.type"] ? fieldErrorId("companions.type") : "", errors["companions.groupSize"] ? fieldErrorId("companions.groupSize") : ""].filter(Boolean).join(" ") : undefined}>
          <legend>Người đồng hành <span className="trip-optional">Tùy chọn</span></legend>
          <div className="trip-choice-grid trip-choice-grid-wrap">
            <label className="trip-choice trip-choice-compact">
              <input type="radio" name="companionType" value="" checked={fields.companionType === ""} onChange={() => updateField("companionType", "")} />
              <span><strong>Chưa chọn</strong></span>
            </label>
            {COMPANION_OPTIONS.map((option) => (
              <label className="trip-choice trip-choice-compact" key={option.value}>
                <input
                  ref={(element) => { if (!fieldRefs.current["companions.type"]) fieldRefs.current["companions.type"] = element; }}
                  type="radio"
                  name="companionType"
                  value={option.value}
                  checked={fields.companionType === option.value}
                  onChange={(event) => updateField("companionType", event.target.value as CompanionType, "companions.type")}
                  onBlur={() => handleFieldBlur("companions.type")}
                  aria-invalid={Boolean(errors["companions.type"])}
                  aria-describedby={errors["companions.type"] ? fieldErrorId("companions.type") : undefined}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <div className="trip-field trip-nested-field">
            <Label htmlFor="trip-group-size">Số người trong nhóm <span className="trip-optional">Tùy chọn</span></Label>
            <Input
              ref={(element) => { fieldRefs.current["companions.groupSize"] = element; }}
              id="trip-group-size"
              name="companionGroupSize"
              type="text"
              inputMode="numeric"
              value={fields.companionGroupSize}
              disabled={!fields.companionType}
              onChange={(event) => updateField("companionGroupSize", event.target.value, "companions.groupSize")}
              onBlur={() => handleFieldBlur("companions.groupSize")}
              aria-invalid={Boolean(errors["companions.groupSize"])}
              aria-describedby={errors["companions.groupSize"] ? fieldErrorId("companions.groupSize") : undefined}
            />
          </div>
          <FieldError field="companions.type" errors={errors} />
          <FieldError field="companions.groupSize" errors={errors} />
        </fieldset>

        <fieldset id="trip-interest-first" className="trip-fieldset" aria-describedby={errors.interests ? fieldErrorId("interests") : undefined}>
          <legend>Sở thích chuyến đi <span className="trip-optional">Tùy chọn</span></legend>
          <p className="trip-help">Chọn những trải nghiệm bạn quan tâm nhất, tối đa 8 sở thích.</p>
          <div className="trip-choice-grid trip-choice-grid-wrap">
            {INTEREST_OPTIONS.map((option) => (
              <label className="trip-choice" key={option.value}>
                <input
                  ref={(element) => { if (!fieldRefs.current.interests) fieldRefs.current.interests = element; }}
                  type="checkbox"
                  name="interests"
                  value={option.value}
                  checked={fields.interests.includes(option.value)}
                  onChange={() => toggleListValue("interests", option.value as TripInterest)}
                  onBlur={() => handleFieldBlur("interests")}
                  aria-invalid={Boolean(errors.interests)}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <FieldError field="interests" errors={errors} />
        </fieldset>

        <fieldset id="trip-pace" className="trip-fieldset" aria-describedby={errors.pace ? fieldErrorId("pace") : undefined}>
          <legend>Nhịp độ chuyến đi <span className="trip-optional">Tùy chọn</span></legend>
          <div className="trip-choice-grid trip-choice-grid-wrap">
            <label className="trip-choice trip-choice-compact">
              <input type="radio" name="pace" value="" checked={fields.pace === ""} onChange={() => updateField("pace", "")} />
              <span><strong>Chưa chọn</strong><small>Để hệ thống gợi ý.</small></span>
            </label>
            {PACE_OPTIONS.map((option) => (
              <label className="trip-choice trip-choice-compact" key={option.value}>
                <input
                  ref={(element) => { if (!fieldRefs.current.pace) fieldRefs.current.pace = element; }}
                  type="radio"
                  name="pace"
                  value={option.value}
                  checked={fields.pace === option.value}
                  onChange={(event) => updateField("pace", event.target.value as TripPace)}
                  onBlur={() => handleFieldBlur("pace")}
                  aria-invalid={Boolean(errors.pace)}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <FieldError field="pace" errors={errors} />
        </fieldset>

        <fieldset id="trip-mobility-first" className="trip-fieldset" aria-describedby={errors["mobilityConstraints.flags"] || errors["mobilityConstraints.note"] ? [errors["mobilityConstraints.flags"] ? fieldErrorId("mobilityConstraints.flags") : "", errors["mobilityConstraints.note"] ? fieldErrorId("mobilityConstraints.note") : ""].filter(Boolean).join(" ") : undefined}>
          <legend>Ràng buộc di chuyển <span className="trip-optional">Tùy chọn</span></legend>
          <p className="trip-help">Chọn điều cần lưu ý để đề xuất phù hợp hơn.</p>
          <div className="trip-choice-grid trip-choice-grid-wrap">
            {MOBILITY_CONSTRAINT_OPTIONS.map((option) => (
              <label className="trip-choice" key={option.value}>
                <input
                  ref={(element) => { if (!fieldRefs.current["mobilityConstraints.flags"]) fieldRefs.current["mobilityConstraints.flags"] = element; }}
                  type="checkbox"
                  name="mobilityFlags"
                  value={option.value}
                  checked={fields.mobilityFlags.includes(option.value)}
                  onChange={() => toggleListValue("mobilityFlags", option.value as MobilityConstraint)}
                  onBlur={() => handleFieldBlur("mobilityConstraints.flags")}
                  aria-invalid={Boolean(errors["mobilityConstraints.flags"])}
                />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </label>
            ))}
          </div>
          <div className="trip-field trip-nested-field">
            <Label htmlFor="trip-mobility-note">Ghi chú thêm <span className="trip-optional">Tùy chọn</span></Label>
            <textarea
              ref={(element) => { fieldRefs.current["mobilityConstraints.note"] = element; }}
              id="trip-mobility-note"
              name="mobilityNote"
              className="trip-textarea"
              value={fields.mobilityNote}
              maxLength={500}
              onChange={(event) => updateField("mobilityNote", event.target.value, "mobilityConstraints.note")}
              onBlur={() => handleFieldBlur("mobilityConstraints.note")}
              aria-describedby={`trip-mobility-note-help${errors["mobilityConstraints.note"] ? ` ${fieldErrorId("mobilityConstraints.note")}` : ""}`}
              aria-invalid={Boolean(errors["mobilityConstraints.note"])}
            />
            <p id="trip-mobility-note-help" className="trip-help trip-character-count">Còn {500 - fields.mobilityNote.length} ký tự</p>
          </div>
          <FieldError field="mobilityConstraints.flags" errors={errors} />
          <FieldError field="mobilityConstraints.note" errors={errors} />
        </fieldset>

        {feedback && <p className="trip-form-feedback" role="alert">{feedback}</p>}
        <div className="trip-form-actions">
          <Button type="submit" className="trip-submit-button" disabled={button.disabled} aria-busy={button.ariaBusy}>
            {pending && <LoaderCircle className="trip-spinner" size={18} aria-hidden="true" />}
            {button.label}
          </Button>
        </div>
      </form>
    </main>
  );
}
