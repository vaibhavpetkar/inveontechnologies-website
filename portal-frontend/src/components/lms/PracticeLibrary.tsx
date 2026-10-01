import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, Library } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { PracticeCatalogCourse } from "../../lib/practice";
import { useToast } from "../Toast";

/** Staff: the built-in practice courses (reading, upload assignments, quizzes) and a button to add them to the catalog. */
export function PracticeLibrary({ onInstalled }: { onInstalled: () => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ courses: PracticeCatalogCourse[]; canInstall: boolean; codeRunner: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    apiFetch<{ courses: PracticeCatalogCourse[]; canInstall: boolean; codeRunner: string | null }>("/api/v1/courses/practice/catalog", { accessToken })
      .then(setData)
      .catch(() => setData(null));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (!data || !data.courses.length) return null;
  const missing = data.courses.filter((c) => !c.courseId).length;
  const questions = data.courses.reduce((n, c) => n + c.questions, 0);

  async function install() {
    setBusy(true);
    try {
      const r = await apiFetch<{ created: string[]; updated: string[] }>("/api/v1/courses/practice/install", { method: "POST", accessToken, body: {} });
      toast(r.created.length ? `Added ${r.created.length} course${r.created.length === 1 ? "" : "s"}` : "Practice courses are up to date");
      await load();
      onInstalled();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't install the courses.", "error");
    }
    setBusy(false);
  }

  return (
    <section className="practice-library">
      <div className="practice-library-head">
        <button className="link-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Library size={18} />
          <span>
            <strong>Practice courses</strong>
            <span className="muted-small"> · {data.courses.length} languages, {questions.toLocaleString("en-IN")} upload questions with line-by-line review{missing ? `, ${missing} not added yet` : ", all added"}</span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={16} /></motion.span>
        </button>
        {data.canInstall && (
          <button className="btn btn-sm" disabled={busy} onClick={install}>
            <Download size={15} /> {busy ? "Adding…" : missing ? `Add ${missing === data.courses.length ? "all" : "missing"}` : "Update"}
          </button>
        )}
      </div>
      {!data.codeRunner && <p className="muted-small">Code isn't run on this server yet (set PORTAL_JUDGE0_URL), so uploads get the line-by-line review only.</p>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul className="practice-grid" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {data.courses.map((c) => (
              <li key={c.key}>
                <strong>{c.courseId ? <Link href={`/courses/${c.courseId}`}>{c.title}</Link> : c.title}</strong>
                <span className="muted-small">{c.units} units · {c.questions} questions · {c.quizQuestions} quiz</span>
                <span className="muted-small">{c.tagline}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
