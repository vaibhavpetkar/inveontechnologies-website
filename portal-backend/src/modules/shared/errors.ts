import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logger } from "./logger.js";

/**
 * Base class for expected, client-facing errors. Anything not thrown as
 * one of these is treated as an unexpected 500 and logged with full detail
 * server-side but returned to the client without internal detail.
 */
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

// Consistent response shape for every error, per docs/architecture.md API conventions.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as Request & { id?: string }).id ?? randomUUID();

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request body", requestId, details: err.flatten().fieldErrors },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  logger.error({ err, requestId }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId },
  });
}
