import { and, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { Env } from "../../env.js";
import { apps, backupConfigs, backups, deployments, environmentReplicas, environments, jobSteps, jobs, releases, servers, type RolloutState } from "../../db/schema.js";
import { ConflictError } from "../../lib/errors.js";
import { fetchFileAtCommit, fetchHeadCommit } from "../../lib/github.js";
import { parseReleaseCommand } from "../../lib/release-command.js";
import { logger } from "../../lib/logger.js";
import { createJob, notifyServer, registerJobEffect, type StepInput } from "../jobs/service.js";
import { backupConfigured, backupParams, newBackupRow, recordBackupStep } from "../backups/routes.js";
import { dashboardLink, emitAlert } from "../alerts/service.js";
import { repoReadToken } from "../github/service.js";
import { activeReplicas, environmentBusy, isPooled, listenerAllow, listenerStep, proxyIdOf, replicasOf, syncUpstream, type ReplicaWithServer } from "../replicas/pool.js";

type App = typeof apps.$inferSelect;
type Environment = typeof environments.$inferSelect;
type Release = typeof releases.$inferSelect;
export type Slot = "blue" | "green" | "main";

/** Finds or creates the release for a commit (fetching the compose file at that commit). */
export async function resolveRelease(
  db: Database,
  env: Env,
  app: App,
  input: { commitSha?: string; commitMessage?: string | null; source: Release["source"]; userId?: string | null },
): Promise<Release> {
  let sha = input.commitSha;
  let message = input.commitMessage ?? null;
  // A GitHub App installation token for this repo when there is one, else INVEON_GITHUB_TOKEN.
  const token = await repoReadToken(db, env, app);
  if (!sha) {
    const head = await fetchHeadCommit(env, app.repoOwner, app.repoName, app.branch, token);
    sha = head.sha;
    message = head.message;
  }
  const existing = await db.query.releases.findFirst({ where: and(eq(releases.appId, app.id), eq(releases.commitSha, sha)) });
  if (existing) return existing;
  const composeContent = await fetchFileAtCommit(env, app.repoOwner, app.repoName, app.composePath, sha, token);
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

/** Where a deploy runs when the environment has several servers (one job per replica). */
export interface DeployTarget {
  bluePort: number;
  greenPort: number;
  /** Only the primary runs the release command (and the backup before it). */
  primary: boolean;
  /** Stop the old colour in this job; a multi-server rollout stops it once every server is updated. */
  stopPrevious: boolean;
  /** nginx.write_listener for this replica, in a pooled environment. */
  listener: StepInput | null;
}

export interface DeployExtras {
  /** backup.create params for the live slot, taken before the release command. */
  backup?: Record<string, unknown> | null;
  target?: DeployTarget;
}

/** The colour a deploy starts next to `active`. */
export const nextSlot = (strategy: Environment["strategy"], active: Slot | null): Slot => (strategy === "recreate" ? "main" : active === "blue" ? "green" : "blue");

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
  const target = extras.target;
  const port = target ? (slot === "green" ? target.greenPort : target.bluePort) : slotPort(environment, slot);
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
  if (environment.releaseCommand && environment.releaseService && (target?.primary ?? true)) {
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
    ...(target?.listener ? [target.listener] : []),
    { name: "Reload nginx", action: "nginx.reload", params: {} },
  );
  if (previousSlot && previousSlot !== slot && (target?.stopPrevious ?? true)) {
    steps.push({ name: `Stop ${previousSlot}`, action: "compose.down", params: { slug: environment.slug, slot: previousSlot, composePath: app.composePath } });
  }
  return steps;
}

const replicaTarget = (r: Pick<ReplicaWithServer, "bluePort" | "greenPort" | "listenPort">, opts: { primary: boolean; stopPrevious: boolean; slug: string; allow: string[] | null }): DeployTarget => ({
  bluePort: r.bluePort,
  greenPort: r.greenPort,
  primary: opts.primary,
  stopPrevious: opts.stopPrevious,
  listener: opts.allow && r.listenPort ? listenerStep({ slug: opts.slug }, r.listenPort, opts.allow) : null,
});

/**
 * Starts a deploy or rollback. One server: one job, as always. Several
 * servers (or a separate proxy): a rollout, one job per active replica,
 * primary first; each server's health check gates the next, and if one
 * fails the servers already updated are rolled back.
 */
export async function createDeployment(
  db: Database,
  input: { environment: Environment; app: App; release: Release; kind: "deploy" | "rollback"; userId?: string | null },
) {
  const { environment, app, release, kind } = input;
  if (await environmentBusy(db, environment.id)) throw new ConflictError("A deploy or a server change is already running for this environment");

  const list = await replicasOf(db, environment);
  const plan = activeReplicas(list);
  const pooled = isPooled(environment, list) && plan[0]?.serverId === environment.serverId;
  const primary = plan[0];
  const previousSlot = (pooled ? primary.activeSlot : environment.activeSlot) ?? null;
  const slot = nextSlot(environment.strategy, previousSlot);
  const verb = kind === "rollback" ? "Roll back" : "Deploy";
  if (environment.releaseCommand) parseReleaseCommand(environment.releaseCommand);
  let target: DeployTarget | undefined;
  let rollout: RolloutState | null = null;
  if (pooled) {
    const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyIdOf(environment)) });
    const allow = proxy ? listenerAllow(proxy) : null;
    target = replicaTarget(primary, { primary: true, stopPrevious: plan.length === 1, slug: environment.slug, allow });
    rollout = { serverIds: plan.map((r) => r.serverId), done: [], previous: { [primary.serverId]: { slot: primary.activeSlot, releaseId: primary.currentReleaseId, newSlot: slot } } };
  }
  const where = plan.length > 1 ? ` on ${primary.server.name} (1/${plan.length})` : "";
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
      title: `${verb} ${app.name} / ${environment.name} to ${release.commitSha.slice(0, 7)}${where}`,
      createdBy: input.userId ?? null,
      steps: deploySteps(environment, app, release, slot, previousSlot, { backup: backupStep, target }),
    });
    const [deployment] = await tx
      .insert(deployments)
      .values({ environmentId: environment.id, releaseId: release.id, jobId: job.id, kind, slot, previousSlot, backupId: backup?.id ?? null, rollout, createdBy: input.userId ?? null })
      .returning();
    await tx.update(jobs).set({ meta: { deploymentId: deployment.id, releaseId: release.id, ...(backup ? { backupIds: [backup.id] } : {}) } }).where(eq(jobs.id, job.id));
    if (backup) await tx.update(backups).set({ jobId: job.id }).where(eq(backups.id, backup.id));
    return { job, deployment };
  });
  notifyServer(environment.serverId);
  return result;
}

