import type { AgentConfig } from "./config.js";
import type { Runner } from "./exec.js";
import { ControlPlaneClient, HttpError, type AgentJob } from "./client.js";
import { runAction } from "./actions.js";
import { collectFacts } from "./facts.js";

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cancelled extends Error {}

/**
 * Runs one job's steps in order. Logs are buffered and sent at most once a
 * second. If the control plane answers 409 (job cancelled or timed out),
 * the job stops. The first failing step fails the job.
 */
export async function runJob(client: ControlPlaneClient, job: AgentJob, deps: { config: AgentConfig; runner: Runner }) {
  log("job claimed", { jobId: job.id, type: job.type, steps: job.steps.length });
  const steps = [...job.steps].sort((a, b) => a.position - b.position);
  for (const step of steps) {
    let buffer = "";
    let flushing: Promise<unknown> = Promise.resolve();
    const report = async (body: Parameters<ControlPlaneClient["reportStep"]>[2]) => {
      try {
        await client.reportStep(job.id, step.id, body);
      } catch (err) {
        if (err instanceof HttpError && (err.status === 409 || err.status === 404)) throw new Cancelled(err.message);
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
    const timer = setInterval(() => void flush().catch(() => undefined), 1000);
    try {
      await report({ status: "running" });
      const result = await runAction(step.action, step.params, {
        config: deps.config,
        runner: deps.runner,
        log: (chunk) => {
          buffer += chunk;
          if (buffer.length > 64 * 1024) void flush().catch(() => undefined);
        },
      });
      clearInterval(timer);
      await flush();
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

export async function runAgent(config: AgentConfig, runner: Runner) {
  const client = new ControlPlaneClient(config.controlPlaneUrl, config.token);
  log("inveon-agent started", { controlPlane: config.controlPlaneUrl, serverId: config.serverId });

  const beat = async () => {
    try {
      await client.heartbeat(await collectFacts(runner));
    } catch (err) {
      log("heartbeat failed", { error: String(err) });
    }
  };
  await beat();
  setInterval(beat, 30000).unref();

  let backoff = 1000;
  for (;;) {
    try {
      const job = await client.claim();
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
