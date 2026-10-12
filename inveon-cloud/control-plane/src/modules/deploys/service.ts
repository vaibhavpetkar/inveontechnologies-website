import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, backupConfigs, backups, deployments, environments, jobSteps, jobs, releases } from "../../db/schema.js";
import { ConflictError } from "../../lib/errors.js";
import { fetchFileAtCommit, fetchHeadCommit } from "../../lib/github.js";
import { parseReleaseCommand } from "../../lib/release-command.js";
import { createJob, notifyServer, registerJobEffect, type StepInput } from "../jobs/service.js";
import { backupConfigured, backupParams, newBackupRow, recordBackupStep } from "../backups/routes.js";

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

/** Images built on the server live in their own local namespace, tagged with the commit. */
export function builtImageName(app: App, commitSha: string) {
  return `inveon-build/${app.slug}-${app.id.slice(0, 8)}:${commitSha}`;
}

export function slotPort(environment: Environment, slot: Slot) {
  return slot === "green" ? environment.greenPort : environment.bluePort;
}

export const RELEASE_COMMAND_TIMEOUT_SEC = 30 * 60;
/** How much of the release command's output is kept on the deployment. */
const RELEASE_OUTPUT_TAIL = 16 * 1024;

export interface DeployExtras {
  /** backup.create params for the live slot, taken before the release command. */
  backup?: Record<string, unknown> | null;
}

/**
 * The deploy plan. Blue/green: prepare and start the idle colour next to the
 * live one, wait for its health check, point the nginx upstream at it,
 * reload, then stop the old colour. Recreate: same steps on one project.
 *
 * With a release command: back up the database (when backups are set up and
 * something is live), then run the command in a one-off container of the new
 * release, before anything is started or switched. If it fails, the job stops
 * there and the live release is untouched.
 */
export function deploySteps(environment: Environment, app: App, release: Release, slot: Slot, previousSlot: Slot | null, extras: DeployExtras = {}): StepInput[] {
  const base = { slug: environment.slug, slot, composePath: app.composePath };
  const port = slotPort(environment, slot);
  const steps: StepInput[] = [];
  // No CI image: clone the commit and build it here first. Credentials (deploy
  // key, registry login) are added when the agent claims the job.
  const image = app.buildOnServer ? builtImageName(app, release.commitSha) : null;
  if (image) {
    steps.push({
      name: `Build image ${release.commitSha.slice(0, 7)}`,
      action: "image.build",
      params: {
        environmentId: environment.id,
        repoOwner: app.repoOwner,
        repoName: app.repoName,
        commitSha: release.commitSha,
        dockerfilePath: app.dockerfilePath,
        context: app.buildContext,
        image,
      },
    });
  }
  steps.push(
    {
      name: `Prepare release ${release.commitSha.slice(0, 7)}`,
      action: "release.prepare",
      params: { ...base, releaseId: release.id, environmentId: environment.id, commitSha: release.commitSha, port, ...(image ? { builtImage: image } : {}) },
    },
    { name: "Validate compose file", action: "compose.validate", params: base },
    // A built image is only local, so only pull what is missing.
    { name: "Pull images", action: "compose.pull", params: { ...base, environmentId: environment.id, missingOnly: !!image } },
  );
  if (environment.releaseCommand && environment.releaseService) {
    if (extras.backup) steps.push({ name: "Back up before the release command", action: "backup.create", params: extras.backup });
    steps.push({
      name: `Release command: ${environment.releaseCommand.slice(0, 80)}`,
      action: "release.run",
      params: { ...base, service: environment.releaseService, command: parseReleaseCommand(environment.releaseCommand), timeoutSec: RELEASE_COMMAND_TIMEOUT_SEC },
    });
  }
  steps.push(
    { name: slot === "main" ? "Start containers" : `Start ${slot}`, action: "compose.up", params: base },
    { name: "Health check", action: "health.check", params: { port, path: environment.healthPath, retries: 20, intervalSec: 3 } },
    { name: "Switch nginx upstream", action: "nginx.write_upstream", params: { slug: environment.slug, port } },
    { name: "Reload nginx", action: "nginx.reload", params: {} },
  );
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
  if (environment.releaseCommand) parseReleaseCommand(environment.releaseCommand);
  const result = await db.transaction(async (tx) => {
    // Back up first, but only if a release command will run, something is
    // live to back up, and backups are set up for this environment.
    let backup: Awaited<ReturnType<typeof newBackupRow>> | null = null;
    let backupStep: Record<string, unknown> | null = null;
    if (environment.releaseCommand && environment.releaseService && environment.activeSlot) {
      const cfg = await tx.query.backupConfigs.findFirst({ where: eq(backupConfigs.environmentId, environment.id) });
      if (backupConfigured(cfg)) {
        backup = await newBackupRow(tx, environment, cfg, "pre_deploy", input.userId ?? null);
        backupStep = backupParams(environment, app, cfg, backup);
      }
    }
    const job = await createJob(tx, {
      orgId: environment.orgId,
      serverId: environment.serverId,
      environmentId: environment.id,
      type: kind,
      title: `${verb} ${app.name} / ${environment.name} to ${release.commitSha.slice(0, 7)}`,
      createdBy: input.userId ?? null,
      steps: deploySteps(environment, app, release, slot, previousSlot, { backup: backupStep }),
    });
    const [deployment] = await tx
      .insert(deployments)
      .values({ environmentId: environment.id, releaseId: release.id, jobId: job.id, kind, slot, previousSlot, backupId: backup?.id ?? null, createdBy: input.userId ?? null })
      .returning();
    await tx.update(jobs).set({ meta: { deploymentId: deployment.id, releaseId: release.id, ...(backup ? { backupIds: [backup.id] } : {}) } }).where(eq(jobs.id, job.id));
    if (backup) await tx.update(backups).set({ jobId: job.id }).where(eq(backups.id, backup.id));
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
  const releaseStep = steps.find((s) => s.action === "release.run");
  const ranRelease = releaseStep && (releaseStep.status === "success" || releaseStep.status === "failure");
  await db
    .update(deployments)
    .set({
      status: job.status,
      error: job.status === "success" ? null : job.error,
      releaseOutput: ranRelease ? tail(releaseStep.log, RELEASE_OUTPUT_TAIL) : null,
      finishedAt: new Date(),
    })
    .where(eq(deployments.id, deployment.id));
  const backupStep = steps.find((s) => s.action === "backup.create");
  if (deployment.backupId && backupStep) await recordBackupStep(db, deployment.backupId, backupStep);
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
  // `compose run` may have started the new colour's dependencies too.
  if (ran("compose.up") || ran("release.run")) {
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

function tail(log: string, max: number) {
  return log.length > max ? "[…]\n" + log.slice(-max) : log;
}

registerJobEffect("deploy", onDeployFinished);
registerJobEffect("rollback", onDeployFinished);
