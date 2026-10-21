"use client";

import { Button } from "@KLTN/ui/components/button";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import type { TripValidation, ValidationGroupName } from "./trip-validation";

const groups: { name: ValidationGroupName; label: string }[] = [
  { name: "openingHours", label: "Giờ hoạt động" },
  { name: "minimumDuration", label: "Thời lượng tham quan tối thiểu" },
  { name: "travelTime", label: "Thời gian di chuyển" },
  { name: "scheduleConflict", label: "Xung đột thời gian" },
];
const labels = {
  SATISFIED: "Đáp ứng",
  VIOLATION: "Vi phạm",
  INSUFFICIENT_DATA: "Chưa đủ dữ liệu để kiểm tra",
} as const;

export function TripValidationPanel({ validation, onConfirm, pending = false, actionLabel = "Xác nhận và lưu", secondaryActions }: {
  validation: TripValidation;
  onConfirm?: () => void;
  pending?: boolean;
  actionLabel?: string;
  secondaryActions?: ReactNode;
}) {
  return <section aria-labelledby="trip-validation-heading" className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-6">
    <h2 id="trip-validation-heading" className="text-lg font-semibold">Kiểm tra hành trình</h2>
    <ul className="grid gap-3 sm:grid-cols-2">
      {groups.map(({ name, label }) => {
        const group = validation.groups[name];
        return <li key={name} className="min-w-0 rounded-md border border-border p-3">
          <h3 className="font-medium">{label}</h3>
          <p className="text-sm text-muted-foreground">{labels[group.status]}</p>
          {group.findings.length > 0 && <div className="mt-2 space-y-1 break-words text-sm">
            {group.findings.map((finding, index) => <p key={`${finding.reasonCode}-${index}`}>
              {finding.affectedVisitId ? `Lượt ${finding.affectedVisitId}: ` : finding.visitIds ? `Lượt ${finding.visitIds.join(" và ")}: ` : `Chặng ${finding.fromVisitId} → ${finding.toVisitId}: `}
              {finding.message}
            </p>)}
          </div>}
        </li>;
      })}
    </ul>
    <div className="flex flex-wrap items-center justify-end gap-3">{secondaryActions}<Button type="button" disabled={!validation.canConfirm || !onConfirm || pending} onClick={onConfirm} aria-busy={pending}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? "Đang lưu…" : actionLabel}
    </Button></div>
  </section>;
}
