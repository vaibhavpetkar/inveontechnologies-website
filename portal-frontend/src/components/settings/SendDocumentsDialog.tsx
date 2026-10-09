import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileSignature, FileText, ScrollText, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { relativeTime, type AvailableDocuments } from "../../lib/settings";
import { useToast } from "../Toast";
import { PersonSearch, type FoundPerson } from "./PersonSearch";
import { Dialog } from "./ui";

/** Email someone their appointment letter, internship offer and/or company policies again. */
export function SendDocumentsDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [person, setPerson] = useState<FoundPerson | null>(null);
  const [docs, setDocs] = useState<AvailableDocuments | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [letter, setLetter] = useState(false);
  const [offer, setOffer] = useState(false);
  const [policies, setPolicies] = useState<string[]>([]);
  const [otherAddress, setOtherAddress] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDocs(null);
    setLoadError(null);
    setLetter(false);
    setOffer(false);
    setPolicies([]);
    if (!person) return;
    let live = true;
    apiFetch<AvailableDocuments>(`/api/v1/send-documents/available?userId=${person.id}`, { accessToken })
      .then((r) => {
        if (!live) return;
        setDocs(r);
        setLetter(!!r.appointmentLetter);
        setOffer(!r.appointmentLetter && !!r.internshipOffer);
      })
      .catch((err) => live && setLoadError(err instanceof ApiError ? err.message : "Couldn't load this person's documents."));
    return () => {
      live = false;
    };
  }, [person, accessToken]);

  const allPolicies = !!docs && docs.policies.length > 0 && policies.length === docs.policies.length;
  const count = (letter ? 1 : 0) + (offer ? 1 : 0) + policies.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!person || !count) return;
    setBusy(true);
    setError(null);
    try {
      const body = { userId: person.id, appointmentLetter: letter, internshipOffer: offer, policies, to: otherAddress && to.trim() ? to.trim() : undefined };
      const r = await apiFetch<{ emailQueued: boolean; to: string; queued: string[] }>("/api/v1/send-documents", { method: "POST", body, accessToken });
      toast(`Sending ${joinList(r.queued)} to ${r.to}`);
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the documents.");
      setBusy(false);
    }
  }

  return (
    <Dialog id="send-docs-title" title="Send documents" onClose={onClose} onSubmit={submit}>
      <p className="muted-small st-dialog-lead">Email someone their letter, offer or the company policies again, as PDF attachments.</p>
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="sd-person">Person</label>
        <PersonSearch id="sd-person" value={person} onChange={setPerson} />
      </div>

      {person && !docs && !loadError && <div className="skeleton" style={{ height: 120, marginBottom: "1rem" }} />}
      {loadError && <div className="error-banner">{loadError}</div>}

      <AnimatePresence>
        {docs && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <fieldset className="st-fieldset field">
              <legend className="field-label">What to send</legend>
              <div className="st-doc-options">
                <DocOption
                  icon={<FileSignature size={17} />}
                  checked={letter}
                  onChange={setLetter}
                  disabled={!docs.appointmentLetter}
                  title="Appointment letter"
                  detail={docs.appointmentLetter ? `${docs.appointmentLetter.referenceNo} · version ${docs.appointmentLetter.version}${sentText(docs.appointmentLetter.emailedAt)}` : "No appointment letter yet"}
                />
                <DocOption
                  icon={<FileText size={17} />}
                  checked={offer}
                  onChange={setOffer}
                  disabled={!docs.internshipOffer}
                  title="Internship offer"
                  detail={docs.internshipOffer ? `${docs.internshipOffer.referenceNo}${sentText(docs.internshipOffer.emailedAt)}` : "No internship offer"}
                />
              </div>

              {docs.policies.length > 0 && (
                <div className="st-policy-box">
                  <label className="st-check st-check-all">
                    <input type="checkbox" checked={allPolicies} ref={(el) => el && (el.indeterminate = policies.length > 0 && !allPolicies)} onChange={(e) => setPolicies(e.target.checked ? docs.policies.map((p) => p.slug) : [])} />
                    <ScrollText size={16} /> <strong>All policies</strong> <span className="muted-small">({docs.policies.length})</span>
                  </label>
                  <div className="st-policy-list">
                    {docs.policies.map((p) => (
                      <label key={p.slug} className="st-check">
                        <input type="checkbox" checked={policies.includes(p.slug)} onChange={(e) => setPolicies((list) => (e.target.checked ? [...list, p.slug] : list.filter((s) => s !== p.slug)))} />
                        <span>{p.title} <span className="muted-small">v{p.version}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>

            <label className="st-check">
              <input type="checkbox" checked={otherAddress} onChange={(e) => setOtherAddress(e.target.checked)} />
              <span>Send to a different address <span className="muted-small">(not {docs.person.email})</span></span>
            </label>
            <AnimatePresence initial={false}>
              {otherAddress && (
                <motion.div className="field" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <label htmlFor="sd-to">Send to</label>
                  <input id="sd-to" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !docs || count === 0}><Send size={15} /> {busy ? "Sending…" : count > 1 ? `Send ${count} documents` : "Send"}</button>
      </div>
    </Dialog>
  );
}

function DocOption({ icon, checked, onChange, disabled, title, detail }: { icon: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled: boolean; title: string; detail: string }) {
  return (
    <label className={`st-doc-option${checked ? " on" : ""}${disabled ? " disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="st-doc-icon">{icon}</span>
      <span className="st-doc-text">
        <strong>{title}</strong>
        <span className="muted-small">{detail}</span>
      </span>
    </label>
  );
}

const sentText = (at: string | null) => (at ? ` · last emailed ${relativeTime(at)}` : " · never emailed");

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "documents";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
