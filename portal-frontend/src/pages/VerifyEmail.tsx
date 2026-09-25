import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { AuthLayout } from "../components/AuthLayout";
import { apiFetch, ApiError } from "../lib/api";

/** Landing page for the link in the verification email (/verify-email?token=…). */
export default function VerifyEmail() {
  const token = new URLSearchParams(useSearch()).get("token");
  const [state, setState] = useState<"working" | "done" | "error">(token ? "working" : "error");
  const [message, setMessage] = useState(token ? "" : "This link is missing its token. Open the link from your email again.");
  const sent = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against StrictMode's double effect
    // spending it and then reporting the second attempt as a failure.
    if (!token || sent.current) return;
    sent.current = true;
    apiFetch("/api/v1/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setState("done"))
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Couldn't reach the server. Try the link again in a moment.");
      });
  }, [token]);

  return (
    <AuthLayout title="Confirming your email." copy="One quick check so we know messages about your applications reach you.">
      <h2>Email verification</h2>
      {state === "working" && <p className="login-form-sub">Verifying…</p>}
      {state === "done" && <div className="notice notice-info">Your email is verified. You're all set.</div>}
      {state === "error" && <div className="error-banner">{message}</div>}
      <p className="login-footnote">
        <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Go to sign in →</Link>
      </p>
    </AuthLayout>
  );
}
