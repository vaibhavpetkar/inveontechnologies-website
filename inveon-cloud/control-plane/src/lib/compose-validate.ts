// Shared compose validator. The same file lives in agent/src and
// control-plane/src/lib; a control-plane test fails if they drift apart.
//
// Input is the fully resolved model printed by
//   docker compose -f <file> config --format json
// so anchors, extends, includes, env_file and ${VAR} interpolation are
// already expanded by Docker itself, and relative bind paths are absolute.
// Validating that model (not the raw YAML) means a trick in the YAML can't
// hide a mount from us.
import { posix } from "node:path";

export interface ComposeValidationResult {
  ok: boolean;
  errors: string[];
}

const DANGEROUS_CAPS = new Set([
  "ALL",
  "SYS_ADMIN",
  "SYS_MODULE",
  "SYS_PTRACE",
  "SYS_RAWIO",
  "SYS_BOOT",
  "SYS_TIME",
  "NET_ADMIN",
  "DAC_READ_SEARCH",
  "MAC_ADMIN",
  "MAC_OVERRIDE",
  "BPF",
  "PERFMON",
]);

const HOST_NAMESPACE_KEYS = ["network_mode", "pid", "ipc", "uts", "userns_mode", "cgroup"] as const;
const FORBIDDEN_KEYS = ["devices", "device_cgroup_rules", "cgroup_parent"] as const;
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** True when p (absolute, POSIX) is appRoot itself or inside it, after normalising "..". */
export function isInside(appRoot: string, p: string): boolean {
  const root = posix.resolve(appRoot);
  const target = posix.resolve(root, p);
  return target === root || target.startsWith(root.endsWith("/") ? root : root + "/");
}

function isDockerSocket(p: string) {
  const n = posix.resolve("/", p);
  return /(^|\/)docker\.sock$/.test(n) || n === "/var/run/docker" || n === "/run/docker" || n.startsWith("/run/containerd") || n.startsWith("/var/run/containerd");
}

/** Short-syntax volume "src:dst[:mode]" to { type, source }. */
function parseShortVolume(v: string): { type: string; source?: string } {
  const parts = v.split(":");
  if (parts.length === 1) return { type: "volume" };
  const src = parts[0];
  if (src.startsWith("/") || src.startsWith(".") || src.startsWith("~")) return { type: "bind", source: src };
  return { type: "volume", source: src };
}

