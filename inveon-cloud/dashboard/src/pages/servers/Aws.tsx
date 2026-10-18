import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { useOrgPath } from "../../context/AuthContext";
import type { AwsConnection, AwsInfo, Server } from "../../lib/types";
import { dateTime } from "../../lib/format";
import { CopyField, ErrorNote, Field, Modal, useAction } from "../../components/ui";

/** What the role needs: launch, describe, and only touch what it tagged. */
export function permissionPolicy(accountId = "<your account id>") {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "Describe",
          Effect: "Allow",
          Action: ["ec2:DescribeInstances", "ec2:DescribeSecurityGroups", "ec2:DescribeKeyPairs", "ec2:DescribeVpcs", "ec2:DescribeSubnets"],
          Resource: "*",
        },
        { Sid: "Launch", Effect: "Allow", Action: ["ec2:RunInstances", "ec2:CreateSecurityGroup"], Resource: "*" },
        { Sid: "TagOnCreate", Effect: "Allow", Action: "ec2:CreateTags", Resource: "*", Condition: { StringEquals: { "ec2:CreateAction": ["RunInstances", "CreateSecurityGroup"] } } },
        {
          Sid: "OnlyInveonResources",
          Effect: "Allow",
          Action: ["ec2:TerminateInstances", "ec2:AuthorizeSecurityGroupIngress", "ec2:DeleteSecurityGroup"],
          Resource: "*",
          Condition: { StringEquals: { "aws:ResourceTag/inveon:managed-by": "inveon-cloud" } },
        },
        { Sid: "UbuntuAmi", Effect: "Allow", Action: "ssm:GetParameter", Resource: "arn:aws:ssm:*::parameter/aws/service/canonical/*" },
        {
          Sid: "InstanceProfileOptional",
          Effect: "Allow",
          Action: "iam:PassRole",
          Resource: `arn:aws:iam::${accountId}:role/inveon-*`,
          Condition: { StringEquals: { "iam:PassedToService": "ec2.amazonaws.com" } },
        },
      ],
    },
    null,
    2,
  );
}

export function trustPolicy(externalId: string) {
  return JSON.stringify(
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::<control plane account id>:role/<control plane's instance role>" },
          Action: "sts:AssumeRole",
          Condition: { StringEquals: { "sts:ExternalId": externalId } },
        },
      ],
    },
    null,
    2,
  );
}

