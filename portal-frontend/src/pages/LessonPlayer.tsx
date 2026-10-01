import { useEffect, useState } from "react";
import { Link, Redirect, useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Circle, ExternalLink, ListTree, PartyPopper, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { AssignmentSheet } from "../components/lms/AssignmentSheet";
import { QuizPlayer } from "../components/lms/QuizPlayer";
import { Reading } from "../components/lms/Reading";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { embedFor, TYPE_META, type Lesson } from "../lib/lms";
import { useCourse } from "../lib/useCourse";

export default function LessonPlayer() {
  const [, params] = useRoute("/learn/:courseId/:lessonId?");
  const [, navigate] = useLocation();
  const { accessToken } = useAuth();
  const toast = useToast();
  const courseId = params?.courseId;
  const { course, modules, lessons, enrollment, progress, overdue, loaded, loadProgress } = useCourse(courseId);
  const [busy, setBusy] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  // Assignment lessons with code questions complete by uploading answers, not by a button.
  const [sheetFor, setSheetFor] = useState<Record<string, boolean>>({});

  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const firstOpen = lessons.find((l) => byLesson.get(l.id)?.status !== "completed") ?? lessons[0];
  const lessonId = params?.lessonId ?? firstOpen?.id;
  const index = lessons.findIndex((l) => l.id === lessonId);
  const lesson: Lesson | undefined = lessons[index];
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const done = progress.filter((p) => p.status === "completed").length;
  const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  const isDone = lesson ? byLesson.get(lesson.id)?.status === "completed" : false;

  useEffect(() => setOutlineOpen(false), [lessonId]);

  if (loaded && (!enrollment || overdue)) return <Redirect to={`/courses/${courseId}`} />;
  if (!course || !lesson) {
    return (
      <DashboardShell wide>
        <div className="skeleton" style={{ height: 420, borderRadius: 16 }} />
      </DashboardShell>
    );
  }

  const finished = (courseCompleted: boolean) => {
    if (courseCompleted) setCelebrate(true);
  };

  async function markComplete() {
    setBusy(true);
    try {
      const r = await apiFetch<{ enrollment: { status: string } }>(`/api/v1/lessons/${lesson!.id}/complete`, { method: "POST", accessToken });
      await loadProgress();
      if (r.enrollment.status === "completed" && enrollment?.status !== "completed") finished(true);
      else if (next) navigate(`/learn/${courseId}/${next.id}`);
      else toast("Lesson complete");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your progress.", "error");
    }
    setBusy(false);
  }

  const embed = embedFor(lesson.contentUrl);
  const Icon = TYPE_META[lesson.contentType].icon;

  const outline = (
    <nav className="player-outline" aria-label="Course outline">
      <div className="player-outline-head">
        <Link href={`/courses/${course.id}`} className="player-course">{course.title}</Link>
        <div className="player-progress">
          <span className="progress-bar"><motion.span className="progress-fill" animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} /></span>
          <span className="muted-small">{pct}%</span>
        </div>
      </div>
      {modules.map((m) => (
        <div key={m.id} className="player-module">
          <div className="player-module-title">{m.title}</div>
          {lessons.filter((l) => l.moduleId === m.id).map((l) => {
            const p = byLesson.get(l.id);
            const LIcon = TYPE_META[l.contentType].icon;
            return (
              <Link key={l.id} href={`/learn/${course.id}/${l.id}`} className={`player-lesson${l.id === lesson.id ? " current" : ""}`}>
                {l.id === lesson.id && <motion.span layoutId="player-current" className="player-current-bg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className="player-lesson-state">{p?.status === "completed" ? <CheckCircle2 size={17} className="ok" /> : <Circle size={17} />}</span>
                <span className="player-lesson-title">{l.title}</span>
                <LIcon size={14} className="muted-icon" />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <DashboardShell wide>
      <div className="player">
        <aside className="player-side">{outline}</aside>

        <AnimatePresence>
          {outlineOpen && (
            <>
              <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOutlineOpen(false)} />
              <motion.aside className="player-side-mobile" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 38 }}>
                <button className="icon-button" aria-label="Close outline" onClick={() => setOutlineOpen(false)} style={{ float: "right" }}><X size={18} /></button>
                {outline}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <section className="player-main">
          <div className="player-crumbs">
            <button className="icon-button outline-toggle" aria-label="Show outline" onClick={() => setOutlineOpen(true)}><ListTree size={18} /></button>
            <span className="muted-small">Lesson {index + 1} of {lessons.length}</span>
            <span className="pill pill-slate"><Icon size={13} style={{ marginRight: 4 }} />{lesson.timeLimitMinutes ? `Exam · ${lesson.timeLimitMinutes} min` : TYPE_META[lesson.contentType].label}</span>
            {isDone && <span className="pill pill-green">Done</span>}
          </div>

          <AnimatePresence mode="wait">
            <motion.article key={lesson.id} className="player-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
              <h1 className="player-title">{lesson.title}</h1>

              {embed?.kind === "iframe" && (
                <div className={lesson.contentType === "video" ? "player-video" : "player-doc"}>
                  <iframe src={embed.src} title={lesson.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                </div>
              )}
              {embed?.kind === "video" && (
                <div className="player-video"><video src={embed.src} controls preload="metadata" /></div>
              )}
              {embed?.kind === "link" && (
                <a className="resource-link" href={embed.src} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open the {lesson.contentType === "video" ? "video" : "material"}</a>
              )}

              {lesson.contentText && <Reading text={lesson.contentText} />}

              {lesson.contentType === "assignment" && (
                <AssignmentSheet
                  lessonId={lesson.id}
                  onLoaded={(has) => setSheetFor((m) => ({ ...m, [lesson.id]: has }))}
                  onSubmitted={async (r) => {
                    const wasCompleted = enrollment?.status === "completed";
                    await loadProgress();
                    if (r.courseCompleted && !wasCompleted) finished(true);
                    else if (r.assignment.completed && r.submission.status !== "failed" && r.assignment.done === r.assignment.total) toast("Assignment complete: every question is done");
                  }}
                />
              )}

              {lesson.contentType === "test" ? (
                <QuizPlayer
                  key={lesson.id}
                  lesson={lesson}
                  onGraded={async (r) => {
                    const wasCompleted = enrollment?.status === "completed";
                    await loadProgress();
                    if (r.courseCompleted && !wasCompleted) finished(true);
                  }}
                />
              ) : (
                !isDone && !(lesson.contentType === "assignment" && sheetFor[lesson.id] !== false) && (
                  <motion.button className="btn player-complete" disabled={busy} onClick={markComplete} whileTap={{ scale: 0.96 }}>
                    <CheckCircle2 size={18} /> {lesson.contentType === "assignment" ? "I've done this" : "Mark as complete"}{next ? " and continue" : ""}
                  </motion.button>
                )
              )}
            </motion.article>
          </AnimatePresence>

          <div className="player-nav">
            {prev ? <Link href={`/learn/${course.id}/${prev.id}`} className="btn btn-secondary"><ArrowLeft size={16} /> {prev.title}</Link> : <span />}
            {next && <Link href={`/learn/${course.id}/${next.id}`} className="btn btn-secondary">{next.title} <ArrowRight size={16} /></Link>}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {celebrate && (
          <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCelebrate(false)}>
            <Confetti />
            <motion.div className="modal celebrate" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <PartyPopper size={48} className="celebrate-icon" />
              <h2>Course complete!</h2>
              <p>You finished every required lesson of {course.title}.{course.certificateTemplateId ? " Your certificate has been issued." : ""}</p>
              <div className="modal-actions" style={{ justifyContent: "center" }}>
                <Link href={`/courses/${course.id}`} className="btn"><Award size={16} /> {course.certificateTemplateId ? "See certificate" : "Back to course"}</Link>
                <button className="btn btn-secondary" onClick={() => setCelebrate(false)}>Keep reviewing</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardShell>
  );
}

/** Light confetti burst: a few dozen animated pieces, no library. */
function Confetti() {
  const pieces = Array.from({ length: 48 }, (_, i) => i);
  const colors = ["#2563eb", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((i) => (
        <motion.span
          key={i}
          style={{ background: colors[i % colors.length], left: `${(i * 37) % 100}%` }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: "105vh", rotate: 360 + (i % 5) * 90, x: ((i % 7) - 3) * 30, opacity: [1, 1, 0.8] }}
          transition={{ duration: 2.2 + (i % 6) * 0.25, ease: "easeIn", delay: (i % 10) * 0.05 }}
        />
      ))}
    </div>
  );
}
