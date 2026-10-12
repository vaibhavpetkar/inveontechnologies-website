import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GitPullRequest, Hammer, KeyRound, Lock, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useOrgPath } from "../../context/AuthContext";
import type { App, Environment, Server } from "../../lib/types";
import { useApi } from "../../lib/useApi";
import { CopyField, ErrorNote, Field, useAction } from "../../components/ui";

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

/** Build on the server: for repos without a CI image. */
function BuildSettings({ app, onSaved }: { app: App; onSaved: (app: App) => void }) {
  const orgPath = useOrgPath();
  const [form, setForm] = useState({ buildOnServer: app.buildOnServer, dockerfilePath: app.dockerfilePath, buildContext: app.buildContext });
  const action = useAction();
  useEffect(() => setForm({ buildOnServer: app.buildOnServer, dockerfilePath: app.dockerfilePath, buildContext: app.buildContext }), [app]);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => onSaved((await api<{ app: App }>(orgPath(`/apps/${app.id}`), { method: "PATCH", body: form })).app));
  };
  return (
    <Section icon={<Hammer size={16} />} title="Build on the server">
      <p className="muted small">
        For repos without a CI image. Each deploy clones the commit on the server, runs <code>docker build</code> and tags the image with the commit. In the compose file, use{" "}
        <code>image: ${"{INVEON_IMAGE}"}</code> for the built service.
      </p>
      <form className="form" onSubmit={save}>
        <label className="check">
          <input type="checkbox" checked={form.buildOnServer} onChange={(e) => setForm({ ...form, buildOnServer: e.target.checked })} /> Build the image on the server
        </label>
        {form.buildOnServer && (
          <div className="row">
            <Field label="Dockerfile path" hint="Relative to the repo root.">
              <input required value={form.dockerfilePath} onChange={(e) => setForm({ ...form, dockerfilePath: e.target.value })} />
            </Field>
            <Field label="Build context" hint="Folder sent to docker build, e.g. . or web.">
              <input required value={form.buildContext} onChange={(e) => setForm({ ...form, buildContext: e.target.value })} />
            </Field>
          </div>
        )}
        {form.buildOnServer && !app.deployKey && <p className="note note-info">Private repo? Generate a deploy key below so the server can clone it.</p>}
        <ErrorNote error={action.error} />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={action.busy}>
            Save
          </button>
        </div>
      </form>
    </Section>
  );
}

/** Write-only registry login: the password is never shown again. */
function RegistrySettings({ app, onSaved }: { app: App; onSaved: (app: App) => void }) {
  const orgPath = useOrgPath();
  const [form, setForm] = useState({ server: app.registryCredentials?.server ?? "ghcr.io", username: app.registryCredentials?.username ?? "", password: "" });
  const action = useAction();
  const base = orgPath(`/apps/${app.id}/registry-credentials`);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      onSaved((await api<{ app: App }>(base, { method: "PUT", body: form })).app);
      setForm((f) => ({ ...f, password: "" }));
    });
  };
  return (
    <Section icon={<Lock size={16} />} title="Registry credentials">
      <p className="muted small">
        Used to pull this app's images (and base images when building). The agent logs in for the job only, in a temporary folder, and logs out after. The password is encrypted and
        write-only.
      </p>
      {app.registryCredentials && (
        <div className="btn-row align-center">
          <span>
            <code>{app.registryCredentials.username}</code> @ <code>{app.registryCredentials.server}</code> <span className="muted">{app.registryCredentials.password}</span>
          </span>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            disabled={action.busy}
            onClick={() => {
              if (confirm("Remove the registry credentials?")) void action.run(async () => onSaved((await api<{ app: App }>(base, { method: "DELETE" })).app));
            }}
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>
      )}
      <form className="form" onSubmit={save}>
        <div className="row row-3">
          <Field label="Registry">
            <input required value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} placeholder="ghcr.io" />
          </Field>
          <Field label="Username">
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={app.registryCredentials ? "New password or token" : "Password or token"}>
            <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
        <ErrorNote error={action.error} />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={action.busy}>
            {app.registryCredentials ? "Replace credentials" : "Save credentials"}
          </button>
        </div>
      </form>
    </Section>
  );
}

