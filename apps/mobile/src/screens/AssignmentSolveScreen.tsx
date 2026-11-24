import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnswerInputPanel,
  buildGradingResult,
  displaySubmittedAnswer,
  extractProblemSteps,
  isAnswerComplete,
  normalizeProblemContent,
  normalizeSubmissionAnswer,
  StudentProblemView,
  translateStudent,
  type AssignmentItemData,
  type GradingResultModel,
  type StudentLocale,
} from "@modu/student-renderer";
import {
  ApiError,
  generateSubmissionKey,
  type StudentApiClient,
  type StudentAssignment,
} from "../services/api";
import { ProblemSkeleton } from "../components/LoadingSkeleton";
import { StepProgressBar } from "../components/StepProgressBar";

export interface AssignmentSolveScreenProps {
  api: StudentApiClient;
  assignmentId: number;
  locale: StudentLocale;
  onBack: () => void;
}

export const AssignmentSolveScreen: React.FC<AssignmentSolveScreenProps> = ({
  api,
  assignmentId,
  locale,
  onBack,
}) => {
  const [assignment, setAssignment] = useState<StudentAssignment | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wrongOnly, setWrongOnly] = useState(false);

  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [feedback, setFeedback] = useState<Record<number, GradingResultModel>>({});
  const [retrying, setRetrying] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [draftStatus, setDraftStatus] = useState<Record<number, string>>({});
  const [hints, setHints] = useState<Record<number, Array<Record<string, unknown>>>>({});

  const elapsedRef = useRef<Record<number, number>>({});
  const itemStartRef = useRef<number>(Date.now());
  const draftTimerRef = useRef<number | null>(null);

  const loadAssignment = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await api.getAssignmentDetail(assignmentId);
      const nextAnswers: Record<number, unknown> = {};
      const nextCounts: Record<number, number> = {};
      const nextFeedback: Record<number, GradingResultModel> = {};
      const nextRetrying: Record<number, boolean> = {};
      const nextPending: Record<number, boolean> = {};
      const nextDraftStatus: Record<number, string> = {};
      const nextHints: Record<number, Array<Record<string, unknown>>> = {};

      for (const item of loaded.items) {
        nextCounts[item.id] = item.attempt_count;
        nextHints[item.id] = item.revealed_hints ?? [];
        if (item.attempt_count > 0) {
          nextFeedback[item.id] = buildGradingResult(locale, item.is_correct);
        }

        let answer: unknown = item.draft_answer ?? item.submitted_answer ?? null;
        const [localDraft, pendingReq] = await Promise.all([
          api.readLocalDraft(assignmentId, item.id),
          api.readPendingSubmission(assignmentId, item.id),
        ]);

        if (loaded.can_work && localDraft && item.attempt_count < loaded.max_attempts) {
          const localTime = Date.parse(localDraft.updated_at);
          const remoteTimes = [item.draft_updated_at, item.last_submitted_at]
            .filter(Boolean)
            .map((t) => Date.parse(String(t)))
            .filter((n) => !Number.isNaN(n));
          const latestRemote = remoteTimes.length > 0 ? Math.max(...remoteTimes) : 0;
          if (!Number.isNaN(localTime) && localTime > latestRemote) {
            answer = localDraft.answer;
            nextDraftStatus[item.id] = "localSaved";
            if (item.attempt_count > 0) nextRetrying[item.id] = true;
          }
        }
        if (pendingReq) {
          answer = pendingReq.answer;
          nextPending[item.id] = true;
        }
        nextAnswers[item.id] = answer;
      }

      setAssignment(loaded);
      setAnswers(nextAnswers);
      setCounts(nextCounts);
      setFeedback(nextFeedback);
      setRetrying(nextRetrying);
      setPending(nextPending);
      setDraftStatus(nextDraftStatus);
      setHints(nextHints);
      setIndex((prev) => (loaded.items.length === 0 ? 0 : Math.min(prev, loaded.items.length - 1)));
      itemStartRef.current = Date.now();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translateStudent(locale, "error"));
    } finally {
      setLoading(false);
    }
  }, [api, assignmentId, locale]);

  useEffect(() => {
    void loadAssignment();
    return () => {
      if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
    };
  }, [loadAssignment]);

  const currentItem: AssignmentItemData | null =
    assignment && assignment.items.length > 0 ? assignment.items[index] ?? null : null;

  const normalizedItem = useMemo(
    () => (currentItem ? normalizeProblemContent(currentItem.content, currentItem.id) : null),
    [currentItem],
  );

  const flushItemElapsed = (itemId: number) => {
    const now = Date.now();
    const delta = Math.max(0, now - itemStartRef.current);
    elapsedRef.current[itemId] = (elapsedRef.current[itemId] ?? 0) + delta;
    itemStartRef.current = now;
  };

  const saveDraftToServer = useCallback(
    async (itemId: number, answerVal: unknown) => {
      setDraftStatus((prev) => ({ ...prev, [itemId]: "saving" }));
      try {
        await api.saveAssignmentProgress(assignmentId, itemId, answerVal);
        setDraftStatus((prev) => ({ ...prev, [itemId]: "serverSaved" }));
      } catch (err) {
        setDraftStatus((prev) => ({
          ...prev,
          [itemId]: err instanceof ApiError && err.status >= 400 && err.status < 500 ? "saveRejected" : "localSaved",
        }));
      }
    },
    [api, assignmentId],
  );

  const handleAnswerChange = (itemId: number, nextVal: unknown) => {
    setAnswers((prev) => ({ ...prev, [itemId]: nextVal }));
    void api.writeLocalDraft(assignmentId, itemId, nextVal);
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      void saveDraftToServer(itemId, nextVal);
    }, 650);
  };

  const handleSubmitItem = async () => {
    if (!assignment || !currentItem || !normalizedItem || busy) return;
    const itemId = currentItem.id;
    const rawAnswer = answers[itemId];
    if (!isAnswerComplete(rawAnswer, normalizedItem.fields.length)) return;

    setBusy(true);
    setError("");
    flushItemElapsed(itemId);
    const normalizedAnswer = normalizeSubmissionAnswer(rawAnswer, normalizedItem.fields.length);

    let pendingReq = await api.readPendingSubmission(assignmentId, itemId);
    if (!pendingReq) {
      pendingReq = {
        answer: normalizedAnswer,
        elapsed_ms: elapsedRef.current[itemId] ?? 0,
        submission_key: generateSubmissionKey(),
      };
      await api.writePendingSubmission(assignmentId, itemId, pendingReq);
      setPending((prev) => ({ ...prev, [itemId]: true }));
    }

    try {
      const res = await api.submitAssignmentAnswer({
        assignmentId,
        itemId,
        answer: pendingReq.answer,
        elapsedMs: pendingReq.elapsed_ms,
        submissionKey: pendingReq.submission_key,
      });
      await Promise.all([
        api.clearPendingSubmission(assignmentId, itemId),
        api.clearLocalDraft(assignmentId, itemId),
      ]);
      elapsedRef.current[itemId] = 0;
      setPending((prev) => ({ ...prev, [itemId]: false }));
      setRetrying((prev) => ({ ...prev, [itemId]: false }));
      setCounts((prev) => ({ ...prev, [itemId]: res.attempt_number }));
      setFeedback((prev) => ({
        ...prev,
        [itemId]: buildGradingResult(locale, res.is_correct ?? null),
      }));
      setDraftStatus((prev) => ({ ...prev, [itemId]: "" }));
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
        await api.clearPendingSubmission(assignmentId, itemId);
        setPending((prev) => ({ ...prev, [itemId]: false }));
      }
      setError(err instanceof ApiError ? err.message : translateStudent(locale, "offline"));
    } finally {
      setBusy(false);
    }
  };

  const handleRequestHint = async () => {
    if (!currentItem || busy) return;
    const itemId = currentItem.id;
    const currentHints = hints[itemId] ?? [];
    if (currentHints.length >= currentItem.hint_total) return;
    setBusy(true);
    try {
      const res = await api.requestAssignmentHint(assignmentId, itemId, currentHints.length + 1);
      setHints((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] ?? []), { level: res.level, text: res.hint.text }],
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translateStudent(locale, "error"));
    } finally {
      setBusy(false);
    }
  };

  const handleFinishAssignment = async () => {
    if (!assignment || busy) return;
    setBusy(true);
    setError("");
    try {
      const finished = await api.finishAssignment(assignmentId);
      setAssignment(finished);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translateStudent(locale, "error"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ProblemSkeleton label={translateStudent(locale, "loading")} />;
  }

  if (!assignment) {
    return (
      <div className="student-section">
        <div className="student-alert error">{error || translateStudent(locale, "unavailable")}</div>
        <button type="button" className="student-btn" onClick={onBack}>
          ← {translateStudent(locale, "back")}
        </button>
      </div>
    );
  }

  // Results mode
  if (assignment.submitted_at) {
    const visibleItems =
      wrongOnly && assignment.results_released
        ? assignment.items.filter((it) => it.is_correct === false)
        : assignment.items;

    return (
      <div className="student-section">
        <div className="student-toolbar-row">
          <button type="button" className="student-btn" onClick={onBack}>
            ← {translateStudent(locale, "back")}
          </button>
          <h2>{assignment.title}</h2>
        </div>

        <div className="student-intro-card">
          <h3>{translateStudent(locale, "finished")}</h3>
          {assignment.results_released ? (
            <div className="student-results-summary">
              <strong>
                {translateStudent(locale, "score", {
                  correct: assignment.correct ?? 0,
                  total: assignment.total,
                })}
              </strong>
              <label className="student-switch">
                <input
                  type="checkbox"
                  checked={wrongOnly}
                  onChange={(e) => setWrongOnly(e.target.checked)}
                />
                <span>{translateStudent(locale, "wrong")}</span>
              </label>
            </div>
          ) : (
            <p className="student-muted">{translateStudent(locale, "withheld")}</p>
          )}
        </div>

        <div className="student-results-list">
          {visibleItems.map((it) => {
            const norm = normalizeProblemContent(it.content, it.id);
            const steps = assignment.results_released
              ? extractProblemSteps(norm.problemId, it.solution)
              : [];
            return (
              <article key={it.id} className="student-problem-card">
                <div className="student-assignment-head">
                  <strong>{translateStudent(locale, "question", { number: it.position + 1 })}</strong>
                  {assignment.results_released && it.is_correct !== null && (
                    <span className={`student-badge ${it.is_correct ? "done" : "wrong"}`}>
                      {it.is_correct
                        ? translateStudent(locale, "correct")
                        : translateStudent(locale, "incorrect")}
                    </span>
                  )}
                </div>
                <p className="student-result-prompt">{norm.prompt || norm.title}</p>
                <div className="student-result-answers">
                  <div>
                    <span className="student-muted">{translateStudent(locale, "myAnswer")}: </span>
                    <strong>
                      {displaySubmittedAnswer(norm, it.submitted_answer, translateStudent(locale, "noResponse"))}
                    </strong>
                  </div>
                  {assignment.results_released && it.answer !== undefined && (
                    <div>
                      <span className="student-muted">{translateStudent(locale, "expected")}: </span>
                      <strong>
                        {displaySubmittedAnswer(norm, it.answer, translateStudent(locale, "noResponse"))}
                      </strong>
                    </div>
                  )}
                </div>
                {steps.length > 0 && (
                  <div className="student-solution-box">
                    <strong>{translateStudent(locale, "solution")}</strong>
                    <ol>
                      {steps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // Work mode
  const completedCount = assignment.items.filter((it) => (counts[it.id] ?? it.attempt_count) > 0).length;
  const hasAnyPending = Object.values(pending).some(Boolean);
  const canFinish = !busy && assignment.can_work && completedCount === assignment.total && !hasAnyPending;

  const itemCount = currentItem ? counts[currentItem.id] ?? currentItem.attempt_count : 0;
  const isItemPending = currentItem ? Boolean(pending[currentItem.id]) : false;
  const isItemRetrying = currentItem ? Boolean(retrying[currentItem.id]) : false;
  const canEditItem = Boolean(
    !busy &&
      assignment.can_work &&
      currentItem &&
      !isItemPending &&
      (itemCount === 0 || isItemRetrying) &&
      itemCount < assignment.max_attempts,
  );
  const canSendItem = Boolean(
    !busy &&
      currentItem &&
      normalizedItem &&
      (isItemPending || canEditItem) &&
      isAnswerComplete(answers[currentItem.id], normalizedItem.fields.length),
  );
  const itemFeedback = currentItem ? feedback[currentItem.id] : undefined;
  const itemHints = currentItem ? hints[currentItem.id] ?? [] : [];
  const itemDraftKey = currentItem ? draftStatus[currentItem.id] : "";

  return (
    <div className="student-section">
      <div className="student-toolbar-row">
        <button type="button" className="student-btn" onClick={onBack}>
          ← {translateStudent(locale, "back")}
        </button>
        <h2>{assignment.title}</h2>
        <span className="student-position-badge">
          {translateStudent(locale, "progress", { done: completedCount, total: assignment.total })}
        </span>
      </div>

      <StepProgressBar
        current={completedCount}
        total={assignment.total}
        label={translateStudent(locale, "progress", { done: completedCount, total: assignment.total })}
        steps={assignment.items.map((it, idx) => ({
          id: it.id,
          label: String(it.position + 1),
          done: (counts[it.id] ?? it.attempt_count) > 0,
          current: idx === index,
          correct: feedback[it.id]?.correct ?? null,
        }))}
        onSelectStep={(nextIdx) => {
          if (currentItem) flushItemElapsed(currentItem.id);
          setIndex(nextIdx);
        }}
      />

      {error && (
        <div className="student-alert error" role="alert">
          {error}
        </div>
      )}

      {currentItem && normalizedItem && (
        <div className="student-solve-grid">
          <div className="student-problem-card">
            <div className="student-question-num">
              {translateStudent(locale, "question", { number: currentItem.position + 1 })}
            </div>
            <StudentProblemView
              item={normalizedItem}
              value={answers[currentItem.id]}
              enabled={canEditItem}
              locale={locale}
              onChange={(val) => handleAnswerChange(currentItem.id, val)}
              assetBaseUrl={api.apiBaseUrl}
              hidePanelInputs
            />
          </div>

          <div className="student-controls-card">
            <div className="student-muted">
              {translateStudent(locale, "attempts", {
                count: itemCount,
                max: assignment.max_attempts,
              })}
            </div>

            {!normalizedItem.canvasInputs && !normalizedItem.canvasSelect && (
              <AnswerInputPanel
                item={normalizedItem}
                value={answers[currentItem.id]}
                enabled={canEditItem}
                locale={locale}
                onChange={(val) => handleAnswerChange(currentItem.id, val)}
              />
            )}

            {isItemPending && (
              <div className="student-alert warning">{translateStudent(locale, "pending")}</div>
            )}

            {itemFeedback && (
              <div className={`student-feedback ${itemFeedback.status}`} role="status">
                {itemFeedback.message}
              </div>
            )}

            <div className="student-controls-actions student-sticky-action-bar">
              <button
                type="button"
                className="student-btn primary"
                data-testid="assignment-send-btn"
                disabled={!canSendItem}
                onClick={() => void handleSubmitItem()}
              >
                {busy
                  ? translateStudent(locale, "waiting")
                  : isItemPending
                    ? translateStudent(locale, "resend")
                    : translateStudent(locale, "send")}
              </button>

              {itemCount > 0 && !isItemRetrying && itemCount < assignment.max_attempts && assignment.can_work && (
                <button
                  type="button"
                  className="student-btn"
                  onClick={() => setRetrying((prev) => ({ ...prev, [currentItem.id]: true }))}
                >
                  {translateStudent(locale, "again")}
                </button>
              )}

              {itemCount >= assignment.max_attempts && (
                <p className="student-muted">{translateStudent(locale, "limit")}</p>
              )}
            </div>

            {itemDraftKey && (
              <div className="student-draft-row">
                <span className="student-muted">{translateStudent(locale, itemDraftKey)}</span>
                {itemDraftKey !== "saving" && (
                  <button
                    type="button"
                    className="student-btn small"
                    onClick={() => void saveDraftToServer(currentItem.id, answers[currentItem.id])}
                  >
                    {translateStudent(locale, "save")}
                  </button>
                )}
              </div>
            )}

            {currentItem.hint_total > 0 && (
              <div className="student-hints-box">
                {itemHints.map((h, idx) => (
                  <div key={idx} className="student-hint-item">
                    <strong>{translateStudent(locale, "hintTitle", { number: idx + 1 })}</strong>
                    <p>{String(h.text ?? "")}</p>
                  </div>
                ))}
                {itemHints.length < currentItem.hint_total && assignment.can_work && (
                  <button
                    type="button"
                    className="student-btn small"
                    disabled={busy}
                    onClick={() => void handleRequestHint()}
                  >
                    {translateStudent(locale, "hint")}
                  </button>
                )}
              </div>
            )}

            <div className="student-nav-pair">
              <button
                type="button"
                className="student-btn"
                disabled={index <= 0}
                onClick={() => {
                  flushItemElapsed(currentItem.id);
                  setIndex((i) => Math.max(0, i - 1));
                }}
              >
                {translateStudent(locale, "previous")}
              </button>
              <button
                type="button"
                className="student-btn"
                disabled={index >= assignment.items.length - 1}
                onClick={() => {
                  flushItemElapsed(currentItem.id);
                  setIndex((i) => Math.min(assignment.items.length - 1, i + 1));
                }}
              >
                {translateStudent(locale, "next")}
              </button>
            </div>

            <div className="student-finish-box">
              <button
                type="button"
                className="student-btn primary"
                data-testid="finish-assignment"
                disabled={!canFinish}
                onClick={() => void handleFinishAssignment()}
              >
                {translateStudent(locale, "finish")}
              </button>
              {!canFinish && <p className="student-muted">{translateStudent(locale, "finishHelp")}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
