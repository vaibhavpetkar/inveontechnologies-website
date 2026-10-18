import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pause, Play, Radio } from "lucide-react";
import { api, stream } from "../../lib/api";
import { useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail, Job } from "../../lib/types";
import { ErrorNote, Field, useAction } from "../../components/ui";

const TERMINAL = ["success", "failure", "cancelled"];
/** Keep the browser responsive on chatty services: only the newest output stays on screen. */
const MAX_CHARS = 400_000;

type State = "idle" | "waiting" | "live" | "stopped";

/**
 * Live logs: `docker compose logs -f` for one service, streamed over SSE.
 * Leaving the tab (or pressing Stop) closes the stream, and the server stops
 * following within a few seconds. Nothing is stored.
 */
export function LiveLogs({ detail }: { detail: EnvironmentDetail }) {
  const orgPath = useOrgPath();
  const [service, setService] = useState(detail.environment.releaseService ?? "");
  const [tail, setTail] = useState(100);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>("idle");
  const [ended, setEnded] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const action = useAction();
  const session = useRef<{ jobId: string; stop: () => void } | null>(null);
  const pre = useRef<HTMLPreElement>(null);

  const stop = (cancel: boolean) => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    s.stop();
    // The server also stops on its own once nobody is watching; this just makes it immediate.
    if (cancel) void api(orgPath(`/jobs/${s.jobId}/cancel`), { method: "POST" }).catch(() => undefined);
  };

  useEffect(() => () => stop(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (follow && pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [text, follow]);

  const start = (e: FormEvent) => {
    e.preventDefault();
    stop(true);
    setText("");
    setEnded(null);
    void action.run(async () => {
      const r = await api<{ job: Job; streamUrl: string }>(orgPath(`/environments/${detail.environment.id}/logs/follow`), {
        method: "POST",
        body: { service: service.trim(), tail: Number(tail) },
      });
      setState("waiting");
      const jobId = r.job.id;
      const stopStream = stream(orgPath(`/jobs/${jobId}/stream`), {
        onEvent(event, data) {
          const d = data as { job?: Job; chunk?: string; step?: { status: string } };
          if (event === "log" && d.chunk) {
            setState("live");
            setText((t) => {
              const next = t + d.chunk;
              return next.length > MAX_CHARS ? next.slice(next.length - MAX_CHARS) : next;
            });
          } else if (event === "step" && d.step?.status === "running") {
            setState("live");
          } else if ((event === "job" || event === "snapshot") && d.job) {
            if (d.job.status === "running") setState("live");
            if (TERMINAL.includes(d.job.status)) {
              setState("stopped");
              setEnded(d.job.status === "failure" ? (d.job.error ?? "The stream failed") : (d.job.error ?? "The stream ended"));
            }
          }
        },
        onEnd() {
          setState((s) => (s === "idle" ? s : "stopped"));
        },
      });
      session.current = { jobId, stop: stopStream };
    });
  };

  const running = state === "waiting" || state === "live";

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <Radio size={16} /> Live logs
        </h3>
        {state === "live" && <span className="badge badge-ok">live</span>}
        {state === "waiting" && <span className="badge badge-info">connecting</span>}
        {state === "stopped" && <span className="badge badge-muted">stopped</span>}
      </div>
      <form className="btn-row align-end" onSubmit={start}>
        <Field label="Service">
          <input required value={service} pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,62}" placeholder="web" onChange={(e) => setService(e.target.value)} disabled={running} />
        </Field>
        <Field label="Start with the last">
          <input type="number" min={0} max={5000} value={tail} onChange={(e) => setTail(Number(e.target.value))} disabled={running} />
        </Field>
        {running ? (
          <button type="button" className="btn btn-ghost" onClick={() => {
              stop(true);
              setState("stopped");
              setEnded("Stopped");
            }}>
            <Pause size={16} /> Stop
          </button>
        ) : (
          <button className="btn btn-primary" disabled={action.busy || !service.trim()}>
            <Play size={16} /> Follow
          </button>
        )}
        <label className="check">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Scroll to new lines
        </label>
      </form>
      <p className="muted small">
        Streams <code>docker compose logs -f</code> from the <strong>{detail.environment.activeSlot}</strong> containers on {detail.server.name} for up to 10 minutes. It stops when you
        leave this tab. Nothing is saved.
      </p>
      <ErrorNote error={action.error} />
      {state === "waiting" && <p className="note note-info">Waiting for the server's agent to start the stream…</p>}
      {ended && state === "stopped" && <p className="muted small">{ended}</p>}
      {(running || text) && (
        <pre ref={pre} className="log log-live" aria-live="off">
          {text || "No output yet."}
        </pre>
      )}
    </div>
  );
}
