import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CalendarPlus, Check, ClipboardCheck, CreditCard, FileText, Mail, MessagesSquare, Phone, UserPlus, Video, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { apiFetch, ApiError } from "../../lib/api";
import { nextSlot, toLocalInput, type Colleague, type ProviderInfo } from "../../lib/calendar";
import { ENROLLMENT_LABELS, formatDateTime, rupees, SLOT_LABELS, timeLeft, type Journey } from "../../lib/journey";
import { Avatar } from "../Avatar";
import { EventDialog } from "../calendar/EventDialog";

interface Props {
  applicationId: string;
  opportunityTitle: string;
  onClose: () => void;
  onChanged: () => void;
}

const CLOSED = ["rejected", "withdrawn", "selected"];

/** Staff view of one applicant: exam, HR round, payment, joining form and sessions, with the next action on each. */
export function ApplicantDrawer({ applicationId, opportunityTitle, onClose, onChanged }: Props) {
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const isHr = !!user && ["hr", "admin", "super_admin"].includes(user.role);
  const [data, setData] = useState<Journey | null>(null);
  const [people, setPeople] = useState<Colleague[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch<Journey>(`/api/v1/program/by-application/${applicationId}`, { accessToken });
    setData(r);
  }, [applicationId, accessToken]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this applicant."));
    apiFetch<{ people: Colleague[] }>("/api/v1/calendar/people", { accessToken }).then((r) => setPeople(r.people)).catch(() => undefined);
    apiFetch<{ providers: ProviderInfo[] }>("/api/v1/calendar/providers", { accessToken }).then((r) => setProviders(r.providers)).catch(() => undefined);
  }, [load, accessToken]);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      toast(done);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const e = data?.enrollment;
  const name = data?.candidate?.fullName || data?.candidate?.email || "Applicant";
  const status = data?.application.status ?? "";
  const candidateAsColleague: Colleague | null = data?.candidate ? { id: data.application.userId, name, email: data.candidate.email, role: "candidate" } : null;

  return (
    <>
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside className="task-drawer applicant-drawer" role="dialog" aria-modal="true" aria-label={name} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 360, damping: 38 }}>
        <div className="drawer-head">
          {data?.candidate && <Avatar email={data.candidate.email} name={data.candidate.fullName ?? undefined} size={40} />}
          <div className="applicant-title">
            <h2 className="drawer-title">{name}</h2>
            <span className="muted-small">{data?.application.businessId} · {status.replace(/_/g, " ")}</span>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!data ? (
          <div className="skeleton" style={{ height: 300 }} />
        ) : (
          <div className="applicant-sections">
            <div className="applicant-contact">
              <a href={`mailto:${data.candidate?.email}`}><Mail size={14} /> {data.candidate?.email}</a>
              {data.candidate?.phone && <a href={`tel:${data.candidate.phone}`}><Phone size={14} /> {data.candidate.phone}</a>}
            </div>

            <section>
              <h3><ClipboardCheck size={16} /> Exam</h3>
              {data.exam.length === 0 ? (
                <p className="muted-small">No exam attempts.</p>
              ) : (
                <ul className="mini-list">
                  {data.exam.map((a) => (
                    <li key={a.id}>
                      <span>{a.language ?? a.title}</span>
                      <span className={`score-pill ${a.passed ? "good" : a.passed === false ? "bad" : ""}`}>{a.scorePercent !== null ? `${a.scorePercent}%` : a.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3><MessagesSquare size={16} /> HR round</h3>
              {data.interviews.length > 0 && (
                <ul className="mini-list">
                  {data.interviews.map((i) => (
                    <li key={i.id} className="interview-item">
                      <span>
                        <strong>Round {i.roundNumber}</strong> · {formatDateTime(i.scheduledAt)}
                        {i.decision && <span className={`score-pill ${i.decision === "pass" ? "good" : i.decision === "fail" ? "bad" : ""}`}>{i.decision}</span>}
                        {i.feedback && <span className="muted-small interview-feedback">{i.feedback}</span>}
                      </span>
                      <span className="mini-actions">
                        {i.meetingUrl && i.status === "scheduled" && <a className="icon-button" href={i.meetingUrl} target="_blank" rel="noreferrer" aria-label="Join call"><Video size={16} /></a>}
                        {i.status === "scheduled" && <button className="btn btn-sm" onClick={() => setFeedbackFor(i.id)}>Record result</button>}
                      </span>
                      <AnimatePresence>
                        {feedbackFor === i.id && (
                          <FeedbackForm
                            busy={busy === "feedback"}
                            onCancel={() => setFeedbackFor(null)}
                            onSubmit={(decision, feedback) =>
                              run("feedback", async () => {
                                await apiFetch(`/api/v1/interviews/${i.id}/feedback`, { method: "POST", body: { decision, feedback }, accessToken });
                                setFeedbackFor(null);
                              }, decision === "pass" ? `${name} passed. They've been asked to pay or start a trial.` : "Result saved")
                            }
                          />
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                </ul>
              )}
              {!CLOSED.includes(status) && !e && !data.interviews.some((i) => i.status === "scheduled") && (
                scheduling ? (
                  <ScheduleForm
                    people={people}
                    busy={busy === "schedule"}
                    onCancel={() => setScheduling(false)}
                    onSubmit={(body) =>
                      run("schedule", async () => {
                        await apiFetch(`/api/v1/applications/${applicationId}/interviews`, { method: "POST", body: { ...body, roundNumber: data.interviews.length + 1 }, accessToken });
                        setScheduling(false);
                      }, "HR round booked. The candidate has been emailed.")
                    }
                  />
                ) : (
                  <button className="btn btn-sm" onClick={() => setScheduling(true)}><CalendarPlus size={14} /> Book HR round</button>
                )
              )}
            </section>

            {e && (
              <section>
                <h3><CreditCard size={16} /> Program fee</h3>
                <div className="fee-status">
                  <span className={`next-pill ${e.status === "paid" || e.status === "waived" ? "good" : e.status === "trial_expired" ? "warn" : "muted"}`}>{ENROLLMENT_LABELS[e.status]}</span>
                  <span>{Number(e.amount) > 0 ? rupees(e.amount) : "No fee"}</span>
                  {e.status === "trial" && e.trialEndsAt && <span className="muted-small">{timeLeft(e.trialEndsAt)}</span>}
                  {e.paidAt && <span className="muted-small">Paid {formatDateTime(e.paidAt)}</span>}
                </div>
                {e.paymentNote && <p className="muted-small">{e.paymentNote}</p>}
                {["awaiting_choice", "trial", "trial_expired"].includes(e.status) && (
                  <div className="mini-actions">
                    <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => {
                      const note = window.prompt("How was it paid? (e.g. bank transfer reference)", "");
                      if (note === null) return;
                      run("paid", () => apiFetch(`/api/v1/program/enrollments/${e.id}/mark-paid`, { method: "POST", body: { note }, accessToken }), "Marked as paid");
                    }}>Mark paid</button>
                    <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => run("waive", () => apiFetch(`/api/v1/program/enrollments/${e.id}/waive`, { method: "POST", body: {}, accessToken }), "Fee waived")}>Waive fee</button>
                  </div>
                )}
              </section>
            )}

            {e && (
              <section>
                <h3><FileText size={16} /> Joining form</h3>
                {!e.joiningDetails ? (
                  <p className="muted-small">Not filled in yet.</p>
                ) : (
                  <dl className="joining-dl">
                    <dt>Start</dt><dd>{new Date(e.joiningDetails.preferredStartDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · {e.joiningDetails.hoursPerWeek} h/week</dd>
                    <dt>Sessions</dt><dd>{e.joiningDetails.preferredSlots.map((s) => SLOT_LABELS[s]).join(", ")}</dd>
                    <dt>Lives in</dt><dd>{e.joiningDetails.address}, {e.joiningDetails.city}</dd>
                    {(e.joiningDetails.college || e.joiningDetails.degree) && <><dt>Education</dt><dd>{[e.joiningDetails.degree, e.joiningDetails.college, e.joiningDetails.graduationYear].filter(Boolean).join(", ")}</dd></>}
                    {e.joiningDetails.githubUsername && <><dt>GitHub</dt><dd><a href={`https://github.com/${e.joiningDetails.githubUsername}`} target="_blank" rel="noreferrer">@{e.joiningDetails.githubUsername}</a></dd></>}
                    {e.joiningDetails.linkedinUrl && <><dt>LinkedIn</dt><dd><a href={e.joiningDetails.linkedinUrl} target="_blank" rel="noreferrer">Profile</a></dd></>}
                    <dt>Emergency</dt><dd>{e.joiningDetails.emergencyContactName}, {e.joiningDetails.emergencyContactPhone}</dd>
                    {e.joiningDetails.notes && <><dt>Notes</dt><dd>{e.joiningDetails.notes}</dd></>}
                  </dl>
                )}
              </section>
            )}

            {e && ["trial", "paid", "waived"].includes(e.status) && (
              <section>
                <h3><CalendarPlus size={16} /> Sessions</h3>
                {data.sessions.length === 0 ? <p className="muted-small">None booked yet.</p> : (
                  <ul className="mini-list">
                    {data.sessions.map((s) => <li key={s.id}><span><strong>{s.title}</strong> · {formatDateTime(s.startsAt)}</span>{s.joinUrl && <a className="icon-button" href={s.joinUrl} target="_blank" rel="noreferrer" aria-label="Join"><Video size={16} /></a>}</li>)}
                  </ul>
                )}
                <button className="btn btn-sm" onClick={() => setBooking(true)}><CalendarPlus size={14} /> Book a session</button>
              </section>
            )}

            {e && ["paid", "waived"].includes(e.status) && (data.employee || isHr) && (
              <section>
                <h3><UserPlus size={16} /> Hire</h3>
                {data.employee ? (
                  <p className="hired-line"><BadgeCheck size={16} /> Hired as {data.employee.businessId}, starting {new Date(data.employee.joiningDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.</p>
                ) : (
                  <HireForm
                    busy={busy === "hire"}
                    defaultStart={e.joiningDetails?.preferredStartDate?.slice(0, 10)}
                    onSubmit={(body) => run("hire", () => apiFetch(`/api/v1/program/enrollments/${e.id}/hire`, { method: "POST", body, accessToken }), `${name} is hired`)}
                  />
                )}
              </section>
            )}

            {!CLOSED.includes(status) && (
              <div className="drawer-actions applicant-stage">
                {status === "shortlisted" && e && ["paid", "waived"].includes(e.status) && !isHr && (
                  <button className="btn" disabled={!!busy} onClick={() => run("select", () => apiFetch(`/api/v1/applications/${applicationId}/transition`, { method: "POST", body: { toStatus: "selected" }, accessToken }), `${name} is selected`)}><Check size={16} /> Mark selected</button>
                )}
                {status === "submitted" && (
                  <button className="btn btn-secondary" disabled={!!busy} onClick={() => run("review", () => apiFetch(`/api/v1/applications/${applicationId}/transition`, { method: "POST", body: { toStatus: "under_review" }, accessToken }), "Moved to review")}>Start review</button>
                )}
                <button className="btn btn-danger" disabled={!!busy} onClick={() => {
                  if (!window.confirm(`Reject ${name}? They'll be told by email.`)) return;
                  run("reject", () => apiFetch(`/api/v1/applications/${applicationId}/transition`, { method: "POST", body: { toStatus: "rejected" }, accessToken }), "Application rejected");
                }}>Reject</button>
              </div>
            )}
          </div>
        )}
      </motion.aside>

      <AnimatePresence>
        {booking && candidateAsColleague && (
          <EventDialog
            existing={null}
            people={[candidateAsColleague, ...people]}
            providers={providers}
            initialTitle={`${opportunityTitle}: session with ${name.split(" ")[0]}`}
            initialInvited={[candidateAsColleague.id]}
            onClose={() => setBooking(false)}
            onSaved={() => {
              setBooking(false);
              toast("Session booked and invite sent");
              load();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ScheduleForm({ people, busy, onSubmit, onCancel }: { people: Colleague[]; busy: boolean; onSubmit: (b: { interviewerId: string; scheduledAt: string; meetingUrl?: string }) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const staff = people.filter((p) => ["hr", "admin", "super_admin", "manager"].includes(p.role));
  const [form, setForm] = useState({ interviewerId: user?.id ?? "", when: toLocalInput(nextSlot()), meetingUrl: "" });
  function submit(ev: FormEvent) {
    ev.preventDefault();
    onSubmit({ interviewerId: form.interviewerId, scheduledAt: new Date(form.when).toISOString(), ...(form.meetingUrl.trim() ? { meetingUrl: form.meetingUrl.trim() } : {}) });
  }
  return (
    <motion.form className="inline-form" onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <div className="field"><label htmlFor="hr-who">Interviewer</label>
        <select id="hr-who" required value={form.interviewerId} onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}>
          {staff.length === 0 && user && <option value={user.id}>Me</option>}
          {staff.map((p) => <option key={p.id} value={p.id}>{p.id === user?.id ? `${p.name} (me)` : p.name}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor="hr-when">When</label><input id="hr-when" type="datetime-local" required value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></div>
      <div className="field"><label htmlFor="hr-url">Meeting link (optional)</label><input id="hr-url" type="url" placeholder="https://meet.google.com/…" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} /></div>
      <div className="mini-actions"><button className="btn btn-sm" disabled={busy}>{busy ? "Booking…" : "Book and email"}</button><button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button></div>
    </motion.form>
  );
}

function FeedbackForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (decision: "pass" | "hold" | "fail", feedback: string) => void; onCancel: () => void }) {
  const [decision, setDecision] = useState<"pass" | "hold" | "fail">("pass");
  const [feedback, setFeedback] = useState("");
  return (
    <motion.form className="inline-form" onSubmit={(ev) => { ev.preventDefault(); onSubmit(decision, feedback.trim()); }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <div className="decision-picks" role="radiogroup" aria-label="Result">
        {(["pass", "hold", "fail"] as const).map((d) => (
          <button type="button" key={d} role="radio" aria-checked={decision === d} className={`${d}${decision === d ? " on" : ""}`} onClick={() => setDecision(d)}>{d === "pass" ? "Pass" : d === "hold" ? "Hold" : "Fail"}</button>
        ))}
      </div>
      <div className="field"><label htmlFor="fb-notes">Notes</label><textarea id="fb-notes" rows={3} required value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="How did it go?" /></div>
      {decision === "pass" && <p className="muted-small">Passing shortlists them and asks them to pay the program fee or start the free trial.</p>}
      <div className="mini-actions"><button className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save result"}</button><button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button></div>
    </motion.form>
  );
}

type HireBody = { employeeType: "intern" | "full_time" | "contract"; joiningDate: string; durationMonths?: number; designationTitle?: string; monthlyPay?: number };

function HireForm({ busy, defaultStart, onSubmit }: { busy: boolean; defaultStart?: string; onSubmit: (body: HireBody) => void }) {
  const [type, setType] = useState<HireBody["employeeType"]>("intern");
  const [start, setStart] = useState(defaultStart ?? new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState("3");
  const [title, setTitle] = useState("Software Intern");
  const [pay, setPay] = useState("");
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    onSubmit({
      employeeType: type,
      joiningDate: start,
      durationMonths: type === "full_time" || !months ? undefined : Number(months),
      designationTitle: title.trim() || undefined,
      monthlyPay: pay ? Number(pay) : undefined,
    });
  };
  return (
    <form className="inline-form hire-form" onSubmit={submit}>
      <div className="field"><label htmlFor="hire-type">Joins as</label>
        <select id="hire-type" value={type} onChange={(ev) => { const t = ev.target.value as HireBody["employeeType"]; setType(t); if (t !== "intern" && title === "Software Intern") setTitle(""); }}>
          <option value="intern">Intern</option><option value="full_time">Full-time employee</option><option value="contract">Contract</option>
        </select>
      </div>
      <div className="field"><label htmlFor="hire-start">Joining date</label><input id="hire-start" type="date" required value={start} onChange={(ev) => setStart(ev.target.value)} /></div>
      {type !== "full_time" && <div className="field"><label htmlFor="hire-months">Months</label><input id="hire-months" type="number" min={1} max={60} value={months} onChange={(ev) => setMonths(ev.target.value)} /></div>}
      <div className="field"><label htmlFor="hire-title">Designation</label><input id="hire-title" value={title} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. Frontend Developer" /></div>
      <div className="field"><label htmlFor="hire-pay">{type === "intern" ? "Monthly stipend (₹)" : "Monthly salary (₹)"}</label><input id="hire-pay" type="number" min={0} value={pay} onChange={(ev) => setPay(ev.target.value)} placeholder="Optional, can be set later" /></div>
      <button className="btn" disabled={busy}><UserPlus size={16} /> {busy ? "Hiring…" : "Hire"}</button>
    </form>
  );
}
