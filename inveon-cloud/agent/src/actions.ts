import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { X509Certificate, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type { AgentConfig } from "./config.js";
import { isAllowedBinary, type Binary, type ExecOptions, type Runner } from "./exec.js";
import { isInside, validateCompose } from "./compose-validate.js";
import { formatEnvFile, renderSite, renderUpstream } from "./templates.js";
import {
  BUCKET_RE,
  COMPOSE_PATH_RE,
  ENV_KEY_RE,
  HOSTNAME_RE,
  ParamError,
  REGION_RE,
  RELEASE_ARG_RE,
  REL_PATH_RE,
  S3_KEY_RE,
  SERVICE_RE,
  SHA_RE,
  SLOTS,
  SLUG_RE,
  URL_PATH_RE,
  bool,
  int,
  obj,
  oneOf,
  optStr,
  str,
  type Slot,
} from "./params.js";

export interface ActionContext {
  config: AgentConfig;
  runner: Runner;
  log: (chunk: string) => void;
  /** Health checks; injectable for tests. */
  httpGet?: (url: string) => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
}

export type ActionResult = Record<string, unknown> | void;

interface Action<P> {
  parse(params: unknown): P;
  run(p: P, ctx: ActionContext): Promise<ActionResult>;
}

async function exec(ctx: ActionContext, bin: Binary, args: string[], opts: ExecOptions = {}) {
  if (!isAllowedBinary(bin)) throw new Error(`Program not allowed: ${bin}`);
  ctx.log(`$ ${bin} ${args.join(" ")}\n`);
  const r = await ctx.runner(bin, args, opts, ctx.log);
  if (r.code !== 0) throw new Error(`${bin} ${args[0] ?? ""} exited with code ${r.code}`);
  return r;
}

// ---------------------------------------------------------------- paths

interface AppRef {
  slug: string;
  slot: Slot;
  composePath: string;
}

function parseAppRef(params: unknown): AppRef {
  const p = obj(params);
  return { slug: str(p, "slug", SLUG_RE), slot: oneOf(p, "slot", SLOTS), composePath: str(p, "composePath", COMPOSE_PATH_RE) };
}

export function appPaths(config: AgentConfig, ref: AppRef) {
  const appRoot = join(config.appsRoot, ref.slug);
  const slotDir = join(appRoot, ref.slot);
  const composeFile = join(slotDir, ref.composePath);
  if (!isInside(slotDir, composeFile)) throw new ParamError("Compose path escapes the app folder");
  const project = ref.slot === "main" ? ref.slug : `${ref.slug}-${ref.slot}`;
  return { appRoot, slotDir, dataDir: join(appRoot, "data"), composeFile, projectDir: dirname(composeFile), project };
}

function composeArgs(config: AgentConfig, ref: AppRef, ...rest: string[]) {
  const p = appPaths(config, ref);
  return ["compose", "-p", p.project, "-f", p.composeFile, "--project-directory", p.projectDir, ...rest];
}

function writeAtomic(file: string, content: string, mode = 0o644) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, content, { mode });
  renameSync(tmp, file);
}

/** Write an nginx file, test the config, and put the old file back if the test fails. */
async function writeNginxFile(ctx: ActionContext, file: string, content: string) {
  const previous = existsSync(file) ? readFileSync(file, "utf8") : null;
  writeAtomic(file, content);
  ctx.log(`wrote ${file}\n`);
  try {
    await exec(ctx, "nginx", ["-t"]);
  } catch (err) {
    if (previous === null) rmSync(file, { force: true });
    else writeAtomic(file, previous);
    ctx.log(`nginx -t failed; restored the previous ${file}\n`);
    throw err;
  }
}

function certExpiry(config: AgentConfig, hostname: string) {
  const file = join(config.letsencryptDir, "live", hostname, "cert.pem");
  try {
    return { hostname, expiresAt: new Date(new X509Certificate(readFileSync(file)).validTo).toISOString() };
  } catch {
    return { hostname, expiresAt: null };
  }
}

function tempDir(config: AgentConfig) {
  mkdirSync(join(config.workDir, "tmp"), { recursive: true, mode: 0o700 });
  return mkdtempSync(join(config.workDir, "tmp", "job-"));
}

// ---------------------------------------------------------------- backups

