import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Cpu, HardDrive, KeyRound, MemoryStick, Plus, Power, RefreshCw, Server as ServerIcon, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import { Link } from "wouter";
import type { AwsInfo, MetricIncident, Server } from "../lib/types";
import { AwsConnectionModal, CreateAwsServerModal, TerminateModal } from "./servers/Aws";
import { CLOUD_NAMES, CloudAccountsModal, CreateCloudServerModal, PowerModal, serverSize } from "./servers/Clouds";
import type { ProviderConnection, TokenCloud } from "../lib/types";
import { bytes, timeAgo } from "../lib/format";
import { CopyField, Empty, ErrorNote, Field, Loading, Modal, PageHeader, StatusBadge, useAction } from "../components/ui";

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  if (left === 0) return <span className="text-bad">expired, create a new command</span>;
  return (
    <span>
      expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * Agent request signing: which servers still send unsigned requests (agents
 * from before signing), and the owner's switch to refuse them.
 */
function RequestSigningCard({ servers }: { servers: Server[] }) {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const org = useApi<{ organization: { requireSignedAgents?: boolean }; agentSignatures?: "optional" | "required" }>(orgPath(""));
  const action = useAction();
  const registered = servers.filter((s) => s.registeredAt && s.provisionState !== "terminated");
  const unsigned = registered.filter((s) => s.requestSigning === "unsigned");
  const global = org.data?.agentSignatures === "required";
  const required = global || !!org.data?.organization.requireSignedAgents;
  if (!org.data || registered.length === 0) return null;
  const toggle = (value: boolean) => {
    if (value && unsigned.length && !confirm(`${unsigned.length} server(s) still use unsigned requests and will be cut off until their agent is upgraded. Continue?`)) return;
    void action.run(async () => {
      await api(orgPath(""), { method: "PATCH", body: { requireSignedAgents: value } });
      await org.reload();
    });
  };
  return (
    <div className={`note ${unsigned.length && required ? "note-bad" : unsigned.length ? "note-warn" : "note-info"}`}>
      <p>
        <ShieldCheck size={14} /> <strong>Signed agent requests.</strong>{" "}
        {unsigned.length === 0
          ? "Every server's agent signs its requests with its own Ed25519 key."
          : `${unsigned.length} of ${registered.length} servers still use unsigned requests (${unsigned.map((s) => s.name).join(", ")}). Upgrade their agent: copy the new bundle to /opt/inveon-agent and restart inveon-agent, or run the installer again.`}
      </p>
      <label className="check">
        <input type="checkbox" checked={required} disabled={global || !can("owner") || action.busy} onChange={(e) => toggle(e.target.checked)} />
        Refuse unsigned agent requests{global ? " (required for every organization on this control plane)" : can("owner") ? "" : " (owners)"}
      </label>
      <ErrorNote error={action.error} />
    </div>
  );
}

function InstallCommand({ command, expiresAt }: { command: string; expiresAt: string }) {
  return (
    <div className="stack">
      <p>Run this on the server (Ubuntu or Debian) as a user with sudo. The token works once and <Countdown until={expiresAt} />.</p>
      <CopyField value={command} />
      <p className="muted small">
        It installs Docker, nginx, certbot and the agent, registers the server, and starts the <code>inveon-agent</code> service. The agent connects out to this control
        panel over HTTPS, so no inbound port is needed except 80/443 for your sites.
      </p>
    </div>
  );
}

export default function Servers() {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<{ servers: Server[] }>(orgPath("/servers"), 15000);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [install, setInstall] = useState<{ command: string; expiresAt: string; title: string } | null>(null);
  const [editing, setEditing] = useState<Server | null>(null);
  const [ip, setIp] = useState("");
  const [privateIp, setPrivateIp] = useState("");
  const action = useAction();
  const aws = useApi<AwsInfo>(can("admin") ? orgPath("/aws") : null);
  const [awsOpen, setAwsOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [terminating, setTerminating] = useState<Server | null>(null);
  const awsConnected = !!aws.data?.connection?.connected;
  const tokenClouds = useApi<{ connections: ProviderConnection[] }>(can("admin") ? orgPath("/clouds") : null);
  const [cloudsOpen, setCloudsOpen] = useState(false);
  const [creatingOn, setCreatingOn] = useState<TokenCloud | null>(null);
  const [power, setPower] = useState<Server | null>(null);
  const connectedClouds = (tokenClouds.data?.connections ?? []).filter((c) => c.connected).map((c) => c.provider as TokenCloud);
  // Launched by Inveon Cloud on some cloud (not added by hand).
  const launched = (s: Server) => s.provider !== "manual" && !!(s.awsInstanceId || s.cloudInstanceId);
  const incidents = useApi<{ incidents: MetricIncident[] }>(orgPath("/metric-incidents"), 30000);
  const openFor = (id: string) => incidents.data?.incidents.filter((i) => i.serverId === id).length ?? 0;

  const refresh = (s: Server) =>
    void action.run(async () => {
      await api(orgPath(`/servers/${s.id}/refresh`), { method: "POST" });
      await reload();
    });

  const create = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const r = await api<{ server: Server; installCommand: string; expiresAt: string }>(orgPath("/servers"), { method: "POST", body: { name } });
      setAdding(false);
      setName("");
      setInstall({ command: r.installCommand, expiresAt: r.expiresAt, title: `Install the agent on ${r.server.name}` });
      void reload();
    });
  };

  const newToken = (s: Server) =>
    void action.run(async () => {
      const r = await api<{ installCommand: string; expiresAt: string }>(orgPath(`/servers/${s.id}/bootstrap-token`), { method: "POST" });
      setInstall({ command: r.installCommand, expiresAt: r.expiresAt, title: `Install the agent on ${s.name}` });
    });

  return (
    <>
      <PageHeader
        title="Servers"
        subtitle="Hosts running the Inveon agent."
        actions={
          can("admin") && (
            <>
              <button className="btn btn-ghost" onClick={() => setAwsOpen(true)}>
                <Cloud size={16} /> AWS account{awsConnected ? "" : "…"}
              </button>
              {awsConnected && (
                <button className="btn btn-ghost" onClick={() => setLaunching(true)}>
                  <Plus size={16} /> Create on AWS
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setCloudsOpen(true)}>
                <Cloud size={16} /> DigitalOcean, Hetzner
              </button>
              {connectedClouds.map((p) => (
                <button key={p} className="btn btn-ghost" onClick={() => setCreatingOn(p)}>
                  <Plus size={16} /> Create on {CLOUD_NAMES[p]}
                </button>
              ))}
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add server
              </button>
            </>
          )
        }
      />
      <ErrorNote error={error ?? action.error} />
      {loading && !data && <Loading />}
      {data && <RequestSigningCard servers={data.servers} />}
      {data && data.servers.length === 0 && (
        <Empty icon={<ServerIcon size={28} />} title="No servers yet">
          {can("admin") ? "Add a server to get a one-line install command." : "Ask an admin to add a server."}
        </Empty>
      )}
      <div className="grid">
        {data?.servers.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-head">
              <h3>
                {s.registeredAt ? <Link href={`/servers/${s.id}`}>{s.name}</Link> : s.name}
                {openFor(s.id) > 0 && (
                  <Link href={`/servers/${s.id}`} className="badge badge-bad" title="Open threshold incidents">
                    {openFor(s.id)} alert{openFor(s.id) > 1 ? "s" : ""}
                  </Link>
                )}
              </h3>
              <StatusBadge status={s.provider !== "manual" && s.provisionState && s.provisionState !== "agent_online" ? s.provisionState : s.status} />
            </div>
            {s.provider === "aws" && (
              <p className="muted small">
                EC2 {s.awsInstanceType} · {s.awsRegion} · {s.awsInstanceId ?? "launching"}
                {s.awsState && s.awsState !== "running" ? ` · ${s.awsState}` : ""}
                {s.provisionState === "running" && " · installing the agent (a few minutes)"}
                {s.provisionState === "terminated" && s.terminatedAt ? ` · terminated ${timeAgo(s.terminatedAt)}` : ""}
              </p>
            )}
            {(s.provider === "digitalocean" || s.provider === "hetzner") && (
              <p className="muted small">
                {CLOUD_NAMES[s.provider]} {s.cloudSize} · {s.cloudRegion} · {s.cloudInstanceId ?? "creating"}
                {s.cloudState ? ` · ${s.cloudState}` : ""}
                {s.provisionState === "resizing" && s.resizeTarget ? ` · resizing to ${s.resizeTarget}` : ""}
                {s.provisionState === "running" && " · installing the agent (a few minutes)"}
                {s.provisionState === "terminated" && s.terminatedAt ? ` · terminated ${timeAgo(s.terminatedAt)}` : ""}
              </p>
            )}
            {s.provisionError && <ErrorNote error={s.provisionError} />}
            {s.registeredAt ? (
              <>
                <p className="muted small">
                  {s.hostname ?? "—"} · {s.ipAddress ?? "no public IP"} · seen {timeAgo(s.lastSeenAt)}
                </p>
                <ul className="facts">
                  <li>
                    <ServerIcon size={14} /> {s.os ?? "unknown OS"}
                  </li>
                  <li>
                    <Cpu size={14} /> {s.cpuCount ?? "?"} CPU
                  </li>
                  <li>
                    <MemoryStick size={14} /> {bytes(s.memoryBytes)} RAM
                  </li>
                  <li>
                    <HardDrive size={14} /> {bytes(s.diskFreeBytes)} free of {bytes(s.diskTotalBytes)}
                  </li>
                  <li>Docker {s.dockerVersion ?? "not detected"}</li>
                  <li>Agent {s.agentVersion ?? "?"}</li>
                  {s.requestSigning === "signed" && (
                    <li title="Every request from this agent is signed with its Ed25519 key">
                      <ShieldCheck size={14} /> Signed requests
                    </li>
                  )}
                  {s.requestSigning === "unsigned" && (
                    <li className="text-bad" title="This agent predates request signing; upgrade it">
                      Unsigned requests
                    </li>
                  )}
                </ul>
              </>
            ) : s.provisionState === "terminated" || s.provisionState === "terminating" ? null : (
              <p className="muted small">Waiting for the agent to register.</p>
            )}
            {can("admin") && (
              <div className="card-actions">
                <button className="btn btn-small btn-ghost" onClick={() => newToken(s)} disabled={action.busy}>
                  <KeyRound size={14} /> {s.registeredAt ? "Reinstall command" : "New install command"}
                </button>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={() => {
                    setEditing(s);
                    setIp(s.ipAddress ?? "");
                    setPrivateIp(s.privateIpAddress ?? "");
                  }}
                >
                  IP addresses
                </button>
                {launched(s) && s.provisionState !== "terminated" && (
                  <>
                    <button className="btn btn-small btn-ghost" onClick={() => refresh(s)} disabled={action.busy} title={`Check the instance in ${CLOUD_NAMES[s.provider]} now`}>
                      <RefreshCw size={14} /> Refresh
                    </button>
                    {s.provisionState !== "terminating" && s.provisionState !== "pending" && (
                      <button className="btn btn-small btn-ghost" onClick={() => setPower(s)} title={`Stop, start or resize (now ${serverSize(s) ?? "?"})`}>
                        <Power size={14} /> Power and size
                      </button>
                    )}
                    {s.provisionState !== "terminating" && (
                      <button className="btn btn-small btn-ghost btn-danger" onClick={() => setTerminating(s)}>
                        <Power size={14} /> Terminate
                      </button>
                    )}
                  </>
                )}
                <button
                  className="btn btn-small btn-ghost btn-danger"
                  aria-label={`Remove ${s.name}`}
                  title={launched(s) && s.provisionState !== "terminated" && s.provisionState !== "failed" ? "Terminate the instance first" : "Remove"}
                  disabled={launched(s) && s.provisionState !== "terminated" && s.provisionState !== "failed"}
                  onClick={() => {
                    if (confirm(`Remove ${s.name}? The agent on it stops being accepted.`)) void action.run(async () => (await api(orgPath(`/servers/${s.id}`), { method: "DELETE" }), reload()));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <AwsConnectionModal open={awsOpen} info={aws.data} onClose={() => setAwsOpen(false)} onSaved={() => void aws.reload()} />
      {aws.data && (
        <CreateAwsServerModal
          open={launching}
          info={aws.data}
          onClose={() => setLaunching(false)}
          onCreated={() => void reload()}
        />
      )}
      <TerminateModal server={terminating} onClose={() => setTerminating(null)} onDone={() => void reload()} />
      <CloudAccountsModal open={cloudsOpen} onClose={() => setCloudsOpen(false)} onSaved={() => void tokenClouds.reload()} />
      <CreateCloudServerModal provider={creatingOn} onClose={() => setCreatingOn(null)} onCreated={() => void reload()} />
      <PowerModal server={power} onClose={() => setPower(null)} onDone={() => void reload()} />

      <Modal open={adding} title="Add server" onClose={() => setAdding(false)}>
        <form onSubmit={create} className="form">
          <Field label="Name" hint="For example web-1 or mumbai-prod.">
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-primary" disabled={action.busy}>
            Create install command
          </button>
        </form>
      </Modal>

      <Modal open={!!install} title={install?.title ?? ""} onClose={() => setInstall(null)} wide>
        {install && <InstallCommand command={install.command} expiresAt={install.expiresAt} />}
      </Modal>

      <Modal open={!!editing} title={`IP addresses of ${editing?.name ?? ""}`} onClose={() => setEditing(null)}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api(orgPath(`/servers/${editing!.id}`), { method: "PATCH", body: { ipAddress: ip, privateIpAddress: privateIp.trim() || null } });
              setEditing(null);
              void reload();
            });
          }}
        >
          <Field label="IPv4 address" hint="Domains point their A record here. Taken from the agent's connection by default; correct it if the server is behind NAT.">
            <input required value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" />
          </Field>
          <Field label="Private IP address (optional)" hint="On a private network shared with the other servers of an environment, the proxy reaches this server here instead of over the internet.">
            <input value={privateIp} onChange={(e) => setPrivateIp(e.target.value)} placeholder="10.0.0.5" />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-primary" disabled={action.busy}>
            Save
          </button>
        </form>
      </Modal>
    </>
  );
}
