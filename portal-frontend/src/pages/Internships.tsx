import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Award, BookOpen, CalendarRange, ClipboardList, GraduationCap, IndianRupee, Sparkles, Users } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { inr, stageOf, type TrackSummary } from "../lib/internships";
import { useToast } from "../components/Toast";

const STEPS = ["Take the free course", "Pass the final exam", "Get your offer letter", "Pay ₹4,000 to join", "Work through your roadmap"];

/** The six 6-month internship tracks, and where the viewer stands on each. */
export default function Internships() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [, navigate] = useLocation();
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ tracks: TrackSummary[]; canInstall: boolean }>("/api/v1/internships", { accessToken });
      setTracks(r.tracks);
      setCanInstall(r.canInstall);
    } catch {
      setTracks([]);
    }
  }, [accessToken]);
  useEffect(() => {
    load();
  }, [load]);

  async function install() {
    setBusy("install");
    try {
      const r = await apiFetch<{ created: string[] }>("/api/v1/internships/install", { method: "POST", accessToken });
      toast(r.created.length ? `Set up ${r.created.length} tracks with their courses, exams and openings` : "Everything was already set up");
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't set them up.", "error");
    }
    setBusy(null);
  }

  async function start(track: TrackSummary) {
    if (!track.courseId) return;
    if (track.me.course) {
      navigate(`/learn/${track.courseId}`);
      return;
    }
    setBusy(track.id);
    try {
      await apiFetch(`/api/v1/courses/${track.courseId}/enroll`, { method: "POST", body: {}, accessToken });
      toast(`You're enrolled in ${track.title}`);
      navigate(`/learn/${track.courseId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_ENROLLED") navigate(`/learn/${track.courseId}`);
      else toast(err instanceof ApiError ? err.message : "Couldn't enroll you.", "error");
    }
    setBusy(null);
  }

  return (
    <DashboardShell>
      <section className="intern-hero">
        <div>
          <span className="intern-kicker"><Sparkles size={15} /> 6-month internship programs</span>
          <h1>Learn, prove it, and join Inveon as an intern</h1>
          <p>Pick a track, finish its free course and pass the final exam. You'll get an offer letter for the 6-month program; the one-time fee of ₹4,000 unlocks a roadmap of real assignments reviewed by our mentors, and makes you an official Inveon intern.</p>
        </div>
        <ol className="intern-steps">
          {STEPS.map((s, i) => (
            <motion.li key={s} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
              <span>{i + 1}</span>
              {s}
            </motion.li>
          ))}
        </ol>
      </section>

      {tracks === null && <div className="skeleton" style={{ height: 220, marginTop: "1.5rem" }} />}
      {tracks?.length === 0 && (
        <div className="panel empty-tracks">
          <GraduationCap size={28} />
          <p>{canInstall ? "The internship tracks aren't set up yet. This creates six tracks, each with a free course, a final exam, a published 6-month opening at ₹4,000 and its assignments." : "Internship programs open soon. Check back shortly."}</p>
          {canInstall && <button className="btn" disabled={busy === "install"} onClick={install}>{busy === "install" ? "Setting up…" : "Set up the six tracks"}</button>}
        </div>
      )}

      <div className="track-grid">
        {tracks?.map((t, i) => {
          const stage = stageOf(t.me);
          const pct = t.me.course ? Math.round((t.me.course.done / Math.max(1, t.me.course.total)) * 100) : 0;
          return (
            <motion.article key={t.id} className="track-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <div className={`track-band band-${i % 6}`}>
                <GraduationCap size={26} />
                {stage.step > 1 && <span className="track-stage">{stage.label}</span>}
              </div>
              <div className="track-body">
                <h2>{t.title}</h2>
                <p className="muted-small">{t.tagline}</p>
                <div className="track-facts">
                  <span><CalendarRange size={14} /> {t.durationMonths} months</span>
                  <span><IndianRupee size={14} /> {inr(t.fee).slice(1)}</span>
                  <span><ClipboardList size={14} /> {t.assignmentCount} assignments</span>
                  {t.interns !== undefined && <span><Users size={14} /> {t.interns} interns</span>}
                </div>
                <div className="track-skills">
                  {[...new Set(t.roadmap.flatMap((p) => p.labels))].map((l) => <span key={l} className="skill-chip">{l}</span>)}
                </div>
                {t.me.course && !t.me.offer && (
                  <div className="track-progress" aria-label={`Course ${pct}% done`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="track-actions">
                  {t.me.offer || t.me.unlocked ? (
                    <Link href={`/internships/${t.slug}`} className="btn">
                      {t.me.unlocked ? <>Open roadmap <ArrowRight size={16} /></> : <><Award size={16} /> View your offer</>}
                    </Link>
                  ) : (
                    <button className="btn" disabled={busy === t.id || !t.courseId} onClick={() => start(t)}>
                      <BookOpen size={16} /> {t.me.course ? (t.me.exam?.attempts ? "Back to the course" : "Continue the course") : "Start the free course"}
                    </button>
                  )}
                  <Link href={`/internships/${t.slug}`} className="link-button">See the roadmap</Link>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
