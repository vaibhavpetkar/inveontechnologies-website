import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useOrgPath } from "../../context/AuthContext";
import type { CloudOptions, ProviderConnection, Server, TokenCloud } from "../../lib/types";
import { dateTime } from "../../lib/format";
import { ErrorNote, Field, Loading, Modal, useAction } from "../../components/ui";

export const CLOUD_NAMES: Record<string, string> = { aws: "AWS EC2", digitalocean: "DigitalOcean", hetzner: "Hetzner Cloud" };

const TOKEN_HELP: Record<TokenCloud, string> = {
  digitalocean: "Control panel, API, Generate New Token, with read and write scope (or the custom scopes droplet, regions, sizes, image and account read).",
  hetzner: "Cloud console, your project, Security, API tokens, Generate API token with Read & Write. A token belongs to one project.",
};

/** The size a server has now, whichever cloud it is on. */
export const serverSize = (s: Server) => (s.provider === "aws" ? s.awsInstanceType : s.cloudSize);

/** DigitalOcean and Hetzner API tokens: write-only, checked with the provider before saving. */
export function CloudAccountsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const orgPath = useOrgPath();
  const list = useApi<{ connections: ProviderConnection[] }>(open ? orgPath("/clouds") : null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const action = useAction();
  useEffect(() => setTokens({}), [open]);

  const save = (provider: string) => (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath(`/clouds/${provider}`), { method: "PUT", body: { token: tokens[provider] ?? "" } });
      setTokens((t) => ({ ...t, [provider]: "" }));
      await list.reload();
      onSaved();
    });
  };
  const remove = (provider: string) => {
    if (!confirm(`Disconnect ${CLOUD_NAMES[provider]}? Servers already created there keep running.`)) return;
    void action.run(async () => {
      await api(orgPath(`/clouds/${provider}`), { method: "DELETE" });
      await list.reload();
      onSaved();
    });
  };

  return (
    <Modal open={open} title="Cloud accounts" onClose={onClose} wide>
      {!list.data ? (
        <Loading />
      ) : (
        <div className="stack">
          {list.data.connections.map((c) => (
            <form key={c.provider} className="form card" onSubmit={save(c.provider)}>
              <h3>{CLOUD_NAMES[c.provider]}</h3>
              {c.connected ? (
                <p className="muted small">
                  Connected to {c.accountLabel} with token {c.tokenHint}, checked {dateTime(c.verifiedAt)}. The token is encrypted and never shown again.
                </p>
              ) : (
                <p className="muted small">Not connected.</p>
              )}
              <Field label={c.connected ? "Replace the API token" : "API token"} hint={TOKEN_HELP[c.provider as TokenCloud]}>
                <input type="password" autoComplete="off" value={tokens[c.provider] ?? ""} onChange={(e) => setTokens((t) => ({ ...t, [c.provider]: e.target.value }))} />
              </Field>
              <div className="btn-row">
                <button className="btn btn-primary" disabled={action.busy || !(tokens[c.provider] ?? "").trim()}>
                  Check and save
                </button>
                {c.connected && (
                  <button type="button" className="btn btn-ghost btn-danger" disabled={action.busy} onClick={() => remove(c.provider)}>
                    Disconnect
                  </button>
                )}
              </div>
            </form>
          ))}
          <ErrorNote error={list.error ?? action.error} />
        </div>
      )}
    </Modal>
  );
}

