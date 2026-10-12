import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";

/**
 * The only programs the agent ever starts. Every call passes an argv array
 * (never a shell string), so parameters can't inject commands.
 */
export const ALLOWED_BINARIES = ["docker", "nginx", "systemctl", "certbot", "aws", "tar", "git"] as const;
export type Binary = (typeof ALLOWED_BINARIES)[number];

export interface ExecOptions {
  cwd?: string;
  /** Feed this file to stdin (restores). */
  stdinFile?: string;
  /** Write stdout to this file instead of the log (dumps). */
  stdoutFile?: string;
  /** Return stdout instead of logging it (it may hold env values). */
  captureStdout?: boolean;
  timeoutMs?: number;
  /** Extra environment (DOCKER_CONFIG, GIT_SSH_COMMAND, ...). Never logged. */
  env?: Record<string, string>;
}

export interface ExecResult {
  code: number;
  stdout: string;
}

export type Runner = (bin: Binary, args: string[], opts: ExecOptions, log: (chunk: string) => void) => Promise<ExecResult>;

export const spawnRunner: Runner = (bin, args, opts, log) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      shell: false,
      stdio: [opts.stdinFile ? "pipe" : "ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: process.env.HOME ?? "/root", LANG: "C.UTF-8", ...opts.env },
    });
    let stdout = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          log(`\n[timed out after ${Math.round(opts.timeoutMs! / 1000)}s]\n`);
          child.kill("SIGTERM");
        }, opts.timeoutMs)
      : null;
    if (opts.stdinFile && child.stdin) createReadStream(opts.stdinFile).pipe(child.stdin);
    let fileDone: Promise<void> = Promise.resolve();
    if (opts.stdoutFile) {
      const out = createWriteStream(opts.stdoutFile, { mode: 0o600 });
      fileDone = new Promise((r) => out.on("close", () => r()));
      child.stdout!.pipe(out);
    } else
      child.stdout!.on("data", (d: Buffer) => {
        if (opts.captureStdout) stdout += d.toString("utf8");
        else log(d.toString("utf8"));
      });
    child.stderr!.on("data", (d: Buffer) => log(d.toString("utf8")));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      void fileDone.then(() => resolve({ code: code ?? 1, stdout }));
    });
  });

export function isAllowedBinary(bin: string): bin is Binary {
  return (ALLOWED_BINARIES as readonly string[]).includes(bin);
}
