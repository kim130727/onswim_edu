import React, { useEffect, useMemo, useState } from "react";
import {
  buildGradingResult,
  isAnswerComplete,
  normalizeProblemContent,
  normalizeSubmissionAnswer,
  StudentProblemView,
  translateStudent,
  type GradingResultModel,
  type StudentLocale,
  type StudentProblemContent,
} from "@modu/student-renderer";

/**
 * PostMessage-compatible preview route when `/student/?studentPreview=1` is opened directly.
 */
export const StudentPreviewRoute: React.FC<{ locale: StudentLocale }> = ({ locale }) => {
  const [content, setContent] = useState<StudentProblemContent | null>(null);
  const [answer, setAnswer] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState<GradingResultModel | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      const msg = event.data as Record<string, unknown>;
      if (msg.type === "modu-math:student-content" && msg.content) {
        setContent(msg.content as StudentProblemContent);
        setAnswer(null);
        setGrading(null);
        setSubmitting(false);
      } else if (msg.type === "modu-math:student-result") {
        setSubmitting(false);
        setGrading(buildGradingResult(locale, Boolean(msg.correct)));
      } else if (msg.type === "modu-math:student-error") {
        setSubmitting(false);
        setGrading(buildGradingResult(locale, null, String(msg.error ?? translateStudent(locale, "error"))));
      }
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: "modu-math:student-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [locale]);

  const item = useMemo(
    () => (content ? normalizeProblemContent(content, content.problem_id ?? 0) : null),
    [content],
  );

  if (!item) {
    return <div className="student-empty">{translateStudent(locale, "loading")}</div>;
  }

  const canSubmit = !submitting && isAnswerComplete(answer, item.fields.length);

  return (
    <div className="student-preview-standalone">
      <div className="student-problem-card">
        <StudentProblemView
          item={item}
          value={answer}
          enabled={!submitting}
          locale={locale}
          onChange={(nextVal) => {
            setAnswer(nextVal);
            if (grading) setGrading(null);
          }}
        />
        {grading && (
          <div className={`student-feedback ${grading.status}`} role="status">
            {grading.message}
          </div>
        )}
        <div className="student-action-row">
          <button
            type="button"
            className="student-btn primary"
            disabled={!canSubmit}
            onClick={() => {
              setSubmitting(true);
              const normalized = normalizeSubmissionAnswer(answer, item.fields.length);
              window.parent?.postMessage(
                { type: "modu-math:student-submit", answer: normalized, revision: item.revision },
                window.location.origin,
              );
            }}
          >
            {submitting ? translateStudent(locale, "waiting") : translateStudent(locale, "send")}
          </button>
        </div>
      </div>
    </div>
  );
};
