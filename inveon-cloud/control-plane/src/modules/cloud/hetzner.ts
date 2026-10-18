import { ProviderApiError, providerRequest } from "./http.js";
import { CLOUD_IMAGES, type CloudApi, type CloudInstance, type CloudState } from "./provider.js";

/**
 * Hetzner Cloud (https://docs.hetzner.cloud/) with a project API token
 * (read and write). Servers carry labels for the Inveon ids.
 */

interface HetznerServer {
  id?: number;
  status?: string;
  labels?: Record<string, string>;
  server_type?: { name?: string };
  public_net?: { ipv4?: { ip?: string } | null };
  private_net?: { ip?: string }[];
}

const STATES: Record<string, CloudState> = {
  initializing: "pending",
  starting: "pending",
  running: "running",
  stopping: "stopping",
  off: "stopped",
  deleting: "terminating",
};

function instance(s: HetznerServer): CloudInstance {
  return {
    instanceId: String(s.id ?? ""),
    state: STATES[s.status ?? ""] ?? "unknown",
    raw: s.status ?? "unknown",
    publicIp: s.public_net?.ipv4?.ip ?? null,
    privateIp: s.private_net?.[0]?.ip ?? null,
    size: s.server_type?.name ?? null,
    tags: s.labels ?? {},
  };
}

const checkId = (id: string) => {
  if (!/^\d{1,20}$/.test(id)) throw new Error("Bad server id");
  return id;
};
const arch = (a: string | undefined) => (a === "arm" ? ("arm64" as const) : ("x86_64" as const));

export function hetznerApi(token: string): CloudApi {
  const req = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => providerRequest<T>("hetzner", token, method, path, body);
  const action = async (id: string, name: string, body?: Record<string, unknown>) => {
    await req("POST", `/servers/${checkId(id)}/actions/${name}`, body ?? {});
  };
  return {
    async verify() {
      // Tokens belong to one project and there is no "who am I" call: listing proves read access.
      await req("GET", "/servers?per_page=1");
      return { account: "Hetzner Cloud project" };
    },
    async regions() {
      const out = await req<{ locations?: { name: string; city?: string; description?: string }[] }>("GET", "/locations");
      return (out?.locations ?? []).map((l) => ({ id: l.name, name: `${l.city ?? l.description ?? l.name} (${l.name})` }));
    },
    async sizes() {
      const out = await req<{
        server_types?: { name: string; cores: number; memory: number; disk: number; architecture?: string; deprecated?: boolean | null; deprecation?: unknown; prices?: { location: string; price_monthly?: { gross?: string } }[] }[];
      }>("GET", "/server_types?per_page=50");
      return (out?.server_types ?? [])
        .filter((t) => !t.deprecated && !t.deprecation)
        .map((t) => {
          const prices = (t.prices ?? []).map((p) => Number(p.price_monthly?.gross)).filter((n) => Number.isFinite(n));
          return {
            id: t.name,
            vcpu: t.cores,
            memoryGb: t.memory,
            diskGb: t.disk,
            priceMonthly: prices.length ? Math.round(Math.min(...prices) * 100) / 100 : null,
            regions: (t.prices ?? []).map((p) => p.location),
            arch: arch(t.architecture),
          };
        });
    },
    async images() {
      const out = await req<{ images?: { name?: string | null; description?: string; architecture?: string }[] }>("GET", "/images?type=system&per_page=50");
      const seen = new Set<string>();
      const list = [];
      for (const i of out?.images ?? []) {
        if (!i.name || !CLOUD_IMAGES.hetzner.includes(i.name) || seen.has(i.name)) continue;
        seen.add(i.name);
        list.push({ id: i.name, name: i.description ?? i.name });
      }
      return list;
    },
    async create(i) {
      const out = await req<{ server?: HetznerServer }>("POST", "/servers", {
        name: i.name,
        server_type: i.size,
        location: i.region,
        image: i.image,
        user_data: i.userData,
        labels: i.tags,
        start_after_create: true,
        public_net: { enable_ipv4: true, enable_ipv6: true },
      });
      const id = out?.server?.id;
      if (!id) throw new ProviderApiError(502, "Hetzner returned no server id");
      return { instanceId: String(id) };
    },
    async describe(ids) {
      const found: CloudInstance[] = [];
      for (const id of ids) {
        try {
          const out = await req<{ server?: HetznerServer }>("GET", `/servers/${checkId(id)}`);
          if (out?.server) found.push(instance(out.server));
        } catch (err) {
          if (!(err instanceof ProviderApiError && err.status === 404)) throw err;
        }
      }
      return found;
    },
    // ACPI shutdown, so the apps stop cleanly.
    stop: (id) => action(id, "shutdown"),
    start: (id) => action(id, "poweron"),
    // upgrade_disk: false keeps the disk, so the type can be changed back down.
    resize: (id, size) => action(id, "change_type", { server_type: size, upgrade_disk: false }),
    async terminate(id) {
      try {
        await req("DELETE", `/servers/${checkId(id)}`);
      } catch (err) {
        if (!(err instanceof ProviderApiError && err.status === 404)) throw err;
      }
    },
  };
}
