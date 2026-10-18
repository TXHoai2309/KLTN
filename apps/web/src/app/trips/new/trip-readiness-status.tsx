import { AlertCircle, CalendarCheck2, CheckCircle2 } from "lucide-react";

import type {
  TripRequirementField,
} from "@/modules/trip-requirement/trip-requirement-readiness";
import type { TripRequirementReadiness } from "@/modules/trip-requirement/trip-requirement-readiness";

export type ReadinessTone = "success" | "warning" | "error";

export type ReadinessDescription = {
  tone: ReadinessTone;
  title: string;
  body: string;
};

const FIELD_LABELS: Record<TripRequirementField, string> = {
  durationDays: "Số ngày chuyến đi",
  transport: "Phương tiện di chuyển",
  startDate: "Ngày bắt đầu",
};

function missingLabels(fields: TripRequirementField[]): string {
  return fields.map((field) => FIELD_LABELS[field]).join(", ");
}

export function describeReadiness(
  readiness: TripRequirementReadiness,
): ReadinessDescription {
  if (readiness.finalConfirmation) {
    return {
      tone: "success",
      title: "Đủ điều kiện xác nhận chính thức",
      body: "Thông tin nhu cầu chuyến đi đã có ngày bắt đầu hợp lệ.",
    };
  }

  if (readiness.preliminary && readiness.startDateIssue === "MISSING") {
    return {
      tone: "warning",
      title: "Đủ để tạo đề xuất sơ bộ",
      body: "Chưa thể xác nhận và lưu chính thức vì thiếu ngày bắt đầu. Hành trình sẽ dùng Ngày 1, Ngày 2…",
    };
  }

  const reason =
    readiness.startDateIssue === "IN_PAST"
      ? "Ngày bắt đầu không được ở trong quá khứ."
      : readiness.startDateIssue === "INVALID_FORMAT"
        ? "Ngày bắt đầu cần là ngày lịch hợp lệ theo định dạng dd/mm/yyyy."
        : null;
  const fields = missingLabels(readiness.missing);
  return {
    tone: "error",
    title: "Chưa đủ thông tin để tạo đề xuất",
    body: reason ?? (fields ? `Cần bổ sung: ${fields}.` : "Vui lòng kiểm tra lại thông tin chuyến đi."),
  };
}

const STATUS_ICON = {
  success: CheckCircle2,
  warning: CalendarCheck2,
  error: AlertCircle,
} as const;

export default function TripReadinessStatus({
  readiness,
}: {
  readiness: TripRequirementReadiness;
}) {
  const description = describeReadiness(readiness);
  const Icon = STATUS_ICON[description.tone];

  return (
    <section
      className="trip-readiness-status"
      data-tone={description.tone}
      role="status"
      aria-live="polite"
    >
      <Icon aria-hidden="true" size={20} />
      <div>
        <h2>{description.title}</h2>
        <p>{description.body}</p>
      </div>
    </section>
  );
}
