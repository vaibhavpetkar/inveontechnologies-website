import { useState, type FormEvent } from "react";
import { Bell, Hash, KeyRound, Mail, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth, useOrgPath } from "../context/AuthContext";
import type { AlertChannel, AlertChannelType, AlertDelivery, AlertEventInfo } from "../lib/types";
import { dateTime, timeAgo } from "../lib/format";
import { CopyField, Empty, ErrorNote, Field, Loading, Modal, PageHeader, StatusBadge, useAction } from "../components/ui";
import { ThresholdRules } from "./monitoring/Thresholds";
import { ScrapeTokens } from "./monitoring/ScrapeTokens";
import { Gauge } from "lucide-react";

const TYPE_LABEL: Record<AlertChannelType, string> = { slack: "Slack", webhook: "Webhook", email: "Email" };
const TypeIcon = ({ type }: { type: AlertChannelType }) => (type === "slack" ? <Hash size={16} /> : type === "webhook" ? <Webhook size={16} /> : <Mail size={16} />);

interface FormState {
  type: AlertChannelType;
  name: string;
  url: string;
  emails: string;
  events: string[];
}

/** Create or edit a channel. URLs are write-only: leave it empty when editing to keep the current one. */
function ChannelForm({ events, channel, onDone }: { events: AlertEventInfo[]; channel: AlertChannel | null; onDone: (secret: string | null) => void }) {
  const orgPath = useOrgPath();
  const [form, setForm] = useState<FormState>({
    type: channel?.type ?? "slack",
    name: channel?.name ?? "",
    url: "",
    emails: (channel?.emails ?? []).join("\n"),
    events: channel?.events ?? events.filter((e) => e.default).map((e) => e.id),
  });
  const action = useAction();
  const emails = form.emails
    .split(/[\s,]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (channel) {
        await api(orgPath(`/alert-channels/${channel.id}`), {
          method: "PATCH",
          body: { name: form.name, events: form.events, ...(form.type === "email" ? { emails } : form.url.trim() ? { url: form.url.trim() } : {}) },
        });
        onDone(null);
      } else {
        const r = await api<{ signingSecret?: string }>(orgPath("/alert-channels"), {
          method: "POST",
          body: { type: form.type, name: form.name, events: form.events, ...(form.type === "email" ? { emails } : { url: form.url.trim() }) },
        });
        onDone(r.signingSecret ?? null);
      }
    });
  };

  const toggle = (id: string) => setForm((f) => ({ ...f, events: f.events.includes(id) ? f.events.filter((x) => x !== id) : [...f.events, id] }));

  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <Field label="Type">
          <select value={form.type} disabled={!!channel} onChange={(e) => setForm({ ...form, type: e.target.value as AlertChannelType })}>
            <option value="slack">Slack (incoming webhook)</option>
            <option value="webhook">Webhook (signed JSON)</option>
            <option value="email">Email</option>
          </select>
        </Field>
        <Field label="Name">
          <input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.type === "slack" ? "#ops" : form.type === "email" ? "On-call" : "PagerDuty"} />
        </Field>
      </div>
      {form.type === "email" ? (
        <Field label="Recipients" hint="One per line. Leave empty to email the organization's owners and admins.">
          <textarea rows={3} value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} placeholder="oncall@example.com" />
        </Field>
      ) : (
        <Field
          label={form.type === "slack" ? "Slack incoming webhook URL" : "Webhook URL"}
          hint={
            channel
              ? `Saved: ${channel.url ?? "none"}. Leave empty to keep it; the full URL is never shown again.`
              : form.type === "slack"
                ? "From Slack: Apps, Incoming Webhooks. It's a secret: stored encrypted and never shown again."
                : "https only, on a public address. Each request is signed with a secret you get after saving."
          }
        >
          <input type="url" required={!channel} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://hooks.slack.com/services/…" autoComplete="off" />
        </Field>
      )}
      <fieldset className="checks">
        <legend className="field-label">Send these events</legend>
        {events.map((ev) => (
          <label key={ev.id} className="check">
            <input type="checkbox" checked={form.events.includes(ev.id)} onChange={() => toggle(ev.id)} /> {ev.label}
          </label>
        ))}
      </fieldset>
      <ErrorNote error={action.error} />
      <button className="btn btn-primary" disabled={action.busy || !form.name.trim() || form.events.length === 0}>
        {channel ? "Save" : "Add channel"}
      </button>
    </form>
  );
}

