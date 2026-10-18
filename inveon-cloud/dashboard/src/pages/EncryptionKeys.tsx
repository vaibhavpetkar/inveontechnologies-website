import { KeyRound, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../context/AuthContext";
import { dateTime } from "../lib/format";
import { ErrorNote, Loading, PageHeader, useAction } from "../components/ui";

interface KeyStatus {
  currentKeyId: string | null;
  configuredKeyIds: string[];
  /** Missing on control planes from before KMS-backed keys. */
  kmsKeyIds?: string[];
  counts: Record<string, number>;
  columns: { name: string; counts: Record<string, number> }[];
  missingKeyIds: string[];
  removableKeyIds: string[];
  pendingRotation: number;
}
interface RotationResult {
  rewrapped: number;
  failed: number;
  failures: { column: string; id: string; error: string }[];
}
interface Rotation {
  running: boolean;
  lastRun: { startedAt: string; finishedAt: string | null; result: RotationResult | null; error: string | null } | null;
}

/** Platform admins: values per master key id, and re-wrapping onto the current key. */
export default function EncryptionKeys() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ status: KeyStatus; rotation: Rotation }>(user?.platformAdmin ? "/platform/keys" : null, 3000);
  const action = useAction();

  if (!user?.platformAdmin) return <ErrorNote error="Only platform admins can see encryption keys." />;

  const status = data?.status;
  const rotation = data?.rotation;
  const ids = status ? Array.from(new Set([...status.configuredKeyIds, ...Object.keys(status.counts)])).sort() : [];
  const rotate = () =>
    void action.run(async () => {
      await api("/platform/keys/rotate", { method: "POST" });
      await reload();
    });

  return (
    <>
      <PageHeader
        title="Encryption keys"
        subtitle="Master keys wrap every stored secret. They are set in the control plane's environment, never in the database."
        actions={
          status && (
            <button className="btn btn-primary" onClick={rotate} disabled={action.busy || rotation?.running || status.pendingRotation === 0}>
              <RefreshCw size={16} className={rotation?.running ? "spin" : ""} /> {rotation?.running ? "Rotating…" : "Re-wrap onto the current key"}
            </button>
          )
        }
      />
      <ErrorNote error={error ?? action.error} />
      {loading && !data && <Loading />}
      {status && (
        <>
          {status.missingKeyIds.length > 0 && (
            <div className="note note-bad">
              Values are encrypted with {status.missingKeyIds.map((k) => `"${k}"`).join(", ")}, which isn't configured. Those values can't be read until the key is added back to
              INVEON_MASTER_KEYS.
            </div>
          )}
          {status.pendingRotation > 0 ? (
            <div className="note note-warn">{status.pendingRotation} values are still on an older key. Re-wrap them before removing that key.</div>
          ) : (
            <div className="note note-info">Every value uses the current key "{status.currentKeyId}".</div>
          )}
          <div className="card card-flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Key id</th>
                    <th>Values</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {ids.map((id) => (
                    <tr key={id}>
                      <td>
                        <KeyRound size={14} /> <code>{id}</code>
                        {status.kmsKeyIds?.includes(id) && (
                          <>
                            {" "}
                            <span className="badge badge-info" title="A data key encrypted by AWS KMS, decrypted when the control plane started">
                              AWS KMS
                            </span>
                          </>
                        )}
                      </td>
                      <td>{status.counts[id] ?? 0}</td>
                      <td>
                        {id === status.currentKeyId ? (
                          <span className="badge badge-ok">current</span>
                        ) : status.missingKeyIds.includes(id) ? (
                          <span className="badge badge-bad">not configured</span>
                        ) : status.removableKeyIds.includes(id) ? (
                          <span className="badge badge-info">unused, safe to remove</span>
                        ) : (
                          <span className="badge badge-warn">still in use</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <details className="card">
            <summary>Per column</summary>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>Column</th>
                    {ids.map((id) => (
                      <th key={id}>{id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {status.columns.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <code>{c.name}</code>
                      </td>
                      {ids.map((id) => (
                        <td key={id}>{c.counts[id] ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {rotation?.lastRun && (
            <div className="card">
              <h3 className="card-title">Last rotation in this process</h3>
              <p className="small">
                Started {dateTime(rotation.lastRun.startedAt)}
                {rotation.lastRun.finishedAt ? `, finished ${dateTime(rotation.lastRun.finishedAt)}` : ", running"}. Re-wrapped {rotation.lastRun.result?.rewrapped ?? 0}, failed{" "}
                {rotation.lastRun.result?.failed ?? 0}.
              </p>
              <ErrorNote error={rotation.lastRun.error} />
              {rotation.lastRun.result?.failures.map((f) => (
                <p key={`${f.column}:${f.id}`} className="small text-bad">
                  {f.column} {f.id}: {f.error}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
