import { useEffect, useState, type FormEvent } from "react";
import { DatabaseBackup, RotateCcw } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { Backup, BackupConfig, EnvironmentDetail, Job } from "../../lib/types";
import { bytes, dateTime, timeAgo } from "../../lib/format";
import { Empty, ErrorNote, Field, StatusBadge, useAction } from "../../components/ui";
import { JobView } from "../../components/JobView";

const DEFAULTS: BackupConfig = {
  enabled: true,
  hourUtc: 2,
  dbType: "postgres",
  dbService: "db",
  dbName: "",
  dbUser: "",
  volumePaths: [],
  s3Bucket: "",
  s3Prefix: "",
  s3Region: "ap-south-1",
};

function ConfigForm({ envId, config, onSaved }: { envId: string; config: BackupConfig | null; onSaved: () => void }) {
  const orgPath = useOrgPath();
  const [form, setForm] = useState<BackupConfig>(config ?? DEFAULTS);
  const [paths, setPaths] = useState((config?.volumePaths ?? []).join("\n"));
  const action = useAction();
  useEffect(() => {
    if (config) {
      setForm(config);
      setPaths(config.volumePaths.join("\n"));
    }
  }, [config]);

  const set = <K extends keyof BackupConfig>(k: K, v: BackupConfig[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const db = form.dbType !== "none";
    void action.run(async () => {
      await api(orgPath(`/environments/${envId}/backup-config`), {
        method: "PUT",
        body: {
          enabled: form.enabled,
          hourUtc: Number(form.hourUtc),
          dbType: form.dbType,
          dbService: db ? form.dbService || null : null,
          dbName: db ? form.dbName || null : null,
          dbUser: db ? form.dbUser || null : null,
          volumePaths: paths
            .split("\n")
            .map((p) => p.trim())
            .filter(Boolean),
          s3Bucket: form.s3Bucket || null,
          s3Prefix: form.s3Prefix ?? "",
          s3Region: form.s3Region,
        },
      });
      onSaved();
    });
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Nightly backup
        </label>
        <Field label="Hour (UTC)">
          <input type="number" min={0} max={23} value={form.hourUtc} onChange={(e) => set("hourUtc", Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Database">
        <select value={form.dbType} onChange={(e) => set("dbType", e.target.value as BackupConfig["dbType"])}>
          <option value="postgres">PostgreSQL (pg_dump)</option>
          <option value="mysql">MySQL / MariaDB (mysqldump)</option>
          <option value="none">No database</option>
        </select>
      </Field>
      {form.dbType !== "none" && (
        <div className="row row-3">
          <Field label="Compose service">
            <input required value={form.dbService ?? ""} onChange={(e) => set("dbService", e.target.value)} />
          </Field>
          <Field label="Database name">
            <input required value={form.dbName ?? ""} onChange={(e) => set("dbName", e.target.value)} />
          </Field>
          <Field label="User">
            <input required value={form.dbUser ?? ""} onChange={(e) => set("dbUser", e.target.value)} />
          </Field>
        </div>
      )}
      <Field label="Folders to include" hint="One per line, relative to the environment's data folder on the server (e.g. uploads).">
        <textarea rows={2} value={paths} onChange={(e) => setPaths(e.target.value)} />
      </Field>
      <div className="row row-3">
        <Field label="S3 bucket">
          <input value={form.s3Bucket ?? ""} onChange={(e) => set("s3Bucket", e.target.value)} placeholder="inveon-backups" />
        </Field>
        <Field label="Prefix">
          <input value={form.s3Prefix} onChange={(e) => set("s3Prefix", e.target.value)} placeholder="portal/production" />
        </Field>
        <Field label="Region">
          <input required value={form.s3Region} onChange={(e) => set("s3Region", e.target.value)} />
        </Field>
      </div>
      <p className="muted small">
        Uploads use the server's own AWS credentials (an EC2 instance role is best), never keys stored here. Give each server a write-only policy on its prefix and turn on bucket versioning
        and encryption.
      </p>
      <ErrorNote error={action.error} />
      <button className="btn btn-primary" disabled={action.busy}>
        Save
      </button>
    </form>
  );
}

export function BackupsTab({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const envId = detail.environment.id;
  const list = useApi<{ backups: Backup[] }>(orgPath(`/environments/${envId}/backups`), 10000);
  const [jobId, setJobId] = useState<string | null>(null);
  const action = useAction();
  const cfg = detail.backupConfig;

  const backupNow = () =>
    void action.run(async () => {
      const r = await api<{ job: Job }>(orgPath(`/environments/${envId}/backups`), { method: "POST" });
      setJobId(r.job.id);
      void list.reload();
    });

  const restore = (b: Backup) => {
    if (!confirm(`Restore the backup from ${dateTime(b.createdAt)}? A fresh backup of the current state is taken first.`)) return;
    void action.run(async () => {
      const r = await api<{ job: Job }>(orgPath(`/backups/${b.id}/restore`), { method: "POST" });
      setJobId(r.job.id);
      void list.reload();
    });
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>
            <DatabaseBackup size={16} /> Backups to S3
          </h3>
          {cfg ? <span className={`badge ${cfg.enabled ? "badge-ok" : "badge-muted"}`}>{cfg.enabled ? `nightly ${String(cfg.hourUtc).padStart(2, "0")}:00 UTC` : "paused"}</span> : <span className="muted small">not configured</span>}
        </div>
        {can("admin") ? (
          <ConfigForm envId={envId} config={cfg} onSaved={reload} />
        ) : (
          cfg && (
            <p className="muted small">
              {cfg.dbType !== "none" ? `${cfg.dbType} ${cfg.dbName} in ${cfg.dbService}` : "Files only"} → s3://{cfg.s3Bucket}/{cfg.s3Prefix}
            </p>
          )
        )}
        {cfg && can("developer") && (
          <div className="btn-row">
            <button className="btn btn-ghost" disabled={action.busy || !detail.environment.activeSlot} onClick={backupNow}>
              Back up now
            </button>
          </div>
        )}
        <ErrorNote error={action.error} />
      </div>

      {jobId && (
        <div className="card">
          <JobView key={jobId} jobId={jobId} onFinished={() => void list.reload()} />
        </div>
      )}

      <div className="card">
        <h3 className="card-title">History</h3>
        <ErrorNote error={list.error} />
        {list.data && list.data.backups.length === 0 && <Empty title="No backups yet" />}
        {list.data && list.data.backups.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {list.data.backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>
                      <span title={dateTime(b.createdAt)}>{timeAgo(b.createdAt)}</span>
                      <div className="muted small">{b.kind.replace("_", " ")}</div>
                    </td>
                    <td className="muted small hide-sm">
                      <span className="truncate" title={`s3://${b.s3Bucket}/${b.s3Key}`}>
                        {b.s3Key}
                      </span>
                    </td>
                    <td className="muted small nowrap">{bytes(b.sizeBytes)}</td>
                    <td className="right nowrap">
                      {b.jobId && (
                        <button className="btn btn-small btn-ghost" onClick={() => setJobId(b.jobId)}>
                          Log
                        </button>
                      )}
                      {can("admin") && b.status === "success" && (
                        <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={() => restore(b)}>
                          <RotateCcw size={14} /> Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