function ChannelCard({ channel, events, onChanged, onEdit, onSecret }: { channel: AlertChannel; events: AlertEventInfo[]; onChanged: () => void; onEdit: () => void; onSecret: (s: string) => void }) {
  const orgPath = useOrgPath();
  const action = useAction();
  const [result, setResult] = useState<AlertDelivery | null>(null);
  const label = (id: string) => events.find((e) => e.id === id)?.label ?? id;

  const test = () =>
    void action.run(async () => {
      setResult(null);
      const r = await api<{ delivery: AlertDelivery }>(orgPath(`/alert-channels/${channel.id}/test`), { method: "POST" });
      setResult(r.delivery);
      onChanged();
    });
  const toggle = () =>
    void action.run(async () => {
      await api(orgPath(`/alert-channels/${channel.id}`), { method: "PATCH", body: { enabled: !channel.enabled } });
      onChanged();
    });
  const remove = () => {
    if (!confirm(`Delete the channel "${channel.name}"? Its delivery log goes with it.`)) return;
    void action.run(async () => {
      await api(orgPath(`/alert-channels/${channel.id}`), { method: "DELETE" });
      onChanged();
    });
  };
  const rotate = () => {
    if (!confirm("Create a new signing secret? Requests are signed with the new one right away, so update your receiver.")) return;
    void action.run(async () => onSecret((await api<{ signingSecret: string }>(orgPath(`/alert-channels/${channel.id}/signing-secret`), { method: "POST" })).signingSecret));
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          <TypeIcon type={channel.type} /> {channel.name}
        </h3>
        <span className={`badge ${channel.enabled ? "badge-ok" : "badge-muted"}`}>{channel.enabled ? TYPE_LABEL[channel.type] : "off"}</span>
      </div>
      <p className="muted small">
        {channel.type === "email" ? (channel.emails.length ? channel.emails.join(", ") : "Owners and admins") : <code>{channel.url}</code>}
        {channel.type === "webhook" && " · signed (X-Inveon-Signature)"}
      </p>
      <div className="chips">
        {channel.events.map((e) => (
          <span key={e} className="chip">
            {label(e)}
          </span>
        ))}
      </div>
      {result && (
        <p className={`note ${result.status === "success" ? "note-info" : "note-bad"}`}>
          {result.status === "success" ? `Test sent${result.responseStatus ? ` (HTTP ${result.responseStatus})` : ""}. ${result.detail ?? ""}` : `Test failed: ${result.lastError ?? "unknown error"}`}
        </p>
      )}
      <ErrorNote error={action.error} />
      <div className="card-actions">
        <button className="btn btn-small btn-primary" disabled={action.busy || !channel.enabled} onClick={test}>
          <Send size={14} /> Send test
        </button>
        <button className="btn btn-small btn-ghost" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
        <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={toggle}>
          {channel.enabled ? "Turn off" : "Turn on"}
        </button>
        {channel.type === "webhook" && (
          <button className="btn btn-small btn-ghost" disabled={action.busy} onClick={rotate}>
            <KeyRound size={14} /> New secret
          </button>
        )}
        <button className="btn btn-small btn-danger" disabled={action.busy} onClick={remove}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}

function DeliveryLog({ channels }: { channels: AlertChannel[] }) {
  const orgPath = useOrgPath();
  const [channelId, setChannelId] = useState("");
  const log = useApi<{ deliveries: AlertDelivery[] }>(orgPath(`/alert-deliveries?limit=100${channelId ? `&channelId=${channelId}` : ""}`), 10000);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Delivery log</h3>
        <select aria-label="Channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes and 2 hours. The log keeps 30 days.</p>
      <ErrorNote error={log.error} />
      {log.data && log.data.deliveries.length === 0 && <Empty title="Nothing sent yet" />}
      {log.data && log.data.deliveries.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {log.data.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    <div className="truncate">{d.payload.title ?? d.event}</div>
                    <div className="muted small">
                      <code>{d.event}</code> → {d.channelName}
                    </div>
                  </td>
                  <td className="muted small hide-sm">
                    {d.status === "success" ? (d.responseStatus ? `HTTP ${d.responseStatus}` : d.detail) : d.lastError}
                    {d.status === "pending" && d.attempts > 0 && <div>retry {timeAgo(d.nextAttemptAt).replace(" ago", "")} · attempt {d.attempts + 1} of {d.maxAttempts}</div>}
                  </td>
                  <td className="muted small nowrap" title={dateTime(d.createdAt)}>
                    {timeAgo(d.createdAt)}
                    {d.attempts > 1 && <div>{d.attempts} attempts</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Alerts() {
  const orgPath = useOrgPath();
  const { can } = useAuth();
  const data = useApi<{ channels: AlertChannel[]; events: AlertEventInfo[] }>(can("admin") ? orgPath("/alert-channels") : null);
  const [editing, setEditing] = useState<AlertChannel | "new" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  if (!can("admin")) return <ErrorNote error="Only owners and admins can manage alerts." />;
  if (data.error) return <ErrorNote error={data.error} />;
  if (!data.data) return <Loading />;
  const { channels, events } = data.data;

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Where to tell you when a deploy fails, a site goes down, a server stops checking in, a backup fails or a certificate is about to expire."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Channel
          </button>
        }
      />
      {channels.length === 0 ? (
        <Empty icon={<Bell size={28} />} title="No alert channels yet">
          Without a channel, owners and admins still get health-check emails. Add Slack, a webhook or an email list to choose who hears about what.
        </Empty>
      ) : (
        <div className="grid">
          {channels.map((c) => (
            <ChannelCard key={c.id} channel={c} events={events} onChanged={() => void data.reload()} onEdit={() => setEditing(c)} onSecret={setSecret} />
          ))}
        </div>
      )}
      <div className="stack section-gap">
        <div className="card">
          <div className="card-head">
            <h3>
              <Gauge size={16} /> Server thresholds
            </h3>
          </div>
          <p className="muted small">
            Defaults for every server; a server's Thresholds tab can override them. Crossing one opens an incident and sends a <em>Server threshold crossed</em> alert; clearing it sends
            one more. CPU and memory use the agent's 30-second samples, disk the fuller of / and Docker's data root.
          </p>
          <ThresholdRules />
        </div>
        <ScrapeTokens />
        <DeliveryLog channels={channels} />
      </div>

      <Modal open={editing !== null} title={editing === "new" ? "New alert channel" : "Edit alert channel"} onClose={() => setEditing(null)} wide>
        {editing !== null && (
          <ChannelForm
            events={events}
            channel={editing === "new" ? null : editing}
            onDone={(s) => {
              setEditing(null);
              if (s) setSecret(s);
              void data.reload();
            }}
          />
        )}
      </Modal>
      <Modal open={!!secret} title="Signing secret" onClose={() => setSecret(null)} wide>
        {secret && (
          <div className="stack">
            <p>Copy it now; it won't be shown again. Each request carries:</p>
            <pre className="log">{`X-Inveon-Event: deploy.failed
X-Inveon-Delivery: <delivery id>
X-Inveon-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`}</pre>
            <p className="muted small">Recompute the HMAC with this secret over the timestamp, a dot and the raw body, compare in constant time, and reject timestamps older than five minutes.</p>
            <CopyField label="Secret" value={secret} />
          </div>
        )}
      </Modal>
    </>
  );
}
