import pino from "pino";

/**
 * Structured logger. In Phase 1+, request-scoped child loggers carry a
 * requestId (see pino-http binding in index.ts) so every log line for a
 * request can be correlated. Never log secrets, tokens, or full personal
 * data payloads — log identifiers (user id) instead of raw PII.
 */
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
});