/** A droplet or Hetzner server with the agent installed by cloud-init. */
export function CreateCloudServerModal({ provider, onClose, onCreated }: { provider: TokenCloud | null; onClose: () => void; onCreated: () => void }) {
  const orgPath = useOrgPath();
  const opts = useApi<CloudOptions>(provider ? orgPath(`/clouds/${provider}/options`) : null);
  const [form, setForm] = useState({ name: "", region: "", size: "", image: "" });
  const action = useAction();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (!opts.data) return;
    setForm((f) => ({ ...f, region: opts.data!.regions[0]?.id ?? "", image: opts.data!.images[0]?.id ?? "", size: "" }));
  }, [opts.data]);
  const sizes = (opts.data?.sizes ?? []).filter((s) => !s.regions?.length || s.regions.includes(form.region));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await api(orgPath("/servers/cloud"), { method: "POST", body: { provider, ...form } });
      onCreated();
      onClose();
    });
  };

  return (
    <Modal open={!!provider} title={`Create on ${provider ? CLOUD_NAMES[provider] : ""}`} onClose={onClose} wide>
      {!opts.data && !opts.error ? (
        <Loading />
      ) : (
        <form className="form" onSubmit={submit}>
          <Field label="Name">
            <input required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="web-1" />
          </Field>
          <Field label="Region">
            <select value={form.region} onChange={(e) => set("region", e.target.value)}>
              {opts.data?.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Size" hint="Only sizes available in the region are listed.">
            <select required value={form.size} onChange={(e) => set("size", e.target.value)}>
              <option value="">Choose…</option>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}: {s.vcpu} vCPU, {s.memoryGb} GB RAM{s.diskGb ? `, ${s.diskGb} GB disk` : ""}
                  {s.arch === "arm64" ? ", Arm" : ""}
                  {s.priceMonthly !== null ? ` (${s.priceMonthly}/month)` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Image">
            <select value={form.image} onChange={(e) => set("image", e.target.value)}>
              {opts.data?.images.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted small">
            The server runs the normal installer on first boot with a single-use install token (valid for an hour) and registers itself. It is tagged with its Inveon ids, and
            only a server with those tags is ever terminated.
          </p>
          <ErrorNote error={opts.error ?? action.error} />
          <button className="btn btn-primary" disabled={action.busy || !form.size}>
            {action.busy ? "Creating…" : "Create server"}
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Stop (typed name), start, and resize while stopped, on any cloud. */
export function PowerModal({ server, onClose, onDone }: { server: Server | null; onClose: () => void; onDone: () => void }) {
  const orgPath = useOrgPath();
  const stopped = server?.provisionState === "stopped";
  const sizes = useApi<{ current: string | null; sizes: CloudOptions["sizes"] }>(server && stopped ? orgPath(`/servers/${server.id}/sizes`) : null);
  const [typed, setTyped] = useState("");
  const [size, setSize] = useState("");
  const action = useAction();
  useEffect(() => {
    setTyped("");
    setSize("");
  }, [server]);
  const post = (path: string, body?: unknown) =>
    void action.run(async () => {
      await api(orgPath(`/servers/${server!.id}/${path}`), { method: "POST", body });
      onDone();
      onClose();
    });

  return (
    <Modal open={!!server} title={`Power and size: ${server?.name ?? ""}`} onClose={onClose}>
      {server && (
        <div className="stack">
          <p className="muted small">
            {CLOUD_NAMES[server.provider]} · {serverSize(server)} · {server.provisionState?.replace(/_/g, " ")}
          </p>
          {(server.provisionState === "agent_online" || server.provisionState === "running") && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                post("stop", { confirm: typed });
              }}
            >
              <div className="note note-warn">
                Stopping shuts the server down cleanly: every app on it goes offline until it is started again.
                {server.provider === "aws" ? " Without an Elastic IP, EC2 gives it a new public IP when it starts; update DNS records then." : ""}
              </div>
              <Field label={`Type ${server.name} to confirm`}>
                <input autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </Field>
              <button className="btn btn-danger" disabled={action.busy || typed !== server.name}>
                Stop server
              </button>
            </form>
          )}
          {stopped && (
            <>
              <button className="btn btn-primary" disabled={action.busy} onClick={() => post("start")}>
                Start server
              </button>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  post("resize", { size });
                }}
              >
                <Field label="Resize to" hint="Same CPU architecture only. The disk keeps its size, so the server can be resized back down later.">
                  <select value={size} onChange={(e) => setSize(e.target.value)}>
                    <option value="">Choose…</option>
                    {sizes.data?.sizes
                      .filter((s) => s.id !== sizes.data?.current)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}: {s.vcpu} vCPU, {s.memoryGb} GB RAM{s.priceMonthly !== null ? ` (${s.priceMonthly}/month)` : ""}
                        </option>
                      ))}
                  </select>
                </Field>
                <button className="btn btn-ghost" disabled={action.busy || !size}>
                  Resize
                </button>
              </form>
            </>
          )}
          {!stopped && server.provisionState !== "agent_online" && server.provisionState !== "running" && (
            <p className="muted">The server is {server.provisionState?.replace(/_/g, " ")}; try again when it has settled (Refresh checks now).</p>
          )}
          <ErrorNote error={sizes.error ?? action.error} />
        </div>
      )}
    </Modal>
  );
}
