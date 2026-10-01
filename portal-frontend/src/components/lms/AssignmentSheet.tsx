import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, EyeOff, FileCode2, History, Info, Lightbulb, Mail, Play, RotateCcw, Upload, Users, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { EDITOR_LABEL, LEVEL_LABEL, type CheckReport, type ReviewFinding } from "../../lib/internships";
import { readCodeFile, UPLOAD_META, type AssignmentResults, type AssignmentSheet as Sheet, type HistoryEntry, type SheetQuestion, type SubmitResult } from "../../lib/practice";
import { useToast } from "../Toast";

interface Props {
  lessonId: string;
  /** Called once the sheet loads; false when the lesson has no code questions. */
  onLoaded: (hasQuestions: boolean) => void;
  onSubmitted: (r: SubmitResult) => void;
}

const initialQuestion = () => {
  try {
    return new URLSearchParams(window.location.search).get("q");
  } catch {
    return null;
  }
};

/** An assignment sheet: one card per question, each answered by uploading (or writing) a code file that is reviewed line by line. */
export function AssignmentSheet({ lessonId, onLoaded, onSubmitted }: Props) {
  const { accessToken } = useAuth();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initialQuestion);
  const [showResults, setShowResults] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    setSheet(null);
    setError(null);
    apiFetch<Sheet>(`/api/v1/courses/lessons/${lessonId}/assignment`, { accessToken })
      .then((s) => {
        if (!live) return;
        setSheet(s);
        if (loadedFor.current !== lessonId) {
          loadedFor.current = lessonId;
          onLoaded(s.questions.length > 0);
          setOpen((cur) => (cur && s.questions.some((q) => q.id === cur) ? cur : s.questions.find((q) => q.submission?.status !== "passed")?.id ?? null));
        }
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 404) onLoaded(false);
        else setError(err instanceof ApiError ? err.message : "Couldn't load the assignment.");
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, accessToken]);

  useEffect(() => {
    if (open) document.getElementById(`q-${open}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!sheet) return <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />;
  if (!sheet.questions.length) return null;

  const passed = sheet.questions.filter((q) => q.submission?.status === "passed" || q.submission?.status === "pending").length;
  const pct = Math.round((passed / sheet.questions.length) * 100);

  const updated = (id: string, r: SubmitResult, code: string) => {
    setSheet((s) =>
      s && {
        ...s,
        questions: s.questions.map((q) => (q.id === id ? { ...q, submission: { ...r.submission, code, report: r.report } } : q)),
      },
    );
    onSubmitted(r);
    if (r.submission.status !== "failed") {
      const next = sheet.questions.find((q) => q.id !== id && q.submission?.status !== "passed" && q.submission?.status !== "pending");
      if (next) setTimeout(() => setOpen(next.id), 900);
    }
  };

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <strong>{sheet.questions.length} questions</strong>
          <span className="muted-small"> · Upload one code file per question. Each upload is reviewed line by line and run against hidden tests.</span>
        </div>
        {!sheet.preview && (
          <div className="sheet-progress">
            <span className="progress-bar"><motion.span className="progress-fill" animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} /></span>
            <span className="muted-small">{passed} of {sheet.questions.length} done</span>
          </div>
        )}
      </div>
      {!sheet.codeRunner && (
        <p className="sheet-note"><Info size={15} /> Code isn't being run on this server yet. Uploads still get the line-by-line review, and ones with no mistakes count as done.</p>
      )}
      {sheet.preview && (
        <div className="sheet-note staff">
          <EyeOff size={15} /> You're previewing this sheet as staff.
          <button className="link-button" onClick={() => setShowResults((v) => !v)}><Users size={14} /> {showResults ? "Hide" : "Show"} learner results</button>
        </div>
      )}
      {sheet.preview && showResults && <Results lessonId={lessonId} />}

      <ol className="sheet-questions">
        {sheet.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            lessonId={lessonId}
            question={q}
            preview={sheet.preview}
            open={open === q.id}
            onToggle={() => setOpen((cur) => (cur === q.id ? null : q.id))}
            onSubmitted={(r, code) => updated(q.id, r, code)}
          />
        ))}
      </ol>
    </div>
  );
}

function StatusIcon({ status }: { status?: string }) {
  if (status === "passed") return <CheckCircle2 size={18} className="ok" />;
  if (status === "pending") return <Clock size={18} className="warn" />;
  if (status === "failed") return <XCircle size={18} className="bad" />;
  return <span className="sheet-dot" />;
}

interface CardProps {
  index: number;
  lessonId: string;
  question: SheetQuestion;
  preview: boolean;
  open: boolean;
  onToggle: () => void;
  onSubmitted: (r: SubmitResult, code: string) => void;
}

function QuestionCard({ index, lessonId, question: q, preview, open, onToggle, onSubmitted }: CardProps) {
  const sub = q.submission;
  return (
    <li id={`q-${q.id}`} className={`sheet-q${open ? " open" : ""}${sub ? ` ${sub.status}` : ""}`}>
      <button className="sheet-q-head" onClick={onToggle} aria-expanded={open}>
        <StatusIcon status={sub?.status} />
        <span className="sheet-q-no">Q{index + 1}</span>
        <span className="sheet-q-title">{q.title}</span>
        <span className="pill pill-slate">{LEVEL_LABEL[q.level]}</span>
        {sub && <span className={`pill pill-${UPLOAD_META[sub.status].tone}`}>{UPLOAD_META[sub.status].label}</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown size={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="sheet-q-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <Answer lessonId={lessonId} question={q} preview={preview} onSubmitted={onSubmitted} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

const draftKey = (id: string) => `sheet-draft:${id}`;
function readDraft(id: string) {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as { code: string; fileName: string | null }) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, value: { code: string; fileName: string | null } | null) {
  try {
    if (value) localStorage.setItem(draftKey(id), JSON.stringify(value));
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* private mode: drafts just aren't kept */
  }
}

function Answer({ lessonId, question: q, preview, onSubmitted }: { lessonId: string; question: SheetQuestion; preview: boolean; onSubmitted: (r: SubmitResult, code: string) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const sub = q.submission;
  const draft = useMemo(() => readDraft(q.id), [q.id]);
  const [code, setCode] = useState(draft?.code ?? sub?.code ?? q.starter ?? "");
  const [fileName, setFileName] = useState<string | null>(draft?.fileName ?? sub?.fileName ?? null);
  const [report, setReport] = useState<CheckReport | null>(sub?.report ?? null);
  const [reviewedCode, setReviewedCode] = useState(sub?.code ?? "");
  const [reportKind, setReportKind] = useState<"check" | "upload">("upload");
  const [busy, setBusy] = useState<"check" | "submit" | null>(null);
  const [dragging, setDragging] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const label = EDITOR_LABEL[q.editor] ?? q.editor;
  const accept = q.fileTypes.join(",");

  useEffect(() => {
    if (preview) return;
    const unchanged = code === (sub?.code ?? q.starter ?? "");
    writeDraft(q.id, unchanged ? null : { code, fileName });
  }, [q.id, code, fileName, preview, sub?.code, q.starter]);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
    if (!q.fileTypes.includes(ext)) {
      toast(`Upload a ${q.fileTypes.filter((t) => t !== ".txt").join(" or ")} file for this question`, "error");
      return;
    }
    try {
      setCode(await readCodeFile(file));
      setFileName(file.name);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't read that file", "error");
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  async function send(kind: "check" | "submit") {
    setBusy(kind);
    setEmailed(false);
    const url = `/api/v1/courses/lessons/${lessonId}/assignment/${q.id}/${kind}`;
    try {
      if (kind === "check") {
        const r = await apiFetch<{ report: CheckReport }>(url, { method: "POST", accessToken, body: { code, fileName } });
        setReport(r.report);
      } else {
        const r = await apiFetch<SubmitResult>(url, { method: "POST", accessToken, body: { code, fileName } });
        setReport(r.report);
        setEmailed(r.emailed);
        writeDraft(q.id, null);
        onSubmitted(r, code);
        if (r.submission.status === "passed") toast("Passed! Every check is green.");
        else if (r.submission.status === "pending") toast("Reviewed: no mistakes found. It will be run when the runner is back.");
        else toast("Not yet: see the lines to fix below", "error");
      }
      setReviewedCode(code);
      setReportKind(kind === "check" ? "check" : "upload");
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
      setCode(`${code.slice(0, start)}    ${code.slice(end)}`);
      requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !preview) {
      e.preventDefault();
      send("check");
    }
  }

  const lines = code.split("\n").length;
  const stale = report && reviewedCode !== code;

  return (
    <div className="sheet-answer">
      <p className="sheet-brief">{q.brief}</p>
      {q.steps.length > 0 && <ol className="sheet-steps">{q.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}

      {(q.examples?.length ?? 0) > 0 && (
        <div className="examples">
          {q.examples!.map((t, i) => (
            <div key={i} className="example">
              <span className="example-label">Example {i + 1}</span>
              <div className="example-io">
                <div><span>Input</span><pre>{t.stdin || "(none)"}</pre></div>
                <div><span>Output</span><pre>{t.expected}</pre></div>
              </div>
            </div>
          ))}
          {q.lenient && <p className="muted-small">Prompts like "Enter a number:" are fine: the check looks for the numbers and words in the expected output, in order.</p>}
          {(q.hiddenTests ?? 0) > 0 && <p className="muted-small"><EyeOff size={13} /> Plus {q.hiddenTests} hidden test{q.hiddenTests === 1 ? "" : "s"} when you upload.</p>}
        </div>
      )}
      {(q.requirements?.length ?? 0) > 0 && (
        <ul className="requirements">
          {q.requirements!.map((r) => {
            const res = report?.items.find((i) => i.kind === "rule" && i.label === r);
            return (
              <li key={r} className={res ? (res.passed ? "ok" : "bad") : ""}>
                {res ? res.passed ? <CheckCircle2 size={15} /> : <XCircle size={15} /> : <FileCode2 size={15} />}
                {r}
              </li>
            );
          })}
        </ul>
      )}

      {!preview && (
        <div
          className={`dropzone${dragging ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        >
          <Upload size={20} />
          <span>
            <strong>{fileName ? `${fileName} loaded` : `Drop your ${q.fileTypes.filter((t) => t !== ".txt")[0] ?? ""} file here`}</strong>
            <span className="muted-small"> or click to choose it. You can also type or paste the code below.</span>
          </span>
          <input ref={fileInput} type="file" accept={accept} hidden onChange={(e) => {
            loadFile(e.target.files?.[0]);
            e.target.value = "";
          }} />
        </div>
      )}

      <div className="code-editor">
        <div className="code-editor-bar">
          <span>{fileName ?? label}</span>
          {!preview && (
            <button type="button" className="link-button" onClick={() => {
              setCode(q.starter ?? "");
              setFileName(null);
            }} title="Start again from the starter code">
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
        <div className="code-editor-body">
          <div className="code-gutter" ref={gutter} aria-hidden>
            {Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
            }}
            readOnly={preview}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={`Your ${label} code`}
            rows={Math.min(22, Math.max(8, lines + 1))}
          />
        </div>
      </div>

      {!preview && (
        <div className="code-actions">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || !code.trim()} onClick={() => send("check")}>
            <Play size={14} /> {busy === "check" ? "Checking…" : q.runs ? "Check with examples" : "Check"}
          </button>
          <button type="button" className="btn btn-sm" disabled={!!busy || !code.trim()} onClick={() => send("submit")}>
            <Upload size={14} /> {busy === "submit" ? "Reviewing…" : "Upload answer"}
          </button>
          <span className="muted-small kbd-hint">Ctrl + Enter to check</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {report && (
          <motion.div key={report.checkedAt} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ReviewReport report={report} code={reviewedCode} kind={reportKind} stale={!!stale} />
            {emailed && <p className="muted-small emailed"><Mail size={13} /> We emailed you this review too.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {!preview && sub && <PastUploads lessonId={lessonId} questionId={q.id} attempts={sub.attempts} onRestore={(c, f) => {
        setCode(c);
        setFileName(f);
      }} />}
    </div>
  );
}

const SEVERITY = {
  error: { icon: XCircle, label: "Must fix" },
  warning: { icon: AlertTriangle, label: "Check this" },
  tip: { icon: Lightbulb, label: "Tip" },
} as const;

/** The review: the summary, the code with each finding under its line, and the test results. */
export function ReviewReport({ report, code, kind, stale }: { report: CheckReport; code: string; kind: "check" | "upload"; stale?: boolean }) {
  const findings = report.review ?? [];
  const byLine = new Map<number, ReviewFinding[]>();
  for (const f of findings) byLine.set(f.line, [...(byLine.get(f.line) ?? []), f]);
  const general = byLine.get(0) ?? [];
  const tests = report.items.filter((i) => i.kind === "test");
  const rules = report.items.filter((i) => i.kind === "rule" && !i.passed);
  const errors = findings.filter((f) => f.severity === "error").length;
  const tone = report.passed ? "passed" : report.runnerUnavailable && !errors && report.items.every((i) => i.passed) ? "pending" : "failed";
  const codeLines = code.split("\n");
  let order = 0;

  return (
    <div className={`check-report review ${tone}`}>
      <strong>
        {tone === "passed" ? <CheckCircle2 size={17} /> : tone === "pending" ? <Clock size={17} /> : <XCircle size={17} />}
        {kind === "check" ? "Check: " : "Upload: "}
        {report.summary}
      </strong>
      {stale && <p className="muted-small">You've changed the code since this review. Check or upload again to review the new version.</p>}
      {findings.length > 0 && (
        <p className="review-counts">
          {(["error", "warning", "tip"] as const).map((s) => {
            const n = findings.filter((f) => f.severity === s).length;
            return n ? <span key={s} className={`sev sev-${s}`}>{n} {SEVERITY[s].label.toLowerCase()}</span> : null;
          })}
        </p>
      )}

      {general.map((f, i) => <Finding key={`g${i}`} f={f} delay={0} />)}

      {byLine.size > (general.length ? 1 : 0) && code && (
        <div className="code-view review-code" role="list" aria-label="Your code, line by line">
          {codeLines.map((text, i) => {
            const n = i + 1;
            const here = byLine.get(n);
            const worst = here?.some((f) => f.severity === "error") ? "error" : here?.some((f) => f.severity === "warning") ? "warning" : here ? "tip" : "";
            return (
              <div key={n} className={`rline${worst ? ` has-${worst}` : ""}`} role="listitem">
                <span className="rline-no">{n}</span>
                <pre className="rline-code">{text || " "}</pre>
                {here?.map((f, j) => <Finding key={j} f={f} delay={0.05 * order++} inline />)}
              </div>
            );
          })}
          {[...byLine.keys()].filter((n) => n > codeLines.length).flatMap((n) => byLine.get(n)!).map((f, j) => <Finding key={`x${j}`} f={f} delay={0} inline />)}
        </div>
      )}

      {rules.length > 0 && (
        <ul className="test-results">
          {rules.map((r) => (
            <li key={r.label} className="bad">
              <span className="test-name"><XCircle size={14} /> {r.label}</span>
              {r.error && <pre className="test-error">{r.error}</pre>}
            </li>
          ))}
        </ul>
      )}
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
              {!t.passed && t.hint && <p className="test-hint"><Lightbulb size={13} /> {t.hint}</p>}
              {!t.passed && t.error && <pre className="test-error">{t.error}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Finding({ f, delay, inline }: { f: ReviewFinding; delay: number; inline?: boolean }) {
  const S = SEVERITY[f.severity];
  return (
    <motion.div className={`finding sev-${f.severity}${inline ? " inline" : ""}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(delay, 1.2), duration: 0.2 }}>
      <S.icon size={14} />
      <span>
        <b>{f.line > 0 ? `Line ${f.line}${f.column ? `:${f.column}` : ""}` : S.label}</b>
        {f.line > 0 && <em> {S.label.toLowerCase()}</em>}
        {f.source !== "review" && <em> ({f.source === "compiler" ? "compiler" : "while running"})</em>}
        {" "}{f.message}
      </span>
    </motion.div>
  );
}

function PastUploads({ lessonId, questionId, attempts, onRestore }: { lessonId: string; questionId: string; attempts: number; onRestore: (code: string, fileName: string | null) => void }) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ submissions: HistoryEntry[] }>(`/api/v1/courses/lessons/${lessonId}/assignment/${questionId}/history`, { accessToken })
      .then((r) => setItems(r.submissions))
      .catch(() => setItems([]));
  }, [open, lessonId, questionId, attempts, accessToken]);

  return (
    <div className="past-uploads">
      <button className="link-button" onClick={() => setOpen((v) => !v)}><History size={14} /> {open ? "Hide" : "Show"} past uploads ({attempts})</button>
      {open && (
        <ul>
          {!items && <li className="muted-small">Loading…</li>}
          {items?.map((s) => (
            <li key={s.id}>
              <span className={`pill pill-${UPLOAD_META[s.status].tone}`}>{UPLOAD_META[s.status].label}</span>
              <span className="muted-small">{new Date(s.submittedAt).toLocaleString()}{s.fileName ? ` · ${s.fileName}` : ""}</span>
              <span className="past-summary">{s.summary}</span>
              <button className="link-button" onClick={() => onRestore(s.code, s.fileName)}>Load this version</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Staff: each learner's latest result per question. */
function Results({ lessonId }: { lessonId: string }) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AssignmentResults | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch<AssignmentResults>(`/api/v1/courses/lessons/${lessonId}/assignment-results`, { accessToken })
      .then(setData)
      .catch(() => setError(true));
  }, [lessonId, accessToken]);

  if (error) return <p className="error-banner">Couldn't load the results.</p>;
  if (!data) return <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />;
  if (!data.learners.length) return <p className="muted-small">No learner has uploaded an answer yet.</p>;
  return (
    <div className="table-wrap sheet-results">
      <table className="data-table">
        <thead>
          <tr>
            <th>Learner</th>
            <th>Done</th>
            {data.questions.map((q, i) => <th key={q.id} title={q.title}>Q{i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.learners.map((l) => {
            const done = data.questions.filter((q) => ["passed", "pending"].includes(l.results[q.id]?.status ?? "")).length;
            return (
              <tr key={l.userId}>
                <td><strong>{l.name}</strong><div className="muted-small">{l.email}</div></td>
                <td>{done}/{data.questions.length}</td>
                {data.questions.map((q) => {
                  const r = l.results[q.id];
                  return <td key={q.id} title={r ? `${UPLOAD_META[r.status].label} · ${r.attempts} upload${r.attempts === 1 ? "" : "s"}` : "Not uploaded"}><StatusIcon status={r?.status} /></td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
