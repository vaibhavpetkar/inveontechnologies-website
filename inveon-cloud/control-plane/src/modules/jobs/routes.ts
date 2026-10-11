import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { jobs, servers } from "../../db/schema.js";
import { requireRole } from "../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { ConflictError } from "../../lib/errors.js";
import { bus, jobEvent, type JobStreamEvent } from "../../lib/bus.js";
import { cancelJob, getJob, TERMINAL, type JobStatus } from "./service.js";

export function jobsRouter(db: Database) {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res) => {
    const q = z
      .object({
        environmentId: z.string().uuid().optional(),
        serverId: z.string().uuid().optional(),
        status: z.enum(["pending", "running", "success", "failure", "cancelled"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);
    const where: SQL[] = [eq(jobs.orgId, req.member!.orgId)];
    if (q.environmentId) where.push(eq(jobs.environmentId, q.environmentId));
    if (q.serverId) where.push(eq(jobs.serverId, q.serverId));
    if (q.status) where.push(eq(jobs.status, q.status));
    const rows = await db
      .select({ job: jobs, serverName: servers.name })
      .from(jobs)
      .innerJoin(servers, eq(servers.id, jobs.serverId))
      .where(and(...where))
      .orderBy(desc(jobs.createdAt))
      .limit(q.limit);
    res.json({ jobs: rows.map((r) => ({ ...r.job, serverName: r.serverName })) });
  });

  router.get("/:jobId", async (req, res) => {
    const { job, steps } = await getJob(db, req.params.jobId, req.member!.orgId);
    res.json({ job, steps });
  });

  router.post("/:jobId/cancel", requireRole("developer"), async (req, res) => {
    const { job } = await getJob(db, req.params.jobId, req.member!.orgId);
    if (TERMINAL.includes(job.status as JobStatus)) throw new ConflictError(`Job is already ${job.status}`);
    const updated = await cancelJob(db, job.id);
    await audit(db, req, "job.cancel", "job", job.id);
    res.json({ job: updated });
  });

  /**
   * Live job view (Server-Sent Events). Sends a snapshot (job + steps with
   * logs), then step changes and log chunks until the job ends. The
   * dashboard reads it with fetch() so the bearer token stays in a header.
   */
  router.get("/:jobId/stream", async (req, res) => {
    const { job, steps } = await getJob(db, req.params.jobId, req.member!.orgId);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("snapshot", { job, steps });
    if (TERMINAL.includes(job.status as JobStatus)) {
      res.end();
      return;
    }
    const listener = (e: JobStreamEvent) => {
      send(e.type, e);
      if (e.type === "job" && TERMINAL.includes(e.job.status as JobStatus)) cleanup(true);
    };
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    const cleanup = (end: boolean) => {
      clearInterval(ping);
      bus.off(jobEvent(job.id), listener);
      if (end) res.end();
    };
    bus.on(jobEvent(job.id), listener);
    req.on("close", () => cleanup(false));
  });

  return router;
}
