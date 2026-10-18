import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, domains, envVars, environments, jobs, releases, servers } from "../../db/schema.js";
import { decryptValue, encryptValue } from "../../lib/crypto.js";
import { logger } from "../../lib/logger.js";
import { AppError, ConflictError } from "../../lib/errors.js";
import { createEnvironmentRecord } from "../apps/routes.js";
import { HOSTNAME_RE, startIssueJob } from "../domains/routes.js";
import { completeJob, createJob, envVarAad, notifyServer, registerJobEffect, type StepInput } from "../jobs/service.js";
import { onDeployDone, onDeploySucceeded } from "../deploys/service.js";
import { notifyPreview } from "../github/service.js";

type App = typeof apps.$inferSelect;
type Environment = typeof environments.$inferSelect;

/**
 * Preview environments: one environment per pull request, named
 * pr-<number>, on the app's preview server, served at
 * pr-<number>.<preview base domain>. A pull_request webhook creates or
 * updates it; closing the PR tears it down (containers, volumes, nginx
 * site, certificate and data folder) and then deletes the record.
 */

export const previewName = (pr: number) => `pr-${pr}`;
export const previewHostname = (app: App, pr: number) => `${previewName(pr)}.${app.previewBaseDomain}`;

export function previewsReady(app: App): app is App & { previewServerId: string; previewBaseDomain: string } {
  return app.previewsEnabled && !!app.previewServerId && !!app.previewBaseDomain;
}

async function teardownPending(db: Database, environmentId: string) {
  return db.query.jobs.findFirst({
    where: and(eq(jobs.environmentId, environmentId), eq(jobs.type, "preview_teardown"), inArray(jobs.status, ["pending", "running"])),
  });
}

/** Finds the PR's preview environment, or creates it (with its domain and copied variables). */
export async function upsertPreviewEnvironment(db: Database, app: App, pr: number): Promise<{ environment: Environment; created: boolean }> {
  if (!previewsReady(app)) throw new AppError("PREVIEWS_OFF", "Previews are not set up for this app", 400);
  const name = previewName(pr);
  const existing = await db.query.environments.findFirst({ where: and(eq(environments.appId, app.id), eq(environments.name, name)) });
  if (existing) {
    if (existing.previewPr !== pr) throw new ConflictError(`An environment called ${name} already exists and is not a preview`);
    if (await teardownPending(db, existing.id)) throw new ConflictError(`The preview for #${pr} is being torn down; push again once it is gone`);
    return { environment: existing, created: false };
  }
  const server = await db.query.servers.findFirst({ where: and(eq(servers.id, app.previewServerId), eq(servers.orgId, app.orgId)) });
  if (!server) throw new AppError("PREVIEW_SERVER_MISSING", "The preview server no longer exists", 400);
  const source = app.previewVarsFromEnvironmentId
    ? await db.query.environments.findFirst({ where: and(eq(environments.id, app.previewVarsFromEnvironmentId), eq(environments.appId, app.id)) })
    : undefined;
  const hostname = previewHostname(app, pr);

  const environment = await db.transaction(async (tx) => {
    const row = await createEnvironmentRecord(tx, app, server.id, {
      name,
      // Previews follow the template environment's deploy settings, if one is chosen.
      strategy: source?.strategy ?? "blue_green",
      healthPath: source?.healthPath ?? "/",
      releaseCommand: source?.releaseCommand ?? null,
      releaseService: source?.releaseService ?? null,
      // Never deployed by pushes to the branch: only by its own pull request.
      autoDeploy: false,
      previewPr: pr,
    });
    if (source) {
      const vars = await tx.select().from(envVars).where(eq(envVars.environmentId, source.id)).orderBy(asc(envVars.key));
      if (vars.length) {
        // Re-encrypted under the new environment (the AAD binds each value to its environment).
        await tx.insert(envVars).values(
          vars.map((v) => ({
            environmentId: row.id,
            key: v.key,
            isSecret: v.isSecret,
            valueEnc: encryptValue(decryptValue(v.valueEnc, envVarAad(source.id, v.key)), envVarAad(row.id, v.key)),
          })),
        );
      }
    }
    if (HOSTNAME_RE.test(hostname)) {
      const taken = await tx.query.domains.findFirst({ where: eq(domains.hostname, hostname) });
      if (!taken) await tx.insert(domains).values({ orgId: app.orgId, environmentId: row.id, hostname });
      else logger.warn({ hostname }, "Preview hostname is already in use; the preview has no domain");
    }
    return row;
  });
  return { environment, created: true };
}