/** A read-only SSH deploy key, generated here; only the public half is shown. */
function DeployKeySettings({ app, onSaved }: { app: App; onSaved: (app: App) => void }) {
  const orgPath = useOrgPath();
  const action = useAction();
  const base = orgPath(`/apps/${app.id}/deploy-key`);
  return (
    <Section icon={<KeyRound size={16} />} title="Deploy key">
      <p className="muted small">
        Lets servers clone a private repo when building. Add the public key in GitHub under {app.repoOwner}/{app.repoName} → Settings → Deploy keys, with write access off. The private key
        is encrypted and only sent to the server running the build.
      </p>
      {app.deployKey && <CopyField label="Public key" value={app.deployKey.publicKey} />}
      <ErrorNote error={action.error} />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={action.busy}
          onClick={() => {
            if (!app.deployKey || confirm("Replace the deploy key? Update it in GitHub right after.")) void action.run(async () => onSaved((await api<{ app: App }>(base, { method: "POST" })).app));
          }}
        >
          <KeyRound size={14} /> {app.deployKey ? "Generate a new key" : "Generate deploy key"}
        </button>
        {app.deployKey && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={action.busy}
            onClick={() => {
              if (confirm("Remove the deploy key?")) void action.run(async () => onSaved((await api<{ app: App }>(base, { method: "DELETE" })).app));
            }}
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </Section>
  );
}

/** One environment per pull request, at pr-<number>.<base domain>. */
function PreviewSettings({ app, environments, onSaved }: { app: App; environments: Environment[]; onSaved: (app: App) => void }) {
  const orgPath = useOrgPath();
  const servers = useApi<{ servers: Server[] }>(orgPath("/servers"));
  const initial = () => ({
    previewsEnabled: app.previewsEnabled,
    previewServerId: app.previewServerId ?? "",
    previewBaseDomain: app.previewBaseDomain ?? "",
    previewVarsFromEnvironmentId: app.previewVarsFromEnvironmentId ?? "",
  });
  const [form, setForm] = useState(initial);
  const action = useAction();
  useEffect(() => setForm(initial()), [app]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!form.previewServerId && servers.data?.servers[0]) setForm((f) => ({ ...f, previewServerId: servers.data!.servers[0].id }));
  }, [servers.data, form.previewServerId]);
  const sources = environments.filter((e) => e.previewPr === null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () =>
      onSaved(
        (
          await api<{ app: App }>(orgPath(`/apps/${app.id}`), {
            method: "PATCH",
            body: {
              previewsEnabled: form.previewsEnabled,
              previewServerId: form.previewServerId || null,
              previewBaseDomain: form.previewBaseDomain.trim() || null,
              previewVarsFromEnvironmentId: form.previewVarsFromEnvironmentId || null,
            },
          })
        ).app,
      ),
    );
  };
  const example = `pr-12.${form.previewBaseDomain.trim() || "preview.example.com"}`;
  return (
    <Section icon={<GitPullRequest size={16} />} title="Preview environments">
      <p className="muted small">
        Each pull request gets its own environment, <code>pr-&lt;number&gt;</code>, deployed on open and on every push to it, and torn down (containers, volumes, nginx site, certificate
        and data) when it closes. Pull requests from forks are never deployed. Turn on the <strong>Pull requests</strong> event in the GitHub webhook.
      </p>
      <form className="form" onSubmit={save}>
        <label className="check">
          <input type="checkbox" checked={form.previewsEnabled} onChange={(e) => setForm({ ...form, previewsEnabled: e.target.checked })} /> Create a preview for each pull request
        </label>
        <div className="row">
          <Field label="Preview server">
            <select value={form.previewServerId} onChange={(e) => setForm({ ...form, previewServerId: e.target.value })} required={form.previewsEnabled}>
              {servers.data?.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base domain" hint={`Previews live at ${example}.`}>
            <input value={form.previewBaseDomain} onChange={(e) => setForm({ ...form, previewBaseDomain: e.target.value })} placeholder="preview.example.com" required={form.previewsEnabled} />
          </Field>
        </div>
        <Field label="Copy variables and deploy settings from" hint="Copied when a preview is created. Pick a staging environment, not production: preview code can read these values.">
          <select value={form.previewVarsFromEnvironmentId} onChange={(e) => setForm({ ...form, previewVarsFromEnvironmentId: e.target.value })}>
            <option value="">Nothing (start empty)</option>
            {sources.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        {form.previewsEnabled && (
          <p className="note note-info">
            Point a wildcard DNS record <code>*.{form.previewBaseDomain.trim() || "preview.example.com"}</code> at the preview server's IP. Each preview gets its own Let's Encrypt
            certificate after its first deploy.
          </p>
        )}
        <ErrorNote error={servers.error ?? action.error} />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={action.busy}>
            Save
          </button>
        </div>
      </form>
    </Section>
  );
}

export function AppSettings({ app, environments, onSaved }: { app: App; environments: Environment[]; onSaved: (app: App) => void }) {
  return (
    <div className="stack">
      <BuildSettings app={app} onSaved={onSaved} />
      <RegistrySettings app={app} onSaved={onSaved} />
      <DeployKeySettings app={app} onSaved={onSaved} />
      <PreviewSettings app={app} environments={environments} onSaved={onSaved} />
    </div>
  );
}
