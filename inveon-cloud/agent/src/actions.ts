import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { X509Certificate, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type { AgentConfig } from "./config.js";
import { isAllowedBinary, type Binary, type ExecOptions, type Runner } from "./exec.js";
import { isInside, validateCompose } from "./compose-validate.js";
import { formatEnvFile, ipLiteral, renderListener, renderPool, renderSite, renderUpstream } from "./templates.js";
import {
  CERT_NAME_RE,
  WILDCARD_CERT_RE,
  wildcardCertName,
  BUCKET_RE,
  BUILT_IMAGE_RE,
  COMPOSE_PATH_RE,
  ENV_KEY_RE,
  GITHUB_OWNER_RE,
  GITHUB_REPO_RE,
  HOSTNAME_RE,
  IMAGE_REF_RE,
  ParamError,
  REGION_RE,
  REGISTRY_SERVER_RE,
  REGISTRY_USER_RE,
  RELEASE_ARG_RE,
  REL_PATH_RE,
  S3_KEY_RE,
  S3_PREFIX_RE,
  BACKUP_FILE_RE,
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

export const LOG_FOLLOW_MAX_SEC = 600;

export interface ActionContext {
  config: AgentConfig;
  runner: Runner;
  log: (chunk: string) => void;
  /** Health checks; injectable for tests. */
  httpGet?: (url: string) => Promise<number>;
  sleep?: (ms: number) => Promise<void>;
  /** Aborted when the control plane cancels the job (a live log viewer left). */
  signal?: AbortSignal;
  /** The running job: certbot's DNS-01 hooks answer for it. */
  jobId?: string;
  /** The agent's config file, for the hooks (default /etc/inveon-agent/config.json). */
  configPath?: string;
  /** The node binary and the agent's entry script, for the hooks (default: this process's). */
  nodePath?: string;
  agentEntry?: string;
}

/** An absolute path with nothing a shell would interpret (certbot runs hook commands through a shell). */
const HOOK_PATH_RE = /^\/[A-Za-z0-9_.\/@+-]{1,1000}$/;
const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The fixed command certbot runs for a DNS-01 challenge: this agent's
 * `dns-hook auth|cleanup`, which asks the control plane to publish or
 * remove the TXT record (see dns-hook.ts). Built only from paths checked
 * against HOOK_PATH_RE, so the shell certbot uses sees no metacharacters.
 */
export function dnsHookCommand(phase: "auth" | "cleanup", ctx: Pick<ActionContext, "configPath" | "nodePath" | "agentEntry">) {
  const parts = [ctx.nodePath ?? process.execPath, ctx.agentEntry ?? process.argv[1] ?? "", ctx.configPath ?? "/etc/inveon-agent/config.json"];
  for (const p of parts) if (!HOOK_PATH_RE.test(p) || p.includes("/../")) throw new Error(`Unsafe path for the certbot hook: ${p.slice(0, 100)}`);
  return `${parts[0]} ${parts[1]} dns-hook ${phase} --config ${parts[2]}`;
}

/** certbot's environment for the hooks: which job they answer for. */
function hookEnv(ctx: ActionContext) {
  if (!ctx.jobId || !JOB_ID_RE.test(ctx.jobId)) throw new Error("No job id for the DNS-01 hooks");
  return { INVEON_DNS_JOB_ID: ctx.jobId };
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

/** Remove an nginx file, test the config, and put it back if the test fails. */
async function removeNginxFile(ctx: ActionContext, file: string) {
  if (!existsSync(file)) {
    ctx.log(`${file} not found; nothing to remove\n`);
    return;
  }
  const previous = readFileSync(file, "utf8");
  rmSync(file, { force: true });
  ctx.log(`removed ${file}\n`);
  try {
    await exec(ctx, "nginx", ["-t"]);
  } catch (err) {
    writeAtomic(file, previous);
    ctx.log(`nginx -t failed; restored ${file}\n`);
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

// ---------------------------------------------------------------- registry login and builds

interface RegistryAuth {
  server: string;
  username: string;
  password: string;
}

function parseRegistryAuth(v: unknown): RegistryAuth | null {
  if (v === null || v === undefined) return null;
  const a = obj(v, "registryAuth");
  const password = a.password;
  if (typeof password !== "string" || password.length < 1 || password.length > 8192 || /[\x00-\x1f\x7f]/.test(password)) throw new ParamError("Invalid registry password");
  return { server: str(a, "server", REGISTRY_SERVER_RE), username: str(a, "username", REGISTRY_USER_RE), password };
}

/**
 * Runs fn logged in to the app's registry, if it has credentials. The login
 * goes to a throwaway DOCKER_CONFIG folder for this step only (never root's
 * ~/.docker), the password is fed on stdin from a 0600 file, and the agent
 * logs out and deletes the folder afterwards, whatever happened.
 */
async function withRegistryLogin<T>(ctx: ActionContext, auth: RegistryAuth | null, fn: (env: Record<string, string>) => Promise<T>): Promise<T> {
  if (!auth) return fn({});
  const tmp = tempDir(ctx.config);
  const env = { DOCKER_CONFIG: join(tmp, "docker") };
  mkdirSync(env.DOCKER_CONFIG, { mode: 0o700 });
  const pwFile = join(tmp, "registry-password");
  writeFileSync(pwFile, auth.password, { mode: 0o600 });
  try {
    await exec(ctx, "docker", ["login", auth.server, "--username", auth.username, "--password-stdin"], { stdinFile: pwFile, env, timeoutMs: 120_000 });
    rmSync(pwFile, { force: true });
    return await fn(env);
  } finally {
    try {
      await exec(ctx, "docker", ["logout", auth.server], { env, timeoutMs: 60_000 });
    } catch {
      ctx.log("docker logout failed; the login is deleted with its temporary folder anyway\n");
    }
    rmSync(tmp, { recursive: true, force: true });
  }
}

type GitAuth = { type: "deploy_key"; privateKey: string } | { type: "token"; token: string } | null;

const OPENSSH_KEY_RE = /^-----BEGIN OPENSSH PRIVATE KEY-----\n[A-Za-z0-9+/=\n]{40,16384}-----END OPENSSH PRIVATE KEY-----\n?$/;

function parseGitAuth(v: unknown): GitAuth {
  if (v === null || v === undefined) return null;
  const a = obj(v, "gitAuth");
  if (a.type === "deploy_key") {
    const key = a.privateKey;
    if (typeof key !== "string" || !OPENSSH_KEY_RE.test(key)) throw new ParamError("Invalid deploy key");
    return { type: "deploy_key", privateKey: key };
  }
  if (a.type === "token") return { type: "token", token: str(a, "token", /^[A-Za-z0-9_.-]{20,255}$/) };
  throw new ParamError("Invalid gitAuth");
}

/** GitHub's published SSH host keys, so a deploy-key clone never trusts an unknown host. */
export const GITHUB_KNOWN_HOSTS = [
  "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
  "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
].join("\n");

interface BuildParams {
  repoOwner: string;
  repoName: string;
  commitSha: string;
  dockerfilePath: string;
  context: string;
  image: string;
  gitAuth: GitAuth;
  registryAuth: RegistryAuth | null;
}

/**
 * Clones exactly one commit into a fresh folder (no hooks, no system or
 * global git config, no prompts), checks HEAD is that commit, then runs
 * docker build with the app's Dockerfile and tags the image with the commit.
 * The repo URL is built here from the owner and name: only github.com.
 */
async function buildImage(p: BuildParams, ctx: ActionContext) {
  const tmp = tempDir(ctx.config);
  const src = join(tmp, "src");
  try {
    const gitEnv: Record<string, string> = { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
    let url = `https://github.com/${p.repoOwner}/${p.repoName}.git`;
    if (p.gitAuth?.type === "deploy_key") {
      const keyFile = join(tmp, "deploy-key");
      const knownHosts = join(tmp, "known_hosts");
      writeFileSync(keyFile, p.gitAuth.privateKey.endsWith("\n") ? p.gitAuth.privateKey : `${p.gitAuth.privateKey}\n`, { mode: 0o600 });
      writeFileSync(knownHosts, GITHUB_KNOWN_HOSTS + "\n", { mode: 0o600 });
      gitEnv.GIT_SSH_COMMAND = `ssh -i ${keyFile} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts}`;
      url = `git@github.com:${p.repoOwner}/${p.repoName}.git`;
    } else if (p.gitAuth?.type === "token") {
      // In the environment, not argv: tokens don't show up in ps or the log.
      gitEnv.GIT_CONFIG_COUNT = "1";
      gitEnv.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
      gitEnv.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${p.gitAuth.token}`).toString("base64")}`;
    }
    const git = (args: string[], opts: ExecOptions = {}) => exec(ctx, "git", args, { env: gitEnv, timeoutMs: 600_000, ...opts });
    await git(["init", "--quiet", src]);
    await git(["-C", src, "-c", "core.hooksPath=/dev/null", "fetch", "--depth", "1", "--no-tags", "--quiet", url, p.commitSha]);
    await git(["-C", src, "-c", "core.hooksPath=/dev/null", "-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    const { stdout } = await git(["-C", src, "rev-parse", "HEAD"], { captureStdout: true });
    if (stdout.trim() !== p.commitSha) throw new Error(`Checked out ${stdout.trim().slice(0, 12)}, expected ${p.commitSha.slice(0, 12)}`);

    // Symlinks in the repo must not point the build at files outside it.
    const root = realpathSync(src);
    const inRepo = (rel: string, what: string) => {
      const full = join(src, rel);
      if (!existsSync(full)) throw new Error(`${what} ${rel} not found in the repo at ${p.commitSha.slice(0, 7)}`);
      const real = realpathSync(full);
      if (!isInside(root, real)) throw new Error(`${what} ${rel} points outside the repo`);
      return real;
    };
    const dockerfile = inRepo(p.dockerfilePath, "Dockerfile");
    const context = inRepo(p.context, "Build context");
    if (!statSync(context).isDirectory()) throw new Error(`Build context ${p.context} is not a folder`);

    await withRegistryLogin(ctx, p.registryAuth, (env) =>
      exec(ctx, "docker", ["build", "--pull", "--file", dockerfile, "--tag", p.image, "--label", `org.opencontainers.image.revision=${p.commitSha}`, context], { env, timeoutMs: 60 * 60_000 }),
    );
    ctx.log(`built ${p.image}\n`);
    return { image: p.image };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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
        builtImage: optStr(p, "builtImage", BUILT_IMAGE_RE),
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
          ...(p.builtImage ? { INVEON_IMAGE: p.builtImage } : {}),
        }),
        0o600,
      );
      ctx.log(`wrote ${paths.composeFile}\nwrote ${envFile} (${Object.keys(p.env).length} app variables, values not logged)\n`);
    },
  } satisfies Action<AppRef & { composeContent: string; env: Record<string, string>; commitSha: string; port: number; imageRegistry: string | null; builtImage: string | null }>,

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

  /**
   * Pulls the release's images, logged in to the app's registry when it has
   * credentials. missingOnly (for images built on this server) skips images
   * that are already here, so the local build isn't looked up remotely.
   */
  "compose.pull": {
    parse(params: unknown) {
      const p = obj(params);
      const missingOnly = p.missingOnly === undefined ? false : bool(p, "missingOnly");
      return { ...parseAppRef(p), missingOnly, registryAuth: parseRegistryAuth(p.registryAuth) };
    },
    async run(p: AppRef & { missingOnly: boolean; registryAuth: RegistryAuth | null }, ctx) {
      const paths = appPaths(ctx.config, p);
      if (!existsSync(paths.composeFile)) throw new Error(`${paths.composeFile} not found (prepare the release first)`);
      const args = ["pull", "--quiet", "--ignore-buildable", ...(p.missingOnly ? ["--policy", "missing"] : [])];
      await withRegistryLogin(ctx, p.registryAuth, (env) => exec(ctx, "docker", composeArgs(ctx.config, p, ...args), { env, timeoutMs: 30 * 60_000 }));
      ctx.log("pull done\n");
    },
  },

  /** Clone one commit and docker build it (repos without a CI image). */
  "image.build": {
    parse(params: unknown): BuildParams {
      const p = obj(params);
      return {
        repoOwner: str(p, "repoOwner", GITHUB_OWNER_RE),
        repoName: str(p, "repoName", GITHUB_REPO_RE),
        commitSha: str(p, "commitSha", SHA_RE),
        dockerfilePath: str(p, "dockerfilePath", REL_PATH_RE),
        context: str(p, "context", REL_PATH_RE),
        image: str(p, "image", BUILT_IMAGE_RE),
        gitAuth: parseGitAuth(p.gitAuth),
        registryAuth: parseRegistryAuth(p.registryAuth),
      };
    },
    run: buildImage,
  },
  /**
   * Release archiving: `docker image rm <ref>` for images of releases that
   * are no longer kept. Never forced, so Docker refuses an image a container
   * still uses; such images (and ones already gone) are skipped, not errors.
   * Every reference must be tagged with a full commit SHA, so shared base
   * images like postgres:16 can never be named here.
   */
  "image.remove": {
    parse(params: unknown) {
      const p = obj(params);
      const images = p.images;
      if (!Array.isArray(images) || images.length < 1 || images.length > 100) throw new ParamError("Invalid images");
      for (const ref of images) {
        if (typeof ref !== "string" || ref.length > 255 || !IMAGE_REF_RE.test(ref) || !/[0-9a-f]{40}/.test(ref.slice(ref.lastIndexOf(":") + 1))) {
          throw new ParamError(`Invalid image ${String(ref).slice(0, 80)}`);
        }
      }
      return { images: images as string[] };
    },
    async run(p: { images: string[] }, ctx) {
      const removed: string[] = [];
      const skipped: string[] = [];
      for (const ref of p.images) {
        ctx.log(`$ docker image rm ${ref}\n`);
        const r = await ctx.runner("docker", ["image", "rm", ref], { timeoutMs: 120_000 }, ctx.log);
        (r.code === 0 ? removed : skipped).push(ref);
        if (r.code !== 0) ctx.log(`kept ${ref} (in use or already removed)\n`);
      }
      ctx.log(`removed ${removed.length} image(s), skipped ${skipped.length}\n`);
      return { removed, skipped };
    },
  },

  "compose.up": composeSimple(["up", "-d", "--remove-orphans"], "up"),
  /** Stops a slot. removeVolumes (preview teardown) also deletes its named volumes. */
  "compose.down": {
    parse(params: unknown) {
      const p = obj(params);
      return { ...parseAppRef(p), removeVolumes: p.removeVolumes === undefined ? false : bool(p, "removeVolumes") };
    },
    async run(p: AppRef & { removeVolumes: boolean }, ctx) {
      return composeSimple(["down", "--remove-orphans", ...(p.removeVolumes ? ["--volumes"] : [])], "down").run(p, ctx);
    },
  },
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

  /**
   * Live logs: `docker compose logs -f --tail N <service>` for at most
   * durationSec (10 minutes). Output goes straight to the step log, which the
   * control plane relays to the viewer without storing it. The process is
   * stopped when the job is cancelled (the viewer left) or the time is up;
   * both end the step normally.
   */
  "compose.logs_follow": {
    parse(params: unknown) {
      const p = obj(params);
      return { ...parseAppRef(p), service: str(p, "service", SERVICE_RE), tail: int(p, "tail", 0, 5000), durationSec: int(p, "durationSec", 10, LOG_FOLLOW_MAX_SEC) };
    },
    async run(p: AppRef & { service: string; tail: number; durationSec: number }, ctx) {
      const paths = appPaths(ctx.config, p);
      if (!existsSync(paths.composeFile)) throw new Error(`${paths.composeFile} not found (deploy this environment first)`);
      const args = composeArgs(ctx.config, p, "logs", "-f", "--no-color", "--timestamps", "--tail", String(p.tail), p.service);
      ctx.log(`$ docker ${args.join(" ")}\n`);
      const started = Date.now();
      const r = await ctx.runner("docker", args, { timeoutMs: p.durationSec * 1000, signal: ctx.signal }, ctx.log);
      if (ctx.signal?.aborted) {
        ctx.log("\n[stopped: the viewer left]\n");
        return { stopped: "viewer" };
      }
      if (Date.now() - started >= p.durationSec * 1000 - 500) {
        ctx.log(`\n[stopped after ${Math.round(p.durationSec / 60)} minutes; follow again to keep watching]\n`);
        return { stopped: "time_limit" };
      }
      if (r.code !== 0) throw new Error(`docker compose logs exited with code ${r.code}`);
      return { stopped: "exited" };
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

  /**
   * The replica listener of a multi-server environment: the proxy reaches
   * this server's live colour on this port. Only the listed addresses (the
   * proxy's, and this machine) may connect.
   */
  "nginx.write_listener": {
    parse(params: unknown) {
      const p = obj(params);
      const allow = p.allow;
      if (!Array.isArray(allow) || allow.length < 1 || allow.length > 20) throw new ParamError("Invalid allow");
      for (const a of allow) ipLiteral(a as string);
      return { slug: str(p, "slug", SLUG_RE), port: int(p, "port", 1024, 65535), allow: allow as string[] };
    },
    async run(p: { slug: string; port: number; allow: string[] }, ctx) {
      await writeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-listener-${p.slug}.conf`), renderListener(p.slug, p.port, p.allow));
    },
  },

  "nginx.remove_listener": {
    parse(params: unknown) {
      return { slug: str(obj(params), "slug", SLUG_RE) };
    },
    async run(p: { slug: string }, ctx) {
      await removeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-listener-${p.slug}.conf`));
    },
  },

  /** On the proxy: the upstream that lists every replica, with passive health checks. */
  "nginx.write_pool": {
    parse(params: unknown) {
      const p = obj(params);
      const servers = p.servers;
      if (!Array.isArray(servers) || servers.length < 1 || servers.length > 50) throw new ParamError("Invalid servers");
      const members = servers.map((m) => {
        const o = obj(m, "server");
        ipLiteral(o.host as string);
        return { host: o.host as string, port: int(o, "port", 1024, 65535) };
      });
      return { slug: str(p, "slug", SLUG_RE), servers: members, maxFails: int(p, "maxFails", 1, 20), failTimeoutSec: int(p, "failTimeoutSec", 1, 600) };
    },
    async run(p: { slug: string; servers: { host: string; port: number }[]; maxFails: number; failTimeoutSec: number }, ctx) {
      await writeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-pool-${p.slug}.conf`), renderPool(p.slug, p.servers, p));
    },
  },

  "nginx.remove_pool": {
    parse(params: unknown) {
      return { slug: str(obj(params), "slug", SLUG_RE) };
    },
    async run(p: { slug: string }, ctx) {
      await removeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-pool-${p.slug}.conf`));
    },
  },

  "nginx.write_site": {
    parse(params: unknown) {
      const p = obj(params);
      return {
        hostname: str(p, "hostname", HOSTNAME_RE),
        slug: str(p, "slug", SLUG_RE),
        tls: bool(p, "tls"),
        pool: p.pool === undefined ? false : bool(p, "pool"),
        certName: optStr(p, "certName", WILDCARD_CERT_RE),
      };
    },
    async run(p: { hostname: string; slug: string; tls: boolean; pool: boolean; certName: string | null }, ctx) {
      mkdirSync(join(ctx.config.acmeWebroot, ".well-known", "acme-challenge"), { recursive: true });
      const cert = p.certName ?? p.hostname;
      if (p.tls && !existsSync(join(ctx.config.letsencryptDir, "live", cert, "fullchain.pem"))) throw new Error(`No certificate ${cert} yet`);
      const content = renderSite({ ...p, acmeWebroot: ctx.config.acmeWebroot, letsencryptDir: ctx.config.letsencryptDir });
      await writeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-site-${p.hostname}.conf`), content);
    },
  },

  "nginx.remove_site": {
    parse(params: unknown) {
      return { hostname: str(obj(params), "hostname", HOSTNAME_RE) };
    },
    async run(p: { hostname: string }, ctx) {
      await removeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-site-${p.hostname}.conf`));
    },
  },

  "nginx.remove_upstream": {
    parse(params: unknown) {
      return { slug: str(obj(params), "slug", SLUG_RE) };
    },
    async run(p: { slug: string }, ctx) {
      await removeNginxFile(ctx, join(ctx.config.nginxConfDir, `inveon-upstream-${p.slug}.conf`));
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

  /**
   * A wildcard certificate (*.<base> and <base>) with the DNS-01 challenge.
   * certbot's manual hooks are this agent's fixed `dns-hook` commands; the
   * control plane publishes the TXT record with the organization's DNS
   * provider, so no DNS credentials are on the server.
   */
  "certbot.issue_wildcard": {
    parse(params: unknown) {
      const p = obj(params);
      return { baseDomain: str(p, "baseDomain", HOSTNAME_RE), email: optStr(p, "email", /^[^\s@]{1,64}@[A-Za-z0-9.-]{1,253}$/) };
    },
    async run(p: { baseDomain: string; email: string | null }, ctx) {
      const certName = wildcardCertName(p.baseDomain);
      const args = [
        "certonly",
        "--manual",
        "--preferred-challenges",
        "dns",
        "--manual-auth-hook",
        dnsHookCommand("auth", ctx),
        "--manual-cleanup-hook",
        dnsHookCommand("cleanup", ctx),
        "--cert-name",
        certName,
        "-d",
        `*.${p.baseDomain}`,
        "-d",
        p.baseDomain,
        "--non-interactive",
        "--agree-tos",
        "--keep-until-expiring",
        ...(p.email ? ["--email", p.email] : ["--register-unsafely-without-email"]),
      ];
      await exec(ctx, "certbot", args, { timeoutMs: 900_000, env: hookEnv(ctx) });
      return { certName, wildcards: [{ baseDomain: p.baseDomain, expiresAt: certExpiry(ctx.config, certName).expiresAt }] };
    },
  },

  "certbot.renew": {
    parse(params: unknown) {
      const p = obj(params);
      const hostnames = Array.isArray(p.hostnames) ? p.hostnames : [];
      if (hostnames.length > 500 || !hostnames.every((h) => typeof h === "string" && HOSTNAME_RE.test(h))) throw new ParamError("Invalid hostnames");
      const wildcards = Array.isArray(p.wildcards) ? p.wildcards : [];
      if (wildcards.length > 100 || !wildcards.every((h) => typeof h === "string" && HOSTNAME_RE.test(h))) throw new ParamError("Invalid wildcards");
      return { hostnames: hostnames as string[], wildcards: wildcards as string[] };
    },
    async run(p: { hostnames: string[]; wildcards: string[] }, ctx) {
      // Wildcards renew through their saved DNS-01 hooks, which answer for this job.
      await exec(ctx, "certbot", ["renew", "--non-interactive"], { timeoutMs: 900_000, ...(p.wildcards.length ? { env: hookEnv(ctx) } : {}) });
      return {
        certs: p.hostnames.map((h) => certExpiry(ctx.config, h)),
        ...(p.wildcards.length ? { wildcards: p.wildcards.map((b) => ({ baseDomain: b, expiresAt: certExpiry(ctx.config, wildcardCertName(b)).expiresAt })) } : {}),
      };
    },
  },

  /** Deletes a certificate (preview teardown, a removed wildcard) so certbot stops renewing it. */
  "certbot.delete": {
    parse(params: unknown) {
      const p = obj(params);
      const name = p.certName !== undefined ? str(p, "certName", CERT_NAME_RE) : str(p, "hostname", HOSTNAME_RE);
      return { hostname: name };
    },
    async run(p: { hostname: string }, ctx) {
      if (!existsSync(join(ctx.config.letsencryptDir, "renewal", `${p.hostname}.conf`)) && !existsSync(join(ctx.config.letsencryptDir, "live", p.hostname))) {
        ctx.log(`no certificate for ${p.hostname}; nothing to delete\n`);
        return;
      }
      await exec(ctx, "certbot", ["delete", "--cert-name", p.hostname, "--non-interactive"], { timeoutMs: 120_000 });
    },
  },

  /**
   * Deletes an environment's folder (<appsRoot>/<slug>: both colours and the
   * data folder). Used only by preview teardown, after its containers are down.
   */
  "app.remove_folder": {
    parse(params: unknown) {
      return { slug: str(obj(params), "slug", SLUG_RE) };
    },
    async run(p: { slug: string }, ctx) {
      const dir = join(ctx.config.appsRoot, p.slug);
      if (dirname(dir) !== ctx.config.appsRoot.replace(/\/+$/, "") || !isInside(ctx.config.appsRoot, dir)) throw new ParamError("Folder escapes the apps root");
      if (!existsSync(dir)) {
        ctx.log(`${dir} not found; nothing to remove\n`);
        return;
      }
      rmSync(dir, { recursive: true, force: true });
      ctx.log(`removed ${dir}\n`);
    },
  },

  "backup.create": { parse: parseBackup, run: createBackup },
  "backup.restore": { parse: parseBackup, run: restoreBackup },

  /**
   * Backup retention: `aws s3 rm` of exact keys, never --recursive. Every key
   * must be a backup archive directly inside the environment's own prefix
   * (one that ends in /<slug>/), so a job can't delete anything else in the
   * bucket. Every key is tried; the step fails if any delete failed, and the
   * control plane then keeps all the records and retries the next day.
   */
  "backup.delete": {
    parse(params: unknown) {
      const p = obj(params);
      const slug = str(p, "slug", SLUG_RE);
      const prefix = str(p, "prefix", S3_PREFIX_RE);
      if (!(prefix === `${slug}/` || prefix.endsWith(`/${slug}/`))) throw new ParamError("The prefix is not this environment's backup folder");
      const keys = p.keys;
      if (!Array.isArray(keys) || keys.length < 1 || keys.length > 200) throw new ParamError("Invalid keys");
      for (const k of keys) {
        if (typeof k !== "string" || !S3_KEY_RE.test(k) || !k.startsWith(prefix) || !BACKUP_FILE_RE.test(k.slice(prefix.length))) throw new ParamError(`Invalid key ${String(k).slice(0, 80)}`);
      }
      return { slug, bucket: str(p, "bucket", BUCKET_RE), region: str(p, "region", REGION_RE), prefix, keys: keys as string[] };
    },
    async run(p: { bucket: string; region: string; keys: string[] }, ctx) {
      const failed: string[] = [];
      for (const key of p.keys) {
        try {
          await exec(ctx, "aws", ["s3", "rm", `s3://${p.bucket}/${key}`, "--region", p.region, "--only-show-errors"], { timeoutMs: 120_000 });
        } catch (err) {
          failed.push(key);
          ctx.log(`could not delete ${key}: ${(err as Error).message}\n`);
        }
      }
      ctx.log(`deleted ${p.keys.length - failed.length} of ${p.keys.length} backup(s)\n`);
      if (failed.length) throw new Error(`${failed.length} backup(s) could not be deleted`);
      return { deleted: p.keys.length };
    },
  },
};

/** Long-running actions: the agent checks in every few seconds, so a cancel stops them promptly. */
export const STREAMING_ACTIONS: ReadonlySet<string> = new Set(["compose.logs_follow"]);

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
