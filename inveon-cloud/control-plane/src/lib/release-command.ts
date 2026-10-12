import { AppError } from "./errors.js";

/**
 * A release command is split on whitespace into an argv list. Each word may
 * only use characters that mean nothing to a shell (no quotes, $, ;, |, &,
 * backticks, redirects or globs), and the first word can't be an option.
 * The agent applies the same rule (agent/src/params.ts) before it runs
 * `docker compose run --rm -T <service> <argv...>` in the app's own image.
 */
export const RELEASE_ARG_RE = /^[A-Za-z0-9_@%+=:,./-]{1,200}$/;
export const RELEASE_MAX_ARGS = 32;
export const RELEASE_SERVICE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export function parseReleaseCommand(command: string): string[] {
  const argv = command.trim().split(/\s+/).filter(Boolean);
  if (!argv.length) throw new AppError("INVALID_RELEASE_COMMAND", "The release command is empty", 400);
  if (argv.length > RELEASE_MAX_ARGS) throw new AppError("INVALID_RELEASE_COMMAND", `Use at most ${RELEASE_MAX_ARGS} words`, 400);
  const bad = argv.find((a) => !RELEASE_ARG_RE.test(a));
  if (bad !== undefined) {
    throw new AppError("INVALID_RELEASE_COMMAND", `"${bad.slice(0, 40)}" is not allowed: use letters, digits and _ @ % + = : , . / - only (no quotes or shell syntax)`, 400);
  }
  if (argv[0].startsWith("-")) throw new AppError("INVALID_RELEASE_COMMAND", "The command must start with a program name, not an option", 400);
  return argv;
}
