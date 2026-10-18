import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Loader2, MinusCircle, X, XCircle } from "lucide-react";
import type { JobStatus } from "../lib/types";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    {
      online: "ok",
      up: "ok",
      success: "ok",
      active: "ok",
      running: "info",
      issuing: "info",
      pending: "muted",
      pending_dns: "warn",
      unknown: "muted",
      offline: "bad",
      down: "bad",
      failure: "bad",
      failed: "bad",
      cancelled: "muted",
      agent_online: "ok",
      terminating: "warn",
      stopping: "warn",
      stopped: "muted",
      starting: "warn",
      resizing: "warn",
      terminated: "muted",
    }[status] ?? "muted";
  return <span className={`badge badge-${tone}`}>{status.replace(/_/g, " ")}</span>;
}

export function StepIcon({ status }: { status: JobStatus }) {
  if (status === "success") return <CheckCircle2 size={18} className="ic-ok" aria-label="success" />;
  if (status === "failure") return <XCircle size={18} className="ic-bad" aria-label="failure" />;
  if (status === "running") return <Loader2 size={18} className="ic-info spin" aria-label="running" />;
  if (status === "cancelled") return <MinusCircle size={18} className="ic-muted" aria-label="cancelled" />;
  return <CircleDashed size={18} className="ic-muted" aria-label="pending" />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="note note-bad" role="alert">
      <AlertTriangle size={16} /> <span>{error}</span>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading">
      <Loader2 size={18} className="spin" /> {label}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            className={`modal ${wide ? "modal-wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="modal-head">
              <h2>{title}</h2>
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      {label && <span className="copy-label">{label}</span>}
      <code>{value}</code>
      <button
        className="icon-btn"
        aria-label="Copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard blocked: the text is still selectable
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Runs an async action with a busy flag and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
