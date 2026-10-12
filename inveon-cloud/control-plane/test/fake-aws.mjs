// Preloaded into the control plane under test (node --import) to replace
// the AWS SDK with an in-memory EC2/SSM/STS. The test drives it over a small
// HTTP port (FAKE_AWS_PORT): read the recorded calls, change instance
// states, and make the next call of a method fail. Never calls AWS.
import { createServer } from "node:http";
import { setEc2ApiFactory } from "../dist/modules/aws/provider.js";

const state = {
  calls: [],
  instances: new Map(), // id -> { instanceId, state, publicIp, privateIp, tags, region }
  groups: new Map(), // id -> { name, vpcId, sshCidr, region }
  failNext: new Map(), // method -> message
  n: 0,
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
      state.instances.set(instanceId, { instanceId, state: "pending", publicIp: null, privateIp: "10.0.0.5", tags: { Name: input.name, ...input.tags }, region });
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
  };
}

setEc2ApiFactory(api);

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
