import { useState, type FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { landingPathForRole } from "../lib/roles";

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(landingPathForRole(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ACCOUNT_LOCKED") {
          setError("This account is temporarily locked after several failed attempts. Try again in a few minutes.");
        } else if (err.code === "RATE_LIMITED") {
          setError("Too many attempts. Wait a few minutes before trying again.");
        } else {
          setError("Email or password is incorrect.");
        }
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <aside className="login-brand">
        <div className="login-wordmark">Inveon</div>
        <div className="login-brand-copy">
          <h1>One portal for your whole journey here.</h1>
          <p>Applications, assessments, courses, and your team — in one place, whoever you are on the team.</p>
        </div>
        <div className="login-audience">
          <div className="login-audience-item">
            <span className="login-audience-dot" />
            Candidates tracking an application
          </div>
          <div className="login-audience-item">
            <span className="login-audience-dot" />
            Employees and interns
          </div>
          <div className="login-audience-item">
            <span className="login-audience-dot" />
            HR and administrators
          </div>
        </div>
      </aside>

      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login-form-sub">Use the same email and password for every role — the portal knows where to send you.</p>

          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={error ? "has-error" : ""}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={error ? "has-error" : ""}
            />
          </div>

          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="login-footnote">
            Don't have an account yet?{" "}
            <Link href="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
