import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../App";
import { PracticeLearningScreen } from "../screens/PracticeLearningScreen";
import { StudentApiClient } from "../services/api";

describe("Student React App (auth, session persistence, locale, practice)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grades a practice choice immediately without regrading the same selection", async () => {
    const api = new StudentApiClient("");
    vi.spyOn(api, "getStudentProblem").mockResolvedValue({
      id: 7,
      revision: "r1",
      input_schema: { fields: [{ type: "choice", choices: [{ label: "○", value: "circle" }, { label: "×", value: "cross" }] }] },
    });
    const submit = vi.spyOn(api, "submitPracticeAttempt").mockResolvedValue({ is_correct: false });
    render(<PracticeLearningScreen api={api} locale="ko" onBack={() => {}}
      initialContext={{
        problemId: 7, list: [], index: 0, page: 1, totalCount: 1, scope: "public",
        classroomId: null, grade: null, category: null, goalDone: 0, goalTarget: 5,
      }} />);
    const choice = await screen.findByRole("button", { name: "○" });
    fireEvent.click(choice);
    expect(await screen.findByTestId("practice-grading-feedback")).toHaveTextContent("다시 생각해 볼까요?");
    expect(submit).toHaveBeenCalledWith({ problem: 7, submitted_answer: "circle", content_revision: "r1" });
    fireEvent.click(choice);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("logs in, persists session across remount, switches language, and logs out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/login/")) {
        return new Response(
          JSON.stringify({
            token: "tok-123",
            user: { id: 7, username: "student1", email: "", is_staff: false, role: "student" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/student/classes/")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/v1/problems/catalog/")) {
        return new Response(
          JSON.stringify({ revision: "r1", grades: [], goal: { target: 5, completed_ids: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/auth/logout/")) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const { unmount } = render(<App apiClient={new StudentApiClient("")} />);

    // Login screen shown initially
    expect(await screen.findByText("로그인하고 나의 학습을 시작해요")).toBeInTheDocument();

    // Toggle language to Ukrainian and back
    fireEvent.click(screen.getByTestId("language-toggle"));
    expect(await screen.findByText("Увійдіть, щоб почати навчання")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("language-toggle"));
    expect(await screen.findByText("로그인하고 나의 학습을 시작해요")).toBeInTheDocument();

    // Submit login
    fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "student1" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "공개 문제" })).toBeInTheDocument();
    });

    // Unmount and remount to verify session persistence
    unmount();
    render(<App apiClient={new StudentApiClient("")} />);
    expect(await screen.findByRole("tab", { name: "공개 문제" })).toBeInTheDocument();

    // Logout
    fireEvent.click(screen.getByTestId("logout-btn"));
    expect(await screen.findByText("로그인하고 나의 학습을 시작해요")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
