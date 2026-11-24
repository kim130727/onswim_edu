import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PracticeGoalCard } from "../components/PracticeGoalCard";
import { ProblemSkeleton } from "../components/LoadingSkeleton";
import { StepProgressBar } from "../components/StepProgressBar";
import { ApiError, type ProblemListItem, type StudentApiClient } from "../services/api";

export interface PracticeSessionContext {
  problemId: number;
  list: ProblemListItem[];
  index: number;
  page: number;
  totalCount: number;
  scope: "public" | "class";
  classroomId: number | null;
  grade: number | string | null;
  category: string | null;
  goalDone: number;
  goalTarget: number;
}

export interface PracticeLearningScreenProps {
  api: StudentApiClient;
  locale: StudentLocale;
  initialContext: PracticeSessionContext;
  onBack: () => void;
}

export const PracticeLearningScreen: React.FC<PracticeLearningScreenProps> = ({
  api,
  locale,
  initialContext,
  onBack,
}) => {
  const [list, setList] = useState<ProblemListItem[]>(initialContext.list);
  const [index, setIndex] = useState(initialContext.index);
  const [page, setPage] = useState(initialContext.page);
  const [totalCount, setTotalCount] = useState(initialContext.totalCount);
  const [goalDone, setGoalDone] = useState(initialContext.goalDone);
  const [goalTarget, setGoalTarget] = useState(initialContext.goalTarget);

  const [rawContent, setRawContent] = useState<StudentProblemContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grading, setGrading] = useState<GradingResultModel | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [toast, setToast] = useState("");
  const submissionInProgress = useRef(false);

  const currentProblemId = list[index]?.id ?? initialContext.problemId;
  const answerRef = useRef<unknown>(null);
  answerRef.current = answer;
  const revisionRef = useRef<string>("");

  const item = useMemo(
    () => (rawContent ? normalizeProblemContent(rawContent, currentProblemId) : null),
    [rawContent, currentProblemId],
  );

  const loadProblem = useCallback(
    async (problemId: number) => {
      setLoading(true);
      setError("");
      setUpdateAvailable(false);
      setAnswer(null);
      setGrading(null);
      try {
        const content = await api.getStudentProblem(problemId);
        revisionRef.current = String(content.revision ?? "");
        setRawContent(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadProblem(currentProblemId);
  }, [currentProblemId, loadProblem]);

  // Poll problem version every 5 seconds for live editor updates
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || !revisionRef.current) return;
      try {
        const { revision } = await api.getProblemVersion(currentProblemId);
        if (revision && revision !== revisionRef.current) {
          const hasDraft =
            answerRef.current !== null &&
            answerRef.current !== "" &&
            !(Array.isArray(answerRef.current) && answerRef.current.every((v) => !v));
          if (!hasDraft) {
            void loadProblem(currentProblemId);
          } else {
            setUpdateAvailable(true);
          }
        }
      } catch {
        // Ignore transient polling failures.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [api, currentProblemId, loadProblem]);

  const handleSubmit = async (value = answer) => {
    if (!item || submissionInProgress.current || grading?.correct === true || !isAnswerComplete(value, item.fields)) return;
    submissionInProgress.current = true;
    setSubmitting(true);
    setError("");
    setGrading(null);
    try {
      const normalized = normalizeSubmissionAnswer(value, item.fields.length);
      const res = await api.submitPracticeAttempt({
        problem: currentProblemId,
        submitted_answer: normalized,
        content_revision: item.revision || undefined,
      });
      setGrading(buildGradingResult(locale, res.is_correct));
      if (res.is_correct) {
        try {
          const prevDone = goalDone;
          const cat = await api.getProblemCatalog({
            scope: initialContext.scope,
            language: locale,
            classroom: initialContext.classroomId,
          });
          const nextDone = cat.goal?.completed_ids?.length ?? prevDone;
          const nextTarget = cat.goal?.target ?? goalTarget;
          setGoalDone(nextDone);
          setGoalTarget(nextTarget);
          if (prevDone < nextTarget && nextDone >= nextTarget) {
            setToast(translateStudent(locale, "goalToast", { count: nextDone }));
          }
        } catch {
          setToast(translateStudent(locale, "goalSyncFailed"));
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setUpdateAvailable(true);
      } else {
        setGrading(buildGradingResult(locale, null, err instanceof Error ? err.message : translateStudent(locale, "error")));
      }
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  };

  const goStep = async (delta: -1 | 1) => {
    if (submissionInProgress.current) return;
    const nextIdx = index + delta;
    if (nextIdx >= 0 && nextIdx < list.length) {
      setIndex(nextIdx);
      return;
    }
    const nextPage = page + delta;
    if (nextPage < 1) return;
    try {
      const res = await api.getProblems({
        scope: initialContext.scope,
        language: locale,
        classroom: initialContext.classroomId,
        grade: initialContext.grade,
        category: initialContext.category,
        page: nextPage,
      });
      if (res.results.length > 0) {
        setList(res.results);
        setPage(nextPage);
        setTotalCount(res.count);
        setIndex(delta > 0 ? 0 : res.results.length - 1);
      }
    } catch {
      // Ignore boundary errors.
    }
  };

  const absolutePos = (page - 1) * 50 + index + 1;
  const canSubmit = Boolean(item && !submitting && grading?.correct !== true && isAnswerComplete(answer, item.fields));
  const changeAnswer = (value: unknown) => {
    setAnswer(value);
    if (grading && grading.correct === false) setGrading(null);
  };

  return (
    <div className="student-section">
      <div className="student-toolbar-row">
        <button type="button" className="student-btn" onClick={onBack}>
          ← {translateStudent(locale, "backToCategories")}
        </button>
        <span className="student-position-badge">
          {translateStudent(locale, "lessonPosition", { current: absolutePos, total: Math.max(totalCount, absolutePos) })}
        </span>
      </div>

      <StepProgressBar
        current={absolutePos}
        total={Math.max(totalCount, absolutePos)}
        label={translateStudent(locale, "lessonPosition", {
          current: absolutePos,
          total: Math.max(totalCount, absolutePos),
        })}
      />

      <PracticeGoalCard done={goalDone} target={goalTarget} locale={locale} />

      {toast && (
        <div className="student-alert success" role="status">
          {toast}
        </div>
      )}

      {updateAvailable && (
        <div className="student-alert warning" role="alert">
          <span>{translateStudent(locale, "problemUpdated")}</span>
          <button
            type="button"
            className="student-btn primary small"
            onClick={() => void loadProblem(currentProblemId)}
          >
            {translateStudent(locale, "applyProblemUpdate")}
          </button>
        </div>
      )}

      {error && (
        <div className="student-alert error" role="alert">
          {error}
        </div>
      )}

      {loading || !item ? (
        <ProblemSkeleton label={translateStudent(locale, "loading")} />
      ) : (
        <form className="student-problem-card student-has-sticky-bar"
          onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <StudentProblemView
            item={item}
            value={answer}
            enabled={!submitting && grading?.correct !== true}
            locale={locale}
            onChange={changeAnswer}
            onAnswerSelected={(nextValue) => {
              if (grading && nextValue === answer) return;
              changeAnswer(nextValue);
              void handleSubmit(nextValue);
            }}
            assetBaseUrl={api.apiBaseUrl}
          />

          {grading && (
            <div
              className={`student-feedback ${grading.status}`}
              data-testid="practice-grading-feedback"
              role="status"
            >
              {grading.message}
            </div>
          )}

          <div className="student-action-row student-sticky-action-bar">
            <button
              type="submit"
              className="student-btn primary"
              data-testid="practice-submit-btn"
              disabled={!canSubmit}
            >
              {submitting ? translateStudent(locale, "waiting") : translateStudent(locale, "send")}
            </button>
            <div className="student-nav-pair">
              <button
                type="button"
                className="student-btn"
                disabled={submitting || absolutePos <= 1}
                onClick={() => void goStep(-1)}
              >
                {translateStudent(locale, "previous")}
              </button>
              <button
                type="button"
                className="student-btn"
                disabled={submitting || absolutePos >= totalCount}
                onClick={() => void goStep(1)}
              >
                {translateStudent(locale, "next")}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