interface BackupParams extends AppRef {
  db: { type: "postgres" | "mysql"; service: string; name: string; user: string } | null;
  volumes: string[];
  bucket: string;
  region: string;
  key: string;
}

function parseBackup(params: unknown): BackupParams {
  const p = obj(params);
  const ref = parseAppRef(p);
  let db: BackupParams["db"] = null;
  if (p.db !== null && p.db !== undefined) {
    const d = obj(p.db, "db");
    db = { type: oneOf(d, "type", ["postgres", "mysql"] as const), service: str(d, "service", SERVICE_RE), name: str(d, "name", SERVICE_RE), user: str(d, "user", SERVICE_RE) };
  }
  if (!Array.isArray(p.volumes) || p.volumes.length > 20) throw new ParamError("Invalid volumes");
  const volumes = p.volumes.map((v) => {
    if (typeof v !== "string" || !REL_PATH_RE.test(v)) throw new ParamError("Invalid volume path");
    return v;
  });
  return { ...ref, db, volumes, bucket: str(p, "bucket", BUCKET_RE), region: str(p, "region", REGION_RE), key: str(p, "key", S3_KEY_RE) };
}

function dbDumpArgs(db: NonNullable<BackupParams["db"]>) {
  return db.type === "postgres"
    ? ["exec", "-T", db.service, "pg_dump", "-U", db.user, "-d", db.name, "--clean", "--if-exists", "--no-owner"]
    : ["exec", "-T", db.service, "mysqldump", "-u", db.user, "--single-transaction", "--routines", "--triggers", db.name];
}

function dbRestoreArgs(db: NonNullable<BackupParams["db"]>) {
  return db.type === "postgres"
    ? ["exec", "-T", db.service, "psql", "-U", db.user, "-d", db.name, "-v", "ON_ERROR_STOP=1", "-q"]
    : ["exec", "-T", db.service, "mysql", "-u", db.user, db.name];
}

