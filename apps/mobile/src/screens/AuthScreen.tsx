import React, { useState } from "react";
import { translateStudent, type StudentLocale } from "@modu/student-renderer";
import { ApiError, type AuthUser, type StudentApiClient } from "../services/api";

export interface AuthScreenProps {
  api: StudentApiClient;
  locale: StudentLocale;
  notice?: string | null;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ api, locale, notice, onAuthenticated }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim()) {
      setError(translateStudent(locale, "authUsernameRequired"));
      return;
    }
    if (mode === "register") {
      if (password.length < 8) {
        setError(translateStudent(locale, "authPasswordMin"));
        return;
      }
      if (password !== confirmPassword) {
        setError(translateStudent(locale, "authPasswordMismatch"));
        return;
      }
    }

    setBusy(true);
    try {
      const user =
        mode === "login"
          ? await api.login(username.trim(), password)
          : await api.register({
              username: username.trim(),
              email,
              password,
              invite_code: inviteCode,
            });
      onAuthenticated(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(translateStudent(locale, "error"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="student-auth-shell">
      <div className="student-auth-card">
        <div className="student-auth-brand">
          <h1>{translateStudent(locale, "appName")}</h1>
          <p>{translateStudent(locale, "login")}</p>
        </div>

        <div className="student-auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            {translateStudent(locale, "authTabLogin")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            {translateStudent(locale, "authTabRegister")}
          </button>
        </div>

        {notice && (
          <div className="student-alert info" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="student-alert error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="student-auth-form">
          <label>
            <span>{translateStudent(locale, "authUsername")}</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          {mode === "register" && (
            <label>
              <span>{translateStudent(locale, "authEmail")}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
          )}

          <label>
            <span>{translateStudent(locale, "authPassword")}</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          {mode === "register" && (
            <>
              <label>
                <span>{translateStudent(locale, "authConfirmPassword")}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={busy}
                  required
                />
              </label>
              <label>
                <span>{translateStudent(locale, "invite")}</span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  disabled={busy}
                />
              </label>
            </>
          )}

          <button type="submit" className="student-btn primary" disabled={busy}>
            {busy
              ? translateStudent(locale, "waiting")
              : mode === "login"
                ? translateStudent(locale, "authLoginSubmit")
                : translateStudent(locale, "authRegisterSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
};