type Deployment = typeof deployments.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Step = typeof jobSteps.$inferSelect;

const ran = (steps: Step[], action: string) => steps.some((s) => s.action === action && (s.status === "success" || s.status === "failure"));

/** The release command's output and the pre-deploy backup's outcome, from the job that ran them. */
async function releaseRecord(db: Database, deployment: Deployment, steps: Step[]): Promise<Partial<Deployment>> {
  const backupStep = steps.find((s) => s.action === "backup.create");
  if (deployment.backupId && backupStep) await recordBackupStep(db, deployment.backupId, backupStep);
  const releaseStep = steps.find((s) => s.action === "release.run");
  return releaseStep && ran(steps, "release.run") ? { releaseOutput: tail(releaseStep.log, RELEASE_OUTPUT_TAIL) } : {};
}

async function runFinishHooks(db: Database, environment: Environment, deployment: Deployment, job: Job) {
  for (const [name, hook] of finishHooks) {
    try {
      await hook(db, environment, deployment, job);
    } catch (err) {
      logger.error({ err, hook: name, environmentId: environment.id }, "Deploy hook failed");
    }
  }
}

/** Points the environment at the new release and runs the success hooks. */
async function switchEnvironment(db: Database, environment: Environment, deployment: Deployment, activeSlot: Slot) {
  const previous = environment.currentReleaseId && environment.currentReleaseId !== deployment.releaseId ? environment.currentReleaseId : environment.previousReleaseId;
  const [updated] = await db
    .update(environments)
    .set({ currentReleaseId: deployment.releaseId, previousReleaseId: previous, activeSlot })
    .where(eq(environments.id, environment.id))
    .returning();
  for (const [name, hook] of successHooks) {
    try {
      await hook(db, updated);
    } catch (err) {
      logger.error({ err, hook: name, environmentId: environment.id }, "Deploy hook failed");
    }
  }
  return updated;
}

const setReplica = (db: Database, environmentId: string, serverId: string, set: Partial<typeof environmentReplicas.$inferSelect>) =>
  db.update(environmentReplicas).set(set).where(and(eq(environmentReplicas.environmentId, environmentId), eq(environmentReplicas.serverId, serverId)));

