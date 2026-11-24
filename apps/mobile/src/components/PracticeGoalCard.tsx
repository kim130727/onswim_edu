import React from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";

export interface PracticeGoalCardProps {
  done: number;
  target: number;
  locale: StudentLocale;
}

export const PracticeGoalCard: React.FC<PracticeGoalCardProps> = ({ done, target, locale }) => {
  const safeTarget = Math.max(1, target);
  const ratio = Math.min(100, Math.round((done / safeTarget) * 100));
  const achieved = done >= safeTarget;

  return (
    <section className={`student-goal-card${achieved ? " achieved" : ""}`} aria-label={translateStudent(locale, "dailyGoal")}>
      <div className="student-goal-header">
        <strong>{achieved ? translateStudent(locale, "goalAchieved") : translateStudent(locale, "dailyGoal")}</strong>
        <span className="student-goal-count">
          {done} / {safeTarget}
        </span>
      </div>
      <div className="student-progress-track" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={safeTarget}>
        <div className="student-progress-fill" style={{ width: `${ratio}%` }} />
      </div>
      <p className="student-goal-help">
        {achieved ? translateStudent(locale, "goalCongratulations") : translateStudent(locale, "goalHelp")}
      </p>
    </section>
  );
};
