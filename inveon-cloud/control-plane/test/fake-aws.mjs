// Preloaded into the control plane under test (node --import) to replace
// the AWS SDK with an in-memory EC2/SSM/STS and KMS. The test drives it over a small
// HTTP port (FAKE_AWS_PORT): read the recorded calls, change instance
// states, and make the next call of a method fail. Never calls AWS.
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { setEc2ApiFactory } from "../dist/modules/aws/provider.js";
import { KMS_CONTEXT, setKmsApiFactory } from "../dist/lib/kms.js";
import { setRoute53ApiFactory } from "../dist/modules/dns/route53.js";

const state = {
  calls: [],
  instances: new Map(), // id -> { instanceId, state, publicIp, privateIp, tags, region }
  groups: new Map(), // id -> { name, vpcId, sshCidr, region }
  failNext: new Map(), // method -> message
  n: 0,
  // Route 53: public hosted zones, and TXT record sets by "zoneId|name".
  zones: [{ id: "Z0FAKEZONE00001", name: "aws-zone.test" }],
  txt: new Map(),
  changes: new Map(), // change id -> polls left before INSYNC
};
const hex = () => (++state.n).toString(16).padStart(17, "0");

function api(creds, region) {
  const call = (method, args) => {
    state.calls.push({ method, region, creds: { ...creds, secretAccessKey: creds.secretAccessKey ? "(set)" : undefined }, args });
    const fail = state.failNext.get(method);
    if (fail) {
      state.failNext.delete(method);
      const err = new Error(fail);
      err.name = "UnauthorizedOperation";
      throw err;
    }
  };
  return {
    async verify() {
      call("verify", {});
      return { accountId: "123456789012", arn: "arn:aws:sts::123456789012:assumed-role/inveon/inveon-cloud" };
    },
    async ubuntuAmi(arch) {
      call("ubuntuAmi", { arch });
      return arch === "arm64" ? "ami-0aaaaaaaaaaaaaaa1" : "ami-0bbbbbbbbbbbbbbb2";
    },
    async defaultVpcId() {
      call("defaultVpcId", {});
      return "vpc-0123456789abcdef0";
    },
    async subnetVpcId(subnetId) {
      call("subnetVpcId", { subnetId });
      return "vpc-0fedcba9876543210";
    },
    async listSecurityGroups() {
      call("listSecurityGroups", {});
      return [{ id: "sg-0123456789abcdef0", name: "default", vpcId: "vpc-0123456789abcdef0" }];
    },
    async listKeyPairs() {
      call("listKeyPairs", {});
      return ["ops-key"];
    },
    async createSecurityGroup(input) {
      call("createSecurityGroup", input);
      const id = `sg-${hex()}`;
      state.groups.set(id, { ...input, region });
      return id;
    },
    async deleteSecurityGroup(id) {
      call("deleteSecurityGroup", { id });
      state.groups.delete(id);
    },
    async runInstance(input) {
      call("runInstance", input);
      const instanceId = `i-${hex()}`;
      state.instances.set(instanceId, { instanceId, state: "pending", publicIp: null, privateIp: "10.0.0.5", instanceType: input.instanceType, tags: { Name: input.name, ...input.tags }, region });
      return { instanceId };
    },
    async describeInstances(ids) {
      call("describeInstances", { ids });
      return ids.map((id) => state.instances.get(id)).filter(Boolean).map((i) => ({ ...i }));
    },
    async terminateInstance(id) {
      call("terminateInstance", { id });
      const i = state.instances.get(id);
      if (i) i.state = "shutting-down";
    },
    async stopInstance(id) {
      call("stopInstance", { id });
      const i = state.instances.get(id);
      if (i) i.state = "stopping";
    },
    async startInstance(id) {
      call("startInstance", { id });
      const i = state.instances.get(id);
      if (i) i.state = "pending";
    },
    async modifyInstanceType(id, instanceType) {
      call("modifyInstanceType", { id, instanceType });
      const i = state.instances.get(id);
      if (!i || i.state !== "stopped") {
        const err = new Error("The instance is not in the 'stopped' state.");
        err.name = "IncorrectInstanceState";
        throw err;
      }
      i.instanceType = instanceType;
    },
  };
}

setEc2ApiFactory(api);

