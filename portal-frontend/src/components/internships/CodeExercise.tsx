import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Database, EyeOff, Play, RotateCcw, Send, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { EDITOR_LABEL, type Assignment, type CheckReport } from "../../lib/internships";
import { useToast } from "../Toast";

interface Props {
  assignment: Assignment;
  onSubmitted: () => void;
}

const draftKey = (id: string) => `exercise-draft:${id}`;
function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function writeDraft(id: string, code: string | null) {
  try {
    if (code === null) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), code);
  } catch {
    /* private mode: drafts just aren't kept */
  }
}

/** Write code for an exercise, run it against the examples, and submit it for the full automatic check. */
export function CodeExercise({ assignment: a, onSubmitted }: Props) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const ex = a.exercise!;
  const sub = a.submission;
  const done = sub?.status === "approved";
  const waiting = sub?.status === "submitted";
  const [code, setCode] = useState(() => readDraft(a.id) ?? sub?.code ?? ex.starter ?? "");
  const [report, setReport] = useState<CheckReport | null>(sub?.checkReport ?? null);
  const [reportIsSubmit, setReportIsSubmit] = useState(!!sub?.checkReport);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const readOnly = done || waiting;

  useEffect(() => {
    if (!readOnly) writeDraft(a.id, code === (sub?.code ?? ex.starter) ? null : code);
  }, [a.id, code, readOnly, sub?.code, ex.starter]);

  async function check(kind: "run" | "submit") {
    setBusy(kind);
    try {
      const r = await apiFetch<{ report: CheckReport }>(`/api/v1/internships/assignments/${a.id}/${kind}`, { method: "POST", accessToken, body: { code } });
      setReport(r.report);
      setReportIsSubmit(kind === "submit");
      if (kind === "submit") {
        if (r.report.passed) toast(`Passed! ${a.maxMarks}/${a.maxMarks} marks`);
        else if (r.report.runnerUnavailable) toast("Submitted. A mentor will check your code.");
        else toast("Not quite yet: see what failed below", "error");
        writeDraft(a.id, null);
        onSubmitted();
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't check your code.", "error");
    }
    setBusy(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: start, selectionEnd: end } = el;
      const next = `${code.slice(0, start)}  ${code.slice(end)}`;
      setCode(next);
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !readOnly) {
      e.preventDefault();
      check(canRun ? "run" : "submit");
    }
  }

  const lines = code.split("\n").length;
  const canRun = !readOnly && ex.autoChecked !== false;
  const requirements = ex.requirements ?? [];
  const ruleResult = (label: string) => report?.items.find((i) => i.kind === "rule" && i.label === label);
  const tests = report?.items.filter((i) => i.kind === "test") ?? [];

  return (
    <div className="code-exercise">
      {(ex.examples?.length ?? 0) > 0 && ex.editor !== "sql" && (
        <div className="examples">
          {ex.examples!.map((t, i) => (
            <div key={i} className="example">
              <span className="example-label">Example {i + 1}</span>
              <div className="example-io">
                <div><span>Input</span><pre>{t.stdin || "(none)"}</pre></div>
                <div><span>Output</span><pre>{t.expected}</pre></div>
              </div>
            </div>
          ))}
          {(ex.hiddenTests ?? 0) > 0 && <p className="muted-small"><EyeOff size={13} /> Plus {ex.hiddenTests} hidden test{ex.hiddenTests === 1 ? "" : "s"} when you submit.</p>}
        </div>
      )}
      {ex.editor === "sql" && ex.setup && (
        <details className="sql-setup">
          <summary><Database size={14} /> The tables you're querying</summary>
          <pre>{ex.setup.trim()}</pre>
          {ex.examples?.[0] && (
            <>
              <span className="example-label">Expected output</span>
              <pre>{ex.examples[0].expected}</pre>
            </>
          )}
        </details>
      )}
      {requirements.length > 0 && (
        <ul className="requirements">
          {requirements.map((r) => {
            const res = ruleResult(r);
            return (
              <li key={r} className={res ? (res.passed ? "ok" : "bad") : ""}>
                {res ? res.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} /> : <Circle size={15} />}
                {r}
              </li>
            );
          })}
        </ul>
      )}

      <div className="code-editor">
        <div className="code-editor-bar">
          <span>{EDITOR_LABEL[ex.editor] ?? ex.editor}</span>
          {!readOnly && (
            <button type="button" className="link-button" onClick={() => setCode(ex.starter ?? "")} title="Start again from the starter code">
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
        <div className="code-editor-body">
          <div className="code-gutter" ref={gutter} aria-hidden>
            {Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}
          </div>
          <textarea
            ref={editor}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={`Your ${EDITOR_LABEL[ex.editor] ?? ""} code`}
            rows={Math.min(22, Math.max(10, lines + 1))}
          />
        </div>
      </div>

      {ex.autoChecked === false && !readOnly && (
        <p className="muted-small runner-off">Automatic checking for {EDITOR_LABEL[ex.editor] ?? "this language"} isn't switched on yet. Submit your code and a mentor will check it.</p>
      )}
      {waiting && <p className="muted-small">Waiting for a mentor to check your code. You'll get a notification.</p>}

      {!readOnly && (
        <div className="code-actions">
          {canRun && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => check("run")}>
              <Play size={14} /> {busy === "run" ? "Running…" : ex.runs ? "Run examples" : "Check"}
            </button>
          )}
          <button type="button" className="btn btn-sm" disabled={!!busy || !code.trim()} onClick={() => check("submit")}>
            <Send size={14} /> {busy === "submit" ? "Checking…" : "Submit"}
          </button>
          <span className="muted-small kbd-hint">Ctrl + Enter to {canRun ? "run" : "submit"}</span>
        </div>
      )}

      <AnimatePresence>
        {report && !(waiting && report.runnerUnavailable) && (
          <motion.div className={`check-report ${report.passed ? "passed" : report.runnerUnavailable ? "pending" : "failed"}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <strong>
              {report.passed ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
              {reportIsSubmit ? (report.passed ? `Passed: ${a.maxMarks}/${a.maxMarks} marks. ` : "Submission: ") : ex.runs ? "Examples: " : ""}
              {report.summary}
            </strong>
            {report.runnerUnavailable && !reportIsSubmit && <p className="muted-small">Your code couldn't be run right now. You can still submit it.</p>}
            {tests.length > 0 && (
              <ul className="test-results">
                {tests.map((t) => (
                  <li key={t.label} className={t.passed ? "ok" : "bad"}>
                    <span className="test-name">{t.passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {t.label}</span>
                    {!t.passed && !t.hidden && (
                      <div className="test-diff">
                        {t.stdin !== undefined && <div><span>Input</span><pre>{t.stdin || "(none)"}</pre></div>}
                        <div><span>Expected</span><pre>{t.expected}</pre></div>
                        <div><span>Your output</span><pre>{t.actual || "(nothing printed)"}</pre></div>
                      </div>
                    )}
                    {!t.passed && t.error && <pre className="test-error">{t.error}</pre>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