/** When a deploy job ends: record the outcome; on success switch the environment's current release. */
async function onDeployFinished(db: Database, job: Job, steps: Step[]) {
  const deploymentId = String(job.meta.deploymentId ?? "");
  const deployment = await db.query.deployments.findFirst({ where: eq(deployments.id, deploymentId) });
  if (!deployment) return;
  const environment = await db.query.environments.findFirst({ where: eq(environments.id, deployment.environmentId) });
  if (deployment.rollout) {
    if (environment) await onRolloutJob(db, job, steps, environment, deployment, deployment.rollout);
    return;
  }
  const record = await releaseRecord(db, deployment, steps);
  await db
    .update(deployments)
    .set({ status: job.status, error: job.status === "success" ? null : job.error, releaseOutput: record.releaseOutput ?? null, finishedAt: new Date() })
    .where(eq(deployments.id, deployment.id));
  if (!environment) return;
  await alertDeployOutcome(db, job, environment, deployment);
  await runFinishHooks(db, environment, deployment, job);
  if (job.status !== "success") {
    await cleanUpFailedDeploy(db, job, steps, environment, {
      serverId: environment.serverId,
      slot: deployment.slot,
      previousSlot: deployment.previousSlot,
      previousPort: deployment.previousSlot ? slotPort(environment, deployment.previousSlot) : null,
    });
    return;
  }
  await setReplica(db, environment.id, environment.serverId, { activeSlot: deployment.slot, currentReleaseId: deployment.releaseId });
  await switchEnvironment(db, environment, deployment, deployment.slot);
}

// ---------------------------------------------------------------- multi-server rollouts

const label = (app: App, environment: Environment) => `${app.name} / ${environment.name}`;

/**
 * Queues the deploy job for the next active replica after `from`. Returns
 * the updated rollout, or null when no replica is left to update.
 */
async function startNextServer(db: Database, environment: Environment, deployment: Deployment, rollout: RolloutState, from: number, createdBy: string | null) {
  const list = await replicasOf(db, environment);
  for (let i = from; i < rollout.serverIds.length; i++) {
    const r = list.find((x) => x.serverId === rollout.serverIds[i] && x.status === "active");
    if (!r) continue; // removed meanwhile
    const [app, release, proxy] = await Promise.all([
      db.query.apps.findFirst({ where: eq(apps.id, environment.appId) }),
      db.query.releases.findFirst({ where: eq(releases.id, deployment.releaseId) }),
      db.query.servers.findFirst({ where: eq(servers.id, proxyIdOf(environment)) }),
    ]);
    if (!app || !release || !proxy) throw new Error("App, release or proxy missing");
    const slot = nextSlot(environment.strategy, r.activeSlot);
    const target = replicaTarget(r, { primary: false, stopPrevious: false, slug: environment.slug, allow: listenerAllow(proxy) });
    const verb = deployment.kind === "rollback" ? "Roll back" : "Deploy";
    const job = await createJob(db, {
      orgId: environment.orgId,
      serverId: r.serverId,
      environmentId: environment.id,
      type: deployment.kind,
      title: `${verb} ${label(app, environment)} to ${release.commitSha.slice(0, 7)} on ${r.server.name} (${i + 1}/${rollout.serverIds.length})`,
      createdBy,
      meta: { deploymentId: deployment.id, releaseId: release.id },
      steps: deploySteps(environment, app, release, slot, r.activeSlot, { target }),
    });
    notifyServer(r.serverId);
    return { ...rollout, previous: { ...rollout.previous, [r.serverId]: { slot: r.activeSlot, releaseId: r.currentReleaseId, newSlot: slot } } };
  }
  return null;
}