// Fake Route 53, with the real API's rules that matter here: UPSERT
// replaces the whole record set, DELETE must name its exact values, and a
// change is PENDING for one poll before it is INSYNC.
setRoute53ApiFactory((creds) => {
  const call = (method, args) => {
    state.calls.push({ method, creds: { ...creds, secretAccessKey: creds.secretAccessKey ? "(set)" : undefined }, args });
    const fail = state.failNext.get(method);
    if (fail) {
      state.failNext.delete(method);
      throw Object.assign(new Error(fail), { name: "AccessDenied" });
    }
  };
  return {
    async findZone(name) {
      call("route53.findZone", { name });
      return state.zones.find((z) => z.name === name) ?? null;
    },
    async changeTxt(zoneId, action, name, values, ttl) {
      call("route53.changeTxt", { zoneId, action, name, values, ttl });
      const zone = state.zones.find((z) => z.id === zoneId);
      if (!zone || !(name === zone.name || name.endsWith(`.${zone.name}`))) throw Object.assign(new Error("No such zone or name"), { name: "InvalidChangeBatch" });
      const key = `${zoneId}|${name}`;
      if (action === "DELETE") {
        const cur = state.txt.get(key);
        if (!cur || JSON.stringify([...cur].sort()) !== JSON.stringify([...values].sort())) throw Object.assign(new Error("Tried to delete resource record set but the values do not match"), { name: "InvalidChangeBatch" });
        state.txt.delete(key);
      } else state.txt.set(key, [...values]);
      const id = `C${hex()}`;
      state.changes.set(id, 1);
      return id;
    },
    async changeStatus(id) {
      call("route53.changeStatus", { id });
      const left = state.changes.get(id) ?? 0;
      state.changes.set(id, left - 1);
      return left > 0 ? "PENDING" : "INSYNC";
    },
  };
});

// Fake KMS. A "ciphertext blob" is the data key sealed with a fixed fake
// KMS key, bound to the KMS key id and the encryption context, so blobs
// made by one process (keys:kms-generate) decrypt in another (the server),
// and a tampered blob or a different context fails like real KMS would.
// KMS key ids starting with "deny" are refused (AccessDenied).
const FAKE_KMS_ROOT = createHash("sha256").update("inveon fake kms").digest();
const kmsContext = JSON.stringify(KMS_CONTEXT);
setKmsApiFactory((region) => ({
  async generateDataKey(keyId) {
    state.calls.push({ method: "kms.generateDataKey", region, args: { keyId } });
    if (keyId.includes("deny")) throw Object.assign(new Error("User is not authorized to perform kms:GenerateDataKey"), { name: "AccessDeniedException" });
    const plaintext = randomBytes(32);
    const arn = keyId.startsWith("arn:") ? keyId : `arn:aws:kms:${region ?? "us-east-1"}:123456789012:key/fake-${keyId.replace(/[^A-Za-z0-9-]/g, "-")}`;
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", FAKE_KMS_ROOT, iv).setAAD(Buffer.from(`${arn}|${kmsContext}`));
    const ct = Buffer.concat([c.update(plaintext), c.final()]);
    const id = Buffer.from(arn);
    const blob = Buffer.concat([Buffer.from([id.length]), id, iv, c.getAuthTag(), ct]);
    return { plaintext, ciphertextBlob: blob, keyArn: arn };
  },
  async decrypt(blob) {
    state.calls.push({ method: "kms.decrypt", region, args: {} });
    const n = blob[0];
    const arn = blob.subarray(1, 1 + n).toString();
    const iv = blob.subarray(1 + n, 13 + n);
    const tag = blob.subarray(13 + n, 29 + n);
    try {
      const d = createDecipheriv("aes-256-gcm", FAKE_KMS_ROOT, iv).setAAD(Buffer.from(`${arn}|${kmsContext}`));
      d.setAuthTag(tag);
      return Buffer.concat([d.update(blob.subarray(29 + n)), d.final()]);
    } catch {
      throw Object.assign(new Error("The ciphertext is invalid"), { name: "InvalidCiphertextException" });
    }
  },
}));

const port = Number(process.env.FAKE_AWS_PORT);
if (port) {
  createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const json = body ? JSON.parse(body) : {};
      const send = (v) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(v ?? {}));
      if (url.pathname === "/calls") return send(state.calls);
      if (url.pathname === "/groups") return send([...state.groups.keys()]);
      if (url.pathname === "/route53/txt") return send(Object.fromEntries(state.txt));
      let m = url.pathname.match(/^\/instances\/([^/]+)$/);
      if (m && req.method === "POST") {
        const i = state.instances.get(m[1]);
        if (!i) return res.writeHead(404).end("{}");
        Object.assign(i, json);
        return send(i);
      }
      if (m && req.method === "DELETE") return send(state.instances.delete(m[1]));
      if (url.pathname === "/fail") {
        state.failNext.set(json.method, json.message ?? "You are not authorized to perform this operation.");
        return send();
      }
      res.writeHead(404).end("{}");
    });
  })
    .listen(port, "127.0.0.1")
    .unref();
}
