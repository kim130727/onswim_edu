import React from "react";

export interface StepItemState {
  id: number | string;
  label: string;
  done: boolean;
  current: boolean;
  correct?: boolean | null;
}

export interface StepProgressBarProps {
  current: number;
  total: number;
  label: string;
  steps?: StepItemState[];
  onSelectStep?: (index: number) => void;
}

export const StepProgressBar: React.FC<StepProgressBarProps> = ({
  current,
  total,
  label,
  steps,
  onSelectStep,
}) => {
  const safeTotal = Math.max(1, total);
  const clampedCurrent = Math.min(safeTotal, Math.max(0, current));
  const pct = Math.round((clampedCurrent / safeTotal) * 100);

  return (
    <section className="student-step-progress" aria-label={label}>
      <div className="student-step-header">
        <span className="student-step-label">{label}</span>
        <span className="student-step-pct">{pct}%</span>
      </div>
      <div
        className="student-progress-track"
        role="progressbar"
        aria-valuenow={clampedCurrent}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
      >
        <div className="student-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {steps && steps.length > 0 && (
        <div className="student-step-pills" role="list">
          {steps.map((step, idx) => {
            const stateClass = step.current
              ? "current"
              : step.correct === true
                ? "correct"
                : step.correct === false
                  ? "incorrect"
                  : step.done
                    ? "done"
                    : "todo";
            return (
              <button
                key={step.id}
                type="button"
                className={`student-step-pill ${stateClass}`}
                aria-current={step.current ? "step" : undefined}
                onClick={() => onSelectStep?.(idx)}
              >
                {step.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
