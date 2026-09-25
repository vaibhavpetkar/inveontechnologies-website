import { useState, type FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { apiFetch, ApiError } from "../lib/api";

export default function Register() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/register", { method: "POST", body: { email, password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Couldn't create your account. Try a different email or password.");
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="login-screen">
        <aside className="login-brand">
          <div className="login-wordmark">Inveon</div>
          <div className="login-brand-copy">
            <h1>You're almost in.</h1>
            <p>Your account has been created.</p>
          </div>
          <div />
        </aside>
        <div className="login-form-panel">
          <div className="login-form">
            <h2>Account created</h2>
            <p className="login-form-sub">
              You can sign in right away with the email and password you just set. We've also sent a verification link to your
              email — open it to confirm your address (check spam if it doesn't arrive).
            </p>
            <button className="submit-button" onClick={() => navigate("/login")}>
              Go to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <aside className="login-brand">
        <div className="login-wordmark">Inveon</div>
        <div className="login-brand-copy">
          <h1>Create your candidate account.</h1>
          <p>One account gets you through applications, assessments, and — once you're in — your whole time here.</p>
        </div>
        <div className="login-audience">
          <div className="login-audience-item">
            <span className="login-audience-dot" />
            Takes under a minute
          </div>
          <div className="login-audience-item">
            <span className="login-audience-dot" />
            Already have an account? Sign in instead
          </div>
        </div>
      </aside>

      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Create your account</h2>
          <p className="login-form-sub">For candidates applying to a role. Employees are set up by HR.</p>

          {error && <div className="error-banner">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <p className="login-footnote">
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
