import { useEffect, useState, type FormEvent } from "react";
import { DatabaseZap } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth, useOrgPath } from "../../context/AuthContext";
import type { EnvironmentDetail } from "../../lib/types";
import { ErrorNote, Field, useAction } from "../../components/ui";

/** Mirrors the API's rule: plain words, no quotes or shell syntax. */
const WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** The environment's release command (migrations), run before traffic switches. */
export function ReleaseCommandCard({ detail, reload }: { detail: EnvironmentDetail; reload: () => void }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const env = detail.environment;
  const [command, setCommand] = useState(env.releaseCommand ?? "");
  const [service, setService] = useState(env.releaseService ?? "");
  const action = useAction();
  useEffect(() => {
    setCommand(env.releaseCommand ?? "");
    setService(env.releaseService ?? "");
  }, [env.id, env.releaseCommand, env.releaseService]);

  const cfg = detail.backupConfig;
  const backupsReady = !!cfg?.s3Bucket && (cfg.dbType !== "none" || cfg.volumePaths.length > 0);
  const badWord = command.trim().split(/\s+/).filter(Boolean).find((w) => !WORD.test(w));

  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath(`/environments/${env.id}`), { method: "PATCH", body: { releaseCommand: command.trim() || null, releaseService: command.trim() ? service.trim() || null : null } });
      reload();
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <DatabaseZap size={16} /> Release command
        </h3>
        {env.releaseCommand ? <code className="truncate">{env.releaseCommand}</code> : <span className="muted small">none</span>}
      </div>
      <p className="muted small">
        Runs once per deploy in a fresh container of the new release (<code>docker compose run --rm</code>), after the images are pulled and before anything is started or switched. Use it
        for migrations. If it fails, the deploy stops and the live release keeps serving.
      </p>
      {env.releaseCommand && (
        <p className={`note ${backupsReady ? "note-info" : "note-warn"}`}>
          {backupsReady
            ? "A backup is taken before the command runs (when a release is live). If the command fails, you can restore it from the failed deploy."
            : "Backups are not set up for this environment, so no backup is taken before the command. Set up backups in the Backups tab."}
        </p>
      )}
      {can("admin") ? (
        <form className="form" onSubmit={save}>
          <div className="row">
            <Field label="Command" hint="Plain words only: no quotes, pipes, ; or $. Example: npm run db:migrate">
              <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npm run db:migrate" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Compose service" hint="The service whose image runs the command.">
              <input value={service} onChange={(e) => setService(e.target.value)} placeholder="web" required={!!command.trim()} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" />
            </Field>
          </div>
          {badWord && <p className="note note-warn">"{badWord}" can't be used: only letters, digits and _ @ % + = : , . / - are allowed.</p>}
          <ErrorNote error={action.error} />
          <div className="btn-row">
            <button className="btn btn-primary" disabled={action.busy || !!badWord}>
              Save
            </button>
          </div>
        </form>
      ) : (
        env.releaseService && <p className="muted small">Runs in the {env.releaseService} service.</p>
      )}
    </div>
  );
}
