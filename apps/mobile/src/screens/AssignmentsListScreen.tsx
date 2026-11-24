import React, { useCallback, useEffect, useState } from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";
import { ListSkeleton } from "../components/LoadingSkeleton";
import {
  ApiError,
  formatKstDate,
  type AuthUser,
  type StudentApiClient,
  type StudentAssignment,
} from "../services/api";

export interface AssignmentsListScreenProps {
  api: StudentApiClient;
  user: AuthUser;
  locale: StudentLocale;
  refreshTick: number;
  onOpenAssignment: (assignmentId: number) => void;
}

export const AssignmentsListScreen: React.FC<AssignmentsListScreenProps> = ({
  api,
  user,
  locale,
  refreshTick,
  onOpenAssignment,
}) => {
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");
  const [joinError, setJoinError] = useState("");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.getAssignments();
      setAssignments(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : translateStudent(locale, "error"));
    } finally {
      setLoading(false);
    }
  }, [api, locale]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, refreshTick]);

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinError("");
    setJoinMessage("");
    try {
      await api.joinClass(inviteCode.trim());
      setJoinMessage(translateStudent(locale, "joined"));
      setInviteCode("");
      setJoinOpen(false);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : translateStudent(locale, "error"));
    } finally {
      setJoinBusy(false);
    }
  };

  return (
    <div className="student-section">
      <div className="student-intro-card">
        <div className="student-intro-top">
          <div>
            <h2>
              {user.username} · {translateStudent(locale, "title")}
            </h2>
            <p>{translateStudent(locale, "welcome")}</p>
            <p className="student-muted">{translateStudent(locale, "privateAssignments")}</p>
          </div>
          <button
            type="button"
            className="student-btn primary"
            data-testid="join-class-open"
            onClick={() => {
              setJoinOpen((v) => !v);
              setJoinError("");
            }}
          >
            {translateStudent(locale, "join")}
          </button>
        </div>

        {joinMessage && (
          <div className="student-alert success" role="status">
            {joinMessage}
          </div>
        )}

        {joinOpen && (
          <form className="student-join-form" onSubmit={handleJoinClass}>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={translateStudent(locale, "code")}
              disabled={joinBusy}
              required
            />
            <button type="submit" className="student-btn primary" disabled={joinBusy}>
              {joinBusy ? translateStudent(locale, "waiting") : translateStudent(locale, "joinButton")}
            </button>
            <button type="button" className="student-btn" onClick={() => setJoinOpen(false)}>
              {translateStudent(locale, "cancel")}
            </button>
            {joinError && <div className="student-alert error">{joinError}</div>}
          </form>
        )}
      </div>

      {error && (
        <div className="student-alert error" role="alert">
          {error}
          <button type="button" className="student-btn small" onClick={() => void loadAssignments()}>
            {translateStudent(locale, "retry")}
          </button>
        </div>
      )}

      {loading ? (
        <ListSkeleton count={3} label={translateStudent(locale, "loading")} />
      ) : assignments.length === 0 ? (
        <div className="student-empty">{translateStudent(locale, "empty")}</div>
      ) : (
        <div className="student-assignment-grid">
          {assignments.map((a) => {
            const pct = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
            const statusText = a.submitted_at
              ? translateStudent(locale, "submitted")
              : a.can_work
                ? translateStudent(locale, "ready")
                : translateStudent(locale, "closed");
            return (
              <article key={a.id} className="student-assignment-card" data-testid={`assignment-card-${a.id}`}>
                <div className="student-assignment-head">
                  <h3>{a.title}</h3>
                  <span className={`student-badge ${a.submitted_at ? "done" : a.can_work ? "open" : "closed"}`}>
                    {statusText}
                  </span>
                </div>
                <div className="student-assignment-meta">
                  {a.starts_at && (
                    <span>
                      {translateStudent(locale, "start")}: {formatKstDate(a.starts_at)}
                    </span>
                  )}
                  <span>
                    {translateStudent(locale, "due")}:{" "}
                    {a.due_at ? formatKstDate(a.due_at) : translateStudent(locale, "noDeadline")}
                  </span>
                </div>
                <div className="student-progress-row">
                  <div className="student-progress-track">
                    <div className="student-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="student-muted">
                    {translateStudent(locale, "progress", { done: a.completed, total: a.total })}
                  </span>
                </div>
                <div className="student-assignment-footer">
                  <button
                    type="button"
                    className="student-btn primary"
                    data-testid={`open-assignment-${a.id}`}
                    onClick={() => onOpenAssignment(a.id)}
                  >
                    {a.submitted_at ? translateStudent(locale, "results") : translateStudent(locale, "open")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
