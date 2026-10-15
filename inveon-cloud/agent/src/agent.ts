import { saveConfig, type AgentConfig } from "./config.js";
import type { Runner } from "./exec.js";
import { ControlPlaneClient, HttpError, type AgentJob } from "./client.js";
import { STREAMING_ACTIONS, runAction } from "./actions.js";
import { collectFacts } from "./facts.js";
import { MetricsBuffer, MetricsSampler, SAMPLE_INTERVAL_MS } from "./metrics.js";
import { defaultKeyPath, loadOrCreateSigningKey, type RequestSigner } from "./signing.js";

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}

export interface RunJobDeps {
  config: AgentConfig;
  runner: Runner;
  /** How often buffered output is sent (ms). */
  flushMs?: number;
  /** Streaming steps check in this often even when quiet, to notice a cancel (ms). */
  keepaliveMs?: number;
}

/**
 * Runs one job's steps in order. Logs are buffered and sent at most once a
 * second. If the control plane answers 409 (job cancelled or timed out),
 * the job stops, and a streaming step (live logs) is aborted right away.
 * The first failing step fails the job.
 */
export async function runJob(client: ControlPlaneClient, job: AgentJob, deps: RunJobDeps) {
  log("job claimed", { jobId: job.id, type: job.type, steps: job.steps.length });
  const steps = [...job.steps].sort((a, b) => a.position - b.position);
  for (const step of steps) {
    let buffer = "";
    let flushing: Promise<unknown> = Promise.resolve();
    let lastSent = Date.now();
    const controller = new AbortController();
    const streaming = STREAMING_ACTIONS.has(step.action);
    const report = async (body: Parameters<ControlPlaneClient["reportStep"]>[2]) => {
      try {
        lastSent = Date.now();
        await client.reportStep(job.id, step.id, body);
      } catch (err) {
        if (err instanceof HttpError && (err.status === 409 || err.status === 404)) {
          controller.abort();
          throw new Cancelled(err.message);
        }
        throw err;
      }
    };
    const flush = () => {
      if (!buffer) return flushing;
      const chunk = buffer;
      buffer = "";
      flushing = flushing.then(() => report({ append: chunk }));
      return flushing;
    };
    const keepaliveMs = deps.keepaliveMs ?? 5000;
    const tick = () => {
      if (buffer) return flush();
      if (streaming && Date.now() - lastSent >= keepaliveMs) flushing = flushing.then(() => report({}));
      return flushing;
    };
    const timer = setInterval(() => void tick().catch(() => undefined), deps.flushMs ?? 1000);
    try {
      await report({ status: "running" });
      const result = await runAction(step.action, step.params, {
        config: deps.config,
        runner: deps.runner,
        signal: controller.signal,
        log: (chunk) => {
          buffer += chunk;
          if (buffer.length > 64 * 1024) void flush().catch(() => undefined);
        },
      });
      clearInterval(timer);
      await flush();
      if (controller.signal.aborted) throw new Cancelled("Job cancelled");
      await report({ status: "success", result: result ?? undefined });
    } catch (err) {
      clearInterval(timer);
      if (err instanceof Cancelled) {
        log("job cancelled by the control plane", { jobId: job.id });
        return "cancelled";
      }
      const message = err instanceof Error ? err.message : String(err);
      buffer += `\nERROR: ${message}\n`;
      try {
        await flush();
        await report({ status: "failure" });
        await client.finish(job.id, "failure", `${step.name}: ${message}`);
      } catch (e) {
        log("could not report failure", { jobId: job.id, error: String(e) });
      }
      log("job failed", { jobId: job.id, step: step.name, error: message });
      return "failure";
    }
  }
  await client.finish(job.id, "success");
  log("job finished", { jobId: job.id });
  return "success";
}

/** Live log streams run on their own lane, next to deploys, a few at a time. */
export const MAX_STREAMS = 4;
let streamLaneSupported = false;
/** Set once the control plane's heartbeat says it stores metrics (older ones answer 404). */
let metricsSupported = false;

