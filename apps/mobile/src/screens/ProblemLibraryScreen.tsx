import React, { useCallback, useEffect, useRef, useState } from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";
import { PracticeGoalCard } from "../components/PracticeGoalCard";
import { ListSkeleton } from "../components/LoadingSkeleton";
import type {
  CatalogGrade,
  PaginatedProblemsResponse,
  ProblemCatalogResponse,
  ProblemListItem,
  StudentApiClient,
  StudentClassroom,
} from "../services/api";

export interface ProblemLibraryScreenProps {
  api: StudentApiClient;
  locale: StudentLocale;
  active: boolean;
  onOpenProblem: (ctx: {
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
  }) => void;
}

export const ProblemLibraryScreen: React.FC<ProblemLibraryScreenProps> = ({
  api,
  locale,
  active,
  onOpenProblem,
}) => {
  const [classes, setClasses] = useState<StudentClassroom[]>([]);
  const [classroomId, setClassroomId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<ProblemCatalogResponse | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selectedGrade, setSelectedGrade] = useState<number | string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [problemPage, setProblemPage] = useState<PaginatedProblemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const lastRevisionRef = useRef<string>("");

  const scope: "public" | "class" = classroomId === null ? "public" : "class";

  const loadClasses = useCallback(async () => {
    try {
      const list = await api.getStudentClasses();
      setClasses(list);
    } catch {
      // Ignore if unauthenticated or classes unavailable.
    }
  }, [api]);

  const loadProblems = useCallback(
    async (targetGrade: number | string | null, targetCategory: string | null, targetPage: number) => {
      setLoading(true);
      setError("");
      try {
        const res = await api.getProblems({
          scope,
          language: locale,
          classroom: classroomId,
          grade: targetGrade,
          category: targetCategory,
          page: targetPage,
        });
        setProblemPage(res);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [api, scope, locale, classroomId],
  );

  const loadCatalog = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const res = await api.getProblemCatalog({
          scope,
          language: locale,
          classroom: classroomId,
        });
        const prevRev = lastRevisionRef.current;
        lastRevisionRef.current = res.revision;
        setCatalog(res);
        if (silent && prevRev && prevRev !== res.revision && step === 2) {
          void loadProblems(selectedGrade, selectedCategory, page);
        }
      } catch (err) {
        if (!silent) setError(String(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, scope, locale, classroomId, step, selectedGrade, selectedCategory, page, loadProblems],
  );

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    setStep(0);
    setSelectedGrade(null);
    setSelectedCategory(null);
    setPage(1);
    setProblemPage(null);
    void loadCatalog(false);
  }, [locale, classroomId]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadCatalog(true);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [active, loadCatalog]);

  const approvedClasses = classes.filter((c) => c.status === "approved");
  const pendingClasses = classes.filter((c) => c.status === "pending");

  const grades: CatalogGrade[] = catalog?.grades ?? [];
  const totalCatalogProblems = grades.reduce((sum, g) => sum + g.count, 0);
  const currentGradeObj =
    selectedGrade === "__ALL__"
      ? null
      : grades.find((g) => String(g.grade ?? "__OTHER__") === String(selectedGrade));

  const goalDone = catalog?.goal?.completed_ids?.length ?? 0;
  const goalTarget = catalog?.goal?.target ?? 5;

  const gradeLabel = (g: number | string | null) => {
    if (g === "__ALL__") return translateStudent(locale, "allGrades");
    if (g === null || g === "" || g === "__OTHER__") return translateStudent(locale, "otherLevel");
    return translateStudent(locale, "gradeCard", { grade: g });
  };

  const openGrade = (gradeKey: number | string | null) => {
    setSelectedGrade(gradeKey);
    if (gradeKey === "__ALL__") {
      setSelectedCategory(null);
      setStep(2);
      setPage(1);
      void loadProblems(null, null, 1);
    } else {
      setStep(1);
    }
  };

  const openCategory = (catKey: string | null) => {
    setSelectedCategory(catKey);
    setStep(2);
    setPage(1);
    const apiGrade = selectedGrade === "__ALL__" || selectedGrade === "__OTHER__" ? null : selectedGrade;
    void loadProblems(apiGrade, catKey, 1);
  };

  return (
    <div className="student-section">
      <div className="student-intro-card">
        <h2>{translateStudent(locale, "library")}</h2>
        <p>{translateStudent(locale, "libraryWelcome")}</p>
        <div className="student-chip-row" role="group" aria-label="Scope">
          <button
            type="button"
            className={`student-chip${classroomId === null ? " active" : ""}`}
            onClick={() => setClassroomId(null)}
          >
            {translateStudent(locale, "publicProblems")}
          </button>
          {approvedClasses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              className={`student-chip${classroomId === cls.id ? " active" : ""}`}
              onClick={() => setClassroomId(cls.id)}
            >
              {cls.name} · {cls.teacher_name}
            </button>
          ))}
        </div>
        {pendingClasses.length > 0 && (
          <p className="student-muted">
            {translateStudent(locale, "classPending")}: {pendingClasses.map((c) => c.name).join(", ")}
          </p>
        )}
      </div>

      {catalog && !error && (
        <PracticeGoalCard done={goalDone} target={goalTarget} locale={locale} />
      )}

      <div className="student-breadcrumb">
        <button type="button" className="student-link-btn" onClick={() => setStep(0)}>
          {translateStudent(locale, "chooseLevel")}
        </button>
        {step >= 1 && selectedGrade !== null && (
          <>
            <span> / </span>
            <button
              type="button"
              className="student-link-btn"
              onClick={() => (selectedGrade === "__ALL__" ? setStep(0) : setStep(1))}
            >
              {gradeLabel(selectedGrade)}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <span> / </span>
            <strong>{selectedCategory ?? translateStudent(locale, "allCategories")}</strong>
          </>
        )}
      </div>

      {error && (
        <div className="student-alert error" role="alert">
          {error}
          <button type="button" className="student-btn small" onClick={() => void loadCatalog(false)}>
            {translateStudent(locale, "retry")}
          </button>
        </div>
      )}

      {loading && !catalog && <ListSkeleton count={4} label={translateStudent(locale, "loading")} />}

      {!loading && !error && catalog && totalCatalogProblems === 0 && (
        <div className="student-empty">{translateStudent(locale, "libraryEmpty")}</div>
      )}

      {step === 0 && totalCatalogProblems > 0 && (
        <div className="student-path-grid">
          <button type="button" className="student-path-card" onClick={() => openGrade("__ALL__")}>
            <strong>{translateStudent(locale, "allGrades")}</strong>
            <span>{translateStudent(locale, "problemCount", { count: totalCatalogProblems })}</span>
          </button>
          {grades.map((g, idx) => {
            const key = g.grade === null || g.grade === "" ? "__OTHER__" : g.grade;
            return (
              <button
                key={`${String(key)}-${idx}`}
                type="button"
                className="student-path-card"
                onClick={() => openGrade(key)}
              >
                <strong>{gradeLabel(key)}</strong>
                <span>{translateStudent(locale, "problemCount", { count: g.count })}</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && currentGradeObj && (
        <div className="student-path-grid">
          <button type="button" className="student-path-card" onClick={() => openCategory(null)}>
            <strong>{translateStudent(locale, "allCategories")}</strong>
            <span>{translateStudent(locale, "problemCount", { count: currentGradeObj.count })}</span>
          </button>
          {currentGradeObj.categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className="student-path-card"
              onClick={() => openCategory(cat.key)}
            >
              <strong>{cat.key || translateStudent(locale, "otherCategory")}</strong>
              <span>{translateStudent(locale, "problemCount", { count: cat.count })}</span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && problemPage && (
        <div className="student-problem-list-wrap">
          {problemPage.results.length === 0 ? (
            <div className="student-empty">{translateStudent(locale, "libraryEmpty")}</div>
          ) : (
            <>
              <div className="student-list-actions">
                <button
                  type="button"
                  className="student-btn primary"
                  onClick={() =>
                    onOpenProblem({
                      problemId: problemPage.results[0].id,
                      list: problemPage.results,
                      index: 0,
                      page,
                      totalCount: problemPage.count,
                      scope,
                      classroomId,
                      grade: selectedGrade === "__ALL__" || selectedGrade === "__OTHER__" ? null : selectedGrade,
                      category: selectedCategory,
                      goalDone,
                      goalTarget,
                    })
                  }
                >
                  {translateStudent(locale, "startLearning")}
                </button>
                <span className="student-muted">
                  {translateStudent(locale, "problemCount", { count: problemPage.count })}
                </span>
              </div>

              <div className="student-problem-cards">
                {problemPage.results.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className="student-problem-row"
                    onClick={() =>
                      onOpenProblem({
                        problemId: item.id,
                        list: problemPage.results,
                        index: idx,
                        page,
                        totalCount: problemPage.count,
                        scope,
                        classroomId,
                        grade: selectedGrade === "__ALL__" || selectedGrade === "__OTHER__" ? null : selectedGrade,
                        category: selectedCategory,
                        goalDone,
                        goalTarget,
                      })
                    }
                  >
                    <span className="student-problem-num">{(page - 1) * 50 + idx + 1}</span>
                    <span className="student-problem-title">{item.title || item.problem_id || `#${item.id}`}</span>
                    {item.owner_name && <span className="student-muted">{item.owner_name}</span>}
                  </button>
                ))}
              </div>

              {(problemPage.previous || problemPage.next) && (
                <div className="student-pagination">
                  <button
                    type="button"
                    className="student-btn"
                    disabled={!problemPage.previous}
                    onClick={() => {
                      const prevPage = Math.max(1, page - 1);
                      setPage(prevPage);
                      const apiGrade = selectedGrade === "__ALL__" || selectedGrade === "__OTHER__" ? null : selectedGrade;
                      void loadProblems(apiGrade, selectedCategory, prevPage);
                    }}
                  >
                    {translateStudent(locale, "previousPage")}
                  </button>
                  <button
                    type="button"
                    className="student-btn"
                    disabled={!problemPage.next}
                    onClick={() => {
                      const nextPage = page + 1;
                      setPage(nextPage);
                      const apiGrade = selectedGrade === "__ALL__" || selectedGrade === "__OTHER__" ? null : selectedGrade;
                      void loadProblems(apiGrade, selectedCategory, nextPage);
                    }}
                  >
                    {translateStudent(locale, "nextPage")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
