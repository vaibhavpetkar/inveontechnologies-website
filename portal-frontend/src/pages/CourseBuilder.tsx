import { useEffect, useState, type FormEvent } from "react";
import { Link, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUp, Award, Eye, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { DashboardShell } from "../components/DashboardShell";
import { LessonEditor } from "../components/lms/LessonEditor";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { TYPE_META, type Lesson, type Module } from "../lib/lms";
import { useCourse } from "../lib/useCourse";

interface Template { id: string; title: string }

const DEFAULT_TEMPLATE = "This certifies that {{recipientName}} has successfully completed the course {{courseTitle}} on {{issuedDate}}.";

export default function CourseBuilder() {
  const [, params] = useRoute("/courses/:id/edit");
  const courseId = params?.id;
  const { user, accessToken } = useAuth();
  const toast = useToast();
  const { course, modules, lessons, reload } = useCourse(courseId);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState({ title: "", description: "", category: "", price: "", certificateTemplateId: "" });
  const [editing, setEditing] = useState<{ lesson: Lesson | null; moduleId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newModule, setNewModule] = useState("");
  const canPublish = !!user && ["admin", "super_admin"].includes(user.role);

  useEffect(() => {
    if (!course) return;
    setSettings({ title: course.title, description: course.description, category: course.category ?? "", price: course.priceAmount && Number(course.priceAmount) > 0 ? String(Number(course.priceAmount)) : "", certificateTemplateId: course.certificateTemplateId ?? "" });
  }, [course]);

  useEffect(() => {
    apiFetch<{ templates: Template[] }>("/api/v1/certificate-templates", { accessToken }).then((r) => setTemplates(r.templates)).catch(() => {});
  }, [accessToken]);

  async function act(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong.", "error");
    }
    setBusy(false);
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    act(async () => {
      let certificateTemplateId: string | null = settings.certificateTemplateId || null;
      if (certificateTemplateId === "__new") {
        const t = await apiFetch<{ template: Template }>("/api/v1/certificate-templates", { method: "POST", body: { title: `${settings.title} completion`, bodyTemplate: DEFAULT_TEMPLATE }, accessToken });
        certificateTemplateId = t.template.id;
        setTemplates((ts) => [t.template, ...ts]);
      }
      await apiFetch(`/api/v1/courses/${courseId}`, {
        method: "PUT",
        body: { title: settings.title.trim(), description: settings.description.trim(), category: settings.category.trim() || null, priceAmount: settings.price ? Number(settings.price) : null, certificateTemplateId },
        accessToken,
      });
    }, "Course details saved");
  }

  /** Saves the whole outline after a move; lessons may change module. */
  function saveOutline(next: { id: string; lessonIds: string[] }[]) {
    act(() => apiFetch(`/api/v1/courses/${courseId}/outline`, { method: "PUT", body: { modules: next }, accessToken }));
  }

  const outline = () => modules.map((m) => ({ id: m.id, lessonIds: lessons.filter((l) => l.moduleId === m.id).map((l) => l.id) }));

  function moveModule(i: number, dir: -1 | 1) {
    const o = outline();
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    saveOutline(o);
  }

  function moveLesson(lesson: Lesson, dir: -1 | 1) {
    const o = outline();
    const mi = o.findIndex((m) => m.id === lesson.moduleId);
    const li = o[mi].lessonIds.indexOf(lesson.id);
    const target = li + dir;
    if (target >= 0 && target < o[mi].lessonIds.length) {
      [o[mi].lessonIds[li], o[mi].lessonIds[target]] = [o[mi].lessonIds[target], o[mi].lessonIds[li]];
    } else {
      // Past the end of its module: hop into the neighbouring module.
      const nm = mi + dir;
      if (nm < 0 || nm >= o.length) return;
      o[mi].lessonIds.splice(li, 1);
      if (dir === 1) o[nm].lessonIds.unshift(lesson.id);
      else o[nm].lessonIds.push(lesson.id);
    }
    saveOutline(o);
  }

  function renameModule(m: Module) {
    const title = window.prompt("Module name", m.title);
    if (!title || title.trim() === m.title) return;
    act(() => apiFetch(`/api/v1/courses/modules/${m.id}`, { method: "PUT", body: { title: title.trim() }, accessToken }));
  }

  function deleteModule(m: Module) {
    const count = lessons.filter((l) => l.moduleId === m.id).length;
    if (!window.confirm(count ? `Delete "${m.title}" and its ${count} lesson(s)? Learner progress on them is removed too.` : `Delete "${m.title}"?`)) return;
    act(() => apiFetch(`/api/v1/courses/modules/${m.id}`, { method: "DELETE", accessToken }), "Module deleted");
  }

  function deleteLesson(l: Lesson) {
    if (!window.confirm(`Delete "${l.title}"? Learner progress on it is removed too.`)) return;
    act(() => apiFetch(`/api/v1/courses/lessons/${l.id}`, { method: "DELETE", accessToken }), "Lesson deleted");
  }

  function addModule(e: FormEvent) {
    e.preventDefault();
    if (newModule.trim().length < 2) return;
    act(async () => {
      await apiFetch(`/api/v1/courses/${courseId}/modules`, { method: "POST", body: { title: newModule.trim(), orderIndex: modules.length }, accessToken });
      setNewModule("");
    }, "Module added");
  }

  if (!course) return <DashboardShell><div className="skeleton" style={{ height: 300 }} /></DashboardShell>;

  return (
    <DashboardShell wide>
      <Link href={`/courses/${course.id}`} className="back-link"><ArrowLeft size={16} /> Back to course</Link>
      <div className="page-head">
        <div>
          <h1>Course builder</h1>
          <p>
            <span className={`pill pill-${course.status === "published" ? "green" : "amber"}`}>{course.status === "published" ? "Published" : course.status === "draft" ? "Draft" : "Archived"}</span>{" "}
            {lessons.length} lessons in {modules.length} modules
          </p>
        </div>
        <div className="head-actions">
          <Link href={`/courses/${course.id}`} className="btn btn-secondary"><Eye size={17} /> Preview</Link>
          {canPublish && course.status === "draft" && (
            <button className="btn" disabled={busy || lessons.length === 0} onClick={() => act(() => apiFetch(`/api/v1/courses/${course.id}/publish`, { method: "POST", accessToken }), "Course published")}>
              <Rocket size={17} /> Publish
            </button>
          )}
        </div>
      </div>

      <div className="builder">
        <form className="panel builder-settings" onSubmit={saveSettings}>
          <h2>Details</h2>
          <div className="field"><label htmlFor="cb-t">Title</label><input id="cb-t" required minLength={3} value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="cb-d">Description</label><textarea id="cb-d" rows={5} required minLength={10} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} /></div>
          <div className="form-grid">
            <div className="field"><label htmlFor="cb-c">Category</label><input id="cb-c" value={settings.category} onChange={(e) => setSettings({ ...settings, category: e.target.value })} /></div>
            <div className="field"><label htmlFor="cb-p">Price (₹)</label><input id="cb-p" type="number" min={0} placeholder="Free" value={settings.price} onChange={(e) => setSettings({ ...settings, price: e.target.value })} /></div>
          </div>
          <div className="field">
            <label htmlFor="cb-cert"><Award size={14} style={{ verticalAlign: "-2px" }} /> Certificate on completion</label>
            <select id="cb-cert" value={settings.certificateTemplateId} onChange={(e) => setSettings({ ...settings, certificateTemplateId: e.target.value })}>
              <option value="">No automatic certificate</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              <option value="__new">+ Create a standard completion certificate</option>
            </select>
          </div>
          <button className="btn" disabled={busy}>Save details</button>
        </form>

        <section className="builder-outline">
          <AnimatePresence initial={false}>
            {modules.map((m, mi) => {
              const items = lessons.filter((l) => l.moduleId === m.id);
              return (
                <motion.div key={m.id} layout className="builder-module" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="builder-module-head">
                    <span className="outline-num">{mi + 1}</span>
                    <strong>{m.title}</strong>
                    <span className="builder-tools">
                      <button className="icon-button" aria-label="Move module up" disabled={busy || mi === 0} onClick={() => moveModule(mi, -1)}><ArrowUp size={15} /></button>
                      <button className="icon-button" aria-label="Move module down" disabled={busy || mi === modules.length - 1} onClick={() => moveModule(mi, 1)}><ArrowDown size={15} /></button>
                      <button className="icon-button" aria-label="Rename module" onClick={() => renameModule(m)}><Pencil size={15} /></button>
                      <button className="icon-button" aria-label="Delete module" onClick={() => deleteModule(m)}><Trash2 size={15} /></button>
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    {items.map((l, li) => {
                      const Icon = TYPE_META[l.contentType].icon;
                      return (
                        <motion.div key={l.id} layout className="builder-lesson" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <Icon size={16} className="muted-icon" />
                          <button className="builder-lesson-title" onClick={() => setEditing({ lesson: l, moduleId: m.id })}>{l.title}</button>
                          <span className="muted-small hide-sm">{TYPE_META[l.contentType].label}{l.durationMinutes ? ` · ${l.durationMinutes} min` : ""}{!l.required ? " · optional" : ""}</span>
                          <span className="builder-tools">
                            <button className="icon-button" aria-label="Move lesson up" disabled={busy || (mi === 0 && li === 0)} onClick={() => moveLesson(l, -1)}><ArrowUp size={15} /></button>
                            <button className="icon-button" aria-label="Move lesson down" disabled={busy || (mi === modules.length - 1 && li === items.length - 1)} onClick={() => moveLesson(l, 1)}><ArrowDown size={15} /></button>
                            <button className="icon-button" aria-label="Delete lesson" onClick={() => deleteLesson(l)}><Trash2 size={15} /></button>
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <button className="link-button builder-add" onClick={() => setEditing({ lesson: null, moduleId: m.id })}><Plus size={15} /> Add lesson</button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <form className="comment-form" onSubmit={addModule}>
            <input aria-label="New module name" placeholder="New module name…" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
            <button className="icon-button primary" aria-label="Add module" disabled={busy || newModule.trim().length < 2}><Plus size={16} /></button>
          </form>
        </section>
      </div>

      <AnimatePresence>
        {editing && <LessonEditor key={editing.lesson?.id ?? `new-${editing.moduleId}`} lesson={editing.lesson} moduleId={editing.moduleId} onClose={() => setEditing(null)} onSaved={reload} />}
      </AnimatePresence>
    </DashboardShell>
  );
}
