import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { metricAlertRules, metricIncidents, serverMetrics, servers, type MetricRuleKind } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { dashboardLink, emitAlert } from "../alerts/service.js";
import { percentOf } from "./service.js";

/**
 * Threshold alerts on server metrics. Each organization sets a default rule
 * per metric (CPU, memory, disk, offline) and can override it per server.
 * Every scheduler tick evaluates the effective rules: crossing a threshold
 * opens an incident and sends one alert; clearing it resolves the incident
 * and sends one more. The partial unique index on open incidents keeps it
 * to one even if two evaluations race.
 */

export const METRIC_KINDS: MetricRuleKind[] = ["cpu", "memory", "disk", "offline"];
export const METRIC_LABEL: Record<MetricRuleKind, string> = { cpu: "CPU", memory: "Memory", disk: "Disk", offline: "Offline" };
/** What the dashboard suggests for a new rule. */
export const SUGGESTED_RULES: Record<MetricRuleKind, { thresholdPct: number | null; forMinutes: number }> = {
  cpu: { thresholdPct: 90, forMinutes: 10 },
  memory: { thresholdPct: 90, forMinutes: 5 },
  disk: { thresholdPct: 85, forMinutes: 0 },
  offline: { thresholdPct: null, forMinutes: 5 },
};
export const MAX_FOR_MINUTES = 120;
/** Samples older than this don't count: the server isn't reporting (the offline rule covers that). */
export const STALE_SEC = 180;
/** One missed sample of slack when checking that a condition covered its whole window. */
const COVERAGE_SLACK_SEC = 45;

type Rule = typeof metricAlertRules.$inferSelect;
type Incident = typeof metricIncidents.$inferSelect;
type Server = typeof servers.$inferSelect;

export interface RuleInput {
  metric: MetricRuleKind;
  thresholdPct: number | null;
  forMinutes: number;
}

/**
 * breach: open (or keep open) an incident. above: over the threshold, but
 * not for long enough yet. ok: clear. unknown: no recent data, change nothing.
 */
export type RuleState = "breach" | "above" | "ok" | "unknown";

export interface Reading {
  at: Date;
  value: number | null;
}

/**
 * Pure: the state of a threshold rule given the server's readings (any
 * order). The latest reading decides above or below; "for N minutes" needs
 * every reading in the last N minutes above the threshold, and readings
 * going back that far.
 */
