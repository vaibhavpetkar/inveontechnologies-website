import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderOpen,
  ArrowLeft,
  Briefcase,
  FileCheck2,
  GraduationCap,
  Plus,
  CalendarClock,
  Check,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gift,
  Lock,
  MessagesSquare,
  Send,
  ShieldCheck,
  Timer,
  Video,
  X,
} from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { DocumentRequests } from "../components/files/DocumentRequests";
import { apiFetch, ApiError } from "../lib/api";
import {
  documentsFor,
  EDUCATION_LEVEL_LABELS,
  formatDateTime,
  openCashfreeCheckout,
  rupees,
  SLOT_LABELS,
  timeLeft,
  type EducationLevel,
  type Journey as JourneyData,
  type JoiningDetails,
  type SlotKey,
} from "../lib/journey";

type StepState = "done" | "current" | "upcoming" | "stopped";
interface Step { key: string; label: string; icon: typeof Check; state: StepState; hint?: string }

const TERMINAL = ["rejected", "withdrawn"];

function buildSteps(j: JourneyData): Step[] {
  const status = j.application.status;
  const stopped = TERMINAL.includes(status);
  const hasExam = j.exam.length > 0 || status === "assessment_invited";
  const examPassed = j.exam.some((a) => a.passed);
  const hrDone = j.interviews.some((i) => i.status === "completed") && !!j.enrollment;
  const hrBooked = j.interviews.some((i) => i.status === "scheduled");
  const e = j.enrollment;
  const fee = (j.opportunity?.programFee ?? 0) > 0;
  const paidOrFree = !!e && ["paid", "waived"].includes(e.status);
  const started = !!e && ["trial", "paid", "waived"].includes(e.status);

  const steps: Step[] = [{ key: "applied", label: "Applied", icon: Send, state: "done" }];
  if (hasExam) steps.push({ key: "exam", label: "Exam", icon: ClipboardCheck, state: examPassed || hrDone ? "done" : status === "assessment_invited" ? "current" : stopped ? "stopped" : "upcoming" });
  steps.push({ key: "hr", label: "HR round", icon: MessagesSquare, state: hrDone ? "done" : stopped ? "stopped" : (hasExam ? examPassed : true) ? "current" : "upcoming", hint: hrBooked ? "Booked" : undefined });
  if (fee || (e && e.status !== "waived")) steps.push({ key: "pay", label: "Pay or trial", icon: CreditCard, state: paidOrFree || e?.status === "trial" ? "done" : e ? "current" : "upcoming", hint: e?.status === "trial" ? "On trial" : undefined });
  steps.push({ key: "joining", label: "Joining form", icon: FileText, state: e?.joiningSubmittedAt ? "done" : started ? "current" : "upcoming" });
  const formDocs = j.documents.filter((d) => d.documentType);
  if (formDocs.length > 0) {
    const accepted = formDocs.filter((d) => d.status === "verified").length;
    const waiting = formDocs.some((d) => d.status === "requested" || d.status === "rejected");
    steps.push({ key: "documents", label: "Documents", icon: FileCheck2, state: accepted === formDocs.length ? "done" : waiting ? "current" : "upcoming", hint: `${accepted}/${formDocs.length} accepted` });
  }
  steps.push({ key: "sessions", label: "Sessions", icon: CalendarClock, state: j.sessions.length > 0 ? "current" : "upcoming" });
  // Only one step is "current": the first one that is.
  let seen = false;
  for (const s of steps) {
    if (s.state === "current") {
      if (seen) s.state = "upcoming";
      seen = true;
    }
  }
  return steps;
}

