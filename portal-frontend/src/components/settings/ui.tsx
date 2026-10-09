import type { FormEvent, ReactNode } from "react";
import { motion } from "framer-motion";
import { Lock, X } from "lucide-react";

/** An on/off switch with a label and an optional one-line hint. */
export function Switch({ id, checked, onChange, label, hint, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`st-switch-row${disabled ? " disabled" : ""}`} htmlFor={id}>
      <span className="st-switch">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="st-switch-track" aria-hidden="true"><span className="st-switch-thumb" /></span>
      </span>
      <span className="st-switch-text">
        <span className="st-switch-label">{label}</span>
        {hint && <span className="muted-small">{hint}</span>}
      </span>
    </label>
  );
}

/** Shown to HR on pages only admins can change. */
export function ReadOnlyNote({ children = "Only admins can change these. You can read them." }: { children?: ReactNode }) {
  return (
    <div className="st-readonly">
      <Lock size={15} /> <span>{children}</span>
    </div>
  );
}

/** The portal's standard modal: scrim, spring-in card, title and close button. */
export function Dialog({ id, title, onClose, onSubmit, wide = false, children }: { id: string; title: ReactNode; onClose: () => void; onSubmit?: (e: FormEvent) => void; wide?: boolean; children: ReactNode }) {
  const Card = onSubmit ? motion.form : motion.div;
  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <Card
        className={`modal st-modal${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onSubmit={onSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="modal-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </Card>
    </motion.div>
  );
}

export function PanelSkeleton({ height = 320 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} />;
}