async function streamLane(client: ControlPlaneClient, config: AgentConfig, runner: Runner) {
  let active = 0;
  let backoff = 1000;
  for (;;) {
    // Only claim on this lane once the control plane says it keeps the lanes
    // apart; an older one would hand out any job here and run it twice as fast.
    if (!streamLaneSupported || active >= MAX_STREAMS) {
      await sleep(1000);
      continue;
    }
    try {
      const job = await client.claim("stream");
      backoff = 1000;
      if (job) {
        active++;
        void runJob(client, job, { config, runner })
          .catch((err) => log("stream job failed", { jobId: job.id, error: String(err) }))
          .finally(() => active--);
      }
    } catch (err) {
      log("stream claim failed", { error: String(err) });
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

/**
 * Samples host metrics every 30 seconds and sends what is buffered. A
 * failed send keeps the samples (up to an hour) for the next round.
 */
function startMetrics(client: ControlPlaneClient, runner: Runner) {
  const sampler = new MetricsSampler({ runner });
  const buffer = new MetricsBuffer();
  let busy = false;
  const round = async () => {
    if (busy) return;
    busy = true;
    try {
      buffer.push(await sampler.sample());
      if (metricsSupported) await buffer.flush(client);
    } catch (err) {
      log("sending metrics failed; will retry", { error: String(err), buffered: buffer.samples.length });
    } finally {
      busy = false;
    }
  };
  // The first sample only primes the CPU and network counters.
  void round();
  setInterval(() => void round(), SAMPLE_INTERVAL_MS).unref();
}

/**
 * An agent installed before request signing makes its key on the first
 * start after the upgrade and enrols it (POST /signing-key); until the
 * control plane has it, enrolment is retried with every heartbeat. A
 * control plane from before signing answers 404 and ignores the headers.
 */
export async function enrolSigningKey(client: ControlPlaneClient, signer: RequestSigner, config: AgentConfig, configPath: string | null) {
  if (config.signingKeyRegistered) return true;
  try {
    await client.registerSigningKey(signer.publicKey());
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return false;
    log("could not register the signing key; will retry", { error: String(err) });
    return false;
  }
  config.signingKeyRegistered = true;
  if (configPath) saveConfig(configPath, config);
  log("request signing key registered", {});
  return true;
}

export async function runAgent(config: AgentConfig, runner: Runner, opts: { configPath?: string } = {}) {
  const configPath = opts.configPath ?? null;
  const { signer, created } = loadOrCreateSigningKey(config.signingKeyPath ?? defaultKeyPath(configPath ?? "/etc/inveon-agent/config.json"));
  // A new key file means whatever the config says about an older one is stale.
  if (created) config.signingKeyRegistered = false;
  const client = new ControlPlaneClient(config.controlPlaneUrl, config.token, signer);
  log("inveon-agent started", { controlPlane: config.controlPlaneUrl, serverId: config.serverId });
  await enrolSigningKey(client, signer, config, configPath);

  const beat = async () => {
    try {
      await enrolSigningKey(client, signer, config, configPath);
      const res = (await client.heartbeat(await collectFacts(runner))) as { features?: unknown } | null;
      if (Array.isArray(res?.features) && res.features.includes("stream_lane")) streamLaneSupported = true;
      if (Array.isArray(res?.features) && res.features.includes("metrics")) metricsSupported = true;
    } catch (err) {
      log("heartbeat failed", { error: String(err) });
    }
  };
  await beat();
  setInterval(beat, 30000).unref();

  void streamLane(client, config, runner);
  startMetrics(client, runner);

  let backoff = 1000;
  for (;;) {
    try {
      const job = await client.claim("main");
      backoff = 1000;
      if (job) await runJob(client, job, { config, runner });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) log("the control plane rejected this agent's token; re-install the agent", {});
      else log("claim failed", { error: String(err) });
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}
