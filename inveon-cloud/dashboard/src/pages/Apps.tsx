import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Boxes, GitBranch, Github, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { App } from "../lib/types";
import { GithubAppCard } from "../components/GithubApp";
import { CopyField, Empty, ErrorNote, Field, Loading, Modal, PageHeader, useAction } from "../components/ui";

export default function Apps() {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const [, navigate] = useLocation();
  const { data, error, loading } = useApi<{ apps: App[] }>(orgPath("/apps"));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", repoUrl: "", branch: "main", composePath: "docker-compose.yml", imageRegistry: "" });
  const [created, setCreated] = useState<{ app: App; webhookSecret: string } | null>(null);
  const action = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ app: App; webhookSecret: string }>(orgPath("/apps"), { method: "POST", body: { ...form, imageRegistry: form.imageRegistry || null } });
      setOpen(false);
      setCreated(r);
    });
  };

  return (
    <>
      <PageHeader
        title="Apps"
        subtitle="GitHub repositories deployed with Docker Compose."
        actions={
          can("admin") && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} /> New app
            </button>
          )
        }
      />
      <ErrorNote error={error} />
      <GithubAppCard />
      {loading && !data && <Loading />}
      {data && data.apps.length === 0 && (
        <Empty icon={<Boxes size={28} />} title="No apps yet">
          An app is a GitHub repo with a compose file. Add one, then create an environment on a server.
        </Empty>
      )}
      <div className="grid">
        {data?.apps.map((a) => (
          <Link key={a.id} href={`/apps/${a.id}`} className="card card-link">
            <div className="card-head">
              <h3>{a.name}</h3>
              <span className="muted small">
                {a.environmentCount ?? 0} environment{a.environmentCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="muted small">
              <Github size={14} /> {a.repoOwner}/{a.repoName}
            </p>
            <p className="muted small">
              <GitBranch size={14} /> {a.branch} · {a.composePath}
            </p>
          </Link>
        ))}
      </div>

      <Modal open={open} title="New app" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="form">
          <Field label="Name">
            <input required maxLength={80} value={form.name} onChange={set("name")} placeholder="Inveon website" autoFocus />
          </Field>
          <Field label="GitHub repository URL">
            <input required value={form.repoUrl} onChange={set("repoUrl")} placeholder="https://github.com/inveon/website" />
          </Field>
          <div className="row">
            <Field label="Branch">
              <input required value={form.branch} onChange={set("branch")} />
            </Field>
            <Field label="Compose file path">
              <input required value={form.composePath} onChange={set("composePath")} />
            </Field>
          </div>
          <Field label="Image registry (optional)" hint="Passed to the compose file as IMAGE_REGISTRY, e.g. ghcr.io/inveon.">
            <input value={form.imageRegistry} onChange={set("imageRegistry")} />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-primary" disabled={action.busy}>
            Create app
          </button>
        </form>
      </Modal>

      <Modal open={!!created} title="Set up the GitHub webhook" onClose={() => created && navigate(`/apps/${created.app.id}`)} wide>
        {created && (
          <div className="stack">
            <p>
              In GitHub, open <strong>{created.app.repoOwner}/{created.app.repoName}</strong> → Settings → Webhooks → Add webhook. Use content type{" "}
              <code>application/json</code>, choose "Let me select individual events" and tick <strong>Pushes</strong> (and <strong>Pull requests</strong> if you'll use preview
              environments).
            </p>
            <CopyField label="Payload URL" value={created.app.webhookUrl} />
            <CopyField label="Secret" value={created.webhookSecret} />
            <p className="note note-warn">The secret is shown only now. You can rotate it later from the app page.</p>
            <button className="btn btn-primary" onClick={() => navigate(`/apps/${created.app.id}`)}>
              Continue to the app
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