async function onRolloutJob(db: Database, job: Job, steps: Step[], environment: Environment, deployment: Deployment, rollout: RolloutState) {
  const serverId = job.serverId;
  const index = rollout.serverIds.indexOf(serverId);
  const mine = rollout.previous[serverId];
  if (index < 0 || !mine) return;
  const record = await releaseRecord(db, deployment, steps);

  if (job.status !== "success") {
    const replica = await db.query.environmentReplicas.findFirst({ where: and(eq(environmentReplicas.environmentId, environment.id), eq(environmentReplicas.serverId, serverId)) });
    if (replica) {
      await cleanUpFailedDeploy(db, job, steps, environment, {
        serverId,
        slot: mine.newSlot,
        previousSlot: mine.slot,
        previousPort: mine.slot ? (mine.slot === "green" ? replica.greenPort : replica.bluePort) : null,
      });
    }
    await failRollout(db, job, environment, deployment, { ...rollout, failedServerId: serverId }, job.error ?? "Deploy failed", record);
    return;
  }

  await setReplica(db, environment.id, serverId, { activeSlot: mine.newSlot, currentReleaseId: deployment.releaseId });
  let state: RolloutState = { ...rollout, done: [...rollout.done, serverId] };
  try {
    const next = await startNextServer(db, environment, deployment, state, index + 1, job.createdBy);
    if (next) {
      await db.update(deployments).set({ ...record, status: "running", rollout: next }).where(eq(deployments.id, deployment.id));
      return;
    }
  } catch (err) {
    const failed = state.serverIds[index + 1] ?? null;
    await failRollout(db, job, environment, deployment, { ...state, failedServerId: failed }, `Could not start the deploy on the next server: ${(err as Error).message}`, record);
    return;
  }

  // Every server is on the new release.
  const [done] = await db.update(deployments).set({ ...record, status: "success", error: null, rollout: state, finishedAt: new Date() }).where(eq(deployments.id, deployment.id)).returning();
  await alertDeployOutcome(db, job, environment, done);
  await runFinishHooks(db, environment, done, job);
  const updated = await switchEnvironment(db, environment, done, state.previous[environment.serverId]?.newSlot ?? deployment.slot);
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (!app) return;
  // The old colours were kept running so the rollout could be undone; stop them now.
  if (state.serverIds.length > 1) {
    for (const id of state.done) {
      const p = state.previous[id];
      if (!p?.slot || p.slot === p.newSlot) continue;
      await createJob(db, {
        orgId: environment.orgId,
        serverId: id,
        environmentId: environment.id,
        type: "rollout_finish",
        title: `Stop ${p.slot} of ${label(app, environment)}`,
        steps: [{ name: `Stop ${p.slot}`, action: "compose.down", params: { slug: environment.slug, slot: p.slot, composePath: app.composePath } }],
      });
      notifyServer(id);
    }
  }
  // A server deployed for the first time joins the proxy's pool.
  if (state.done.some((id) => !state.previous[id]?.slot)) {
    try {
      await syncUpstream(db, updated, label(app, environment));
    } catch (err) {
      logger.error({ err, environmentId: environment.id }, "Pool update after the rollout failed");
    }
  }
}

/** One server failed: the deployment fails and the servers already updated go back to what they ran. */
async function failRollout(db: Database, job: Job, environment: Environment, deployment: Deployment, state: RolloutState, error: string, record: Partial<Deployment>) {
  const failedServer = state.failedServerId ? await db.query.servers.findFirst({ where: eq(servers.id, state.failedServerId), columns: { name: true } }) : null;
  const message = `${failedServer ? `${failedServer.name}: ` : ""}${error}`.slice(0, 2000);
  const [failed] = await db
    .update(deployments)
    .set({ ...record, status: job.status === "cancelled" ? "cancelled" : "failure", error: message, rollout: state, finishedAt: new Date() })
    .where(eq(deployments.id, deployment.id))
    .returning();
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (app && state.done.length) {
    const list = await replicasOf(db, environment);
    const proxy = await db.query.servers.findFirst({ where: eq(servers.id, proxyIdOf(environment)) });
    for (const id of [...state.done].reverse()) {
      const p = state.previous[id];
      const r = list.find((x) => x.serverId === id);
      if (!p || !r) continue;
      let steps: StepInput[];
      if (p.newSlot === "main") {
        const previousRelease = p.releaseId ? await db.query.releases.findFirst({ where: eq(releases.id, p.releaseId) }) : null;
        steps = previousRelease
          ? deploySteps(environment, app, previousRelease, "main", "main", { target: replicaTarget(r, { primary: false, stopPrevious: false, slug: environment.slug, allow: proxy ? listenerAllow(proxy) : null }) })
          : [{ name: "Stop containers", action: "compose.down", params: { slug: environment.slug, slot: "main", composePath: app.composePath } }];
      } else if (p.slot && p.slot !== p.newSlot) {
        steps = [
          { name: `Point upstream back to ${p.slot}`, action: "nginx.write_upstream", params: { slug: environment.slug, port: p.slot === "green" ? r.greenPort : r.bluePort } },
          { name: "Reload nginx", action: "nginx.reload", params: {} },
          { name: `Stop ${p.newSlot}`, action: "compose.down", params: { slug: environment.slug, slot: p.newSlot, composePath: app.composePath } },
        ];
      } else {
        steps = [{ name: `Stop ${p.newSlot}`, action: "compose.down", params: { slug: environment.slug, slot: p.newSlot, composePath: app.composePath } }];
      }
      await createJob(db, {
        orgId: environment.orgId,
        serverId: id,
        environmentId: environment.id,
        type: "rollout_revert",
        title: `Roll back ${label(app, environment)} on ${r.server.name}`,
        meta: { deploymentId: deployment.id, failedJobId: job.id },
        steps,
      });
      await setReplica(db, environment.id, id, { activeSlot: p.slot, currentReleaseId: p.releaseId });
      notifyServer(id);
    }
  }
  await alertDeployOutcome(db, { ...job, status: "failure", error: message }, environment, failed, state.done.length ? `${state.done.length} server${state.done.length === 1 ? " that was" : "s that were"} already updated are being rolled back.` : null);
  await runFinishHooks(db, environment, failed, { ...job, status: "failure", error: message });
}