async function createBackup(p: BackupParams, ctx: ActionContext) {
  const paths = appPaths(ctx.config, p);
  const tmp = tempDir(ctx.config);
  try {
    const members: string[] = [];
    const tarArgs = ["-czf", join(tmp, "backup.tar.gz")];
    if (p.db) {
      await exec(ctx, "docker", composeArgs(ctx.config, p, ...dbDumpArgs(p.db)), { stdoutFile: join(tmp, "db.sql"), timeoutMs: 3600_000 });
      ctx.log(`database dump: ${statSync(join(tmp, "db.sql")).size} bytes\n`);
      tarArgs.push("-C", tmp, "db.sql");
      members.push("db.sql");
    }
    const vols = p.volumes.filter((v) => {
      const full = join(paths.dataDir, v);
      if (!isInside(paths.dataDir, full)) throw new ParamError(`Volume path escapes the data folder: ${v}`);
      if (!existsSync(full)) {
        ctx.log(`skipping missing ${full}\n`);
        return false;
      }
      return true;
    });
    if (vols.length) tarArgs.push("-C", paths.appRoot, ...vols.map((v) => join("data", v)));
    if (!p.db && !vols.length) throw new Error("Nothing to back up: no database and no existing volume paths");
    await exec(ctx, "tar", tarArgs, { timeoutMs: 3600_000 });
    const sizeBytes = statSync(join(tmp, "backup.tar.gz")).size;
    await exec(ctx, "aws", ["s3", "cp", join(tmp, "backup.tar.gz"), `s3://${p.bucket}/${p.key}`, "--region", p.region, "--sse", "AES256", "--only-show-errors"], { timeoutMs: 3600_000 });
    ctx.log(`uploaded s3://${p.bucket}/${p.key} (${sizeBytes} bytes)\n`);
    return { sizeBytes };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function restoreBackup(p: BackupParams, ctx: ActionContext) {
  const paths = appPaths(ctx.config, p);
  const tmp = tempDir(ctx.config);
  const archive = join(tmp, "backup.tar.gz");
  try {
    await exec(ctx, "aws", ["s3", "cp", `s3://${p.bucket}/${p.key}`, archive, "--region", p.region, "--only-show-errors"], { timeoutMs: 3600_000 });
    const { stdout } = await exec(ctx, "tar", ["-tzf", archive], { captureStdout: true });
    const listed = new Set(stdout.split("\n").map((l) => l.replace(/\/$/, "")));
    // Only the members we expect, by exact name, so a tampered archive can't write elsewhere.
    const vols = p.volumes.map((v) => join("data", v)).filter((m) => listed.has(m));
    if (vols.length) {
      await exec(ctx, "tar", ["-xzf", archive, "-C", paths.appRoot, "--no-same-owner", ...vols], { timeoutMs: 3600_000 });
    }
    if (p.db && !listed.has("db.sql")) throw new Error("The backup has no database dump");
    if (p.db) {
      await exec(ctx, "tar", ["-xzf", archive, "-C", tmp, "--no-same-owner", "db.sql"]);
      await exec(ctx, "docker", composeArgs(ctx.config, p, ...dbRestoreArgs(p.db)), { stdinFile: join(tmp, "db.sql"), timeoutMs: 3600_000 });
    }
    ctx.log("restore complete\n");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- the allow-list

const composeSimple = (verb: string[], label: string): Action<AppRef> => ({
  parse: parseAppRef,
  async run(p, ctx) {
    const paths = appPaths(ctx.config, p);
    if (!existsSync(paths.composeFile)) {
      if (verb[0] === "down") {
        ctx.log(`${paths.composeFile} not found; nothing to stop\n`);
        return;
      }
      throw new Error(`${paths.composeFile} not found (prepare the release first)`);
    }
    await exec(ctx, "docker", composeArgs(ctx.config, p, ...verb), { timeoutMs: 30 * 60_000 });
    ctx.log(`${label} done\n`);
  },
});

export const ACTIONS: Record<string, Action<any>> = {
  /** Writes the compose file and .env for one slot. Nothing is run. */
  "release.prepare": {
    parse(params: unknown) {
      const p = obj(params);
      const ref = parseAppRef(p);
      if (typeof p.composeContent !== "string" || p.composeContent.length === 0 || p.composeContent.length > 256 * 1024) throw new ParamError("Invalid composeContent");
      const env = obj(p.env ?? {}, "env");
      for (const [k, v] of Object.entries(env)) {
        if (!ENV_KEY_RE.test(k) || k.startsWith("INVEON_") || typeof v !== "string") throw new ParamError(`Invalid env var ${k}`);
      }
      return {
        ...ref,
        composeContent: p.composeContent,
        env: env as Record<string, string>,
        commitSha: str(p, "commitSha", SHA_RE),
        port: int(p, "port", 1024, 65535),
        imageRegistry: optStr(p, "imageRegistry", /^[A-Za-z0-9.\-:\/]{1,200}$/),
      };
    },
    async run(p, ctx) {
      const paths = appPaths(ctx.config, p);
      mkdirSync(paths.projectDir, { recursive: true, mode: 0o750 });
      mkdirSync(paths.dataDir, { recursive: true, mode: 0o750 });
      writeAtomic(paths.composeFile, p.composeContent, 0o640);
      const envFile = join(paths.projectDir, ".env");
      writeAtomic(
        envFile,
        formatEnvFile({
          ...p.env,
          INVEON_HTTP_PORT: String(p.port),
          INVEON_DATA_DIR: paths.dataDir,
          INVEON_SLOT: p.slot,
          INVEON_COMMIT_SHA: p.commitSha,
          IMAGE_TAG: p.env.IMAGE_TAG ?? p.commitSha,
          ...(p.imageRegistry ? { IMAGE_REGISTRY: p.imageRegistry } : {}),
        }),
        0o600,
      );
      ctx.log(`wrote ${paths.composeFile}\nwrote ${envFile} (${Object.keys(p.env).length} app variables, values not logged)\n`);
    },
  } satisfies Action<AppRef & { composeContent: string; env: Record<string, string>; commitSha: string; port: number; imageRegistry: string | null }>,

  /** docker compose config --format json, then the shared validator on the resolved model. */
  "compose.validate": {
    parse: parseAppRef,
    async run(p: AppRef, ctx) {
      const paths = appPaths(ctx.config, p);
      const { stdout } = await exec(ctx, "docker", composeArgs(ctx.config, p, "config", "--format", "json"), { captureStdout: true, timeoutMs: 120_000 });
      let model: Record<string, unknown>;
      try {
        model = JSON.parse(stdout);
      } catch {
        throw new Error("docker compose config did not return JSON");
      }
      const appRoot = existsSync(paths.appRoot) ? realpathSync(paths.appRoot) : paths.appRoot;
      const verdict = validateCompose(model, { appRoot });
      // Symlinks inside the app folder must not lead out of it.
      const services = (model.services ?? {}) as Record<string, { volumes?: { type?: string; source?: string }[] }>;
      for (const [name, svc] of Object.entries(services)) {
        for (const v of svc.volumes ?? []) {
          if (v.type === "bind" && v.source && existsSync(v.source) && !isInside(appRoot, realpathSync(v.source))) {
            verdict.ok = false;
            verdict.errors.push(`services.${name}: bind mount ${v.source} resolves outside the app folder`);
          }
        }
      }
      if (!verdict.ok) throw new Error(`Compose file rejected:\n${verdict.errors.map((e) => `  - ${e}`).join("\n")}`);
      ctx.log(`${Object.keys(services).length} service(s): ${Object.keys(services).join(", ")}. Compose file passed the safety checks.\n`);
      // Environment values are stripped before the model goes back to the control plane.
      const slim = { ...model, services: Object.fromEntries(Object.entries(services).map(([k, s]) => [k, { ...s, environment: undefined }])) };
      return { appRoot, model: slim };
    },
  },

  "compose.pull": composeSimple(["pull", "--quiet", "--ignore-buildable"], "pull"),
  "compose.up": composeSimple(["up", "-d", "--remove-orphans"], "up"),
  "compose.down": composeSimple(["down", "--remove-orphans"], "down"),
  "compose.ps": composeSimple(["ps"], "ps"),

  /**
   * The release command (migrations): a one-off container of the new
   * release's image, `docker compose run --rm -T <service> <argv...>`. The
   * argv is a validated list, never a shell string, and it runs only inside
   * the app's own container.
   */
  "release.run": {
    parse(params: unknown) {
      const p = obj(params);
      const ref = parseAppRef(p);
      const command = p.command;
      if (!Array.isArray(command) || command.length < 1 || command.length > 32) throw new ParamError("Invalid command");
      for (const a of command) if (typeof a !== "string" || !RELEASE_ARG_RE.test(a)) throw new ParamError("Invalid command");
      if ((command[0] as string).startsWith("-")) throw new ParamError("Invalid command");
      return { ...ref, service: str(p, "service", SERVICE_RE), command: command as string[], timeoutSec: int(p, "timeoutSec", 10, 7200) };
    },
    async run(p: AppRef & { service: string; command: string[]; timeoutSec: number }, ctx) {
      const paths = appPaths(ctx.config, p);
      if (!existsSync(paths.composeFile)) throw new Error(`${paths.composeFile} not found (prepare the release first)`);
      try {
        await exec(ctx, "docker", composeArgs(ctx.config, p, "run", "--rm", "-T", p.service, ...p.command), { timeoutMs: p.timeoutSec * 1000 });
      } catch (err) {
        throw new Error(`Release command failed (${(err as Error).message}). Nothing was switched: the live release keeps serving.`);
      }
      ctx.log("release command finished\n");
    },
  },

  "compose.logs": {
    parse(params: unknown) {
      const p = obj(params);
      return { ...parseAppRef(p), lines: int(p, "lines", 1, 5000), service: optStr(p, "service", SERVICE_RE) };
    },
    async run(p: AppRef & { lines: number; service: string | null }, ctx) {
      const args = ["logs", "--no-color", "--timestamps", "--tail", String(p.lines)];
      if (p.service) args.push(p.service);
      await exec(ctx, "docker", composeArgs(ctx.config, p, ...args), { timeoutMs: 120_000 });
    },
  },

  /** HTTP GET to the new slot on 127.0.0.1 until it answers 2xx/3xx. */
  "health.check": {
    parse(params: unknown) {
      const p = obj(params);
      return { port: int(p, "port", 1024, 65535), path: str(p, "path", URL_PATH_RE), retries: int(p, "retries", 1, 120), intervalSec: int(p, "intervalSec", 1, 60) };
    },
    async run(p: { port: number; path: string; retries: number; intervalSec: number }, ctx) {
      const url = `http://127.0.0.1:${p.port}${p.path}`;
      const get =
        ctx.httpGet ??
        (async (u: string) => {
          const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(5000) });
          await res.body?.cancel().catch(() => undefined);
          return res.status;
        });
      const sleep = ctx.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
      for (let i = 1; i <= p.retries; i++) {
        try {
          const status = await get(url);
          ctx.log(`attempt ${i}/${p.retries}: GET ${url} -> ${status}\n`);
          if (status >= 200 && status < 400) return { status, attempts: i };
        } catch (err) {
          ctx.log(`attempt ${i}/${p.retries}: GET ${url} -> ${(err as Error).message}\n`);
        }
        if (i < p.retries) await sleep(p.intervalSec * 1000);
      }
      throw new Error(`Health check failed after ${p.retries} attempts`);
    },
  },

  "nginx.write_upstream": {
    parse(params: unknown) {
      const p = obj(params);
      return { slug: str(p, "slug", SLUG_RE), port: int(p, "port", 1024, 65535) };
    },
    async run(p: { slug: string; port: number }, ctx) {
      await writeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-upstream-${p.slug}.conf`), renderUpstream(p.slug, p.port));
    },
  },

  "nginx.write_site": {
    parse(params: unknown) {
      const p = obj(params);
      return { hostname: str(p, "hostname", HOSTNAME_RE), slug: str(p, "slug", SLUG_RE), tls: bool(p, "tls") };
    },
    async run(p: { hostname: string; slug: string; tls: boolean }, ctx) {
      mkdirSync(join(ctx.config.acmeWebroot, ".well-known", "acme-challenge"), { recursive: true });
      if (p.tls && !existsSync(join(ctx.config.letsencryptDir, "live", p.hostname, "fullchain.pem"))) throw new Error(`No certificate for ${p.hostname} yet`);
      const content = renderSite({ ...p, acmeWebroot: ctx.config.acmeWebroot, letsencryptDir: ctx.config.letsencryptDir });
      await writeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-site-${p.hostname}.conf`), content);
    },
  },

  "nginx.reload": {
    parse: (params: unknown) => (obj(params ?? {}), {}),
    async run(_p, ctx) {
      await exec(ctx, "nginx", ["-t"]);
      await exec(ctx, "systemctl", ["reload", "nginx"]);
    },
  },

  "certbot.issue": {
    parse(params: unknown) {
      const p = obj(params);
      return { hostname: str(p, "hostname", HOSTNAME_RE), email: optStr(p, "email", /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,253}$/) };
    },
    async run(p: { hostname: string; email: string | null }, ctx) {
      const args = ["certonly", "--webroot", "-w", ctx.config.acmeWebroot, "-d", p.hostname, "--non-interactive", "--agree-tos", "--keep-until-expiring"];
      args.push(...(p.email ? ["--email", p.email] : ["--register-unsafely-without-email"]));
      await exec(ctx, "certbot", args, { timeoutMs: 300_000 });
      return { certs: [certExpiry(ctx.config, p.hostname)] };
    },
  },

  "certbot.renew": {
    parse(params: unknown) {
      const p = obj(params);
      const hostnames = Array.isArray(p.hostnames) ? p.hostnames : [];
      if (hostnames.length > 500 || !hostnames.every((h) => typeof h === "string" && HOSTNAME_RE.test(h))) throw new ParamError("Invalid hostnames");
      return { hostnames: hostnames as string[] };
    },
    async run(p: { hostnames: string[] }, ctx) {
      await exec(ctx, "certbot", ["renew", "--non-interactive"], { timeoutMs: 900_000 });
      return { certs: p.hostnames.map((h) => certExpiry(ctx.config, h)) };
    },
  },

  "backup.create": { parse: parseBackup, run: createBackup },
  "backup.restore": { parse: parseBackup, run: restoreBackup },
};

export function isAllowedAction(name: string) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name);
}

/** Runs one step: unknown actions and bad params are refused before anything happens. */
export async function runAction(name: string, params: unknown, ctx: ActionContext): Promise<ActionResult> {
  if (!isAllowedAction(name)) throw new Error(`Action not allowed: ${name}`);
  const action = ACTIONS[name];
  const parsed = action.parse(params);
  return action.run(parsed, ctx);
}
