import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import qrcode from "qrcode-generator";
import { Download, ShieldCheck, ShieldOff } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { TwoFactorStatus } from "../lib/types";
import { CopyField, ErrorNote, Field, Loading, useAction } from "./ui";

/** Renders text as a QR code, drawn locally: the secret never leaves the browser. */
export function QrCode({ text, size = 200 }: { text: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, count: n + 8 };
  }, [text]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${count} ${count}`} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges">
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** The one-time display of recovery codes. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `Inveon Cloud recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inveon-cloud-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <div className="note note-warn">Save these recovery codes somewhere safe, such as a password manager. Each one signs you in once if you lose your phone. They won't be shown again.</div>
      <ul className="recovery-codes">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={download}>
          <Download size={16} /> Download
        </button>
        <CopyField value={codes.join("\n")} label="Copy all" />
      </div>
      <button type="button" className="btn btn-primary" onClick={onDone}>
        I've saved them
      </button>
    </div>
  );
}

/** Enrolment: scan, confirm with a code, then save the recovery codes. */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useAction();
  const confirm = useAction();
  const started = useRef(false);

  useEffect(() => {
    // Once only (StrictMode runs effects twice): each call makes a new pending secret.
    if (started.current) return;
    started.current = true;
    void start.run(async () => setSetup(await api<{ secret: string; otpauthUri: string }>("/auth/2fa/setup", { method: "POST" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;
  if (start.error) return <ErrorNote error={start.error} />;
  if (!setup) return <Loading />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void confirm.run(async () => {
      const r = await api<{ recoveryCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: { code: code.replace(/\s/g, "") } });
      setCodes(r.recoveryCodes);
    });
  };
  const grouped = setup.secret.replace(/(.{4})/g, "$1 ").trim();
  return (
    <form className="form" onSubmit={submit}>
      <p>Scan this with an authenticator app (1Password, Google Authenticator, Authy, or similar), then enter the 6-digit code it shows.</p>
      <div className="qr-wrap">
        <QrCode text={setup.otpauthUri} />
      </div>
      <details>
        <summary className="small">Can't scan? Enter the key by hand</summary>
        <CopyField value={grouped} />
        <p className="muted small">Time-based, 6 digits, every 30 seconds.</p>
      </details>
      <Field label="Code from the app">
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
      </Field>
      <ErrorNote error={confirm.error} />
      <button className="btn btn-primary" disabled={confirm.busy}>
        Turn on two-factor
      </button>
    </form>
  );
}

/** A code or a recovery code, for turning two-factor off or making new recovery codes. */
function SecondFactorForm({ submitLabel, danger, onSubmit }: { submitLabel: string; danger?: boolean; onSubmit: (factor: { code?: string; recoveryCode?: string }) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [recovery, setRecovery] = useState(false);
  const action = useAction();
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(() => onSubmit(recovery ? { recoveryCode: value.trim() } : { code: value.replace(/\s/g, "") }));
      }}
    >
      <Field label={recovery ? "Recovery code" : "Current code from your app"}>
        <input autoComplete="one-time-code" required value={value} onChange={(e) => setValue(e.target.value)} placeholder={recovery ? "xxxx-xxxx-xxxx" : "123456"} />
      </Field>
      <ErrorNote error={action.error} />
      <div className="btn-row">
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={action.busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setRecovery((r) => !r)}>
          {recovery ? "Use a code from the app" : "Use a recovery code"}
        </button>
      </div>
    </form>
  );
}

/** Account page card: status, set up, new recovery codes, turn off. */
export function TwoFactorCard() {
  const { reloadMe } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [mode, setMode] = useState<"idle" | "setup" | "disable" | "regenerate">("idle");
  const [codes, setCodes] = useState<string[] | null>(null);
  const load = useAction();

  const refresh = async () => {
    const r = await api<{ twoFactor: TwoFactorStatus }>("/auth/2fa");
    setStatus(r.twoFactor);
  };
  useEffect(() => {
    void load.run(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async () => {
    setMode("idle");
    setCodes(null);
    await refresh();
    await reloadMe();
  };

  return (
    <div className="card">
      <h3 className="card-title">{status?.enabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />} Two-factor authentication</h3>
      <ErrorNote error={load.error} />
      {!status && !load.error && <Loading />}
      {status && mode === "idle" && !codes && (
        <div className="stack">
          {status.enabled ? (
            <>
              <p>
                <span className="badge badge-ok">on</span> Sign-in asks for a code from your authenticator app. {status.recoveryCodesLeft} of 10 recovery codes left.
              </p>
              {status.recoveryCodesLeft <= 3 && <div className="note note-warn">You're running low on recovery codes. Make new ones.</div>}
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => setMode("regenerate")}>
                  New recovery codes
                </button>
                <button className="btn btn-ghost btn-danger" onClick={() => setMode("disable")}>
                  Turn off
                </button>
              </div>
              {status.required && <p className="muted small">Your role needs two-factor: if you turn it off, you'll have to set it up again before you can continue.</p>}
            </>
          ) : (
            <>
              <p>
                <span className="badge badge-warn">off</span> Add a code from an authenticator app to every sign-in.
              </p>
              {status.required && <div className="note note-warn">Your role needs two-factor.</div>}
              <button className="btn btn-primary" onClick={() => setMode("setup")}>
                Set up two-factor
              </button>
            </>
          )}
        </div>
      )}
      {mode === "setup" && <TwoFactorSetup onDone={() => void finish()} />}
      {mode === "disable" && (
        <>
          <p>Enter a code to turn two-factor off. Other sessions are signed out.</p>
          <SecondFactorForm
            danger
            submitLabel="Turn off two-factor"
            onSubmit={async (factor) => {
              await api("/auth/2fa/disable", { method: "POST", body: factor });
              await finish();
            }}
          />
          <button className="btn btn-ghost btn-small" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </>
      )}
      {mode === "regenerate" && !codes && (
        <>
          <p>New codes replace all of the old ones.</p>
          <SecondFactorForm
            submitLabel="Make new recovery codes"
            onSubmit={async (factor) => {
              const r = await api<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", { method: "POST", body: factor });
              setCodes(r.recoveryCodes);
            }}
          />
          <button className="btn btn-ghost btn-small" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </>
      )}
      {codes && <RecoveryCodes codes={codes} onDone={() => void finish()} />}
    </div>
  );
}
