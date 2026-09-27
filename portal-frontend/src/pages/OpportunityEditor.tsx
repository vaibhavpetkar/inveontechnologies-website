import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Briefcase, Check, GraduationCap, Rocket, Search } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { KIND_META, type LinkedCourse, type Opportunity, type OpportunityKind } from "../lib/opportunities";

interface CatalogCourse { id: string; title: string; status: string; category: string | null; lessonCount: number }

const KIND_ICON: Record<OpportunityKind, typeof Briefcase> = { internship: GraduationCap, program: Rocket, job: Briefcase };
const KINDS: OpportunityKind[] = ["internship", "program", "job"];

/** Create or edit an opening: its kind, terms, and the training that comes with it. */
export default function OpportunityEditor() {
  const [, editParams] = useRoute("/opportunities/:id/edit");
  const id = editParams?.id;
  const [, navigate] = useLocation();
  const { accessToken } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    kind: "internship" as OpportunityKind,
    title: "",
    description: "",
    location: "",
    startDate: "",
    durationMonths: "",
    stipendAmount: "",
    skills: "",
  });
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogCourse[]>([]);
  const [courseQuery, setCourseQuery] = useState("");
  const [loaded, setLoaded] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ courses: CatalogCourse[] }>("/api/v1/courses/catalog", { accessToken }).then((r) => setCatalog(r.courses)).catch(() => undefined);
  }, [accessToken]);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ opportunity: Opportunity; skills: { name: string }[]; courses: LinkedCourse[] }>(`/api/v1/opportunities/${id}`, { accessToken })
      .then(({ opportunity: o, skills, courses }) => {
        setForm({
          kind: o.kind,
          title: o.title,
          description: o.description,
          location: o.location ?? "",
          startDate: o.startDate ? o.startDate.slice(0, 10) : "",
          durationMonths: o.durationMonths ? String(o.durationMonths) : "",
          stipendAmount: o.stipendAmount !== null ? String(Number(o.stipendAmount)) : "",
          skills: skills.map((s) => s.name).join(", "),
        });
        setCourseIds(courses.map((c) => c.id));
        setLoaded(true);
      })
      .catch(() => setError("Couldn't load this opening."));
  }, [id, accessToken]);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const available = catalog.filter((c) => !courseIds.includes(c.id) && c.title.toLowerCase().includes(courseQuery.trim().toLowerCase()));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim() || null,
      startDate: form.startDate ? new Date(`${form.startDate}T09:00:00`).toISOString() : null,
      durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
      stipendAmount: form.stipendAmount !== "" ? Number(form.stipendAmount) : null,
      skillNames: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      courseIds,
    };
    try {
      const r = id
        ? await apiFetch<{ opportunity: Opportunity }>(`/api/v1/opportunities/${id}`, { method: "PUT", body, accessToken })
        : await apiFetch<{ opportunity: Opportunity }>("/api/v1/opportunities", { method: "POST", body, accessToken });
      toast(id ? "Saved" : "Created as a draft. Publish it when you're ready.");
      navigate(`/opportunities/${r.opportunity.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.code === "VALIDATION_ERROR" ? "Check the title (3+ characters) and description (10+ characters)." : err.message) : "Couldn't save.");
      setSaving(false);
    }
  }

  const move = (i: number, dir: -1 | 1) =>
    setCourseIds((ids) => {
      const next = [...ids];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  return (
    <DashboardShell>
      <Link href={id ? `/opportunities/${id}` : "/opportunities"} className="back-link"><ArrowLeft size={16} /> Back</Link>
      <div className="page-head">
        <div>
          <h1>{id ? "Edit opening" : "New opening"}</h1>
          <p>Link courses to give joiners a training track that starts automatically.</p>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!loaded ? (
        <div className="skeleton" style={{ height: 380 }} />
      ) : (
        <form className="opp-editor" onSubmit={save}>
          <section className="panel">
            <h2 className="opp-section-title">What is it?</h2>
            <div className="kind-picker" role="radiogroup" aria-label="Kind">
              {KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                const active = form.kind === k;
                return (
                  <button type="button" key={k} role="radio" aria-checked={active} className={`kind-${k}${active ? " active" : ""}`} onClick={() => setForm({ ...form, kind: k })}>
                    {active && <motion.span layoutId="kind-pick" className="kind-pick-bg" />}
                    <Icon size={22} />
                    <strong>{KIND_META[k].label}</strong>
                    <span>{KIND_META[k].blurb}</span>
                  </button>
                );
              })}
            </div>
            <div className="field">
              <label htmlFor="op-title">Title</label>
              <input id="op-title" required minLength={3} maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.kind === "internship" ? "e.g. Frontend Engineering Intern" : form.kind === "program" ? "e.g. Data Analytics Bootcamp" : "e.g. Backend Engineer"} />
            </div>
            <div className="field">
              <label htmlFor="op-desc">Description</label>
              <textarea id="op-desc" required minLength={10} rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What they'll work on, who they'll work with, what they'll learn." />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="op-loc">Location</label>
                <input id="op-loc" maxLength={200} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Pune (hybrid)" />
              </div>
              <div className="field">
                <label htmlFor="op-start">Start date</label>
                <input id="op-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="op-dur">Duration (months)</label>
                <input id="op-dur" type="number" min={1} max={60} value={form.durationMonths} onChange={(e) => setForm({ ...form, durationMonths: e.target.value })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="op-stipend">{form.kind === "job" ? "Pay per month (₹)" : "Stipend per month (₹)"}</label>
                <input id="op-stipend" type="number" min={0} step={500} value={form.stipendAmount} onChange={(e) => setForm({ ...form, stipendAmount: e.target.value })} placeholder="Leave empty to not show" />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="op-skills">Skills (comma separated)</label>
                <input id="op-skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, TypeScript, SQL" />
              </div>
            </div>
          </section>

          <section className="panel">
            <h2 className="opp-section-title">Training track</h2>
            <p className="muted-small" style={{ marginTop: 0 }}>
              {form.kind === "program" ? "Participants are enrolled in these as soon as they're selected." : "New joiners are enrolled in these when they accept their offer."} Only published courses are shown to applicants.
            </p>
            {courseIds.length > 0 && (
              <ol className="track-list">
                {courseIds.map((cid, i) => {
                  const c = byId.get(cid);
                  return (
                    <motion.li key={cid} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                      <span className="opp-step">{i + 1}</span>
                      <span className="track-title">{c?.title ?? "Course"}{c && c.status !== "published" && <span className="pill pill-amber" style={{ marginLeft: 8 }}>Draft</span>}</span>
                      <button type="button" className="icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="icon-button" aria-label="Move down" disabled={i === courseIds.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button type="button" className="link-button" onClick={() => setCourseIds((ids) => ids.filter((x) => x !== cid))}>Remove</button>
                    </motion.li>
                  );
                })}
              </ol>
            )}
            <label className="search-box" style={{ margin: "0.6rem 0" }}>
              <Search size={16} />
              <input value={courseQuery} onChange={(e) => setCourseQuery(e.target.value)} placeholder="Find a course to add" />
            </label>
            <div className="track-options">
              {available.slice(0, 8).map((c) => (
                <button type="button" key={c.id} onClick={() => setCourseIds((ids) => [...ids, c.id])}>
                  <Check size={14} className="track-add" />
                  <span><strong>{c.title}</strong><span className="muted-small">{c.lessonCount} lessons{c.category ? ` · ${c.category}` : ""}{c.status !== "published" ? " · draft" : ""}</span></span>
                </button>
              ))}
              {available.length === 0 && <p className="muted-small">{catalog.length ? "No more courses match." : "No courses yet. Create one under Courses."}</p>}
            </div>
          </section>

          <div className="opp-editor-actions">
            <Link href={id ? `/opportunities/${id}` : "/opportunities"} className="btn btn-secondary">Cancel</Link>
            <button className="btn" disabled={saving}>{saving ? "Saving…" : id ? "Save changes" : "Create draft"}</button>
          </div>
        </form>
      )}
    </DashboardShell>
  );
}
