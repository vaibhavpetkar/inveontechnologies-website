import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { ArrowLeft, ExternalLink, GitPullRequest, Github, Layers, Plus, RefreshCw, Settings, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { App, Environment, EnvironmentDetail, Server } from "../lib/types";
import { CopyField, Empty, ErrorNote, Field, Loading, Modal, PageHeader, StatusBadge, useAction } from "../components/ui";
import { DeploysTab } from "./app/DeploysTab";
import { VariablesTab } from "./app/VariablesTab";
import { DomainsTab } from "./app/DomainsTab";
import { HealthTab } from "./app/HealthTab";
import { BackupsTab } from "./app/BackupsTab";
import { LogsTab } from "./app/LogsTab";
import { AppSettings } from "./app/AppSettings";
import { JobView } from "../components/JobView";

const TABS = ["Deploys", "Variables", "Domains", "Health", "Backups", "Logs"] as const;
type Tab = (typeof TABS)[number];

function NewEnvironment({ appId, onCreated }: { appId: string; onCreated: (env: Environment) => void }) {
  const orgPath = useOrgPath();
  const servers = useApi<{ servers: Server[] }>(orgPath("/servers"));
  const [form, setForm] = useState({ name: "production", serverId: "", strategy: "blue_green", healthPath: "/", autoDeploy: true });
  const action = useAction();
  useEffect(() => {
    if (!form.serverId && servers.data?.servers[0]) setForm((f) => ({ ...f, serverId: servers.data!.servers[0].id }));
  }, [servers.data, form.serverId]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ environment: Environment }>(orgPath(`/apps/${appId}/environments`), { method: "POST", body: form });
      onCreated(r.environment);
    });
  };
  if (servers.data && servers.data.servers.length === 0) return <p className="note note-info">Add a server first, then put this app on it.</p>;
  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <Field label="Name" hint="Lowercase, e.g. production or staging.">
          <input required pattern="[a-z0-9-]+" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Server">
          <select required value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}>
            {servers.data?.servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Deploy strategy"
        hint={
          form.strategy === "blue_green"
            ? "Starts the new release next to the running one and switches nginx when it's healthy: no downtime. Keep databases outside this compose file."
            : "Updates one set of containers in place (brief restart). Use when the compose file also runs the database."
        }
      >
        <select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
          <option value="blue_green">Blue/green (zero downtime)</option>
          <option value="recreate">Recreate in place</option>
        </select>
      </Field>
      <div className="row">
        <Field label="Health check path" hint="Checked on the new containers before nginx switches.">
          <input required value={form.healthPath} onChange={(e) => setForm({ ...form, healthPath: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.autoDeploy} onChange={(e) => setForm({ ...form, autoDeploy: e.target.checked })} /> Deploy on every push
        </label>
      </div>
      <ErrorNote error={servers.error ?? action.error} />
      <button className="btn btn-primary" disabled={action.busy || !form.serverId}>
        Create environment
      </button>
    </form>
  );
}

export default function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const app = useApi<{ app: App; environments: Environment[] }>(orgPath(`/apps/${id}`));
  const params = new URLSearchParams(search);
  const envId = params.get("env") ?? app.data?.environments[0]?.id ?? null;
  const [tab, setTab] = useState<Tab>("Deploys");
  const detail = useApi<EnvironmentDetail>(envId ? orgPath(`/environments/${envId}`) : null, 10000);
  const [newEnvOpen, setNewEnvOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teardownJob, setTeardownJob] = useState<string | null>(null);
  const teardown = useAction();
  const rotate = useAction();

  const selectEnv = (e: string) => navigate(`/apps/${id}?env=${e}`, { replace: true });

  if (app.error) return <ErrorNote error={app.error} />;
  if (!app.data) return <Loading />;
  const a = app.data.app;

  return (
    <>
      <Link href="/apps" className="back">
        <ArrowLeft size={16} /> Apps
      </Link>
      <PageHeader
        title={a.name}
        subtitle={
          <>
            <a href={a.repoUrl} target="_blank" rel="noreferrer">
              <Github size={14} /> {a.repoOwner}/{a.repoName}
            </a>{" "}
            · {a.branch} · {a.composePath}
            {a.buildOnServer && <> · built on the server</>}
          </>
        }
        actions={
          can("admin") && (
            <>
              <button
                className="btn btn-ghost"
                disabled={rotate.busy}
                onClick={() => {
                  if (confirm("Rotate the webhook secret? Update it in GitHub right after.")) void rotate.run(async () => setSecret((await api<{ webhookSecret: string }>(orgPath(`/apps/${a.id}/webhook-secret`), { method: "POST" })).webhookSecret));
                }}
              >
                <RefreshCw size={16} /> Webhook secret
              </button>
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
                <Settings size={16} /> Settings
              </button>
              <button className="btn btn-primary" onClick={() => setNewEnvOpen(true)}>
                <Plus size={16} /> Environment
              </button>
            </>
          )
        }
      />
      <ErrorNote error={rotate.error} />

      {app.data.environments.length === 0 ? (
        <Empty icon={<Layers size={28} />} title="No environments yet">
          An environment runs this app on one of your servers, with its own variables and domains.
          {can("admin") && (
            <div className="empty-action">
              <button className="btn btn-primary" onClick={() => setNewEnvOpen(true)}>
                <Plus size={16} /> Create environment
              </button>
            </div>
          )}
        </Empty>
      ) : (
        <>
          <div className="pills" role="tablist" aria-label="Environments">
            {app.data.environments.map((e) => (
              <button key={e.id} role="tab" aria-selected={e.id === envId} className={`pill ${e.id === envId ? "active" : ""}`} onClick={() => selectEnv(e.id)}>
                {e.previewPr !== null && <GitPullRequest size={13} aria-label="preview" />} {e.name} <span className="muted small">on {e.serverName}</span>
              </button>
            ))}
          </div>
          {detail.error && <ErrorNote error={detail.error} />}
          {detail.data && (
            <>
              <div className="env-summary">
                <span>
                  Server <strong>{detail.data.server.name}</strong> <StatusBadge status={detail.data.server.status} />
                </span>
                <span>
                  Live: <strong>{detail.data.currentRelease ? detail.data.currentRelease.commitSha.slice(0, 7) : "not deployed"}</strong>
                  {detail.data.environment.activeSlot && detail.data.environment.activeSlot !== "main" && <span className={`slot slot-${detail.data.environment.activeSlot}`}>{detail.data.environment.activeSlot}</span>}
                </span>
                <span className="muted small">
                  {detail.data.environment.strategy === "blue_green" ? "Blue/green" : "Recreate"} · ports {detail.data.environment.bluePort}/{detail.data.environment.greenPort} · folder{" "}
                  <code>{detail.data.environment.slug}</code>
                </span>
              </div>
              {detail.data.environment.previewPr !== null && (
                <div className="note note-info preview-note">
                  <GitPullRequest size={16} />
                  <span>
                    Preview of{" "}
                    <a href={`${a.repoUrl}/pull/${detail.data.environment.previewPr}`} target="_blank" rel="noreferrer">
                      pull request #{detail.data.environment.previewPr}
                    </a>
                    . Deployed on every push to it and torn down when it closes.
                    {detail.data.domains[0] && (
                      <>
                        {" "}
                        <a href={`${detail.data.domains[0].status === "active" ? "https" : "http"}://${detail.data.domains[0].hostname}`} target="_blank" rel="noreferrer">
                          {detail.data.domains[0].hostname} <ExternalLink size={12} />
                        </a>
                      </>
                    )}
                  </span>
                  {can("admin") && (
                    <button
                      className="btn btn-small btn-ghost"
                      disabled={teardown.busy}
                      onClick={() => {
                        if (confirm(`Tear down ${detail.data!.environment.name}? Its containers, volumes, nginx site, certificate and data are deleted.`))
                          void teardown.run(async () => setTeardownJob((await api<{ jobId: string }>(orgPath(`/environments/${detail.data!.environment.id}`), { method: "DELETE" })).jobId));
                      }}
                    >
                      <Trash2 size={14} /> Tear down
                    </button>
                  )}
                </div>
              )}
              <ErrorNote error={teardown.error} />
              <div className="tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="tab-panel">
                {tab === "Deploys" && <DeploysTab detail={detail.data} reload={detail.reload} />}
                {tab === "Variables" && <VariablesTab environmentId={detail.data.environment.id} />}
                {tab === "Domains" && <DomainsTab detail={detail.data} reload={detail.reload} />}
                {tab === "Health" && <HealthTab detail={detail.data} reload={detail.reload} />}
                {tab === "Backups" && <BackupsTab detail={detail.data} reload={detail.reload} />}
                {tab === "Logs" && <LogsTab detail={detail.data} />}
              </div>
            </>
          )}
          {!detail.data && !detail.error && <Loading />}
        </>
      )}

      <Modal open={newEnvOpen} title="New environment" onClose={() => setNewEnvOpen(false)}>
        <NewEnvironment
          appId={a.id}
          onCreated={(e) => {
            setNewEnvOpen(false);
            void app.reload();
            selectEnv(e.id);
          }}
        />
      </Modal>
      <Modal open={settingsOpen} title={`${a.name} settings`} onClose={() => setSettingsOpen(false)} wide>
        <AppSettings app={a} environments={app.data.environments} onSaved={() => void app.reload()} />
      </Modal>
      <Modal open={!!teardownJob} title="Tearing down the preview" onClose={() => setTeardownJob(null)} wide>
        {teardownJob && (
          <JobView
            jobId={teardownJob}
            onFinished={(job) => {
              if (job.status === "success") {
                setTeardownJob(null);
                navigate(`/apps/${id}`, { replace: true });
              }
              void app.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={!!secret} title="New webhook secret" onClose={() => setSecret(null)} wide>
        {secret && (
          <div className="stack">
            <p>Paste this into the GitHub webhook settings now. It won't be shown again.</p>
            <CopyField label="Payload URL" value={a.webhookUrl} />
            <CopyField label="Secret" value={secret} />
          </div>
        )}
      </Modal>
    </>
  );
}
