import type { AssignmentItemData, StudentLocale, StudentProblemContent } from "@modu/student-renderer";
import { resolveApiBaseUrl } from "./config";
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  assignmentStorageKey,
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "./storage";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  is_staff: boolean;
  role: string;
}

export interface StudentClassroom {
  id: number;
  name: string;
  teacher_name: string;
  status: "approved" | "pending" | string;
}

export interface CatalogCategory {
  key: string;
  count: number;
}

export interface CatalogGrade {
  grade: number | string | null;
  count: number;
  categories: CatalogCategory[];
}

export interface ProblemCatalogResponse {
  revision: string;
  grades: CatalogGrade[];
  goal: {
    target: number;
    completed_ids: Array<number | string>;
  };
}

export interface ProblemListItem {
  id: number;
  problem_id?: string;
  title: string;
  owner_name?: string;
  grade?: number | string | null;
  category?: string;
}

export interface PaginatedProblemsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ProblemListItem[];
}

export interface StudentAssignment {
  id: number;
  recipient_id: number;
  title: string;
  status: string;
  starts_at: string | null;
  due_at: string | null;
  submitted_at: string | null;
  can_work: boolean;
  results_released: boolean;
  total: number;
  completed: number;
  max_attempts: number;
  correct: number | null;
  accuracy: number | null;
  items: AssignmentItemData[];
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export function generateSubmissionKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatKstDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())} (KST)`;
}

export class StudentApiClient {
  private token: string | null = null;
  private user: AuthUser | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor(private readonly baseUrl: string = resolveApiBaseUrl()) {}

  get apiBaseUrl(): string {
    return this.baseUrl;
  }

  get currentUser(): AuthUser | null {
    return this.user;
  }

  get currentToken(): string | null {
    return this.token;
  }

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  async restoreSession(): Promise<AuthUser | null> {
    const [token, userJson] = await Promise.all([
      getStorageItem(AUTH_TOKEN_KEY),
      getStorageItem(AUTH_USER_KEY),
    ]);
    if (!token || !userJson) {
      this.token = null;
      this.user = null;
      return null;
    }
    try {
      const parsed = JSON.parse(userJson) as AuthUser;
      this.token = token;
      this.user = parsed;
      return parsed;
    } catch {
      await this.clearSession();
      return null;
    }
  }

  async saveSession(token: string, user: AuthUser): Promise<void> {
    this.token = token;
    this.user = user;
    await Promise.all([
      setStorageItem(AUTH_TOKEN_KEY, token),
      setStorageItem(AUTH_USER_KEY, JSON.stringify(user)),
    ]);
  }

  async clearSession(): Promise<void> {
    this.token = null;
    this.user = null;
    await Promise.all([
      removeStorageItem(AUTH_TOKEN_KEY),
      removeStorageItem(AUTH_USER_KEY),
    ]);
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    opts: { auth?: boolean } = { auth: true },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string> | undefined),
    };
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (opts.auth !== false && this.token) {
      headers.Authorization = `Token ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && opts.auth !== false) {
      await this.clearSession();
      this.onUnauthorized?.();
      throw new ApiError(401, "loginExpired");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const msg =
        data && typeof data === "object"
          ? String(
              (data as Record<string, unknown>).detail ??
                (data as Record<string, unknown>).error ??
                Object.values(data as Record<string, unknown>)[0] ??
                `HTTP ${response.status}`,
            )
          : `HTTP ${response.status}`;
      throw new ApiError(response.status, msg, data);
    }

    return data as T;
  }

  // Auth
  async login(username: string, password: string): Promise<AuthUser> {
    const res = await this.request<{ token: string; user: AuthUser }>(
      "/api/v1/auth/login/",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      { auth: false },
    );
    await this.saveSession(res.token, res.user);
    return res.user;
  }

  async register(params: {
    username: string;
    email?: string;
    password: string;
    invite_code?: string;
  }): Promise<AuthUser> {
    const payload: Record<string, string> = {
      username: params.username,
      password: params.password,
    };
    if (params.email?.trim()) payload.email = params.email.trim();
    if (params.invite_code?.trim()) payload.invite_code = params.invite_code.trim();
    const res = await this.request<{ token: string; user: AuthUser }>(
      "/api/v1/auth/register/",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      { auth: false },
    );
    await this.saveSession(res.token, res.user);
    return res.user;
  }

  async fetchMe(): Promise<AuthUser> {
    const user = await this.request<AuthUser>("/api/v1/auth/me/");
    this.user = user;
    await setStorageItem(AUTH_USER_KEY, JSON.stringify(user));
    return user;
  }

  async logout(): Promise<void> {
    if (this.token) {
      try {
        await this.request("/api/v1/auth/logout/", { method: "POST" });
      } catch {
        // Best-effort logout.
      }
    }
    await this.clearSession();
  }

  // Classes & Practice
  async getStudentClasses(): Promise<StudentClassroom[]> {
    return this.request<StudentClassroom[]>("/api/v1/student/classes/");
  }

  async joinClass(inviteCode: string): Promise<void> {
    await this.request("/api/v1/student/join-class/", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode }),
    });
  }

  async getProblemCatalog(params: {
    scope: "public" | "class";
    language: StudentLocale;
    classroom?: number | null;
  }): Promise<ProblemCatalogResponse> {
    const q = new URLSearchParams({
      scope: params.scope,
      language: params.language,
    });
    if (params.classroom != null) q.set("classroom", String(params.classroom));
    return this.request<ProblemCatalogResponse>(`/api/v1/problems/catalog/?${q.toString()}`);
  }

  async getProblems(params: {
    scope: "public" | "class";
    language: StudentLocale;
    page?: number;
    classroom?: number | null;
    grade?: number | string | null;
    category?: string | null;
  }): Promise<PaginatedProblemsResponse> {
    const q = new URLSearchParams({
      scope: params.scope,
      language: params.language,
      page: String(params.page ?? 1),
    });
    if (params.classroom != null) q.set("classroom", String(params.classroom));
    if (params.grade !== undefined && params.grade !== null && params.grade !== "") {
      q.set("grade", String(params.grade));
    }
    if (params.category) q.set("category", params.category);
    return this.request<PaginatedProblemsResponse>(`/api/v1/problems/?${q.toString()}`);
  }

  async getStudentProblem(problemId: number): Promise<StudentProblemContent> {
    return this.request<StudentProblemContent>(`/api/v1/problems/${problemId}/?presentation=student`);
  }

  async getProblemVersion(problemId: number): Promise<{ revision: string }> {
    return this.request<{ revision: string }>(`/api/v1/problems/${problemId}/version/`);
  }

  async submitPracticeAttempt(params: {
    problem: number;
    submitted_answer: unknown;
    content_revision?: string;
  }): Promise<{ is_correct: boolean }> {
    return this.request<{ is_correct: boolean }>("/api/v1/attempts/", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // Assignments
  async getAssignments(): Promise<StudentAssignment[]> {
    return this.request<StudentAssignment[]>("/api/v1/student/assignments/");
  }

  async getAssignmentDetail(assignmentId: number): Promise<StudentAssignment> {
    return this.request<StudentAssignment>(`/api/v1/student/assignments/${assignmentId}/`);
  }

  async saveAssignmentProgress(
    assignmentId: number,
    itemId: number,
    answer: unknown,
  ): Promise<{ saved: boolean }> {
    return this.request<{ saved: boolean }>(
      `/api/v1/student/assignments/${assignmentId}/progress/`,
      {
        method: "PUT",
        body: JSON.stringify({ item_id: itemId, answer }),
      },
    );
  }

  async submitAssignmentAnswer(params: {
    assignmentId: number;
    itemId: number;
    answer: unknown;
    elapsedMs: number;
    submissionKey: string;
  }): Promise<{ attempt_id: number; item_id: number; attempt_number: number; is_correct?: boolean | null }> {
    return this.request(`/api/v1/student/assignments/${params.assignmentId}/answers/`, {
      method: "POST",
      body: JSON.stringify({
        item_id: params.itemId,
        answer: params.answer,
        elapsed_ms: Math.max(0, Math.min(86400000, Math.round(params.elapsedMs))),
        submission_key: params.submissionKey,
      }),
    });
  }

  async requestAssignmentHint(
    assignmentId: number,
    itemId: number,
    level: number,
  ): Promise<{ level: number; hint: { text: string } }> {
    return this.request(`/api/v1/student/assignments/${assignmentId}/hints/`, {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, level }),
    });
  }

  async finishAssignment(assignmentId: number): Promise<StudentAssignment> {
    return this.request<StudentAssignment>(
      `/api/v1/student/assignments/${assignmentId}/submit/`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  // Local draft / pending helpers
  async readLocalDraft(assignmentId: number, itemId: number): Promise<{ answer: unknown; updated_at: string } | null> {
    if (!this.user) return null;
    const raw = await getStorageItem(assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "draft"));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async writeLocalDraft(assignmentId: number, itemId: number, answer: unknown): Promise<void> {
    if (!this.user) return;
    await setStorageItem(
      assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "draft"),
      JSON.stringify({ answer, updated_at: new Date().toISOString() }),
    );
  }

  async clearLocalDraft(assignmentId: number, itemId: number): Promise<void> {
    if (!this.user) return;
    await removeStorageItem(assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "draft"));
  }

  async readPendingSubmission(
    assignmentId: number,
    itemId: number,
  ): Promise<{ answer: unknown; elapsed_ms: number; submission_key: string } | null> {
    if (!this.user) return null;
    const raw = await getStorageItem(assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "pending"));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async writePendingSubmission(
    assignmentId: number,
    itemId: number,
    payload: { answer: unknown; elapsed_ms: number; submission_key: string },
  ): Promise<void> {
    if (!this.user) return;
    await setStorageItem(
      assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "pending"),
      JSON.stringify(payload),
    );
  }

  async clearPendingSubmission(assignmentId: number, itemId: number): Promise<void> {
    if (!this.user) return;
    await removeStorageItem(assignmentStorageKey(this.baseUrl, this.user.id, assignmentId, itemId, "pending"));
  }
}
