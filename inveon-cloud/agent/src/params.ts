/**
 * Strict parameter checks. The agent re-validates everything it receives,
 * whatever the control plane already checked: every value that reaches a
 * file path, an nginx config or a command's argv must match a whitelist.
 */
export class ParamError extends Error {}

type Obj = Record<string, unknown>;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const SERVICE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
export const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const COMPOSE_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}\.ya?ml$/;
export const REL_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}$/;
export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const SHA_RE = /^[0-9a-f]{40}$/;
export const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
export const S3_KEY_RE = /^[A-Za-z0-9._\/-]{1,512}$/;
/** A backup folder: slash-separated words ending in a slash, with no empty, "." or ".." parts. */
export const S3_PREFIX_RE = /^(?:(?!\.\.?\/)[A-Za-z0-9._-]{1,100}\/){1,10}$/;
/** A backup archive's file name (no folders). */
export const BACKUP_FILE_RE = /^[A-Za-z0-9._-]{1,200}\.tar\.gz$/;
export const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
/** One word of a release command: nothing a shell would interpret (same rule as the control plane). */
export const RELEASE_ARG_RE = /^[A-Za-z0-9_@%+=:,./-]{1,200}$/;
/** Images built on the server: a fixed local namespace, tagged with the commit. */
export const BUILT_IMAGE_RE = /^inveon-build\/[a-z0-9][a-z0-9-]{0,80}:[0-9a-f]{40}$/;
export const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const GITHUB_REPO_RE = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
export const REGISTRY_SERVER_RE = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/;
export const REGISTRY_USER_RE = /^[A-Za-z0-9._@+-]{1,256}$/;
export const URL_PATH_RE = /^\/[A-Za-z0-9._~\/?=&%-]{0,200}$/;

export function obj(v: unknown, what = "params"): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ParamError(`${what} must be an object`);
  return v as Obj;
}

export function str(p: Obj, key: string, re: RegExp): string {
  const v = p[key];
  if (typeof v !== "string" || !re.test(v)) throw new ParamError(`Invalid ${key}`);
  return v;
}

export function optStr(p: Obj, key: string, re: RegExp): string | null {
  if (p[key] === undefined || p[key] === null) return null;
  return str(p, key, re);
}

export function int(p: Obj, key: string, min: number, max: number): number {
  const v = p[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new ParamError(`Invalid ${key}`);
  return v;
}

export function bool(p: Obj, key: string): boolean {
  if (typeof p[key] !== "boolean") throw new ParamError(`Invalid ${key}`);
  return p[key] as boolean;
}

export function oneOf<T extends string>(p: Obj, key: string, values: readonly T[]): T {
  const v = p[key];
  if (typeof v !== "string" || !values.includes(v as T)) throw new ParamError(`Invalid ${key}`);
  return v as T;
}

export const SLOTS = ["blue", "green", "main"] as const;
export type Slot = (typeof SLOTS)[number];
/**
 * An image reference with a tag and no digest (registry/name:tag). Used only
 * for removing archived releases' images, whose tag must carry a commit SHA.
 */
export const IMAGE_REF_RE = /^(?:[a-z0-9][a-z0-9.-]*(?::\d{1,5})?\/)?[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
