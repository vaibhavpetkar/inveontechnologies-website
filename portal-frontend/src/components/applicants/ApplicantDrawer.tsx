import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CalendarPlus, Check, ClipboardCheck, CreditCard, FileText, FolderOpen, Mail, MessagesSquare, Phone, UserPlus, Video, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { apiFetch, ApiError } from "../../lib/api";
import { nextSlot, toLocalInput, type Colleague, type ProviderInfo } from "../../lib/calendar";
import { EDUCATION_LEVEL_LABELS, ENROLLMENT_LABELS, formatDateTime, rupees, SLOT_LABELS, timeLeft, type InterviewRound, type Journey } from "../../lib/journey";
import { Avatar } from "../Avatar";
import { EventDialog } from "../calendar/EventDialog";
import { FileChip } from "../files/FileChip";
import { DocumentRequests } from "../files/DocumentRequests";

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
            {data.candidate?.resume ? <FileChip file={data.candidate.resume} /> : <p className="muted-small">No resume uploaded.</p>}

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
              <h3><MessagesSquare size={16} /> Interviews and exams</h3>
              {data.interviews.length > 0 && (
                <ul className="mini-list">
                  {data.interviews.map((i) => (
                    <li key={i.id} className="interview-item">
                      <span>
                        <strong>{roundTitle(i)}</strong> · {formatDateTime(i.scheduledAt)}{i.durationMinutes ? ` · ${i.durationMinutes} min` : ""}
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
                              }, decision === "pass" && i.kind !== "exam" && !e ? `${name} passed. They've been asked to pay or start a trial.` : "Result saved")
                            }
                          />
                        )}
                      </AnimatePresence>
                    </li>
                  ))}
                </ul>
              )}
              {!CLOSED.includes(status) && (
                scheduling ? (
                  <ScheduleForm
                    people={people}
                    providers={providers}
                    firstRound={data.interviews.length === 0}
                    busy={busy === "schedule"}
                    onCancel={() => setScheduling(false)}
                    onSubmit={(body) =>
                      run("schedule", async () => {
                        await apiFetch(`/api/v1/applications/${applicationId}/interviews`, { method: "POST", body: { ...body, roundNumber: data.interviews.length + 1 }, accessToken });
                        setScheduling(false);
                      }, "Booked. The candidate and interviewer have been emailed.")
                    }
                  />
                ) : (
                  <button className="btn btn-sm" onClick={() => setScheduling(true)}><CalendarPlus size={14} /> Schedule interview or exam</button>
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
                    {e.joiningDetails.educationLevel && <><dt>Studies</dt><dd>{EDUCATION_LEVEL_LABELS[e.joiningDetails.educationLevel]}, {e.joiningDetails.educationStatus === "studying" ? "still studying" : "finished"}</dd></>}
                    <dt>Experience</dt><dd>{e.joiningDetails.experienceCompanies?.length ? e.joiningDetails.experienceCompanies.join(", ") : e.joiningDetails.educationLevel ? "None, first job" : "Not asked"}</dd>
                    {e.joiningDetails.githubUsername && <><dt>GitHub</dt><dd><a href={`https://github.com/${e.joiningDetails.githubUsername}`} target="_blank" rel="noreferrer">@{e.joiningDetails.githubUsername}</a></dd></>}
                    {e.joiningDetails.linkedinUrl && <><dt>LinkedIn</dt><dd><a href={e.joiningDetails.linkedinUrl} target="_blank" rel="noreferrer">Profile</a></dd></>}
                    <dt>Emergency</dt><dd>{e.joiningDetails.emergencyContactName}, {e.joiningDetails.emergencyContactPhone}</dd>
                    {e.joiningDetails.notes && <><dt>Notes</dt><dd>{e.joiningDetails.notes}</dd></>}
                  </dl>
                )}
              </section>
            )}

            <section>
              <h3><FolderOpen size={16} /> Documents</h3>
              <DocumentRequests applicationId={applicationId} documents={data.documents} mode="staff" onChanged={load} />
            </section>

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

            {(data.employee || (isHr && (!CLOSED.includes(status) || status === "selected"))) && (
              <section>
                <h3><UserPlus size={16} /> Hire</h3>
                {data.employee ? (
                  <p className="hired-line"><BadgeCheck size={16} /> Hired as {data.employee.businessId}, starting {new Date(data.employee.joiningDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.</p>
                ) : (
                  <DirectHire
                    applicationId={applicationId}
                    feeSettled={!!e && ["paid", "waived"].includes(e.status)}
                    busy={busy === "hire"}
                    onSubmit={(body) =>
                      run(
                        "hire",
                        async () => {
                          const r = await apiFetch<{ letterIssued: boolean; letterRequested: boolean }>(
                            e && ["paid", "waived"].includes(e.status) ? `/api/v1/program/enrollments/${e.id}/hire` : `/api/v1/applications/${applicationId}/hire`,
                            { method: "POST", body, accessToken },
                          );
                          if (r.letterRequested) toast("An admin has been asked to issue the join letter.");
                        },
                        body.sendLetter ? `${name} is hired. The join letter is on its way.` : `${name} is hired`,
                      )
                    }
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

const KIND_WORD = { interview: "interview", exam: "exam", hr: "HR round" } as const;

function roundTitle(i: InterviewRound) {
  const kind = KIND_WORD[i.kind ?? "interview"];
  return i.subject ? `${i.subject} ${kind}` : `Round ${i.roundNumber} ${kind}`;
}

type ScheduleBody = { interviewerId: string; scheduledAt: string; meetingUrl?: string; subject?: string; kind: "interview" | "exam" | "hr"; durationMinutes: number; provider: "manual" | "google_meet" | "zoom" };

function ScheduleForm({ people, providers, firstRound, busy, onSubmit, onCancel }: { people: Colleague[]; providers: ProviderInfo[]; firstRound: boolean; busy: boolean; onSubmit: (b: ScheduleBody) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const staff = people.filter((p) => p.role !== "candidate");
  const meet = providers.find((p) => p.name === "google_meet" && p.configured);
  const zoom = providers.find((p) => p.name === "zoom" && p.configured);
  const [form, setForm] = useState({
    interviewerId: user?.id ?? "",
    when: toLocalInput(nextSlot()),
    meetingUrl: "",
    subject: "",
    kind: (firstRound ? "hr" : "interview") as ScheduleBody["kind"],
    duration: "45",
    provider: (meet ? "google_meet" : zoom ? "zoom" : "manual") as ScheduleBody["provider"],
  });
  function submit(ev: FormEvent) {
    ev.preventDefault();
    onSubmit({
      interviewerId: form.interviewerId,
      scheduledAt: new Date(form.when).toISOString(),
      subject: form.subject.trim() || undefined,
      kind: form.kind,
      durationMinutes: Number(form.duration),
      provider: form.provider,
      ...(form.provider === "manual" && form.meetingUrl.trim() ? { meetingUrl: form.meetingUrl.trim() } : {}),
    });
  }
  return (
    <motion.form className="inline-form" onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <div className="segmented small" role="radiogroup" aria-label="Type">
        {(["hr", "interview", "exam"] as const).map((k) => (
          <button type="button" key={k} role="radio" aria-checked={form.kind === k} className={form.kind === k ? "active" : ""} onClick={() => setForm({ ...form, kind: k })}>
            {form.kind === k && <motion.span layoutId="round-kind" className="segmented-pill" />}
            <span>{k === "hr" ? "HR round" : k === "exam" ? "Exam" : "Interview"}</span>
          </button>
        ))}
      </div>
      <div className="field"><label htmlFor="hr-subject">Subject {form.kind === "hr" ? "(optional)" : ""}</label>
        <input id="hr-subject" list="hr-subjects" maxLength={200} required={form.kind !== "hr"} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={form.kind === "exam" ? "e.g. Java, Aptitude, SQL" : "e.g. React technical"} />
        <datalist id="hr-subjects">{["Java", "Python", "JavaScript", "React", "Node.js", "SQL", "C#", "Aptitude", "Communication", "System design"].map((x) => <option key={x} value={x} />)}</datalist>
      </div>
      <div className="field"><label htmlFor="hr-who">{form.kind === "exam" ? "Invigilator" : "Interviewer"}</label>
        <select id="hr-who" required value={form.interviewerId} onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}>
          {staff.length === 0 && user && <option value={user.id}>Me</option>}
          {staff.map((p) => <option key={p.id} value={p.id}>{p.id === user?.id ? `${p.name} (me)` : p.name}</option>)}
        </select>
      </div>
      <div className="field-row field-row-2 even">
        <div className="field"><label htmlFor="hr-when">When</label><input id="hr-when" type="datetime-local" required value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></div>
        <div className="field"><label htmlFor="hr-len">Length</label>
          <select id="hr-len" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
            {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label htmlFor="hr-prov">Call</label>
        <select id="hr-prov" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as ScheduleBody["provider"] })}>
          <option value="google_meet" disabled={!meet}>Google Meet, link made automatically{meet ? "" : " (not set up)"}</option>
          <option value="zoom" disabled={!zoom}>Zoom, link made automatically{zoom ? "" : " (not set up)"}</option>
          <option value="manual">Paste my own link, or in person</option>
        </select>
      </div>
      {form.provider === "manual" && (
        <div className="field"><label htmlFor="hr-url">Meeting link (optional)</label><input id="hr-url" type="url" placeholder="https://meet.google.com/…" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} /></div>
      )}
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

type HireBody = { employeeType: "intern" | "full_time" | "contract"; joiningDate: string; durationMonths?: number; designationTitle?: string; department?: string; monthlyPay?: number; sendLetter: boolean };

interface HireDefaults {
  candidate: { name: string; email: string; phone: string | null; city: string | null; education: string | null; githubUsername: string | null };
  applicationStatus: string;
  opportunity: { id: string; title: string; kind: string } | null;
  enrollmentStatus: string | null;
  canIssueLetter: boolean;
  defaults: { employeeType: HireBody["employeeType"]; joiningDate: string; durationMonths: number | null; designationTitle: string; department: string; monthlyPay: number | null };
}

/**
 * Hire someone straight from their application, at any stage: everything the
 * portal already knows is filled in, and the join letter goes out with it.
 */
function DirectHire({ applicationId, feeSettled, busy, onSubmit }: { applicationId: string; feeSettled: boolean; busy: boolean; onSubmit: (body: HireBody) => void }) {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(feeSettled);
  const [info, setInfo] = useState<HireDefaults | null>(null);
  const [form, setForm] = useState<{ type: HireBody["employeeType"]; start: string; months: string; title: string; department: string; pay: string; sendLetter: boolean } | null>(null);

  useEffect(() => {
    if (!open || info) return;
    apiFetch<HireDefaults>(`/api/v1/applications/${applicationId}/hire-defaults`, { accessToken })
      .then((r) => {
        setInfo(r);
        setForm({
          type: r.defaults.employeeType,
          start: r.defaults.joiningDate,
          months: r.defaults.durationMonths ? String(r.defaults.durationMonths) : "",
          title: r.defaults.designationTitle,
          department: r.defaults.department,
          pay: r.defaults.monthlyPay ? String(r.defaults.monthlyPay) : "",
          sendLetter: true,
        });
      })
      .catch(() => setForm({ type: "intern", start: new Date().toISOString().slice(0, 10), months: "3", title: "", department: "", pay: "", sendLetter: true }));
  }, [open, info, applicationId, accessToken]);

  if (!open) {
    return (
      <div className="hire-direct">
        <p className="muted-small">Skip the remaining steps and bring them on board now as an intern, employee or contractor.</p>
        <button className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}><UserPlus size={14} /> Hire directly</button>
      </div>
    );
  }
  if (!form) return <div className="skeleton" style={{ height: 180 }} />;

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    onSubmit({
      employeeType: form.type,
      joiningDate: form.start,
      durationMonths: form.type === "full_time" || !form.months ? undefined : Number(form.months),
      designationTitle: form.title.trim() || undefined,
      department: form.department.trim() || undefined,
      monthlyPay: form.pay ? Number(form.pay) : undefined,
      sendLetter: form.sendLetter,
    });
  };
  const c = info?.candidate;

  return (
    <motion.form className="inline-form direct-hire" onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
      {c && (
        <dl className="joining-dl hire-facts">
          <dt>Name</dt><dd>{c.name}</dd>
          <dt>Email</dt><dd>{c.email}</dd>
          {c.phone && <><dt>Phone</dt><dd>{c.phone}</dd></>}
          {c.city && <><dt>City</dt><dd>{c.city}</dd></>}
          {c.education && <><dt>Education</dt><dd>{c.education}</dd></>}
          {c.githubUsername && <><dt>GitHub</dt><dd>@{c.githubUsername}</dd></>}
        </dl>
      )}
      <div className="segmented small" role="radiogroup" aria-label="Joins as">
        {(["intern", "full_time", "contract"] as const).map((t) => (
          <button type="button" key={t} role="radio" aria-checked={form.type === t} className={form.type === t ? "active" : ""} onClick={() => setForm({ ...form, type: t })}>
            {form.type === t && <motion.span layoutId="hire-type" className="segmented-pill" />}
            <span>{t === "intern" ? "Intern" : t === "full_time" ? "Full-time" : "Contract"}</span>
          </button>
        ))}
      </div>
      <div className="field-row field-row-2 even">
        <div className="field"><label htmlFor="hire-start">Joining date</label><input id="hire-start" type="date" required value={form.start} onChange={(ev) => setForm({ ...form, start: ev.target.value })} /></div>
        {form.type !== "full_time" && <div className="field"><label htmlFor="hire-months">Months</label><input id="hire-months" type="number" min={1} max={60} value={form.months} onChange={(ev) => setForm({ ...form, months: ev.target.value })} /></div>}
      </div>
      <div className="field-row field-row-2 even">
        <div className="field"><label htmlFor="hire-title">Designation</label><input id="hire-title" value={form.title} onChange={(ev) => setForm({ ...form, title: ev.target.value })} placeholder="e.g. Frontend Developer" /></div>
        <div className="field"><label htmlFor="hire-dept">Department</label><input id="hire-dept" value={form.department} onChange={(ev) => setForm({ ...form, department: ev.target.value })} placeholder="e.g. Engineering" /></div>
      </div>
      <div className="field"><label htmlFor="hire-pay">{form.type === "intern" ? "Monthly stipend (₹)" : "Monthly salary (₹)"}</label><input id="hire-pay" type="number" min={0} value={form.pay} onChange={(ev) => setForm({ ...form, pay: ev.target.value })} placeholder="Optional, can be set later" /></div>
      <label className="check-field">
        <input type="checkbox" checked={form.sendLetter} onChange={(ev) => setForm({ ...form, sendLetter: ev.target.checked })} />
        <span>{info && !info.canIssueLetter ? "Ask an admin to issue the join letter" : "Email the join letter with the terms and conditions"}</span>
      </label>
      <div className="mini-actions">
        <button className="btn" disabled={busy}><UserPlus size={16} /> {busy ? "Hiring…" : "Hire"}</button>
        {!feeSettled && <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </motion.form>
  );
}
