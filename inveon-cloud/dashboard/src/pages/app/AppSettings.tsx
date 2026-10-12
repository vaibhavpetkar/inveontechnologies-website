import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Hammer, KeyRound, Lock, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useOrgPath } from "../../context/AuthContext";
import type { App } from "../../lib/types";
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

export function AppSettings({ app, onSaved, extra }: { app: App; onSaved: (app: App) => void; extra?: ReactNode }) {
  return (
    <div className="stack">
      <BuildSettings app={app} onSaved={onSaved} />
      <RegistrySettings app={app} onSaved={onSaved} />
      <DeployKeySettings app={app} onSaved={onSaved} />
      {extra}
    </div>
  );
}

export { Section as SettingsSection };