/** Everything a preview leaves on the server, removed in a safe order. */
export function previewTeardownSteps(environment: Environment, app: App, sites: { hostname: string; wildcardId?: string | null }[]): StepInput[] {
  const slots = environment.strategy === "recreate" ? (["main"] as const) : (["blue", "green"] as const);
  const steps: StepInput[] = slots.map((slot) => ({
    name: `Stop ${slot === "main" ? "containers" : slot} and remove volumes`,
    action: "compose.down",
    params: { slug: environment.slug, slot, composePath: app.composePath, removeVolumes: true },
  }));
  for (const { hostname, wildcardId } of sites) {
    steps.push({ name: `Remove nginx site ${hostname}`, action: "nginx.remove_site", params: { hostname } });
    // A hostname served with a wildcard certificate has none of its own.
    if (!wildcardId) steps.push({ name: `Delete certificate ${hostname}`, action: "certbot.delete", params: { hostname } });
  }
  steps.push(
    { name: "Remove nginx upstream", action: "nginx.remove_upstream", params: { slug: environment.slug } },
    { name: "Reload nginx", action: "nginx.reload", params: {} },
    { name: "Remove the environment's folder", action: "app.remove_folder", params: { slug: environment.slug } },
  );
  return steps;
}

/**
 * Queues the teardown. The environment record stays until the job succeeds,
 * so a failed teardown can be retried from the dashboard.
 */
export async function startPreviewTeardown(db: Database, environment: Environment, app: App, userId: string | null) {
  if (environment.previewPr === null) throw new AppError("NOT_A_PREVIEW", "Only preview environments are torn down this way", 400);
  const pending = await teardownPending(db, environment.id);
  if (pending) return pending;
  const sites = await db.select({ hostname: domains.hostname, wildcardId: domains.wildcardId }).from(domains).where(eq(domains.environmentId, environment.id));
  const job = await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "preview_teardown",
    title: `Tear down ${app.name} / ${environment.name}`,
    createdBy: userId,
    meta: { environmentId: environment.id, pr: environment.previewPr },
    steps: previewTeardownSteps(environment, app, sites),
  });
  await db.update(environments).set({ autoDeploy: false }).where(eq(environments.id, environment.id));
  notifyServer(environment.serverId);
  return job;
}

// Teardown done: cancel anything still queued for the preview, then delete it.
registerJobEffect("preview_teardown", async (db, job) => {
  if (job.status !== "success") return;
  const environmentId = String(job.meta.environmentId ?? "");
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, environmentId) });
  const app = environment ? await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) }) : undefined;
  if (app && environment?.previewPr) void notifyPreview(db, { app, pr: environment.previewPr, state: "removed" });
  const queued = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.environmentId, environmentId), eq(jobs.status, "pending")));
  for (const q of queued) await completeJob(db, q.id, "cancelled", "The preview was torn down");
  await db.delete(environments).where(and(eq(environments.id, environmentId), eq(environments.serverId, job.serverId)));
});

/**
 * After a preview's first successful deploy, issue its certificate. Preview
 * hostnames need a wildcard DNS record (*.<base domain>) pointing at the
 * preview server, so there is no per-PR DNS step. With a wildcard
 * certificate for the base domain on that server, the site uses it at once;
 * otherwise the issue job writes the HTTP site first, so the preview works
 * over HTTP even if certbot fails.
 */
export function registerPreviewHooks(env: Env) {
  // The pull request's comment and commit status follow every preview deploy.
  onDeployDone("preview-comment", async (db, environment, deployment, job) => {
    if (environment.previewPr === null || (job.status !== "success" && job.status !== "failure")) return;
    const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
    const release = await db.query.releases.findFirst({ where: eq(releases.id, deployment.releaseId), columns: { commitSha: true } });
    if (!app || !previewsReady(app)) return;
    void notifyPreview(db, {
      app,
      pr: environment.previewPr,
      state: job.status === "success" ? "live" : "failed",
      commitSha: release?.commitSha,
      environmentId: environment.id,
      hostname: previewHostname(app, environment.previewPr),
      error: job.error,
    });
  });

  onDeploySucceeded("previews", async (db, environment) => {
    if (environment.previewPr === null) return;
    if (await teardownPending(db, environment.id)) return;
    const pending = await db.select().from(domains).where(and(eq(domains.environmentId, environment.id), eq(domains.status, "pending_dns")));
    for (const d of pending) {
      await db.update(domains).set({ dnsCheckedAt: new Date() }).where(eq(domains.id, d.id));
      try {
        await startIssueJob(db, env, d, null);
      } catch (err) {
        logger.warn({ err, hostname: d.hostname }, "Preview certificate not queued");
      }
    }
  });
}
