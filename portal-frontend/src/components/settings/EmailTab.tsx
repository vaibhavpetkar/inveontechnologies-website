import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing, CheckCircle2, CircleSlash, KeyRound, Mail, Save, Send, Server, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { fullTime, relativeTime, type AutomaticEmail, type EmailSettings, type MailCheck, type MailStatus } from "../../lib/settings";
import { useToast } from "../Toast";
import { PanelSkeleton, ReadOnlyNote, Switch } from "./ui";

interface EmailResponse {
  settings: EmailSettings | null;
  status: MailStatus;
  canEdit: boolean;
}

type Form = Omit<EmailSettings, "hasPassword" | "saved"> & { password: string; clearPassword: boolean };

const toForm = (s: EmailSettings): Form => ({
  enabled: s.enabled,
  host: s.host,
  port: s.port,
  secure: s.secure,
  user: s.user,
  fromName: s.fromName,
  fromEmail: s.fromEmail,
  replyTo: s.replyTo,
  password: "",
  clearPassword: false,
});

/** How the portal sends email: what it uses now, and (for admins) the mail server to send through. */
export function EmailTab() {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<EmailResponse | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [check, setCheck] = useState<MailCheck | null>(null);

  useEffect(() => {
    apiFetch<EmailResponse>("/api/v1/settings/email", { accessToken })
      .then((r) => {
        setData(r);
        if (r.settings) setForm(toForm(r.settings));
      })
      .catch(() => setError("Couldn't load the email settings."));
  }, [accessToken]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <PanelSkeleton height={420} />;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setCheck(null);
    try {
      const { clearPassword, password, ...rest } = form;
      const body = { ...rest, port: Number(form.port), password: clearPassword ? null : password || undefined };
      const r = await apiFetch<{ settings: EmailSettings; status: MailStatus; check: MailCheck }>("/api/v1/settings/email", { method: "PUT", body, accessToken });
      setData((d) => (d ? { ...d, settings: r.settings, status: r.status } : d));
      setForm(toForm(r.settings));
      setDirty(false);
      setCheck(r.check);
      toast(r.check.ok ? "Email settings saved. The mail server answered." : "Saved, but the mail server check failed.", r.check.ok ? "success" : "error");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the email settings.", "error");
    } finally {
      setSaving(false);
    }
  }

  const s = data.settings;

  return (
    <motion.div className="st-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <p className="st-lead">Letters, offers, invites and notifications go out through this email account.</p>
      <StatusCard status={data.status} />

      {!data.canEdit && <ReadOnlyNote>Only admins can change how email is sent. You can still check the email log and send documents again.</ReadOnlyNote>}

      {data.canEdit && form && s && (
        <form className="panel" onSubmit={save}>
          <h2 className="st-panel-title"><Server size={18} /> Mail server (SMTP)</h2>
          <p className="muted-small st-panel-sub">
            The outgoing mail server from your email provider, e.g. smtp.gmail.com or smtp.zoho.in. {s.saved ? "" : "These start from the server's environment settings; nothing has been saved here yet."}
          </p>

          <Switch
            id="em-enabled"
            checked={form.enabled}
            onChange={(v) => set("enabled", v)}
            label="Send through these settings"
            hint={form.enabled ? "The portal uses the server below instead of the server environment's settings." : "Off: the portal uses the mail server set in the server environment, if any."}
          />

          <div className="st-divider" />
          <div className="st-host-row">
            <div className="field"><label htmlFor="em-host">Server address</label><input id="em-host" value={form.host} required={form.enabled} maxLength={255} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" autoComplete="off" /></div>
            <div className="field"><label htmlFor="em-port">Port</label><input id="em-port" type="number" min={1} max={65535} required value={form.port} onChange={(e) => set("port", Number(e.target.value))} /></div>
          </div>
          <Switch
            id="em-secure"
            checked={form.secure}
            onChange={(v) => {
              set("secure", v);
              if (v && form.port === 587) set("port", 465);
              if (!v && form.port === 465) set("port", 587);
            }}
            label={<><ShieldCheck size={15} /> Secure connection (SSL/TLS)</>}
            hint="Usually on for port 465 and off for port 587 (which upgrades to a secure connection on its own)."
          />

          <div className="field-row field-row-2 even st-gap-top">
            <div className="field"><label htmlFor="em-user">Username</label><input id="em-user" value={form.user} maxLength={255} onChange={(e) => set("user", e.target.value)} placeholder="Usually the full email address" autoComplete="off" /></div>
            <div className="field">
              <label htmlFor="em-pass"><KeyRound size={13} /> Password</label>
              <input
                id="em-pass"
                type="password"
                value={form.password}
                maxLength={500}
                disabled={form.clearPassword}
                onChange={(e) => set("password", e.target.value)}
                placeholder={form.clearPassword ? "Will be cleared when you save" : s.hasPassword ? "Saved, leave blank to keep" : "App password from your provider"}
                autoComplete="new-password"
              />
              {s.hasPassword && (
                <button type="button" className="link-button st-under-field" onClick={() => {
                    setForm((f) => (f ? { ...f, password: "", clearPassword: !f.clearPassword } : f));
                    setDirty(true);
                  }}>
                  {form.clearPassword ? "Keep the saved password" : "Clear saved password"}
                </button>
              )}
            </div>
          </div>

          <div className="st-divider" />
          <div className="field-row">
            <div className="field"><label htmlFor="em-fname">From name</label><input id="em-fname" required maxLength={120} value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Inveon Portal" /></div>
            <div className="field"><label htmlFor="em-femail">From email</label><input id="em-femail" type="email" required maxLength={255} value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="no-reply@example.com" /></div>
            <div className="field"><label htmlFor="em-reply">Replies go to</label><input id="em-reply" type="email" maxLength={255} value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} placeholder="Optional" /></div>
          </div>
          <p className="muted-small">Use a From email on your own domain; many providers refuse to send as another address.</p>

          <AnimatePresence>{check && <CheckResult key="check" check={check} />}</AnimatePresence>

          <div className="st-savebar in-panel">
            <button className="btn" disabled={saving || !dirty}><Save size={16} /> {saving ? "Saving and checking…" : "Save and check connection"}</button>
            {dirty && <span className="muted-small">You have unsaved changes.</span>}
          </div>
        </form>
      )}

      <AutomaticEmails />
      {data.canEdit && <TestEmail defaultTo={user?.email ?? ""} />}
    </motion.div>
  );
}

