"use client";

import {
  PLAN_PROGRESS_LABELS,
  PLAN_PROGRESS_STEPS,
  type PlanProgressSnapshot,
  type PlanProgressStep,
} from "@/modules/tripsage-chat/tripsage-chat-parts";

export interface TripsagePlanProgressProps {
  snapshot: PlanProgressSnapshot;
  interrupted?: boolean;
  onRetryStep?: (step: PlanProgressStep) => void;
  onRetryStream?: () => void;
}

const STEP_RETRY_PROMPTS: Record<PlanProgressStep, string> = {
  SELECT: "Tải lại danh sách điểm đến và lập lịch giúp mình.",
  VALIDATE: "Kiểm tra lại lịch trình giúp mình.",
  LODGING: "Tìm lại chỗ nghỉ cho các đêm trong lịch giúp mình.",
  COSTS: "Tính lại bảng chi phí ước tính giúp mình.",
};

export function planProgressRetryPrompt(step: PlanProgressStep): string {
  return STEP_RETRY_PROMPTS[step];
}

/**
 * Slim D19 / BR-4 / design §3.7: real-time step progress fed strictly by server
 * `data-plan-progress` stream events. Never renders fake steps or percentage bars.
 */
export function TripsagePlanProgress({
  snapshot,
  interrupted = false,
  onRetryStep,
  onRetryStream,
}: TripsagePlanProgressProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Tiến độ lập lịch trình"
      className="tripsage-plan-progress"
    >
      <ul className="tripsage-plan-progress-list">
        {PLAN_PROGRESS_STEPS.map(step => {
          const row = snapshot.steps[step];
          const label = PLAN_PROGRESS_LABELS[step];
          const isDone = row.state === "done";
          const isRunning = row.state === "running" && !interrupted;
          const isError = row.state === "error";
          const marker = isDone ? "✓" : isError ? "!" : isRunning ? "●" : "○";
          const errorText = row.detail && /^chưa tìm được|^chưa /iu.test(row.detail)
            ? row.detail
            : `Chưa tìm được ${label.toLowerCase()}`;

          return (
            <li
              key={step}
              className={`tripsage-plan-progress-row is-${interrupted && row.state === "running" ? "interrupted" : row.state}`}
              data-step={step}
              data-state={row.state}
            >
              <span className="tripsage-plan-progress-mark" aria-hidden="true">{marker}</span>
              <span className="tripsage-plan-progress-label">
                {isError ? errorText : label}
              </span>
              {!isError && row.detail && (
                <span className="tripsage-plan-progress-detail">· {row.detail}</span>
              )}
              {isError && onRetryStep && (
                <button
                  type="button"
                  className="tripsage-plan-progress-retry"
                  onClick={() => onRetryStep(step)}
                >
                  Thử lại
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {interrupted && (
        <div className="tripsage-plan-progress-interrupted">
          <span>Bị ngắt</span>
          {onRetryStream && (
            <button
              type="button"
              className="tripsage-plan-progress-retry"
              onClick={onRetryStream}
            >
              Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
