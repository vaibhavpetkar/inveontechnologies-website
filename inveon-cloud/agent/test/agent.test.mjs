import { test } from "node:test";
import assert from "node:assert/strict";
import { runJob } from "../dist/agent.js";
import { HttpError } from "../dist/client.js";

function fakeClient({ cancelOn } = {}) {
  const reports = [];
  const finishes = [];
  return {
    reports,
    finishes,
    reportStep: async (jobId, stepId, body) => {
      if (cancelOn && stepId === cancelOn) throw new HttpError(409, "Job is cancelled");
      reports.push({ stepId, ...body });
    },
    finish: async (jobId, status, error) => finishes.push({ status, error }),
  };
}

const deps = { config: { appsRoot: "/nonexistent", nginxConfDir: "/nonexistent", acmeWebroot: "/x", letsencryptDir: "/x", workDir: "/x" }, runner: async () => ({ code: 0, stdout: "" }) };
const silence = () => {
  const orig = console.log;
  console.log = () => {};
  return () => (console.log = orig);
};

test("a disallowed action fails the job without running later steps", async () => {
  const restore = silence();
  try {
    const client = fakeClient();
    const status = await runJob(client, { id: "j", type: "x", title: "x", steps: [{ id: "s1", position: 0, name: "evil", action: "shell.exec", params: { cmd: "rm -rf /" } }, { id: "s2", position: 1, name: "reload", action: "nginx.reload", params: {} }] }, deps);
    assert.equal(status, "failure");
    assert.ok(client.reports.some((r) => r.stepId === "s1" && r.status === "failure"));
    assert.ok(client.reports.some((r) => r.append?.includes("Action not allowed: shell.exec")));
    assert.ok(!client.reports.some((r) => r.stepId === "s2"));
    assert.equal(client.finishes[0].status, "failure");
  } finally {
    restore();
  }
});

test("steps run in order and the job finishes successfully", async () => {
  const restore = silence();
  try {
    const client = fakeClient();
    const status = await runJob(client, { id: "j", type: "x", title: "x", steps: [{ id: "b", position: 1, name: "reload 2", action: "nginx.reload", params: {} }, { id: "a", position: 0, name: "reload 1", action: "nginx.reload", params: {} }] }, deps);
    assert.equal(status, "success");
    const order = client.reports.filter((r) => r.status === "success").map((r) => r.stepId);
    assert.deepEqual(order, ["a", "b"]);
    assert.ok(client.reports.some((r) => r.append?.includes("$ systemctl reload nginx")));
    assert.deepEqual(client.finishes, [{ status: "success", error: undefined }]);
  } finally {
    restore();
  }
});

test("a cancelled job stops without finishing", async () => {
  const restore = silence();
  try {
    const client = fakeClient({ cancelOn: "a" });
    const status = await runJob(client, { id: "j", type: "x", title: "x", steps: [{ id: "a", position: 0, name: "r", action: "nginx.reload", params: {} }] }, deps);
    assert.equal(status, "cancelled");
    assert.equal(client.finishes.length, 0);
  } finally {
    restore();
  }
});