async function alertDeployOutcome(db: Database, job: Job, environment: Environment, deployment: Deployment, note: string | null = null) {
  if (job.status !== "success" && job.status !== "failure") return;
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  const release = await db.query.releases.findFirst({ where: eq(releases.id, deployment.releaseId), columns: { commitSha: true, commitMessage: true } });
  if (!app || !release) return;
  const label = `${app.name} / ${environment.name}`;
  const verb = deployment.kind === "rollback" ? "Rollback" : "Deploy";
  const sha = release.commitSha.slice(0, 7);
  const details = { app: app.name, environment: environment.name, commit: sha, message: release.commitMessage?.split("\n")[0]?.slice(0, 120) ?? null };
  const url = dashboardLink(`/apps/${app.id}?env=${environment.id}`);
  if (job.status === "failure") {
    await emitAlert(db, environment.orgId, "deploy.failed", {
      title: `${verb} failed: ${label}`,
      text: `${verb} of ${sha} to ${label} failed. The live release was not changed.${note ? ` ${note}` : ""}${job.error ? `\n${job.error.slice(0, 500)}` : ""}`,
      severity: "critical",
      url,
      details,
    });
  } else {
    await emitAlert(db, environment.orgId, "deploy.succeeded", { title: `${verb} succeeded: ${label}`, text: `${sha} is live on ${label}.`, severity: "info", url, details });
  }
}

type FinishHook = (db: Database, environment: Environment, deployment: typeof deployments.$inferSelect, job: typeof jobs.$inferSelect) => Promise<void>;
const finishHooks = new Map<string, FinishHook>();

/** Runs after every deploy or rollback, whatever the outcome (job.status), before the environment is switched. */
export function onDeployDone(name: string, fn: FinishHook) {
  finishHooks.set(name, fn);
}

type SuccessHook = (db: Database, environment: Environment) => Promise<void>;
const successHooks = new Map<string, SuccessHook>();

/** Runs after a deploy or rollback succeeds and the environment points at the new release. */
export function onDeploySucceeded(name: string, fn: SuccessHook) {
  successHooks.set(name, fn);
}

/**
 * A failed blue/green deploy must leave the live colour serving: point the
 * upstream back if it was touched, and stop the half-started new colour.
 */
async function cleanUpFailedDeploy(
  db: Database,
  job: Job,
  steps: Step[],
  environment: Environment,
  where: { serverId: string; slot: Slot; previousSlot: Slot | null; previousPort: number | null },
) {
  if (where.slot === "main" || !where.previousSlot || where.previousSlot === where.slot) return;
  const app = await db.query.apps.findFirst({ where: eq(apps.id, environment.appId) });
  if (!app) return;
  const cleanup: StepInput[] = [];
  if (ran(steps, "nginx.write_upstream") && where.previousPort) {
    cleanup.push({ name: `Point upstream back to ${where.previousSlot}`, action: "nginx.write_upstream", params: { slug: environment.slug, port: where.previousPort } });
    cleanup.push({ name: "Reload nginx", action: "nginx.reload", params: {} });
  }
  // `compose run` may have started the new colour's dependencies too.
  if (ran(steps, "compose.up") || ran(steps, "release.run")) {
    cleanup.push({ name: `Stop failed ${where.slot}`, action: "compose.down", params: { slug: environment.slug, slot: where.slot, composePath: app.composePath } });
  }
  if (!cleanup.length) return;
  await createJob(db, {
    orgId: environment.orgId,
    serverId: where.serverId,
    environmentId: environment.id,
    type: "deploy_cleanup",
    title: `Clean up failed deploy of ${app.name} / ${environment.name}`,
    meta: { failedJobId: job.id },
    steps: cleanup,
  });
  notifyServer(where.serverId);
}

function tail(log: string, max: number) {
  return log.length > max ? "[…]\n" + log.slice(-max) : log;
}

registerJobEffect("deploy", onDeployFinished);
registerJobEffect("rollback", onDeployFinished);
