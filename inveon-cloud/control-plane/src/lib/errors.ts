import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logger } from "./logger.js";

/** Expected, client-facing errors. Anything else becomes a logged 500. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

const PG_CLIENT_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  "22P02": { status: 400, code: "INVALID_INPUT", message: "Invalid identifier or value in request" },
  "23503": { status: 400, code: "INVALID_REFERENCE", message: "A referenced record does not exist" },
  "23505": { status: 409, code: "CONFLICT", message: "This record already exists" },
};

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as Request & { id?: string }).id ?? randomUUID();
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", requestId, details: err.flatten().fieldErrors } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.too.large") {
    res.status(413).json({ error: { code: "TOO_LARGE", message: "Request body is too large", requestId } });
    return;
  }
  if (typeof err === "object" && err !== null && (err as { type?: unknown }).type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON", requestId } });
    return;
  }
  const pgCode = typeof err === "object" && err !== null && "code" in err ? (err as { code?: unknown }).code : undefined;
  const pgError = typeof pgCode === "string" ? PG_CLIENT_ERRORS[pgCode] : undefined;
  if (pgError) {
    res.status(pgError.status).json({ error: { code: pgError.code, message: pgError.message, requestId } });
    return;
  }
  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId } });
}
