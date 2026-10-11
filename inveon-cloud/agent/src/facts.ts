import { cpus, totalmem } from "node:os";
import { hostname } from "node:os";
import { readFileSync, statfsSync } from "node:fs";
import { AGENT_VERSION } from "./config.js";
import type { Runner } from "./exec.js";

export interface HostFacts {
  hostname?: string;
  os?: string;
  cpuCount?: number;
  memoryBytes?: number;
  diskTotalBytes?: number;
  diskFreeBytes?: number;
  dockerVersion?: string;
  agentVersion: string;
}

export async function collectFacts(runner: Runner): Promise<HostFacts> {
  const facts: HostFacts = { agentVersion: AGENT_VERSION, hostname: hostname().slice(0, 255), cpuCount: cpus().length, memoryBytes: totalmem() };
  try {
    const release = readFileSync("/etc/os-release", "utf8");
    facts.os = release.match(/^PRETTY_NAME="?([^"\n]*)"?/m)?.[1]?.slice(0, 255);
  } catch {
    facts.os = process.platform;
  }
  try {
    const s = statfsSync("/");
    facts.diskTotalBytes = s.blocks * s.bsize;
    facts.diskFreeBytes = s.bavail * s.bsize;
  } catch {
    // not available
  }
  try {
    const r = await runner("docker", ["version", "--format", "{{.Server.Version}}"], { captureStdout: true, timeoutMs: 10000 }, () => undefined);
    const v = r.stdout.trim();
    if (r.code === 0 && /^[0-9A-Za-z.+-]{1,64}$/.test(v)) facts.dockerVersion = v;
  } catch {
    // docker missing
  }
  return facts;
}
