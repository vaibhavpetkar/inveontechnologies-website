import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Cpu, HardDrive, KeyRound, MemoryStick, Plus, Power, RefreshCw, Server as ServerIcon, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { AwsInfo, Server } from "../lib/types";
import { AwsConnectionModal, CreateAwsServerModal, TerminateModal } from "./servers/Aws";
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
  const action = useAction();
  const aws = useApi<AwsInfo>(can("admin") ? orgPath("/aws") : null);
  const [awsOpen, setAwsOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [terminating, setTerminating] = useState<Server | null>(null);
  const awsConnected = !!aws.data?.connection?.connected;

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
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> Add server
              </button>
            </>
          )
        }
      />
      <ErrorNote error={error ?? action.error} />
      {loading && !data && <Loading />}
      {data && data.servers.length === 0 && (
        <Empty icon={<ServerIcon size={28} />} title="No servers yet">
          {can("admin") ? "Add a server to get a one-line install command." : "Ask an admin to add a server."}
        </Empty>
      )}
      <div className="grid">
        {data?.servers.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-head">
              <h3>{s.name}</h3>
              <StatusBadge status={s.provider === "aws" && s.provisionState && s.provisionState !== "agent_online" ? s.provisionState : s.status} />
            </div>
            {s.provider === "aws" && (
              <p className="muted small">
                EC2 {s.awsInstanceType} · {s.awsRegion} · {s.awsInstanceId ?? "launching"}
                {s.awsState && s.awsState !== "running" ? ` · ${s.awsState}` : ""}
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
                  }}
                >
                  Public IP
                </button>
                {s.provider === "aws" && s.provisionState !== "terminated" && (
                  <>
                    <button className="btn btn-small btn-ghost" onClick={() => refresh(s)} disabled={action.busy} title="Check the instance in AWS now">
                      <RefreshCw size={14} /> Refresh
                    </button>
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
                  title={s.provider === "aws" && s.provisionState !== "terminated" && s.provisionState !== "failed" ? "Terminate the instance first" : "Remove"}
                  disabled={s.provider === "aws" && s.provisionState !== "terminated" && s.provisionState !== "failed"}
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

      <Modal open={!!editing} title={`Public IP of ${editing?.name ?? ""}`} onClose={() => setEditing(null)}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api(orgPath(`/servers/${editing!.id}`), { method: "PATCH", body: { ipAddress: ip } });
              setEditing(null);
              void reload();
            });
          }}
        >
          <Field label="IPv4 address" hint="Domains point their A record here. Taken from the agent's connection by default; correct it if the server is behind NAT.">
            <input required value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" />
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
