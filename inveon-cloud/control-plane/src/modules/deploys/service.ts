import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, deployments, environments, jobSteps, jobs, releases } from "../../db/schema.js";
import { ConflictError } from "../../lib/errors.js";
import { fetchFileAtCommit, fetchHeadCommit } from "../../lib/github.js";
import { createJob, notifyServer, registerJobEffect, type StepInput } from "../jobs/service.js";

type App = typeof apps.$inferSelect;
type Environment = typeof environments.$inferSelect;
type Release = typeof releases.$inferSelect;
export type Slot = "blue" | "green" | "main";

/** Finds or creates the release for a commit (fetching the compose file at that commit). */
export async function resolveRelease(
  db: Database,
  env: Env,
  app: App,
  input: { commitSha?: string; commitMessage?: string | null; source: "webhook" | "manual"; userId?: string | null },
): Promise<Release> {
  let sha = input.commitSha;
  let message = input.commitMessage ?? null;
  if (!sha) {
    const head = await fetchHeadCommit(env, app.repoOwner, app.repoName, app.branch);
    sha = head.sha;
    message = head.message;
  }
  const existing = await db.query.releases.findFirst({ where: and(eq(releases.appId, app.id), eq(releases.commitSha, sha)) });
  if (existing) return existing;
  const composeContent = await fetchFileAtCommit(env, app.repoOwner, app.repoName, app.composePath, sha);
  const [release] = await db
    .insert(releases)
    .values({ appId: app.id, commitSha: sha, commitMessage: message?.slice(0, 2000) ?? null, composeContent, source: input.source, createdBy: input.userId ?? null })
    .onConflictDoNothing()
    .returning();
  return release ?? (await db.query.releases.findFirst({ where: and(eq(releases.appId, app.id), eq(releases.commitSha, sha)) }))!;
}

export function slotPort(environment: Environment, slot: Slot) {
  return slot === "green" ? environment.greenPort : environment.bluePort;
}

/**
 * The deploy plan. Blue/green: prepare and start the idle colour next to the
 * live one, wait for its health check, point the nginx upstream at it,
 * reload, then stop the old colour. Recreate: same steps on one project.
 */
export function deploySteps(environment: Environment, app: App, release: Release, slot: Slot, previousSlot: Slot | null): StepInput[] {
  const base = { slug: environment.slug, slot, composePath: app.composePath };
  const port = slotPort(environment, slot);
  const steps: StepInput[] = [
    { name: `Prepare release ${release.commitSha.slice(0, 7)}`, action: "release.prepare", params: { ...base, releaseId: release.id, environmentId: environment.id, commitSha: release.commitSha, port } },
    { name: "Validate compose file", action: "compose.validate", params: base },
    { name: "Pull images", action: "compose.pull", params: base },
    { name: slot === "main" ? "Start containers" : `Start ${slot}`, action: "compose.up", params: base },
    { name: "Health check", action: "health.check", params: { port, path: environment.healthPath, retries: 20, intervalSec: 3 } },
    { name: "Switch nginx upstream", action: "nginx.write_upstream", params: { slug: environment.slug, port } },
    { name: "Reload nginx", action: "nginx.reload", params: {} },
  ];
  if (previousSlot && previousSlot !== slot) {
    steps.push({ name: `Stop ${previousSlot}`, action: "compose.down", params: { slug: environment.slug, slot: previousSlot, composePath: app.composePath } });
  }
  return steps;
}

