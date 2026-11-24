import React from "react";

export const ListSkeleton: React.FC<{ count?: number; label?: string }> = ({
  count = 4,
  label = "불러오는 중…",
}) => (
  <div className="student-skeleton-list" role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="student-skeleton-card">
        <div className="mm-skeleton student-skeleton-title" />
        <div className="mm-skeleton student-skeleton-line" />
        <div className="mm-skeleton student-skeleton-bar" />
      </div>
    ))}
  </div>
);

export const ProblemSkeleton: React.FC<{ label?: string }> = ({ label = "문제를 불러오는 중…" }) => (
  <div className="student-problem-card student-skeleton-problem" role="status" aria-busy="true" aria-label={label}>
    <div className="mm-skeleton student-skeleton-title" />
    <div className="mm-skeleton student-skeleton-canvas" />
    <div className="student-skeleton-choices">
      <div className="mm-skeleton student-skeleton-pill" />
      <div className="mm-skeleton student-skeleton-pill" />
      <div className="mm-skeleton student-skeleton-pill" />
    </div>
  </div>
);