export function validateCompose(model: unknown, opts: { appRoot: string }): ComposeValidationResult {
  const errors: string[] = [];
  const appRoot = posix.resolve(opts.appRoot);
  if (!isObj(model)) return { ok: false, errors: ["Compose model is not an object"] };
  const services = model.services;
  if (!isObj(services) || Object.keys(services).length === 0) return { ok: false, errors: ["Compose file has no services"] };

  const checkPath = (where: string, source: unknown) => {
    if (typeof source !== "string" || source.length === 0) {
      errors.push(`${where}: bind mount without a source path`);
      return;
    }
    if (source.startsWith("~")) {
      errors.push(`${where}: home-directory paths are not allowed (${source})`);
      return;
    }
    if (isDockerSocket(source)) {
      errors.push(`${where}: mounting the Docker socket is not allowed`);
      return;
    }
    if (!isInside(appRoot, source)) errors.push(`${where}: bind mount ${source} is outside the app folder ${appRoot}`);
  };

  for (const [name, raw] of Object.entries(services)) {
    const where = `services.${name}`;
    if (!isObj(raw)) {
      errors.push(`${where}: not an object`);
      continue;
    }
    const svc = raw;
    if (svc.privileged === true || svc.privileged === "true") errors.push(`${where}: privileged: true is not allowed`);

    for (const key of HOST_NAMESPACE_KEYS) {
      const v = svc[key];
      if (typeof v === "string" && v.trim().toLowerCase() === "host") errors.push(`${where}: ${key}: host is not allowed`);
    }
    for (const key of FORBIDDEN_KEYS) {
      const v = svc[key];
      if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) errors.push(`${where}: ${key} is not allowed`);
    }

    if (Array.isArray(svc.cap_add)) {
      for (const cap of svc.cap_add) {
        const c = String(cap).toUpperCase().replace(/^CAP_/, "");
        if (DANGEROUS_CAPS.has(c)) errors.push(`${where}: cap_add ${c} is not allowed`);
      }
    }

    if (Array.isArray(svc.security_opt)) {
      for (const opt of svc.security_opt) {
        const o = String(opt).toLowerCase().replace(/=/g, ":");
        if (o.includes("unconfined") || o.startsWith("label:disable") || o === "no-new-privileges:false") errors.push(`${where}: security_opt ${opt} is not allowed`);
      }
    }

    if (Array.isArray(svc.volumes)) {
      svc.volumes.forEach((vol, i) => {
        const w = `${where}.volumes[${i}]`;
        const v = typeof vol === "string" ? parseShortVolume(vol) : isObj(vol) ? { type: String(vol.type ?? "volume"), source: vol.source as string | undefined } : null;
        if (!v) {
          errors.push(`${w}: unreadable volume entry`);
          return;
        }
        if (v.type === "bind") checkPath(w, v.source);
        else if (v.type === "npipe") errors.push(`${w}: npipe mounts are not allowed`);
        else if (v.type === "volume" || v.type === "tmpfs" || v.type === "image") {
          // Named volumes are checked at the top level (driver_opts can hide a bind).
        } else errors.push(`${w}: volume type ${v.type} is not allowed`);
      });
    }

    if (Array.isArray(svc.volumes_from) && svc.volumes_from.length > 0) {
      for (const vf of svc.volumes_from) if (String(vf).startsWith("container:")) errors.push(`${where}: volumes_from another container is not allowed`);
    }

    if (Array.isArray(svc.ports)) {
      svc.ports.forEach((p, i) => {
        const w = `${where}.ports[${i}]`;
        let hostIp: string | undefined;
        let published: unknown;
        if (isObj(p)) {
          hostIp = typeof p.host_ip === "string" ? p.host_ip : undefined;
          published = p.published;
        } else {
          // Short syntax, in case the model was not normalised:
          // "80", "8080:80", "127.0.0.1:8080:80", "[::1]:8080:80".
          const s = String(p).replace(/\/\w+$/, "");
          const bracket = s.match(/^\[([0-9a-fA-F:.]+)\]:(.+)$/);
          const parts = bracket ? [bracket[1], ...bracket[2].split(":")] : s.split(":");
          if (parts.length === 2) published = parts[0];
          else if (parts.length === 3) {
            hostIp = parts[0];
            published = parts[1];
          } else if (parts.length > 3) {
            errors.push(`${w}: unreadable port mapping ${s}`);
            return;
          }
        }
        if (published === undefined || published === null || published === "") return; // container-only port
        if (!hostIp || !LOOPBACK.has(hostIp)) errors.push(`${w}: published ports must bind to 127.0.0.1 (nginx is the only public entry), e.g. "127.0.0.1:\${INVEON_HTTP_PORT}:3000"`);
      });
    }

    if (svc.build !== undefined) {
      const ctx = typeof svc.build === "string" ? svc.build : isObj(svc.build) ? svc.build.context : undefined;
      if (typeof ctx === "string" && !/^(https?|git):\/\//.test(ctx) && !ctx.startsWith("git@")) checkPath(`${where}.build.context`, ctx);
    }
  }

  // Top-level named volumes: the local driver with o=bind is a bind mount in disguise.
  if (isObj(model.volumes)) {
    for (const [name, raw] of Object.entries(model.volumes)) {
      if (!isObj(raw)) continue;
      const opts = isObj(raw.driver_opts) ? raw.driver_opts : null;
      if (opts) {
        const o = String(opts.o ?? "");
        const device = opts.device;
        if (/(^|,)\s*r?bind\s*(,|$)/.test(o) || (typeof device === "string" && device.startsWith("/"))) checkPath(`volumes.${name}.driver_opts.device`, device);
        if (String(opts.type ?? "").toLowerCase() === "none" && device === undefined) errors.push(`volumes.${name}: driver_opts without a device`);
      }
    }
  }

  // configs/secrets read host files into containers.
  for (const section of ["configs", "secrets"] as const) {
    const sec = model[section];
    if (!isObj(sec)) continue;
    for (const [name, raw] of Object.entries(sec)) {
      if (isObj(raw) && typeof raw.file === "string") checkPath(`${section}.${name}.file`, raw.file);
    }
  }

  return { ok: errors.length === 0, errors };
}