export default function Journey() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editJoining, setEditJoining] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const r = await apiFetch<JourneyData>(`/api/v1/program/by-application/${applicationId}`, { accessToken });
    setData(r);
    return r;
  }, [applicationId, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your progress."));
  }, [accessToken, load]);

  // Back from Cashfree: confirm the payment straight away (the webhook may lag).
  const orderId = new URLSearchParams(search).get("order_id");
  useEffect(() => {
    if (!orderId || !data?.enrollment || !accessToken) return;
    const enrollmentId = data.enrollment.id;
    navigate(`/journey/${applicationId}`, { replace: true });
    apiFetch<{ orderStatus: string }>(`/api/v1/program/enrollments/${enrollmentId}/verify`, { method: "POST", body: { orderId }, accessToken })
      .then((r) => {
        toast(r.orderStatus === "PAID" ? "Payment received. Welcome aboard!" : "Your payment didn't go through. You can try again.");
        return load();
      })
      .catch(() => toast("We couldn't confirm the payment yet. It'll show here once Cashfree tells us."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, data?.enrollment?.id]);

  // Keep the trial countdown fresh.
  useEffect(() => {
    if (data?.enrollment?.status !== "trial") return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [data?.enrollment?.status]);

  async function act(kind: "trial" | "pay") {
    if (!data?.enrollment) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "trial") {
        await apiFetch(`/api/v1/program/enrollments/${data.enrollment.id}/trial`, { method: "POST", accessToken });
        toast(`Your ${data.enrollment.trialHours}-hour trial has started.`);
        await load();
      } else {
        const r = await apiFetch<{ paymentSessionId: string; mode: "sandbox" | "production" }>(`/api/v1/program/enrollments/${data.enrollment.id}/pay`, { method: "POST", accessToken });
        await openCashfreeCheckout(r.paymentSessionId, r.mode);
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const back = <Link href="/candidate" className="back-link"><ArrowLeft size={16} /> My applications</Link>;
  if (error && !data) return <DashboardShell>{back}<div className="error-banner">{error}</div></DashboardShell>;
  if (!data) return <DashboardShell>{back}<div className="skeleton" style={{ height: 360 }} /></DashboardShell>;

  const steps = buildSteps(data);
  const current = steps.find((s) => s.state === "current")?.key;
  const e = data.enrollment;
  const stopped = TERMINAL.includes(data.application.status);
  const nextInterview = data.interviews.find((i) => i.status === "scheduled");
  const showJoiningForm = !!e && ["trial", "paid", "waived"].includes(e.status) && (!e.joiningSubmittedAt || editJoining);

  return (
    <DashboardShell>
      {back}
      <header className="journey-head">
        <span className="muted-small">{data.application.businessId}</span>
        <h1>{data.opportunity?.title ?? "Your application"}</h1>
      </header>

      <ol className="journey-steps" aria-label="Your progress">
        {steps.map((s, i) => (
          <motion.li key={s.key} className={`journey-step ${s.state}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className="journey-dot">{s.state === "done" ? <Check size={16} /> : s.state === "stopped" ? <X size={16} /> : <s.icon size={16} />}</span>
            <span className="journey-label">{s.label}{s.hint && <em>{s.hint}</em>}</span>
          </motion.li>
        ))}
      </ol>

      {error && <div className="error-banner">{error}</div>}

      <AnimatePresence mode="wait">
        <motion.div key={`${current}-${e?.status}-${showJoiningForm}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="journey-body">
          {stopped && (
            <section className="panel journey-panel">
              <h2>This application is closed</h2>
              <p>It was {data.application.status}. You can still apply to other openings.</p>
              <Link href="/opportunities" className="btn">Browse openings</Link>
            </section>
          )}

          {!stopped && current === "exam" && (
            <section className="panel journey-panel">
              <h2><ClipboardCheck size={20} /> Your exam is waiting</h2>
              <p>Pick the language you're strongest in. The timer starts only when you press Start.</p>
              <Link href={`/assessments/${data.application.id}`} className="btn">Go to the exam</Link>
            </section>
          )}

          {!stopped && current === "hr" && (
            <section className="panel journey-panel">
              <h2><MessagesSquare size={20} /> HR round</h2>
              {nextInterview ? (
                <>
                  <p>Your HR conversation is booked for <strong>{formatDateTime(nextInterview.scheduledAt)}</strong>. It's a relaxed chat about you, the program and how you like to work.</p>
                  {nextInterview.meetingUrl && <a className="btn" href={nextInterview.meetingUrl} target="_blank" rel="noreferrer"><Video size={16} /> Join the call</a>}
                </>
              ) : data.interviews.some((i) => i.status === "completed") ? (
                <p>Thanks for talking to us. The team is making a decision and you'll hear back here.</p>
              ) : (
                <p>{data.exam.some((a) => a.passed) ? "Well done on the exam. " : ""}The team will invite you to a short HR conversation. You'll get an email and a notification with the time and link.</p>
              )}
            </section>
          )}

          {!stopped && e?.status === "trial" && e.trialEndsAt && (
            <section className="panel journey-panel trial-strip">
              <div className="trial-banner"><Timer size={18} /> <strong>Free trial: {timeLeft(e.trialEndsAt)}</strong><span>Ends {formatDateTime(e.trialEndsAt)}. Pay any time to keep your access.</span></div>
              <button className="btn" onClick={() => act("pay")} disabled={!!busy || !data.payments.enabled}>{busy === "pay" ? "Opening checkout…" : `Pay ${rupees(e.amount)}`}</button>
              {!data.payments.enabled && <span className="muted-small"><Lock size={12} /> Online payment is being set up. Contact the team to pay another way.</span>}
            </section>
          )}

          {!stopped && e && ["awaiting_choice", "trial_expired"].includes(e.status) && (
            <section className="panel journey-panel">
              <h2><CreditCard size={20} /> {e.status === "trial_expired" ? "Your free trial has ended" : "You're in! One last step"}</h2>
              {e.status === "trial_expired" && <p>Your courses are paused, but your progress is saved. Pay the program fee to pick up where you left off.</p>}
              {e.status === "awaiting_choice" && <p>You passed the HR round. Pay the program fee to start, or try it free first.</p>}
              <div className="pay-options">
                <motion.div className="pay-card primary" whileHover={{ y: -3 }}>
                  <span className="pay-card-icon"><CreditCard size={22} /></span>
                  <strong>{rupees(e.amount)}</strong>
                  <span className="muted-small">One-time program fee. UPI, cards and net banking through Cashfree.</span>
                  <button className="btn btn-lg" onClick={() => act("pay")} disabled={!!busy || !data.payments.enabled}>{busy === "pay" ? "Opening checkout…" : "Pay now"}</button>
                  {!data.payments.enabled && <span className="muted-small"><Lock size={12} /> Online payment is being set up. Contact the team to pay another way.</span>}
                </motion.div>
                {e.status === "awaiting_choice" && e.trialHours > 0 && (
                  <motion.div className="pay-card" whileHover={{ y: -3 }}>
                    <span className="pay-card-icon"><Gift size={22} /></span>
                    <strong>{e.trialHours} hours free</strong>
                    <span className="muted-small">Full access to the program's courses and your joining form. No card needed.</span>
                    <button className="btn btn-secondary btn-lg" onClick={() => act("trial")} disabled={!!busy}>{busy === "trial" ? "Starting…" : "Start free trial"}</button>
                  </motion.div>
                )}
              </div>
              <p className="muted-small secure-note"><ShieldCheck size={14} /> Payments are processed by Cashfree. We never see your card or UPI details.</p>
            </section>
          )}

          {showJoiningForm && e && (
            <JoiningForm
              enrollmentId={e.id}
              initial={e.joiningDetails}
              onDone={async () => {
                setEditJoining(false);
                toast("Joining form saved. The team will book your sessions.");
                await load();
              }}
              onCancel={e.joiningSubmittedAt ? () => setEditJoining(false) : undefined}
            />
          )}

          {e?.joiningSubmittedAt && !showJoiningForm && (
            <section className="panel journey-panel">
              <h2><CalendarClock size={20} /> Your sessions</h2>
              {data.sessions.length === 0 ? (
                <p>Thanks for your joining details. The team is booking your first sessions around {e.joiningDetails?.preferredSlots.map((s) => SLOT_LABELS[s].toLowerCase()).join(" and ")}. They'll show up here and in your calendar.</p>
              ) : (
                <ul className="session-list">
                  {data.sessions.map((s) => {
                    const live = new Date(s.startsAt).getTime() - Date.now() < 15 * 60_000 && new Date(s.endsAt).getTime() > Date.now();
                    return (
                      <li key={s.id} className={live ? "live" : ""}>
                        <div className="session-when">
                          <strong>{new Date(s.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</strong>
                          <span>{new Date(s.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                        </div>
                        <div className="session-what">
                          <strong>{s.title}</strong>
                          <span className="muted-small">{Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000)} min{s.location ? ` · ${s.location}` : ""}</span>
                        </div>
                        {s.joinUrl && <a className={`btn btn-sm${live ? "" : " btn-secondary"}`} href={s.joinUrl} target="_blank" rel="noreferrer"><Video size={14} /> Join</a>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="journey-actions">
                <Link href="/calendar" className="btn btn-secondary">Open calendar</Link>
                <button className="btn btn-secondary" onClick={() => setEditJoining(true)}>Edit joining details</button>
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      {!stopped && data.documents.length > 0 && (
        <section className="panel journey-panel">
          <h2><FolderOpen size={20} /> Documents</h2>
          <p>{data.documents.some((d) => d.status === "requested" || d.status === "rejected") ? "Upload each one as a PDF or a clear photo. The team checks them and tells you if anything needs a redo." : "Thanks, the team has everything it needs."}</p>
          <DocumentRequests applicationId={data.application.id} documents={data.documents} mode="candidate" onChanged={() => load().catch(() => undefined)} />
        </section>
      )}
    </DashboardShell>
  );
}

const EMPTY: JoiningDetails = {
  fullName: "",
  phone: "",
  dateOfBirth: "",
  address: "",
  city: "",
  college: "",
  degree: "",
  graduationYear: null,
  experienceCompanies: [],
  githubUsername: "",
  linkedinUrl: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  preferredStartDate: "",
  hoursPerWeek: 20,
  preferredSlots: [],
  notes: "",
};

function JoiningForm({ enrollmentId, initial, onDone, onCancel }: { enrollmentId: string; initial: JoiningDetails | null; onDone: () => void; onCancel?: () => void }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState<JoiningDetails>({ ...EMPTY, ...(initial ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof JoiningDetails>(k: K, v: JoiningDetails[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [hasExperience, setHasExperience] = useState((initial?.experienceCompanies?.length ?? 0) > 0);
  const [companies, setCompanies] = useState<string[]>(initial?.experienceCompanies?.length ? initial.experienceCompanies : [""]);
  const willAsk = documentsFor({ ...form, experienceCompanies: hasExperience ? companies : [] });
  // A first-time form starts from what the candidate already put on their profile.
  useEffect(() => {
    if (initial) return;
    apiFetch<{ profile: { fullName?: string | null; phone?: string | null; degree?: string | null; graduationYear?: number | null } }>("/api/v1/profile/me", { accessToken })
      .then(({ profile: p }) =>
        setForm((f) => ({
          ...f,
          fullName: f.fullName || p.fullName || "",
          phone: f.phone || p.phone || "",
          degree: f.degree || p.degree || "",
          graduationYear: f.graduationYear ?? p.graduationYear ?? null,
        })),
      )
      .catch(() => {});
  }, [initial, accessToken]);
  const toggleSlot = (s: SlotKey) => set("preferredSlots", form.preferredSlots.includes(s) ? form.preferredSlots.filter((x) => x !== s) : [...form.preferredSlots, s]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.educationStatus || !form.educationLevel) return setError("Tell us whether you're still studying and your latest course, so we know which certificate to ask for.");
    if (hasExperience && companies.filter((c) => c.trim().length >= 2).length === 0) return setError("Add the companies you've worked at, or switch off work experience.");
    if (form.preferredSlots.length === 0) return setError("Pick at least one time that suits you for sessions.");
    setBusy(true);
    setError(null);
    const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
    try {
      await apiFetch(`/api/v1/program/enrollments/${enrollmentId}/joining`, {
        method: "PUT",
        accessToken,
        body: {
          ...form,
          dateOfBirth: clean(form.dateOfBirth),
          college: clean(form.college),
          degree: clean(form.degree),
          githubUsername: clean(form.githubUsername),
          linkedinUrl: clean(form.linkedinUrl) ?? "",
          notes: clean(form.notes),
          graduationYear: form.graduationYear ? Number(form.graduationYear) : null,
          experienceCompanies: hasExperience ? companies.map((c) => c.trim()).filter((c) => c.length >= 2) : [],
          hoursPerWeek: Number(form.hoursPerWeek),
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "VALIDATION_ERROR" ? "Some details look off. Check the phone numbers, address and dates." : err.message) : "Couldn't save the form.");
      setBusy(false);
    }
  }

  return (
    <form className="panel journey-panel joining-form" onSubmit={submit}>
      <h2><FileText size={20} /> Joining form</h2>
      <p>This helps us set up your account, projects and sessions. It takes about two minutes.</p>
      {error && <div className="error-banner">{error}</div>}

      <fieldset>
        <legend>About you</legend>
        <div className="field-row">
          <div className="field"><label htmlFor="jf-name">Full name</label><input id="jf-name" required minLength={2} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" /></div>
          <div className="field"><label htmlFor="jf-phone">Phone</label><input id="jf-phone" required type="tel" minLength={8} value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" /></div>
          <div className="field"><label htmlFor="jf-dob">Date of birth</label><input id="jf-dob" type="date" value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} /></div>
        </div>
        <div className="field-row field-row-2">
          <div className="field"><label htmlFor="jf-addr">Address</label><input id="jf-addr" required minLength={5} value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" /></div>
          <div className="field"><label htmlFor="jf-city">City</label><input id="jf-city" required value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" /></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Education and profiles</legend>
        <div className="field-row">
          <div className="field"><label htmlFor="jf-college">College</label><input id="jf-college" value={form.college ?? ""} onChange={(e) => set("college", e.target.value)} /></div>
          <div className="field"><label htmlFor="jf-degree">Degree</label><input id="jf-degree" value={form.degree ?? ""} onChange={(e) => set("degree", e.target.value)} placeholder="e.g. B.E. Computer" /></div>
          <div className="field"><label htmlFor="jf-grad">Graduation year</label><input id="jf-grad" type="number" min={1990} max={2100} value={form.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value ? Number(e.target.value) : null)} /></div>
        </div>
        <div className="field-row field-row-2">
          <div className="field"><label htmlFor="jf-gh">GitHub username</label><input id="jf-gh" value={form.githubUsername ?? ""} onChange={(e) => set("githubUsername", e.target.value)} placeholder="Used to add you to project repos" /></div>
          <div className="field"><label htmlFor="jf-li">LinkedIn URL</label><input id="jf-li" type="url" value={form.linkedinUrl ?? ""} onChange={(e) => set("linkedinUrl", e.target.value)} /></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Studies, work and documents</legend>
        <div className="field-row field-row-2">
          <div className="field">
            <span className="field-label">Are you still studying?</span>
            <div className="slot-picks" role="group" aria-label="Are you still studying?">
              {([["studying", "Yes, still studying"], ["completed", "No, I've finished"]] as const).map(([v, label]) => (
                <button type="button" key={v} className={form.educationStatus === v ? "on" : ""} aria-pressed={form.educationStatus === v} onClick={() => set("educationStatus", v)}>
                  {form.educationStatus === v && <Check size={14} />} {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="jf-level">{form.educationStatus === "studying" ? "Course you're in" : "Highest course finished"}</label>
            <select id="jf-level" required value={form.educationLevel ?? ""} onChange={(e) => set("educationLevel", (e.target.value || undefined) as EducationLevel | undefined)}>
              <option value="">Choose…</option>
              {(Object.keys(EDUCATION_LEVEL_LABELS) as EducationLevel[]).map((l) => <option key={l} value={l}>{EDUCATION_LEVEL_LABELS[l]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Any work experience?</span>
          <div className="slot-picks" role="group" aria-label="Any work experience?">
            {([[false, "No, this is my first"], [true, "Yes, I've worked before"]] as const).map(([v, label]) => (
              <button type="button" key={String(v)} className={hasExperience === v ? "on" : ""} aria-pressed={hasExperience === v} onClick={() => setHasExperience(v)}>
                {hasExperience === v && <Check size={14} />} {label}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {hasExperience && (
            <motion.div className="company-list" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              {companies.map((c, i) => (
                <div className="company-row" key={i}>
                  <Briefcase size={16} aria-hidden />
                  <input value={c} onChange={(e) => setCompanies(companies.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Company name" aria-label={`Company ${i + 1}`} maxLength={120} />
                  {companies.length > 1 && (
                    <button type="button" className="icon-button" aria-label={`Remove company ${i + 1}`} onClick={() => setCompanies(companies.filter((_, j) => j !== i))}><X size={15} /></button>
                  )}
                </div>
              ))}
              {companies.length < 5 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCompanies([...companies, ""])}><Plus size={14} /> Add another company</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="doc-preview" aria-live="polite">
          <span className="field-label"><GraduationCap size={15} /> You'll upload these next</span>
          <ul>
            <AnimatePresence initial={false}>
              {willAsk.map((d) => (
                <motion.li key={d} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <FileText size={13} /> {d}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </fieldset>

      <fieldset>
        <legend>Emergency contact</legend>
        <div className="field-row field-row-2">
          <div className="field"><label htmlFor="jf-ecn">Name</label><input id="jf-ecn" required minLength={2} value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></div>
          <div className="field"><label htmlFor="jf-ecp">Phone</label><input id="jf-ecp" required type="tel" minLength={8} value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} /></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Schedule</legend>
        <div className="field-row field-row-2">
          <div className="field"><label htmlFor="jf-start">When can you start?</label><input id="jf-start" required type="date" value={form.preferredStartDate} onChange={(e) => set("preferredStartDate", e.target.value)} /></div>
          <div className="field"><label htmlFor="jf-hours">Hours per week</label><input id="jf-hours" required type="number" min={1} max={80} value={form.hoursPerWeek} onChange={(e) => set("hoursPerWeek", Number(e.target.value))} /></div>
        </div>
        <div className="field">
          <span className="field-label">Best times for live sessions</span>
          <div className="slot-picks">
            {(Object.keys(SLOT_LABELS) as SlotKey[]).map((s) => (
              <button type="button" key={s} className={form.preferredSlots.includes(s) ? "on" : ""} aria-pressed={form.preferredSlots.includes(s)} onClick={() => toggleSlot(s)}>
                {form.preferredSlots.includes(s) && <Check size={14} />} {SLOT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label htmlFor="jf-notes">Anything we should know? (optional)</label><textarea id="jf-notes" rows={2} maxLength={2000} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </fieldset>

      <div className="journey-actions">
        <button className="btn btn-lg" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Submit joining form"}</button>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
