import { useState, type FormEvent } from "react";
import { Link, useSearch } from "wouter";
import { AuthLayout } from "../components/AuthLayout";
import { apiFetch, ApiError } from "../lib/api";

/** Landing page for the link in the password-reset email (/reset-password?token=…). */
export default function ResetPassword() {
  const token = new URLSearchParams(useSearch()).get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its token. Open the link from your email again.");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) return setError("Password must be at least 10 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/reset-password", { method: "POST", body: { token, newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password." copy="Resetting signs you out everywhere else, so an old session can't linger.">
      <h2>New password</h2>
      {done ? (
        <div className="notice notice-info">Password updated. Sign in with your new password.</div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label htmlFor="password">New password</label>
            <input id="password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm new password</label>
            <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="submit-button" type="submit" disabled={submitting || !token}>
            {submitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
      <p className="login-footnote">
        <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Go to sign in →</Link>
      </p>
    </AuthLayout>
  );
}
