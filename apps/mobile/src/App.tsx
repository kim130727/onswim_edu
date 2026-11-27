import React, { useEffect, useMemo, useState } from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";
import { LanguageToggleButton } from "./components/LanguageToggleButton";
import { AuthScreen } from "./screens/AuthScreen";
import { AssignmentsListScreen } from "./screens/AssignmentsListScreen";
import { AssignmentSolveScreen } from "./screens/AssignmentSolveScreen";
import { PracticeLearningScreen, type PracticeSessionContext } from "./screens/PracticeLearningScreen";
import { ProblemLibraryScreen } from "./screens/ProblemLibraryScreen";
import { StudentPreviewRoute } from "./screens/StudentPreviewRoute";
import { StudentApiClient, type AuthUser } from "./services/api";
import { getStorageItem, LOCALE_KEY, setStorageItem } from "./services/storage";

export interface AppProps {
  apiClient?: StudentApiClient;
}

export const App: React.FC<AppProps> = ({ apiClient }) => {
  const api = useMemo(() => apiClient ?? new StudentApiClient(), [apiClient]);
  const isStandalonePreview = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("studentPreview") === "1";
    } catch {
      return false;
    }
  }, []);

  const [locale, setLocale] = useState<StudentLocale>("ko");
  const [restoring, setRestoring] = useState(!isStandalonePreview);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"public" | "assignments">("public");
  const [practiceCtx, setPracticeCtx] = useState<PracticeSessionContext | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [dismissedPortraitGate, setDismissedPortraitGate] = useState(false);

  useEffect(() => {
    void getStorageItem(LOCALE_KEY).then((saved) => {
      if (saved === "ko" || saved === "uk") {
        setLocale(saved);
      }
    });
  }, []);

  const handleLocaleChange = (next: StudentLocale) => {
    setLocale(next);
    void setStorageItem(LOCALE_KEY, next);
  };

  useEffect(() => {
    if (isStandalonePreview) return;
    api.setUnauthorizedHandler(() => {
      setUser(null);
      setPracticeCtx(null);
      setActiveAssignmentId(null);
      setAuthNotice(translateStudent(locale, "loginExpired"));
    });
    let active = true;
    void api.restoreSession().then((restored) => {
      if (!active) return;
      setUser(restored);
      setRestoring(false);
    });
    return () => {
      active = false;
      api.setUnauthorizedHandler(null);
    };
  }, [api, isStandalonePreview, locale]);

  if (isStandalonePreview) {
    return (
      <div className="student-app-shell">
        <div className="student-topbar">
          <span className="student-brand">{translateStudent(locale, "appName")}</span>
          <LanguageToggleButton locale={locale} onChange={handleLocaleChange} />
        </div>
        <StudentPreviewRoute locale={locale} />
      </div>
    );
  }

  return (
    <div className="student-app-shell">
      {!dismissedPortraitGate && (
        <div className="student-portrait-gate" role="dialog" aria-modal="true" aria-label="가로 화면 안내">
          <div className="student-portrait-gate-card">
            <div className="student-portrait-gate-icon" aria-hidden="true">📱↻</div>
            <strong>가로 화면으로 돌려 주세요</strong>
            <p>수학 문제와 도형을 선명하게 볼 수 있도록 가로 화면에 최적화되어 있습니다.</p>
            <button
              type="button"
              className="student-btn small"
              onClick={() => setDismissedPortraitGate(true)}
            >
              세로로 계속 보기
            </button>
          </div>
        </div>
      )}
      <header className="student-topbar">
        <div className="student-topbar-left">
          <span className="student-brand">{translateStudent(locale, "appName")}</span>
        </div>
        <div className="student-topbar-right">
          {user && (
            <>
              <button
                type="button"
                className="student-btn small"
                onClick={() => setRefreshTick((v) => v + 1)}
              >
                {translateStudent(locale, "refresh")}
              </button>
              <button
                type="button"
                className="student-btn small"
                data-testid="logout-btn"
                onClick={() => {
                  void api.logout().then(() => {
                    setUser(null);
                    setPracticeCtx(null);
                    setActiveAssignmentId(null);
                    setAuthNotice(null);
                  });
                }}
              >
                {translateStudent(locale, "logout")}
              </button>
            </>
          )}
          <LanguageToggleButton locale={locale} onChange={handleLocaleChange} />
        </div>
      </header>

      {restoring ? (
        <div className="student-empty">{translateStudent(locale, "loading")}</div>
      ) : !user ? (
        <AuthScreen
          api={api}
          locale={locale}
          notice={authNotice}
          onAuthenticated={(loggedIn) => {
            setUser(loggedIn);
            setAuthNotice(null);
          }}
        />
      ) : (
        <>
          {!practiceCtx && activeAssignmentId === null && (
            <nav className="student-tabs" role="tablist" aria-label={translateStudent(locale, "learningHome")}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "public"}
                className={`student-tab${activeTab === "public" ? " active" : ""}`}
                onClick={() => setActiveTab("public")}
              >
                {translateStudent(locale, "publicTab")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "assignments"}
                className={`student-tab${activeTab === "assignments" ? " active" : ""}`}
                onClick={() => setActiveTab("assignments")}
              >
                {translateStudent(locale, "title")}
              </button>
            </nav>
          )}

          <main className="student-main">
            {practiceCtx ? (
              <PracticeLearningScreen
                api={api}
                locale={locale}
                initialContext={practiceCtx}
                onBack={() => setPracticeCtx(null)}
              />
            ) : activeAssignmentId !== null ? (
              <AssignmentSolveScreen
                api={api}
                assignmentId={activeAssignmentId}
                locale={locale}
                onBack={() => {
                  setActiveAssignmentId(null);
                  setRefreshTick((v) => v + 1);
                }}
              />
            ) : activeTab === "public" ? (
              <ProblemLibraryScreen
                api={api}
                locale={locale}
                active={activeTab === "public"}
                onOpenProblem={(ctx) => setPracticeCtx(ctx)}
              />
            ) : (
              <AssignmentsListScreen
                api={api}
                user={user}
                locale={locale}
                refreshTick={refreshTick}
                onOpenAssignment={(id) => setActiveAssignmentId(id)}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
};
