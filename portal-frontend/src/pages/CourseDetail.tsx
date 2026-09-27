import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Award, CheckCircle2, Circle, Clock, GraduationCap, Layers, Lock, Pencil, PlayCircle, Rocket } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { AUTHOR_ROLES, coverFor, minutesLabel, priceLabel, TYPE_META } from "../lib/lms";
import { useCourse } from "../lib/useCourse";

export default function CourseDetail() {
  const [, params] = useRoute("/courses/:id");
  const [, navigate] = useLocation();
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const { course, modules, lessons, enrollment, progress, overdue, error, reload } = useCourse(params?.id);
  const [busy, setBusy] = useState(false);
  const isAuthor = !!user && AUTHOR_ROLES.includes(user.role);
  const canPublish = !!user && ["admin", "super_admin"].includes(user.role);
  const [certificateCode, setCertificateCode] = useState<string | null>(null);

  useEffect(() => {
    if (enrollment?.status !== "completed" || !accessToken) return;
    apiFetch<{ certificates: { courseId: string; status: string; verificationCode: string }[] }>("/api/v1/certificates", { accessToken })
      .then((r) => setCertificateCode(r.certificates.find((c) => c.courseId === params?.id && c.status === "issued")?.verificationCode ?? null))
      .catch(() => {});
  }, [enrollment?.status, accessToken, params?.id]);

  async function enroll(paymentChoice?: "pay" | "skip") {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/courses/${params!.id}/enroll`, { method: "POST", body: paymentChoice ? { paymentChoice } : {}, accessToken });
      toast("You're enrolled. Let's go!");
      navigate(`/learn/${params!.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't enroll.", "error");
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/courses/${params!.id}/publish`, { method: "POST", accessToken });
      toast("Course published");
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't publish.", "error");
    }
    setBusy(false);
  }

  if (error && !course) return <DashboardShell><div className="error-banner">{error}</div></DashboardShell>;
  if (!course) return <DashboardShell><div className="skeleton" style={{ height: 220, borderRadius: 18 }} /></DashboardShell>;

  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const done = progress.filter((p) => p.status === "completed").length;
  const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  const totalMinutes = lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0);
  const price = priceLabel(course.priceAmount);
  const nextLesson = lessons.find((l) => byLesson.get(l.id)?.status !== "completed") ?? lessons[0];

  return (
    <DashboardShell>
      <motion.section className="course-hero" style={{ background: coverFor(course.id) }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="course-hero-inner">
          {course.category && <span className="course-hero-cat">{course.category}</span>}
          <h1>{course.title}</h1>
          <div className="course-hero-meta">
            <span><Layers size={15} /> {lessons.length} lessons</span>
            {totalMinutes > 0 && <span><Clock size={15} /> {minutesLabel(totalMinutes)}</span>}
            {course.certificateTemplateId && <span><Award size={15} /> Certificate on completion</span>}
            <span>{price}</span>
          </div>
          <div className="course-hero-actions">
            {enrollment && !overdue && nextLesson && (
              <Link href={`/learn/${course.id}/${nextLesson.id}`} className="btn btn-light">
                <PlayCircle size={18} /> {done === 0 ? "Start learning" : enrollment.status === "completed" ? "Review course" : "Continue"}
              </Link>
            )}
            {!enrollment && !overdue && course.status === "published" && (
              price === "Free" ? (
                <button className="btn btn-light" disabled={busy} onClick={() => enroll()}><Rocket size={18} /> Enroll for free</button>
              ) : (
                <>
                  <button className="btn btn-light" disabled={busy} onClick={() => enroll("pay")}>Pay {price}</button>
                  <button className="btn btn-ghost-light" disabled={busy} onClick={() => enroll("skip")}>Start now, pay later</button>
                </>
              )
            )}
            {isAuthor && <Link href={`/courses/${course.id}/edit`} className="btn btn-ghost-light"><Pencil size={16} /> Edit course</Link>}
            {canPublish && course.status === "draft" && <button className="btn btn-ghost-light" disabled={busy || lessons.length === 0} onClick={publish}>Publish</button>}
          </div>
        </div>
        <GraduationCap className="course-hero-art" size={140} />
      </motion.section>

      {overdue && <div className="notice notice-warn">Your payment grace period has ended, so course access is paused. Contact an administrator to complete payment and restore access.</div>}
      {enrollment?.paymentStatus === "pending" && enrollment.paymentDueAt && (
        <div className="notice notice-warn">Payment is pending. Complete it by {new Date(enrollment.paymentDueAt).toLocaleDateString()} or access will be paused.</div>
      )}

      <div className="course-layout">
        <section>
          <h2 className="section-title">About this course</h2>
          <p className="course-about">{course.description}</p>

          <h2 className="section-title">Course outline</h2>
          {modules.map((m, mi) => (
            <motion.div key={m.id} className="outline-module" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: mi * 0.05 } }}>
              <div className="outline-module-title">
                <span className="outline-num">{mi + 1}</span> {m.title}
              </div>
              {lessons.filter((l) => l.moduleId === m.id).map((l) => {
                const p = byLesson.get(l.id);
                const Icon = TYPE_META[l.contentType].icon;
                const row = (
                  <>
                    <span className="outline-state">
                      {p?.status === "completed" ? <CheckCircle2 size={18} className="ok" /> : enrollment ? <Circle size={18} /> : <Lock size={16} />}
                    </span>
                    <Icon size={16} className="outline-type" />
                    <span className="outline-title">{l.title}</span>
                    <span className="muted-small">
                      {TYPE_META[l.contentType].label}
                      {l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}
                      {l.contentType === "test" && p?.bestScorePercent != null ? ` · best ${p.bestScorePercent}%` : ""}
                    </span>
                  </>
                );
                return enrollment && !overdue ? (
                  <Link key={l.id} href={`/learn/${course.id}/${l.id}`} className="outline-lesson">{row}</Link>
                ) : (
                  <div key={l.id} className="outline-lesson locked">{row}</div>
                );
              })}
            </motion.div>
          ))}
          {modules.length === 0 && <p className="muted-small">No lessons yet.</p>}
        </section>

        <aside className="course-side">
          {enrollment ? (
            <div className="panel">
              <h3>Your progress</h3>
              <div className="big-pct">{pct}%</div>
              <span className="progress-bar"><motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} /></span>
              <p className="muted-small">{done} of {lessons.length} lessons done</p>
              {enrollment.status === "completed" && (certificateCode ? (
                <Link href={`/verify/${certificateCode}`} className="btn"><Award size={16} /> View certificate</Link>
              ) : (
                <p className="muted-small">Completed. {course.certificateTemplateId ? "Your certificate is on its way." : ""}</p>
              ))}
            </div>
          ) : (
            <div className="panel">
              <h3>What's inside</h3>
              {(["video", "document", "assignment", "test"] as const).map((t) => {
                const n = lessons.filter((l) => l.contentType === t).length;
                if (!n) return null;
                const Icon = TYPE_META[t].icon;
                return <div key={t} className="inside-row"><Icon size={16} /> {n} {TYPE_META[t].label.toLowerCase()}{n > 1 && t !== "test" ? "s" : n > 1 ? "zes" : ""}</div>;
              })}
            </div>
          )}
        </aside>
      </div>
    </DashboardShell>
  );
}
