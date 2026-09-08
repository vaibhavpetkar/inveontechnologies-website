import express, { type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { loadEnv } from "./modules/shared/env.js";
import { logger } from "./modules/shared/logger.js";
import { errorHandler } from "./modules/shared/errors.js";

const env = loadEnv();
const app = express();

app.use(
  pinoHttp({
    logger,
    genReqId: (req: Request, res: Response) => {
      const existing = req.headers["x-request-id"];
      const id = typeof existing === "string" ? existing : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
  }),
);

app.use(express.json());

// Liveness — process is up.
app.get("/api/v1/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness — process is up AND ready to serve (DB reachable etc).
// Phase 0: no DB wired yet, so readiness == liveness for now.
// Phase 1 must extend this to actually check the DB connection.
app.get("/api/v1/health/ready", (_req, res) => {
  res.json({ status: "ok", checks: { database: "not-configured-yet" } });
});

// Feature routes are mounted here starting in Phase 1:
// app.use("/api/v1/auth", authRouter);
// app.use("/api/v1/opportunities", opportunitiesRouter);
// etc.

app.use(errorHandler);

app.listen(env.PORTAL_PORT, () => {
  logger.info({ port: env.PORTAL_PORT, env: env.NODE_ENV }, "portal-backend listening");
});
