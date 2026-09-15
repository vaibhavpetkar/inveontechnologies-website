import { useEffect, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { DashboardShell } from "../components/DashboardShell";
import { CandidateNav } from "../components/CandidateNav";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

interface Course { id: string; title: string; description: string; priceAmount: string | null }
interface Lesson { id: string; title: string; contentType: string; moduleId: string; required: boolean }
interface Module { id: string; title: string }
interface Enrollment { id: string; status: string; paymentStatus: string; paymentDueAt: string | null }
interface Progress { lessonId: string; status: string; passed: boolean | null }

export default function CourseDetail() {
  const [, params] = useRoute("/courses/:id");
  const { accessToken } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProgress = useCallback(async (courseId: string) => {
    try {
      const r = await apiFetch<{ enrollment: Enrollment; progress: Progress[] }>(`/api/v1/courses/${courseId}/progress`, { accessToken });
      setEnrollment(r.enrollment);
      setProgress(r.progress);
      setOverdue(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PAYMENT_OVERDUE") {
        setOverdue(true);
      }
      // A 404 just means "not enrolled yet" — not an error worth showing.
    }
  }, [accessToken]);

  useEffect(() => {
    if (!params?.id) return;
    apiFetch<{ course: Course; modules: Module[]; lessons: Lesson[] }>(`/api/v1/courses/${params.id}`, { accessToken })
      .then((r) => { setCourse(r.course); setModules(r.modules); setLessons(r.lessons); })
      .catch(() => setError("Couldn't load this course."));
    loadProgress(params.id);
  }, [params?.id, accessToken, loadProgress]);

  async function enroll(paymentChoice?: "pay" | "skip") {
    if (!params?.id) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/courses/${params.id}/enroll`, { method: "POST", body: paymentChoice ? { paymentChoice } : {}, accessToken });
      await loadProgress(params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't enroll.");
    } finally {
      setBusy(false);
    }
  }

  async function completeLesson(lessonId: string) {
    if (!params?.id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/lessons/${lessonId}/complete`, { method: "POST", accessToken });
      await loadProgress(params.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't mark that lesson complete.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !course) return <DashboardShell nav={<CandidateNav />}><div className="error-banner">{error}</div></DashboardShell>;
  if (!course) return <DashboardShell nav={<CandidateNav />}><p className="empty">Loading…</p></DashboardShell>;

  const price = course.priceAmount && Number(course.priceAmount) > 0 ? Number(course.priceAmount) : null;
  const progressByLesson = new Map(progress.map((p) => [p.lessonId, p]));

  return (
    <DashboardShell nav={<CandidateNav />}>
      <h1>{course.title}</h1>
      <p>{price ? `₹${price.toLocaleString("en-IN")}` : "Free"}</p>

      <div className="card" style={{ marginTop: "1.5rem", whiteSpace: "pre-wrap" }}>{course.description}</div>

      {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}

      {overdue && (
        <div className="notice notice-warn">
          Your payment grace period has ended, so course access is paused. Contact an administrator to complete payment and restore access.
        </div>
      )}

      {enrollment?.paymentStatus === "pending" && enrollment.paymentDueAt && (
        <div className="notice notice-warn">
          Payment is pending. Complete it by {new Date(enrollment.paymentDueAt).toLocaleDateString()} or access will be paused.
        </div>
      )}

      {!enrollment && !overdue && (
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {price ? (
            <>
              <button className="btn" onClick={() => enroll("pay")} disabled={busy}>Pay now</button>
              <button className="btn btn-secondary" onClick={() => enroll("skip")} disabled={busy}>Skip for now</button>
            </>
          ) : (
            <button className="btn" onClick={() => enroll()} disabled={busy}>Enroll</button>
          )}
        </div>
      )}

      {enrollment && !overdue && (
        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.15rem" }}>Lessons</h2>
          {modules.map((m) => (
            <div key={m.id} style={{ marginTop: "1rem" }}>
              <div className="card-meta" style={{ fontWeight: 600 }}>{m.title}</div>
              <div className="stack" style={{ marginTop: "0.6rem" }}>
                {lessons.filter((l) => l.moduleId === m.id).map((l) => {
                  const p = progressByLesson.get(l.id);
                  const done = p?.status === "completed";
                  return (
                    <div key={l.id} className="card">
                      <div className="card-row">
                        <div>
                          <div className="card-title" style={{ fontSize: "0.95rem" }}>{l.title}</div>
                          <div className="card-meta">{l.contentType}{l.required ? " · required" : ""}</div>
                        </div>
                        {done ? (
                          <span className="badge badge-good">
                            {l.contentType === "test" ? (p?.passed ? "Passed" : "Reviewed") : "Done"}
                          </span>
                        ) : l.contentType === "test" ? (
                          <span className="badge">Graded by reviewer</span>
                        ) : (
                          <button className="btn btn-secondary" onClick={() => completeLesson(l.id)} disabled={busy}>
                            Mark complete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {enrollment.status === "completed" && (
            <div className="notice notice-info">You've completed this course. A certificate can be issued by an administrator.</div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