export function AwsConnectionModal({ open, info, onClose, onSaved }: { open: boolean; info: AwsInfo | null; onClose: () => void; onSaved: () => void }) {
  const orgPath = useOrgPath();
  const [connection, setConnection] = useState<AwsConnection | null>(info?.connection ?? null);
  const [mode, setMode] = useState<"role" | "keys">("role");
  const [form, setForm] = useState({ roleArn: "", accessKeyId: "", secretAccessKey: "", defaultRegion: "ap-south-1" });
  const action = useAction();

  useEffect(() => {
    if (!open) return;
    const c = info?.connection ?? null;
    setConnection(c);
    setMode(c?.authType ?? "role");
    setForm({ roleArn: c?.roleArn ?? "", accessKeyId: c?.accessKeyId ?? "", secretAccessKey: "", defaultRegion: c?.defaultRegion ?? "ap-south-1" });
    // The role's trust policy needs the external id before the role exists.
    if (!c) void action.run(async () => setConnection((await api<{ connection: AwsConnection }>(orgPath("/aws/setup"), { method: "POST" })).connection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const body =
        mode === "role"
          ? { authType: "role", roleArn: form.roleArn.trim(), defaultRegion: form.defaultRegion }
          : { authType: "keys", accessKeyId: form.accessKeyId.trim(), secretAccessKey: form.secretAccessKey.trim(), defaultRegion: form.defaultRegion };
      await api(orgPath("/aws"), { method: "PUT", body });
      onSaved();
      onClose();
    });
  };

  const disconnect = () => {
    if (!confirm("Disconnect this AWS account? Servers already launched keep running.")) return;
    void action.run(async () => {
      await api(orgPath("/aws"), { method: "DELETE" });
      onSaved();
      onClose();
    });
  };

  return (
    <Modal open={open} title="AWS account" onClose={onClose} wide>
      <div className="stack">
        {connection?.connected && (
          <div className="note note-info">
            Connected to account {connection.accountId} with {connection.authType === "role" ? "a role" : `access key ${connection.accessKeyId}`}, checked {dateTime(connection.verifiedAt)}.
          </div>
        )}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "role"} className={`tab ${mode === "role" ? "active" : ""}`} onClick={() => setMode("role")}>
            Role (recommended)
          </button>
          <button type="button" role="tab" aria-selected={mode === "keys"} className={`tab ${mode === "keys" ? "active" : ""}`} onClick={() => setMode("keys")}>
            Access key
          </button>
        </div>
        <form className="form" onSubmit={save}>
          {mode === "role" ? (
            <>
              <p className="small">
                In your AWS account, create an IAM role that the control plane's own role can assume with this external id, attach the permissions below, and paste the
                role's ARN. No AWS keys are stored.
              </p>
              {connection && <CopyField label="External id" value={connection.externalId} />}
              <details>
                <summary className="small">Trust policy</summary>
                <pre className="log">{trustPolicy(connection?.externalId ?? "…")}</pre>
              </details>
              <details>
                <summary className="small">Permissions policy</summary>
                <pre className="log">{permissionPolicy()}</pre>
              </details>
              <Field label="Role ARN">
                <input required value={form.roleArn} onChange={(e) => setForm({ ...form, roleArn: e.target.value })} placeholder="arn:aws:iam::123456789012:role/inveon-cloud" />
              </Field>
            </>
          ) : (
            <>
              <p className="small">An IAM user's long-term access key with the permissions below. The secret is encrypted and can't be read back.</p>
              <details>
                <summary className="small">Permissions policy</summary>
                <pre className="log">{permissionPolicy()}</pre>
              </details>
              <Field label="Access key id">
                <input required autoComplete="off" value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} placeholder="AKIA…" />
              </Field>
              <Field label="Secret access key" hint={connection?.hasSecret ? "Enter it again to change the connection." : undefined}>
                <input required type="password" autoComplete="off" value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Default region">
            <select value={form.defaultRegion} onChange={(e) => setForm({ ...form, defaultRegion: e.target.value })}>
              {(info?.regions ?? []).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <ErrorNote error={action.error} />
          <div className="btn-row">
            <button className="btn btn-primary" disabled={action.busy}>
              {action.busy ? "Checking with AWS…" : "Check and save"}
            </button>
            {connection?.connected && (
              <button type="button" className="btn btn-ghost btn-danger" onClick={disconnect} disabled={action.busy}>
                Disconnect
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

export function CreateAwsServerModal({ open, info, onClose, onCreated }: { open: boolean; info: AwsInfo; onClose: () => void; onCreated: (s: Server) => void }) {
  const orgPath = useOrgPath();
  const initial = () => ({
    name: "",
    region: info.connection?.defaultRegion ?? "ap-south-1",
    instanceType: "t3.small",
    diskGb: 30,
    sgMode: "create" as "create" | "existing",
    sshCidr: "",
    securityGroupId: "",
    keyName: "",
    subnetId: "",
    instanceProfile: "",
  });
  const [form, setForm] = useState(initial);
  const [options, setOptions] = useState<{ securityGroups: { id: string; name: string; vpcId: string | null }[]; keyPairs: string[] } | null>(null);
  const action = useAction();
  const opts = useAction();

  useEffect(() => {
    if (open) setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setOptions(null);
    void opts.run(async () => setOptions(await api(orgPath(`/aws/options?region=${encodeURIComponent(form.region)}`))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.region]);

  const set = <K extends keyof ReturnType<typeof initial>>(k: K, v: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const body = {
        name: form.name.trim(),
        region: form.region,
        instanceType: form.instanceType,
        diskGb: form.diskGb,
        ...(form.sgMode === "create" ? { createSecurityGroup: form.sshCidr.trim() ? { sshCidr: form.sshCidr.trim() } : {} } : { securityGroupId: form.securityGroupId }),
        ...(form.keyName ? { keyName: form.keyName } : {}),
        ...(form.subnetId.trim() ? { subnetId: form.subnetId.trim() } : {}),
        ...(form.instanceProfile.trim() ? { instanceProfile: form.instanceProfile.trim() } : {}),
      };
      const r = await api<{ server: Server }>(orgPath("/servers/aws"), { method: "POST", body });
      onCreated(r.server);
      onClose();
    });
  };

  return (
    <Modal open={open} title="Create a server on AWS" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <p className="small muted">
          Launches Ubuntu 24.04 LTS (the current image from Canonical) with an encrypted gp3 disk and IMDSv2. On first boot it runs the install command with a fresh
          single-use token, so the server registers itself in a few minutes.
        </p>
        <Field label="Name">
          <input required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="web-1" autoFocus />
        </Field>
        <div className="row row-3">
          <Field label="Region">
            <select value={form.region} onChange={(e) => set("region", e.target.value)}>
              {info.regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Instance type">
            <select value={form.instanceType} onChange={(e) => set("instanceType", e.target.value)}>
              {info.instanceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.vcpu} vCPU · {t.memoryGb} GB · {t.arch === "arm64" ? "Arm" : "x86"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Disk (GB)">
            <input type="number" required min={info.disk.min} max={info.disk.max} step={1} value={form.diskGb} onChange={(e) => set("diskGb", Number(e.target.value))} />
          </Field>
        </div>
        <fieldset className="field">
          <legend className="field-label">Security group</legend>
          <label className="check">
            <input type="radio" name="sg" checked={form.sgMode === "create"} onChange={() => set("sgMode", "create")} /> Create one that opens 80 and 443
          </label>
          {form.sgMode === "create" && (
            <Field label="Allow SSH from (optional)" hint="An IPv4 network between /16 and /32, such as your office's address with /32. Leave empty for no SSH: the agent needs no inbound port.">
              <input value={form.sshCidr} onChange={(e) => set("sshCidr", e.target.value)} placeholder="203.0.113.10/32" />
            </Field>
          )}
          <label className="check">
            <input type="radio" name="sg" checked={form.sgMode === "existing"} onChange={() => set("sgMode", "existing")} /> Use an existing group
          </label>
          {form.sgMode === "existing" && (
            <select required value={form.securityGroupId} onChange={(e) => set("securityGroupId", e.target.value)} aria-label="Existing security group">
              <option value="">{options ? "Choose a group" : "Loading…"}</option>
              {options?.securityGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))}
            </select>
          )}
        </fieldset>
        <Field label="Key pair (optional)" hint="Only needed to SSH in.">
          <select value={form.keyName} onChange={(e) => set("keyName", e.target.value)}>
            <option value="">None</option>
            {options?.keyPairs.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <details>
          <summary className="small">Advanced</summary>
          <Field label="Subnet id (optional)" hint="Defaults to the region's default VPC. The instance gets a public IP either way.">
            <input value={form.subnetId} onChange={(e) => set("subnetId", e.target.value)} placeholder="subnet-0123456789abcdef0" />
          </Field>
          <Field label="Instance profile (optional)" hint="For S3 backups: an instance profile whose role can write to the backup bucket.">
            <input value={form.instanceProfile} onChange={(e) => set("instanceProfile", e.target.value)} placeholder="inveon-backups" />
          </Field>
        </details>
        <ErrorNote error={opts.error ?? action.error} />
        <button className="btn btn-primary" disabled={action.busy}>
          {action.busy ? "Launching…" : "Create server"}
        </button>
      </form>
    </Modal>
  );
}

export function TerminateModal({ server, onClose, onDone }: { server: Server | null; onClose: () => void; onDone: () => void }) {
  const orgPath = useOrgPath();
  const [typed, setTyped] = useState("");
  const action = useAction();
  useEffect(() => setTyped(""), [server]);
  return (
    <Modal open={!!server} title={`Terminate ${server?.name ?? ""}`} onClose={onClose}>
      {server && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api(orgPath(`/servers/${server.id}/terminate`), { method: "POST", body: { confirm: typed } });
              onDone();
              onClose();
            });
          }}
        >
          <div className="note note-bad">
            This terminates {server.provider === "aws" ? `EC2 instance ${server.awsInstanceId} in ${server.awsRegion}` : `${server.provider === "hetzner" ? "Hetzner server" : "droplet"} ${server.cloudInstanceId} in ${server.cloudRegion}`}. Its disk is deleted with it and can't be recovered. Move or back
            up anything you need first.
          </div>
          <Field label={`Type ${server.name} to confirm`}>
            <input autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <ErrorNote error={action.error} />
          <button className="btn btn-danger" disabled={action.busy || typed !== server.name}>
            Terminate instance
          </button>
        </form>
      )}
    </Modal>
  );
}
