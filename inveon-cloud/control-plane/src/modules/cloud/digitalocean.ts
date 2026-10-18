import { ProviderApiError, providerRequest } from "./http.js";
import { CLOUD_IMAGES, type CloudApi, type CloudInstance, type CloudState } from "./provider.js";

/**
 * DigitalOcean (API v2, https://docs.digitalocean.com/reference/api/) with
 * a personal access token. Droplets are tagged with single-word tags
 * "<key>:<value>", read back into a map.
 */

interface Droplet {
  id?: number;
  status?: string;
  size_slug?: string;
  tags?: string[];
  networks?: { v4?: { ip_address?: string; type?: string }[] };
}

const STATES: Record<string, CloudState> = { new: "pending", active: "running", off: "stopped", archive: "terminated" };

const toTags = (tags: Record<string, string>) => Object.entries(tags).map(([k, v]) => `${k}:${v}`.replace(/[^A-Za-z0-9:_-]/g, "-").slice(0, 255));
const fromTags = (tags: string[] = []) => Object.fromEntries(tags.filter((t) => t.includes(":")).map((t) => [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)]));

function instance(d: Droplet): CloudInstance {
  const v4 = d.networks?.v4 ?? [];
  return {
    instanceId: String(d.id ?? ""),
    state: STATES[d.status ?? ""] ?? "unknown",
    raw: d.status ?? "unknown",
    publicIp: v4.find((n) => n.type === "public")?.ip_address ?? null,
    privateIp: v4.find((n) => n.type === "private")?.ip_address ?? null,
    size: d.size_slug ?? null,
    tags: fromTags(d.tags),
  };
}

const ID_RE = /^\d{1,20}$/;
const checkId = (id: string) => {
  if (!ID_RE.test(id)) throw new Error("Bad droplet id");
  return id;
};

export function digitalOceanApi(token: string): CloudApi {
  const req = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => providerRequest<T>("digitalocean", token, method, path, body);
  const action = async (id: string, body: Record<string, unknown>) => {
    await req("POST", `/droplets/${checkId(id)}/actions`, body);
  };
  return {
    async verify() {
      const out = await req<{ account?: { email?: string; team?: { name?: string } } }>("GET", "/account");
      return { account: out?.account?.team?.name ?? out?.account?.email ?? "DigitalOcean account" };
    },
    async regions() {
      const out = await req<{ regions?: { slug: string; name: string; available?: boolean }[] }>("GET", "/regions?per_page=200");
      return (out?.regions ?? []).filter((r) => r.available !== false).map((r) => ({ id: r.slug, name: r.name }));
    },
    async sizes() {
      const out = await req<{ sizes?: { slug: string; vcpus: number; memory: number; disk: number; price_monthly?: number; regions?: string[]; available?: boolean }[] }>(
        "GET",
        "/sizes?per_page=200",
      );
      return (out?.sizes ?? [])
        .filter((s) => s.available !== false)
        .map((s) => ({ id: s.slug, vcpu: s.vcpus, memoryGb: Math.round((s.memory / 1024) * 10) / 10, diskGb: s.disk, priceMonthly: s.price_monthly ?? null, regions: s.regions ?? [], arch: "x86_64" as const }));
    },
    async images() {
      const out = await req<{ images?: { slug?: string | null; distribution?: string; name?: string }[] }>("GET", "/images?type=distribution&per_page=200");
      return (out?.images ?? []).filter((i) => i.slug && CLOUD_IMAGES.digitalocean.includes(i.slug)).map((i) => ({ id: i.slug!, name: `${i.distribution ?? ""} ${i.name ?? ""}`.trim() || i.slug! }));
    },
    async create(i) {
      const out = await req<{ droplet?: Droplet }>("POST", "/droplets", {
        name: i.name,
        region: i.region,
        size: i.size,
        image: i.image,
        user_data: i.userData,
        tags: toTags(i.tags),
        ipv6: true,
        monitoring: false,
      });
      const id = out?.droplet?.id;
      if (!id) throw new ProviderApiError(502, "DigitalOcean returned no droplet id");
      return { instanceId: String(id) };
    },
    async describe(ids) {
      const found: CloudInstance[] = [];
      for (const id of ids) {
        try {
          const out = await req<{ droplet?: Droplet }>("GET", `/droplets/${checkId(id)}`);
          if (out?.droplet) found.push(instance(out.droplet));
        } catch (err) {
          if (!(err instanceof ProviderApiError && err.status === 404)) throw err;
        }
      }
      return found;
    },
    // A clean shutdown (ACPI), not a power cut.
    stop: (id) => action(id, { type: "shutdown" }),
    start: (id) => action(id, { type: "power_on" }),
    // disk: false keeps the disk size, so the droplet can be resized back down.
    resize: (id, size) => action(id, { type: "resize", size, disk: false }),
    async terminate(id) {
      try {
        await req("DELETE", `/droplets/${checkId(id)}`);
      } catch (err) {
        if (!(err instanceof ProviderApiError && err.status === 404)) throw err;
      }
    },
  };
}
