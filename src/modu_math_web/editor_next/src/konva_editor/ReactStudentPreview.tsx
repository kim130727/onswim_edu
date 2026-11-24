import { useEffect, useMemo, useState } from "react";
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
import { checkStudentPreview, loadStudentPreview } from "../api/editorApi";

type PreviewViewport = "full" | "tablet" | "mobile";

export function ReactStudentPreview({
  problemId,
  onClose,
}: {
  problemId: string;
  onClose: () => void;
}) {
  const [problem, setProblem] = useState<StudentProblemContent | null>(null);
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [viewport, setViewport] = useState<PreviewViewport>("full");
  const [answer, setAnswer] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState<GradingResultModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingProblem(true);
    setError("");
    setAnswer(null);
    setGrading(null);
    void loadStudentPreview(problemId)
      .then((detail) => {
        if (!cancelled) {
          setProblem(detail as StudentProblemContent);
          setLoadingProblem(false);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setProblem(null);
          setLoadingProblem(false);
          setError(`저장된 문제를 불러오지 못했습니다. ${String(reason)}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [problemId, attempt]);

  const item = useMemo(
    () => (problem ? normalizeProblemContent(problem, problem.problem_id ?? problemId) : null),
    [problem, problemId],
  );

  const locale: StudentLocale = item?.language === "uk" ? "uk" : "ko";
  const isLocked = submitting || grading?.correct === true;
  const canSubmit = Boolean(item && !isLocked && isAnswerComplete(answer, item.fields.length));

  const handleSubmit = async () => {
    if (!item || !problem || submitting || !canSubmit) return;
    setSubmitting(true);
    setGrading(null);
    try {
      const normalized = normalizeSubmissionAnswer(answer, item.fields.length);
      const result = await checkStudentPreview(problemId, normalized, String(problem.revision ?? ""));
      setGrading(buildGradingResult(locale, result.correct));
    } catch (reason) {
      setGrading(buildGradingResult(locale, null, String(reason)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="react-student-preview" aria-labelledby="student-preview-title">
      <header className="student-preview-header">
        <div className="student-preview-heading">
          <strong id="student-preview-title">앱처럼 풀어보기</strong>
          <p>마지막으로 저장하고 화면 반영한 문제입니다. 풀이 기록은 저장하지 않습니다.</p>
        </div>
        <div className="student-preview-actions">
          <div className="student-preview-viewport" role="group" aria-label="미리보기 화면 크기">
            {(
              [
                ["full", "전체"],
                ["tablet", "태블릿"],
                ["mobile", "모바일"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={viewport === key}
                onClick={() => setViewport(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            새로고침
          </button>
          <button type="button" onClick={onClose}>
            편집으로 돌아가기
          </button>
        </div>
      </header>
      {error ? (
        <div className="student-preview-message" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            다시 시도
          </button>
        </div>
      ) : (
        <section
          className={`student-preview-surface viewport-${viewport}`}
          aria-label="학생 앱 문제풀이 화면"
        >
          {loadingProblem || !item ? (
            <div className="student-preview-loading" role="status">
              저장된 문제를 불러오는 중…
            </div>
          ) : (
            <div
              className="student-preview-body"
              data-testid="react-student-preview-body"
              data-mm-surface="student"
            >
              <StudentProblemView
                item={item}
                value={answer}
                enabled={!isLocked}
                locale={locale}
                onChange={(nextVal) => {
                  setAnswer(nextVal);
                  if (grading) setGrading(null);
                }}
              />

              {grading && (
                <div
                  className={`student-preview-feedback ${grading.status}`}
                  data-testid="preview-grading-feedback"
                  role="status"
                >
                  {grading.message}
                </div>
              )}

              <div className="student-preview-submit-row">
                <button
                  type="button"
                  className="student-preview-submit-btn"
                  data-testid="preview-submit-btn"
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? translateStudent(locale, "waiting") : translateStudent(locale, "send")}
                </button>
                <button
                  type="button"
                  className="student-preview-reset-btn"
                  disabled={submitting}
                  onClick={() => {
                    setAnswer(null);
                    setGrading(null);
                  }}
                >
                  초기화
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
