import "dotenv/config";
import "express-async-errors";
import express from "express";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { loadEnv } from "./modules/shared/env.js";
import { logger } from "./modules/shared/logger.js";
import { errorHandler } from "./modules/shared/errors.js";
import { createDb } from "./modules/shared/db/client.js";
import { authRouter } from "./modules/auth/routes.js";
import { opportunitiesRouter } from "./modules/opportunities/routes.js";
import { profileRouter } from "./modules/profile/routes.js";
import { applicationsRouter } from "./modules/applications/routes.js";
import { assessmentsRouter } from "./modules/assessments/routes.js";
import { attemptRouter } from "./modules/assessments/attempt-routes.js";
import { documentsRouter } from "./modules/recruitment/documents-routes.js";
import { interviewsRouter } from "./modules/recruitment/interviews-routes.js";
import { offersRouter } from "./modules/recruitment/offers-routes.js";
import { onboardingRouter } from "./modules/recruitment/onboarding-routes.js";
import { coursesRouter, lessonsRouter } from "./modules/courses/routes.js";
import { certificateTemplatesRouter, certificatesRouter, courseCertificateIssueRouter } from "./modules/certificates/routes.js";
import { employeesRouter } from "./modules/employees/routes.js";
import { letterTemplatesRouter, employeeLettersRouter } from "./modules/employees/letters-routes.js";
import { projectsRouter } from "./modules/projects/routes.js";
import { tasksRouter } from "./modules/tasks/routes.js";
import { communitiesRouter } from "./modules/chat/communities-routes.js";
import { conversationsRouter } from "./modules/chat/conversations-routes.js";
import { messagesRouter } from "./modules/chat/messages-routes.js";
import { presenceRouter } from "./modules/chat/presence-routes.js";
import { reportsRouter } from "./modules/reports/routes.js";
import { featureFlagsRouter, notificationPreferencesRouter, bulkActionsRouter } from "./modules/admin/routes.js";
import { usersRouter } from "./modules/admin/users-routes.js";
import { configureMailer } from "./modules/shared/mailer.js";

const env = loadEnv();
const { db, pool } = createDb(env);
configureMailer(env);
const app = express();
// Behind nginx (and Cloudflare in front of that) — trust exactly one hop
// so req.ip and X-Forwarded-For-based rate limiting resolve to the real
// client IP instead of nginx's. Without this, express-rate-limit refuses
// to trust X-Forwarded-For at all and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR (seen in production logs).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers["x-request-id"];
      const id = typeof existing === "string" ? existing : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
  }),
);

app.use((req, res, next) => {
  // CORS. Credentialed (cookies for refresh token) so origin must be
  // explicit — never "*" when credentials are allowed.
  res.setHeader("Access-Control-Allow-Origin", env.PORTAL_CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

app.get("/api/v1/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/v1/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", checks: { database: "up" } });
  } catch {
    res.status(503).json({ status: "degraded", checks: { database: "down" } });
  }
});

app.use("/api/v1/auth", authRouter(db, env));
app.use("/api/v1/opportunities", opportunitiesRouter(db, env));
app.use("/api/v1/profile", profileRouter(db, env));
app.use("/api/v1/applications", applicationsRouter(db, env));
app.use("/api/v1/assessments", assessmentsRouter(db, env));
app.use("/api/v1/assessment-attempts", attemptRouter(db, env));
app.use("/api/v1", documentsRouter(db, env));
app.use("/api/v1", interviewsRouter(db, env));
app.use("/api/v1", offersRouter(db, env));
app.use("/api/v1", onboardingRouter(db, env));
app.use("/api/v1/courses", coursesRouter(db, env));
app.use("/api/v1/courses", courseCertificateIssueRouter(db, env));
app.use("/api/v1/lessons", lessonsRouter(db, env));
app.use("/api/v1/certificate-templates", certificateTemplatesRouter(db, env));
app.use("/api/v1/certificates", certificatesRouter(db, env));
app.use("/api/v1/employees", employeesRouter(db, env));
app.use("/api/v1/letter-templates", letterTemplatesRouter(db, env));
app.use("/api/v1", employeeLettersRouter(db, env));
app.use("/api/v1/projects", projectsRouter(db, env));
app.use("/api/v1/tasks", tasksRouter(db, env));
app.use("/api/v1/communities", communitiesRouter(db, env));
app.use("/api/v1/conversations", conversationsRouter(db, env));
app.use("/api/v1/messages", messagesRouter(db, env));
app.use("/api/v1/presence", presenceRouter(db, env));
app.use("/api/v1/reports", reportsRouter(db, env));
app.use("/api/v1/feature-flags", featureFlagsRouter(db, env));
app.use("/api/v1/notification-preferences", notificationPreferencesRouter(db, env));
app.use("/api/v1/bulk", bulkActionsRouter(db, env));
app.use("/api/v1/users", usersRouter(db, env));

// Future feature routes mount here:
// app.use("/api/v1/employees", employeesRouter(db, env));
// etc.

app.use(errorHandler);

app.listen(env.PORTAL_PORT, () => {
  logger.info({ port: env.PORTAL_PORT, env: env.NODE_ENV }, "portal-backend listening");
});
