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
export const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
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
