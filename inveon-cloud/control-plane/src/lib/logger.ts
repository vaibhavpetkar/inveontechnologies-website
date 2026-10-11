import pino from "pino";

/** Structured logger. Never log secrets or tokens; log ids instead. */
export const logger = pino({
  level: process.env.INVEON_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token", "*.secret", "*.value"],
});
