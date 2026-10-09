import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarRange, FileText, Mail, MapPin, Pencil, RefreshCw, Search, Send } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { openPdf } from "../../lib/letters";
import { formatDay, fullTime, money, PAYMENT_STATUS, relativeTime, type InternshipOffer, type OfferTerms } from "../../lib/settings";
import { useToast } from "../Toast";
import { OfferEditDialog } from "./OfferEditDialog";

/** Every internship offer issued, with its fee, dates and payment, to open, correct or email again. */
export function OffersTab() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [offers, setOffers] = useState<InternshipOffer[] | null>(null);
  const [terms, setTerms] = useState<OfferTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InternshipOffer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await apiFetch<{ offers: InternshipOffer[]; terms: OfferTerms }>("/api/v1/internships/offers", { accessToken });
      setOffers(r.offers);
      setTerms(r.terms);
      setError(null);
    } catch {
      setError("Couldn't load the internship offers.");
    } finally {
      setRefreshing(false);
    }
  }, [accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (offers ?? []).filter((o) => !q || [o.name, o.email, o.referenceNo, o.track.title].some((v) => v.toLowerCase().includes(q)));
  }, [offers, query]);

  async function resend(o: InternshipOffer) {
    setBusy(o.id);
    try {
      await apiFetch(`/api/v1/internships/offers/${o.id}/resend`, { method: "POST", accessToken });
      toast(`Emailing the offer to ${o.email} again`);
      setTimeout(load, 2500);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't email the offer.", "error");
    } finally {
      setBusy(null);
    }
  }

  function open(o: InternshipOffer) {
    openPdf(`/api/v1/internships/offers/${o.id}/pdf`, accessToken).catch((err) => toast(err instanceof ApiError ? err.message : "Couldn't open the PDF.", "error"));
  }

  return (
    <motion.div className="st-stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="st-tab-head">
        <p className="st-lead">Offers sent to people who passed an internship assessment. Correct the fee, work mode or dates before it's paid, then email the updated offer.</p>
        <div className="st-tab-head-actions">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, track or ref" aria-label="Search offers" />
          </label>
          <button className="btn btn-secondary" onClick={load} disabled={refreshing} aria-label="Refresh offers"><RefreshCw size={16} className={refreshing ? "spin" : ""} /></button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!offers && !error && <div className="st-offer-list">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>}
      {offers && visible.length === 0 && (
        <div className="empty-state">
          <FileText size={34} />
          <h3>{offers.length ? "Nobody matches" : "No offers yet"}</h3>
          <p>{offers.length ? "Try another search." : "An offer is made when someone passes an internship assessment."}</p>
        </div>
      )}

      <div className="st-offer-list">
        {visible.map((o, i) => {
          const pay = o.paymentStatus ? PAYMENT_STATUS[o.paymentStatus] : null;
          return (
            <motion.article key={o.id} className="panel st-offer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
              <div className="st-offer-head">
                <div className="st-offer-who">
                  <strong>{o.name}</strong>
                  <span className="muted-small st-ellipsis">{o.email}</span>
                </div>
                {pay && <span className={`pill pill-${pay.tone}`}>{pay.label}</span>}
              </div>
              <div className="st-offer-track">
                <span>{o.track.title || "Internship"}</span>
                <span className="muted-small">Ref {o.referenceNo}</span>
              </div>
              <dl className="st-offer-facts">
                <div>
                  <dt>Fee</dt>
                  <dd>
                    <strong>{money(o.fee)}</strong>{" "}
                    {o.feeCategory && <span className={`pill ${o.feeCategory === "student" ? "pill-blue" : "pill-violet"}`}>{o.feeCategory === "student" ? "Student" : "Graduate"}</span>}
                  </dd>
                </div>
                <div>
                  <dt><MapPin size={12} /> Work mode</dt>
                  <dd>{o.workMode}</dd>
                </div>
                <div className="st-offer-dates">
                  <dt><CalendarRange size={12} /> Dates</dt>
                  <dd>{formatDay(o.joiningDate)} → {formatDay(o.endDate)}</dd>
                </div>
                <div>
                  <dt><Mail size={12} /> Emailed</dt>
                  <dd title={o.emailedAt ? fullTime(o.emailedAt) : undefined}>{o.emailedAt ? relativeTime(o.emailedAt) : "Not yet"}</dd>
                </div>
              </dl>
              <div className="st-offer-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => open(o)}><FileText size={14} /> Open PDF</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(o)}><Pencil size={14} /> Edit</button>
                <button className="btn btn-secondary btn-sm" disabled={busy === o.id} onClick={() => resend(o)}><Send size={14} /> {busy === o.id ? "Sending…" : "Email again"}</button>
              </div>
            </motion.article>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && terms && (
          <OfferEditDialog
            offer={editing}
            terms={terms}
            onClose={() => setEditing(null)}
            onSaved={(updated, emailed) => {
              setEditing(null);
              setOffers((list) => list?.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)) ?? list);
              toast(emailed ? `Offer updated and emailed to ${editing.email}` : "Offer updated");
              load();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
