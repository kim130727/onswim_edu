import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const submissionInProgress = useRef(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data) return;
      const msg = event.data as Record<string, unknown>;
      if (msg.type === "modu-math:student-content" && msg.content) {
        submissionInProgress.current = false;
        setContent(msg.content as StudentProblemContent);
        setAnswer(null);
        setGrading(null);
        setSubmitting(false);
      } else if (msg.type === "modu-math:student-result") {
        submissionInProgress.current = false;
        setSubmitting(false);
        setGrading(buildGradingResult(locale, Boolean(msg.correct)));
      } else if (msg.type === "modu-math:student-error") {
        submissionInProgress.current = false;
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

  const canSubmit = !submitting && isAnswerComplete(answer, item.fields);
  const submitAnswer = (value = answer) => {
    if (submissionInProgress.current || !isAnswerComplete(value, item.fields)) return;
    submissionInProgress.current = true;
    setSubmitting(true);
    setGrading(null);
    window.parent?.postMessage(
      { type: "modu-math:student-submit", answer: normalizeSubmissionAnswer(value, item.fields.length), revision: item.revision },
      window.location.origin,
    );
  };

  const changeAnswer = (value: unknown) => {
    setAnswer(value);
    if (grading) setGrading(null);
  };

  return (
    <div className="student-preview-standalone">
      <form className="student-problem-card" onSubmit={(event) => { event.preventDefault(); submitAnswer(); }}>
        <StudentProblemView
          item={item}
          value={answer}
          enabled={!submitting}
          locale={locale}
          onChange={changeAnswer}
          onAnswerSelected={(nextValue) => {
            if (grading && nextValue === answer) return;
            changeAnswer(nextValue);
            submitAnswer(nextValue);
          }}
        />
        {grading && (
          <div className={`student-feedback ${grading.status}`} role="status">
            {grading.message}
          </div>
        )}
        <div className="student-action-row">
          <button
            type="submit"
            className="student-btn primary"
            disabled={!canSubmit}
          >
            {submitting ? translateStudent(locale, "waiting") : translateStudent(locale, "send")}
          </button>
        </div>
      </form>
    </div>
  );
};