export function evaluateThreshold(rule: RuleInput, readings: Reading[], now: Date): { state: RuleState; value: number | null } {
  const threshold = rule.thresholdPct ?? 100;
  const valid = readings.filter((r) => r.value !== null && r.at.getTime() <= now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
  const latest = valid.at(-1);
  if (!latest || now.getTime() - latest.at.getTime() > STALE_SEC * 1000) return { state: "unknown", value: null };
  const value = latest.value!;
  if (value <= threshold) return { state: "ok", value };
  if (rule.forMinutes <= 0) return { state: "breach", value };
  const windowStart = now.getTime() - rule.forMinutes * 60_000;
  const inWindow = valid.filter((r) => r.at.getTime() >= windowStart);
  const covered = inWindow.length > 0 && inWindow[0].at.getTime() <= windowStart + COVERAGE_SLACK_SEC * 1000;
  const allAbove = inWindow.every((r) => r.value! > threshold);
  return { state: covered && allAbove ? "breach" : "above", value };
}

/** Pure: the offline rule. Offline after the heartbeat timeout; an incident after N more minutes. Value: minutes since the last check-in. */
export function evaluateOffline(rule: Pick<RuleInput, "forMinutes">, lastSeenAt: Date | null, now: Date, heartbeatTimeoutSec: number): { state: RuleState; value: number | null } {
  if (!lastSeenAt) return { state: "unknown", value: null };
  const silentMs = now.getTime() - lastSeenAt.getTime();
  const value = Math.round((silentMs / 60_000) * 10) / 10;
  if (silentMs < heartbeatTimeoutSec * 1000) return { state: "ok", value };
  return { state: silentMs >= heartbeatTimeoutSec * 1000 + rule.forMinutes * 60_000 ? "breach" : "above", value };
}

type SampleRow = Pick<typeof serverMetrics.$inferSelect, "at" | "cpuPct" | "memUsedBytes" | "memTotalBytes" | "diskRootUsedBytes" | "diskRootTotalBytes" | "diskDockerUsedBytes" | "diskDockerTotalBytes">;

/** The value a rule compares: percent CPU, percent memory used, and the fuller of / and Docker's data root. */
export function metricValue(metric: Exclude<MetricRuleKind, "offline">, s: SampleRow): number | null {
  if (metric === "cpu") return s.cpuPct;
  if (metric === "memory") return percentOf(s.memUsedBytes, s.memTotalBytes);
  const disks = [percentOf(s.diskRootUsedBytes, s.diskRootTotalBytes), percentOf(s.diskDockerUsedBytes, s.diskDockerTotalBytes)].filter((v): v is number => v !== null);
  return disks.length ? Math.max(...disks) : null;
}

/** Server overrides win over the organization's default for the same metric. */
export function effectiveRules(rules: Rule[], serverId: string) {
  const out = new Map<MetricRuleKind, Rule>();
  for (const r of rules) if (r.serverId === null && !out.has(r.metric)) out.set(r.metric, r);
  for (const r of rules) if (r.serverId === serverId) out.set(r.metric, r);
  return out;
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function describe(metric: MetricRuleKind, server: string, rule: Pick<Rule, "thresholdPct" | "forMinutes">, value: number | null) {
  if (metric === "offline") {
    return { title: `Server offline for ${rule.forMinutes} min: ${server}`, text: `${server} has not checked in for ${round1(value)} minutes.` };
  }
  const what = METRIC_LABEL[metric];
  const lasting = rule.forMinutes > 0 ? ` for ${rule.forMinutes} minute${rule.forMinutes === 1 ? "" : "s"}` : "";
  return { title: `${what} above ${rule.thresholdPct}%: ${server}`, text: `${what} on ${server} has been above ${rule.thresholdPct}%${lasting} (now ${round1(value)}%).` };
}

function describeClear(metric: MetricRuleKind, server: string, incident: Incident, value: number | null, now: Date) {
  const minutes = Math.max(1, Math.round((now.getTime() - incident.startedAt.getTime()) / 60_000));
  if (metric === "offline") return { title: `Server back online: ${server}`, text: `${server} is checking in again after an offline incident of ${minutes} minutes.` };
  const what = METRIC_LABEL[metric];
  return {
    title: `${what} back to normal: ${server}`,
    text: `${what} on ${server} is back at ${round1(value)}%, at or below the ${incident.thresholdPct}% threshold, after ${minutes} minute${minutes === 1 ? "" : "s"} (peak ${round1(incident.peakValue)}%).`,
  };
}

/**
 * One evaluation pass for every registered server of the organizations that
 * have rules or open incidents. now is injectable so tests use fixed times.
 */
export async function evaluateMetricAlerts(db: Database, heartbeatTimeoutSec: number, now = new Date()) {
  const rules = await db.select().from(metricAlertRules);
  const open = await db.select().from(metricIncidents).where(isNull(metricIncidents.resolvedAt));
  const orgIds = [...new Set([...rules.map((r) => r.orgId), ...open.map((i) => i.orgId)])];
  if (!orgIds.length) return { opened: 0, resolved: 0 };
  const serverRows = await db
    .select()
    .from(servers)
    .where(and(inArray(servers.orgId, orgIds), isNotNull(servers.registeredAt)));
  const live = serverRows.filter((s) => s.provisionState !== "terminated" && s.provisionState !== "terminating");
  const maxFor = Math.max(0, ...rules.map((r) => r.forMinutes));
  const since = new Date(now.getTime() - (maxFor * 60 + STALE_SEC + 60) * 1000);
  const samples = live.length
    ? await db
        .select({
          serverId: serverMetrics.serverId,
          at: serverMetrics.at,
          cpuPct: serverMetrics.cpuPct,
          memUsedBytes: serverMetrics.memUsedBytes,
          memTotalBytes: serverMetrics.memTotalBytes,
          diskRootUsedBytes: serverMetrics.diskRootUsedBytes,
          diskRootTotalBytes: serverMetrics.diskRootTotalBytes,
          diskDockerUsedBytes: serverMetrics.diskDockerUsedBytes,
          diskDockerTotalBytes: serverMetrics.diskDockerTotalBytes,
        })
        .from(serverMetrics)
        .where(and(inArray(serverMetrics.serverId, live.map((s) => s.id)), gt(serverMetrics.at, since), lte(serverMetrics.at, now)))
        .orderBy(asc(serverMetrics.at))
    : [];
  const byServer = new Map<string, SampleRow[]>();
  for (const s of samples) byServer.set(s.serverId, [...(byServer.get(s.serverId) ?? []), s]);

  let opened = 0;
  let resolved = 0;
  for (const server of live) {
    const effective = effectiveRules(
      rules.filter((r) => r.orgId === server.orgId),
      server.id,
    );
    for (const metric of METRIC_KINDS) {
      const incident = open.find((i) => i.serverId === server.id && i.metric === metric) ?? null;
      const rule = effective.get(metric);
      try {
        if (!rule || !rule.enabled) {
          // The rule was removed or turned off: close quietly, it didn't clear.
          if (incident) await closeIncident(db, incident, null, now, "rule removed or turned off");
          continue;
        }
        const result =
          metric === "offline"
            ? evaluateOffline(rule, server.lastSeenAt, now, heartbeatTimeoutSec)
            : evaluateThreshold(
                rule,
                (byServer.get(server.id) ?? []).map((s) => ({ at: s.at, value: metricValue(metric, s) })),
                now,
              );
        if (result.state === "breach" && !incident) {
          if (await openIncident(db, server, rule, result.value, now)) opened++;
        } else if ((result.state === "breach" || result.state === "above") && incident && result.value !== null && (incident.peakValue === null || result.value > incident.peakValue)) {
          await db.update(metricIncidents).set({ peakValue: result.value }).where(eq(metricIncidents.id, incident.id));
        } else if (result.state === "ok" && incident) {
          if (await closeIncident(db, incident, result.value, now, null, server)) resolved++;
        }
      } catch (err) {
        logger.error({ err, serverId: server.id, metric }, "Could not evaluate a metric alert");
      }
    }
  }
  return { opened, resolved };
}

async function openIncident(db: Database, server: Server, rule: Rule, value: number | null, now: Date) {
  const [row] = await db
    .insert(metricIncidents)
    .values({ orgId: server.orgId, serverId: server.id, metric: rule.metric, ruleId: rule.id, thresholdPct: rule.thresholdPct, forMinutes: rule.forMinutes, startedAt: now, openValue: value, peakValue: value })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  const msg = describe(rule.metric, server.name, rule, value);
  await emitAlert(db, server.orgId, "server.threshold", {
    ...msg,
    severity: rule.metric === "cpu" || rule.metric === "memory" ? "warning" : "critical",
    url: dashboardLink(`/servers/${server.id}`),
    details: { server: server.name, metric: rule.metric, threshold: rule.thresholdPct, forMinutes: rule.forMinutes, value: round1(value) },
  });
  await writeAudit(db, { orgId: server.orgId, action: "metric_alert.open", entityType: "server", entityId: server.id, metadata: { metric: rule.metric, threshold: rule.thresholdPct, value: round1(value), incidentId: row.id } });
  return row;
}

/** Resolves an open incident once. A reason means it closed without clearing: no alert. */
async function closeIncident(db: Database, incident: Incident, value: number | null, now: Date, reason: string | null, server?: Server) {
  const [row] = await db
    .update(metricIncidents)
    .set({ resolvedAt: now, clearValue: value, closedReason: reason })
    .where(and(eq(metricIncidents.id, incident.id), isNull(metricIncidents.resolvedAt)))
    .returning();
  if (!row || reason || !server) return row ?? null;
  const msg = describeClear(incident.metric, server.name, incident, value, now);
  await emitAlert(db, server.orgId, "server.threshold_cleared", {
    ...msg,
    severity: "info",
    url: dashboardLink(`/servers/${server.id}`),
    details: { server: server.name, metric: incident.metric, threshold: incident.thresholdPct, value: round1(value), peak: round1(incident.peakValue) },
  });
  await writeAudit(db, { orgId: server.orgId, action: "metric_alert.resolve", entityType: "server", entityId: server.id, metadata: { metric: incident.metric, value: round1(value), incidentId: incident.id } });
  return row;
}

/** Shown on the server page and exported to Prometheus. */
export async function openIncidents(db: Database, orgId: string, serverIds?: string[]) {
  const where = [eq(metricIncidents.orgId, orgId), isNull(metricIncidents.resolvedAt)];
  if (serverIds) {
    if (!serverIds.length) return [];
    where.push(inArray(metricIncidents.serverId, serverIds));
  }
  return db.select().from(metricIncidents).where(and(...where)).orderBy(asc(metricIncidents.startedAt));
}

/** Keep 90 days of resolved incidents (daily). */
export async function pruneIncidents(db: Database, now = new Date()) {
  const gone = await db.execute(sql`DELETE FROM metric_incidents WHERE resolved_at IS NOT NULL AND resolved_at < ${new Date(now.getTime() - 90 * 86400_000)}`);
  return gone.rowCount ?? 0;
}
