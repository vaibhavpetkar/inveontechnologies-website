import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Cloud, Fingerprint } from "lucide-react";
import { passkeysSupported } from "../lib/webauthn";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { ErrorNote, Field, useAction } from "../components/ui";

export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand auth-brand">
          <Cloud size={24} /> Inveon Cloud
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login, completeLogin, loginWithPasskey } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [methods, setMethods] = useState<string[]>([]);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const { busy, error, setError, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const next = await login(email, password);
      if (next) {
        setChallenge(next.challengeToken);
        setMethods(next.methods);
        setCode("");
        return;
      }
      navigate("/servers");
    });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      try {
        await completeLogin(challenge!, useRecovery ? { recoveryCode: code.trim() } : { code: code.replace(/\s/g, "") });
        navigate("/servers");
      } catch (err) {
        // An expired step sends you back to the password.
        if (err instanceof ApiError && err.code === "INVALID_CHALLENGE") setChallenge(null);
        throw err;
      }
    });
  };
  const withPasskey = (challengeToken?: string) =>
    void run(async () => {
      try {
        await loginWithPasskey(challengeToken);
        navigate("/servers");
      } catch (err) {
        if (err instanceof ApiError && err.code === "INVALID_CHALLENGE") setChallenge(null);
        throw err;
      }
    });
  if (challenge) {
    const totp = methods.includes("totp");
    return (
      <AuthFrame title="Two-factor authentication">
        {methods.includes("passkey") && passkeysSupported() && (
          <>
            <button type="button" className={`btn btn-block ${totp ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => withPasskey(challenge)}>
              <Fingerprint size={16} /> Use your passkey
            </button>
            {!totp && <ErrorNote error={error} />}
          </>
        )}
        {totp && (
          <form onSubmit={submitCode} className="form">
            {useRecovery ? (
              <Field label="Recovery code" hint="One of the codes you saved when you turned on two-factor. Each works once.">
                <input autoComplete="off" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxx-xxxx-xxxx" />
              </Field>
            ) : (
              <Field label="Code from your authenticator app">
                <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </Field>
          )}
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Checking…" : "Verify"}
          </button>
        </form>
        )}
        <p className="muted small center">
          {totp && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setError(null);
              }}
            >
              {useRecovery ? "Use a code from the app" : "Use a recovery code"}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setChallenge(null)}>
            Start again
          </button>
        </p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Sign in">
      <form onSubmit={submit} className="form">
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorNote error={error} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {passkeysSupported() && (
        <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => withPasskey()}>
          <Fingerprint size={16} /> Sign in with a passkey
        </button>
      )}
      <p className="muted small center">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </AuthFrame>
  );
}

function SignupForm({ inviteToken, invitedEmail }: { inviteToken?: string; invitedEmail?: string }) {
  const { signup } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: "", email: invitedEmail ?? "", password: "", orgName: "" });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await signup({ name: form.name, email: form.email, password: form.password, ...(inviteToken ? { inviteToken } : { orgName: form.orgName || undefined }) });
      navigate("/servers");
    });
  };
  return (
    <form onSubmit={submit} className="form">
      <Field label="Your name">
        <input required autoComplete="name" value={form.name} onChange={set("name")} />
      </Field>
      <Field label="Email">
        <input type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <input type="password" required minLength={10} autoComplete="new-password" value={form.password} onChange={set("password")} />
      </Field>
      {!inviteToken && (
        <Field label="Organization name" hint="You can invite your team after signing up.">
          <input value={form.orgName} onChange={set("orgName")} placeholder="Inveon Technologies" />
        </Field>
      )}
      <ErrorNote error={error} />
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Creating account…" : inviteToken ? "Create account and join" : "Create account"}
      </button>
    </form>
  );
}

export function Signup() {
  return (
    <AuthFrame title="Create your account">
      <SignupForm />
      <p className="muted small center">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, reloadMe, setOrgId } = useAuth();
  const [, navigate] = useLocation();
  const [invite, setInvite] = useState<{ email: string; role: string; orgName: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const accept = useAction();

  useEffect(() => {
    api<{ invite: { email: string; role: string; orgName: string } }>(`/auth/invites/${encodeURIComponent(token)}`)
      .then((r) => setInvite(r.invite))
      .catch((e) => setLoadError(e.message));
  }, [token]);

  return (
    <AuthFrame title="Join an organization">
      {loadError && <ErrorNote error={loadError} />}
      {invite && (
        <>
          <p>
            You've been invited to <strong>{invite.orgName}</strong> as <strong>{invite.role}</strong>.
          </p>
          {user ? (
            <>
              <ErrorNote error={accept.error} />
              <button
                className="btn btn-primary btn-block"
                disabled={accept.busy}
                onClick={() =>
                  void accept.run(async () => {
                    const r = await api<{ orgId: string }>("/auth/invites/accept", { method: "POST", body: { token } });
                    await reloadMe();
                    setOrgId(r.orgId);
                    navigate("/servers");
                  })
                }
              >
                Accept as {user.email}
              </button>
            </>
          ) : (
            <>
              <SignupForm inviteToken={token} invitedEmail={invite.email} />
              <p className="muted small center">
                Have an account? <Link href={`/login`}>Sign in</Link>, then open this link again.
              </p>
            </>
          )}
        </>
      )}
    </AuthFrame>
  );
}
