import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { apps, environments, healthChecks, memberships, users } from "../../db/schema.js";
import { sendMail } from "../../lib/mailer.js";
import { writeAudit } from "../../lib/audit.js";
import { emitAlert, hasChannelFor } from "../alerts/service.js";

export const FAILURES_BEFORE_DOWN = 3;

type Check = typeof healthChecks.$inferSelect;

export interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

export async function probe(url: string, timeoutMs = 10000): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "inveon-cloud-health" } });
    await res.body?.cancel().catch(() => undefined);
    const ok = res.status >= 200 && res.status < 400;
    return { ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, statusCode: null, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
  }
}

/**
 * Pure state machine: 3 failures in a row mark the check down (one alert);
 * the first success after that marks it up again (one recovery email).
 */
export function nextHealthState(check: Pick<Check, "status" | "consecutiveFailures">, ok: boolean) {
  if (ok) {
    return { status: "up" as const, consecutiveFailures: 0, transition: check.status === "down" ? ("recovered" as const) : null };
  }
  const failures = check.consecutiveFailures + 1;
  if (failures >= FAILURES_BEFORE_DOWN && check.status !== "down") return { status: "down" as const, consecutiveFailures: failures, transition: "down" as const };
  return { status: check.status === "down" ? ("down" as const) : check.status, consecutiveFailures: failures, transition: null };
}

async function alertRecipients(db: Database, orgId: string) {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"])));
  return rows.map((r) => r.email);
}

export async function runCheck(db: Database, check: Check, publicUrl: string) {
  const result = await probe(check.url);
  const next = nextHealthState(check, result.ok);
  const now = new Date();
  await db
    .update(healthChecks)
    .set({
      status: next.status,
      consecutiveFailures: next.consecutiveFailures,
      lastCheckedAt: now,
      lastStatusCode: result.statusCode,
      lastError: result.error,
      ...(next.transition ? { lastChangeAt: now } : {}),
    })
    .where(eq(healthChecks.id, check.id));

  if (next.transition) {
    const environment = await db.query.environments.findFirst({ where: eq(environments.id, check.environmentId) });
    const app = environment ? await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) }) : null;
    if (environment && app) {
      const label = `${app.name} / ${environment.name}`;
      const link = `${publicUrl.replace(/\/$/, "")}/apps/${app.id}?env=${environment.id}`;
      const event = next.transition === "down" ? "health.down" : "health.up";
      // Alert channels take over from the built-in email once one subscribes to the event.
      if (!(await hasChannelFor(db, environment.orgId, event))) {
        const to = await alertRecipients(db, environment.orgId);
        if (next.transition === "down") {
          await sendMail(to, `[Down] ${label}`, `${label} failed ${next.consecutiveFailures} health checks in a row.\n\nURL: ${check.url}\nLast error: ${result.error}\n\n${link}`);
        } else {
          await sendMail(to, `[Recovered] ${label}`, `${label} is responding again (HTTP ${result.statusCode}).\n\nURL: ${check.url}\n\n${link}`);
        }
      }
      const details = { app: app.name, environment: environment.name, url: check.url, status: result.statusCode, error: result.error };
      if (next.transition === "down") {
        await emitAlert(db, environment.orgId, "health.down", { title: `Down: ${label}`, text: `${label} failed ${next.consecutiveFailures} health checks in a row.`, severity: "critical", url: link, details });
      } else {
        await emitAlert(db, environment.orgId, "health.up", { title: `Recovered: ${label}`, text: `${label} is responding again (HTTP ${result.statusCode}).`, severity: "info", url: link, details });
      }
      await writeAudit(db, { orgId: environment.orgId, action: `health.${next.transition}`, entityType: "environment", entityId: environment.id, metadata: { url: check.url, error: result.error } });
    }
  }
  return { ...result, ...next };
}

export async function runDueChecks(db: Database, publicUrl: string) {
  const due = await db
    .select()
    .from(healthChecks)
    .where(and(eq(healthChecks.enabled, true), sql`(${healthChecks.lastCheckedAt} IS NULL OR ${healthChecks.lastCheckedAt} < now() - make_interval(secs => ${healthChecks.intervalSec}))`));
  await Promise.all(due.map((c) => runCheck(db, c, publicUrl)));
  return due.length;
}
