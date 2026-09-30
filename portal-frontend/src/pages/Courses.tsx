import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Award, BookOpen, Clock, GraduationCap, Layers, Plus, Search, Users, X } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { PracticeLibrary } from "../components/lms/PracticeLibrary";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { AUTHOR_ROLES, coverFor, minutesLabel, priceLabel, type CatalogCourse } from "../lib/lms";

type Tab = "all" | "mine";

export default function Courses() {
  const { user, accessToken } = useAuth();
  const [, navigate] = useLocation();
  const [courses, setCourses] = useState<CatalogCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const isAuthor = !!user && AUTHOR_ROLES.includes(user.role);

  useEffect(() => {
    apiFetch<{ courses: CatalogCourse[] }>("/api/v1/courses/catalog", { accessToken })
      .then((r) => {
        setCourses(r.courses);
        if (r.courses.some((c) => c.enrollment?.status === "enrolled")) setTab("mine");
      })
      .catch(() => setError("Couldn't load courses."));
  }, [accessToken, reload]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (courses ?? []).filter((c) => (tab === "mine" ? !!c.enrollment : true) && (!q || c.title.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q)));
  }, [courses, tab, search]);

  const inProgress = (courses ?? []).filter((c) => c.enrollment?.status === "enrolled");

  return (
    <DashboardShell wide>
      <div className="page-head">
        <div>
          <h1>Courses</h1>
          <p>{isAuthor ? "Build courses with videos, readings and quizzes, and follow how learners do." : "Learn at your own pace. Quizzes are graded instantly."}</p>
        </div>
        {isAuthor && (
          <motion.button className="btn" onClick={() => setCreating(true)} whileTap={{ scale: 0.96 }}>
            <Plus size={18} /> New course
          </motion.button>
        )}
      </div>

      {isAuthor && <PracticeLibrary onInstalled={() => setReload((n) => n + 1)} />}

      {inProgress.length > 0 && (
        <section className="continue-strip">
          <h2>Continue learning</h2>
          <div className="continue-list">
            {inProgress.slice(0, 3).map((c, i) => {
              const pct = c.enrollment!.total ? Math.round((c.enrollment!.done / c.enrollment!.total) * 100) : 0;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.06 } }}>
                  <Link href={`/learn/${c.id}`} className="continue-card">
                    <span className="continue-cover" style={{ background: coverFor(c.id) }}>
                      <GraduationCap size={22} />
                    </span>
                    <span className="continue-body">
                      <strong>{c.title}</strong>
                      <span className="muted-small">{c.enrollment!.done} of {c.enrollment!.total} lessons · {pct}%</span>
                      <span className="progress-bar"><motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} /></span>
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <div className="board-toolbar">
        <div className="segmented" role="tablist">
          {(
            [
              ["all", isAuthor ? "All courses" : "Catalog"],
              ["mine", "My learning"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {tab === value && <motion.span layoutId="courses-pill" className="segmented-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={16} />
          <input placeholder="Search courses" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!courses && !error && (
        <div className="course-grid">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 260, borderRadius: 16 }} />)}
        </div>
      )}
      {courses && visible.length === 0 && (
        <motion.div className="empty-state" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          <BookOpen size={36} />
          <h3>{tab === "mine" ? "You haven't started a course yet" : "No courses yet"}</h3>
          <p>{tab === "mine" ? "Pick one from the catalog to begin." : isAuthor ? "Create the first one." : "Check back soon."}</p>
        </motion.div>
      )}

      <div className="course-grid">
        {visible.map((c, i) => {
          const pct = c.enrollment?.total ? Math.round((c.enrollment.done / c.enrollment.total) * 100) : 0;
          return (
            <motion.article key={c.id} className="course-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.05 } }} whileHover={{ y: -4 }}>
              <Link href={`/courses/${c.id}`} className="course-card-link">
                <div className="course-cover" style={{ background: coverFor(c.id) }}>
                  <span className="course-cover-icon"><GraduationCap size={28} /></span>
                  {c.status !== "published" && <span className="pill pill-amber course-status">{c.status === "draft" ? "Draft" : "Archived"}</span>}
                  {c.enrollment?.status === "completed" && <span className="pill pill-green course-status">Completed</span>}
                </div>
                <div className="course-body">
                  {c.category && <span className="course-category">{c.category}</span>}
                  <h3>{c.title}</h3>
                  <p className="course-desc">{c.description}</p>
                  <div className="course-meta">
                    <span><Layers size={14} /> {c.lessonCount} lessons</span>
                    {c.totalMinutes > 0 && <span><Clock size={14} /> {minutesLabel(c.totalMinutes)}</span>}
                    {c.hasCertificate && <span><Award size={14} /> Certificate</span>}
                    {isAuthor && <span><Users size={14} /> {c.learnerCount}</span>}
                  </div>
                  {c.enrollment ? (
                    <div className="course-progress">
                      <span className="progress-bar"><span className="progress-fill" style={{ width: `${pct}%` }} /></span>
                      <span className="muted-small">{pct}%</span>
                    </div>
                  ) : (
                    <span className="course-price">{priceLabel(c.priceAmount)}</span>
                  )}
                </div>
              </Link>
            </motion.article>
          );
        })}
      </div>

      <AnimatePresence>{creating && <NewCourseDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`/courses/${id}/edit`)} />}</AnimatePresence>
    </DashboardShell>
  );
}

function NewCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { accessToken } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", category: "", price: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: form.title.trim(), description: form.description.trim() };
      if (form.price) body.priceAmount = Number(form.price);
      const { course } = await apiFetch<{ course: { id: string } }>("/api/v1/courses", { method: "POST", body, accessToken });
      if (form.category.trim()) await apiFetch(`/api/v1/courses/${course.id}`, { method: "PUT", body: { category: form.category.trim() }, accessToken });
      // Every course starts with one module so the builder isn't empty.
      await apiFetch(`/api/v1/courses/${course.id}/modules`, { method: "POST", body: { title: "Getting started" }, accessToken });
      onCreated(course.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the course.");
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="nc-title" initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}>
        <div className="modal-head">
          <h2 id="nc-title">New course</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="field"><label htmlFor="nc-t">Title</label><input id="nc-t" autoFocus required minLength={3} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. React fundamentals" /></div>
        <div className="field"><label htmlFor="nc-d">What learners will get out of it</label><textarea id="nc-d" required minLength={10} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="nc-c">Category</label><input id="nc-c" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Engineering" /></div>
          <div className="field"><label htmlFor="nc-p">Price (₹, blank = free)</label><input id="nc-p" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? "Creating…" : "Create and add lessons"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