function StatusCard({ status }: { status: MailStatus }) {
  const check = status.lastCheck;
  const tone = !status.sending ? "slate" : check && !check.ok ? "red" : "green";
  return (
    <section className={`panel st-status tone-${tone}`}>
      <span className={`st-status-icon tone-${tone}`}>{!status.sending ? <CircleSlash size={20} /> : check && !check.ok ? <AlertTriangle size={20} /> : <Mail size={20} />}</span>
      <div className="st-status-main">
        <strong>
          {status.sending ? <>Sending through {status.host}{status.port ? `:${status.port}` : ""}</> : "Not sending email"}
        </strong>
        <span className="muted-small">
          {status.sending ? <>From {status.from}{status.replyTo ? <> · replies to {status.replyTo}</> : null}</> : "No mail server is set, so emails are only written to the server log and nobody receives them."}
        </span>
        <div className="st-status-pills">
          <span className={`pill ${status.source === "settings" ? "pill-blue" : "pill-slate"}`}>{status.source === "settings" ? "Saved here" : "Server environment"}</span>
          {check ? (
            <span className={`pill ${check.ok ? "pill-green" : "pill-red"}`} title={fullTime(check.at)}>
              {check.ok ? "Connection OK" : "Connection failed"} · checked {relativeTime(check.at)}
            </span>
          ) : (
            <span className="pill pill-slate">Connection not checked yet</span>
          )}
        </div>
        {check && !check.ok && check.error && <p className="st-error-text">{check.error}</p>}
      </div>
    </section>
  );
}

function CheckResult({ check }: { check: MailCheck }) {
  return (
    <motion.div className={`st-check ${check.ok ? "ok" : "bad"}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status">
      {check.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{check.ok ? "The mail server accepted the connection and sign-in." : <>Connection check failed: {check.error ?? "unknown error"}</>}</span>
    </motion.div>
  );
}

function TestEmail({ defaultTo }: { defaultTo: string }) {
  const { accessToken } = useAuth();
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await apiFetch<{ ok: true; sent: boolean } | { ok: false; error: string }>("/api/v1/settings/email/test", { method: "POST", body: { to: to.trim() }, accessToken });
      if (r.ok) setResult(r.sent ? { ok: true, text: `Sent to ${to.trim()}. Check the inbox (and the spam folder).` } : { ok: false, text: "No mail server is set, so the test was only written to the server log." });
      else setResult({ ok: false, text: r.error });
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't send the test email." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={send}>
      <h2 className="st-panel-title"><Send size={18} /> Send a test email</h2>
      <p className="muted-small st-panel-sub">Uses the settings in effect now. Save any changes first.</p>
      <div className="st-inline-form">
        <div className="field"><label htmlFor="em-test" className="st-sr-only">Send to</label><input id="em-test" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></div>
        <button className="btn btn-secondary" disabled={busy || !to.trim()}><Send size={15} /> {busy ? "Sending…" : "Send test"}</button>
      </div>
      <AnimatePresence>
        {result && (
          <motion.div className={`st-check ${result.ok ? "ok" : "bad"}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status">
            {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{result.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

/** Org-wide on/off switches for the emails the portal sends by itself. */
function AutomaticEmails() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [emails, setEmails] = useState<AutomaticEmail[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ emails: AutomaticEmail[]; canEdit: boolean }>("/api/v1/settings/email/automation", { accessToken })
      .then((r) => {
        setEmails(r.emails);
        setCanEdit(r.canEdit);
      })
      .catch(() => setEmails([]));
  }, [accessToken]);

  if (!emails) return <PanelSkeleton height={260} />;
  if (emails.length === 0) return null;

  async function toggle(kind: string, on: boolean) {
    if (!emails) return;
    const next = emails.map((e) => (e.kind === kind ? { ...e, on } : e));
    setEmails(next);
    setBusy(kind);
    try {
      const r = await apiFetch<{ emails: AutomaticEmail[] }>("/api/v1/settings/email/automation", { method: "PUT", body: { paused: next.filter((e) => !e.on).map((e) => e.kind) }, accessToken });
      setEmails(r.emails);
      toast(on ? "Turned on." : "Turned off. These emails are now only recorded in the email log.", "success");
    } catch (err) {
      setEmails(emails);
      toast(err instanceof ApiError ? err.message : "Couldn't save that change.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <h2 className="st-panel-title"><BellRing size={18} /> Automatic emails</h2>
      <p className="muted-small st-panel-sub">
        Choose which emails the portal sends on its own. Sign-in links, password resets, letters and anything you send by hand always go out. Emails that are turned off show in the email log as not sent.
      </p>
      {emails.map((e) => (
        <Switch key={e.kind} id={`auto-${e.kind}`} checked={e.on} disabled={!canEdit || busy !== null} onChange={(v) => void toggle(e.kind, v)} label={e.label} hint={e.hint} />
      ))}
      {!canEdit && <p className="muted-small">Only admins can change these.</p>}
    </section>
  );
}