export async function createDeployment(
  db: Database,
  input: { environment: Environment; app: App; release: Release; kind: "deploy" | "rollback"; userId?: string | null },
) {
  const { environment, app, release, kind } = input;
  const busy = await db.query.jobs.findFirst({
    where: and(eq(jobs.environmentId, environment.id), inArray(jobs.type, ["deploy", "rollback"]), inArray(jobs.status, ["pending", "running"])),
  });
  if (busy) throw new ConflictError("A deploy is already running for this environment");

  const previousSlot = environment.activeSlot ?? null;
  const slot: Slot = environment.strategy === "recreate" ? "main" : previousSlot === "blue" ? "green" : "blue";
  const verb = kind === "rollback" ? "Roll back" : "Deploy";
  const result = await db.transaction(async (tx) => {
    const job = await createJob(tx, {
      orgId: environment.orgId,
      serverId: environment.serverId,
      environmentId: environment.id,
      type: kind,
      title: `${verb} ${app.name} / ${environment.name} to ${release.commitSha.slice(0, 7)}`,
      createdBy: input.userId ?? null,
      steps: deploySteps(environment, app, release, slot, previousSlot),
    });
    const [deployment] = await tx
      .insert(deployments)
      .values({ environmentId: environment.id, releaseId: release.id, jobId: job.id, kind, slot, previousSlot, createdBy: input.userId ?? null })
      .returning();
    await tx.update(jobs).set({ meta: { deploymentId: deployment.id, releaseId: release.id } }).where(eq(jobs.id, job.id));
    return { job, deployment };
  });
  notifyServer(environment.serverId);
  return result;
}

/** When a deploy job ends: record the outcome; on success switch the environment's current release. */
async function onDeployFinished(db: Database, job: typeof jobs.$inferSelect, steps: (typeof jobSteps.$inferSelect)[]) {
  const deploymentId = String(job.meta.deploymentId ?? "");
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, deploymentId) });
  if (!deployment) return;
  await db.update(deployments).set({ status: job.status, finishedAt: new Date() }).where(eq(deployments.id, deployment.id));
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, deployment.environmentId) });
  if (!environment) return;
  if (job.status !== "success") {
    await cleanUpFailedDeploy(db, job, steps, environment, deployment);
    return;
  }
  const previous = environment.currentReleaseId && environment.currentReleaseId !== deployment.releaseId ? environment.currentReleaseId : environment.previousReleaseId;
  await db
    .update(environments)
    .set({ currentReleaseId: deployment.releaseId, previousReleaseId: previous, activeSlot: deployment.slot })
    .where(eq(environments.id, environment.id));
}

/**
 * A failed blue/green deploy must leave the live colour serving: point the
 * upstream back if it was touched, and stop the half-started new colour.
 */
async function cleanUpFailedDeploy(
  db: Database,
  job: typeof jobs.$inferSelect,
  steps: (typeof jobSteps.$inferSelect)[],
  environment: Environment,
  deployment: typeof deployments.$inferSelect,
) {
  if (deployment.slot === "main" || !deployment.previousSlot || deployment.previousSlot === deployment.slot) return;
  const ran = (action: string) => steps.some((s) => s.action === action && (s.status === "success" || s.status === "failure"));
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (!app) return;
  const cleanup: StepInput[] = [];
  if (ran("nginx.write_upstream")) {
    const port = slotPort(environment, deployment.previousSlot);
    cleanup.push({ name: `Point upstream back to ${deployment.previousSlot}`, action: "nginx.write_upstream", params: { slug: environment.slug, port } });
    cleanup.push({ name: "Reload nginx", action: "nginx.reload", params: {} });
  }
  if (ran("compose.up")) {
    cleanup.push({ name: `Stop failed ${deployment.slot}`, action: "compose.down", params: { slug: environment.slug, slot: deployment.slot, composePath: app.composePath } });
  }
  if (!cleanup.length) return;
  await createJob(db, {
    orgId: environment.orgId,
    serverId: environment.serverId,
    environmentId: environment.id,
    type: "deploy_cleanup",
    title: `Clean up failed deploy of ${app.name} / ${environment.name}`,
    meta: { failedJobId: job.id },
    steps: cleanup,
  });
  notifyServer(environment.serverId);
}

registerJobEffect("deploy", onDeployFinished);
registerJobEffect("rollback", onDeployFinished);
