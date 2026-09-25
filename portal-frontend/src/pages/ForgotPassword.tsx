import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AuthLayout } from "../components/AuthLayout";
import { apiFetch, ApiError } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/forgot-password", { method: "POST", body: { email } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "RATE_LIMITED" ? "Too many requests. Wait a while before trying again." : "Couldn't send the reset link. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Locked out? It happens." copy="We'll email you a link to choose a new password.">
      <h2>Reset your password</h2>
      {done ? (
        // Same message whether or not the account exists (the API doesn't say either).
        <div className="notice notice-info">If an account exists for {email}, a reset link is on its way. It's valid for one hour.</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="login-form-sub">Enter the email you signed up with.</p>
          {error && <div className="error-banner">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="login-footnote">
        <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
