#!/usr/bin/env node
import { parseArgs } from "node:util";
import { AGENT_VERSION, DEFAULTS, DEFAULT_CONFIG_PATH, checkControlPlaneUrl, loadConfig, saveConfig } from "./config.js";
import { ControlPlaneClient } from "./client.js";
import { collectFacts } from "./facts.js";
import { spawnRunner } from "./exec.js";
import { runAgent } from "./agent.js";

const usage = `inveon-agent ${AGENT_VERSION}

  inveon-agent register --url https://cloud.example.com --token <install token> [--config ${DEFAULT_CONFIG_PATH}]
  inveon-agent run [--config ${DEFAULT_CONFIG_PATH}]
  inveon-agent version
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({ args: rest, options: { url: { type: "string" }, token: { type: "string" }, config: { type: "string", default: DEFAULT_CONFIG_PATH } } });
  const configPath = values.config ?? DEFAULT_CONFIG_PATH;

  if (command === "version") {
    console.log(AGENT_VERSION);
    return;
  }
  if (command === "register") {
    if (!values.url || !values.token) throw new Error(usage);
    const url = checkControlPlaneUrl(values.url);
    const client = new ControlPlaneClient(url, null);
    const { serverId, agentToken } = await client.register(values.token, await collectFacts(spawnRunner));
    saveConfig(configPath, { ...DEFAULTS, controlPlaneUrl: url, serverId, token: agentToken });
    console.log(`Registered as server ${serverId}. Config written to ${configPath}.`);
    return;
  }
  if (command === "run") {
    const config = loadConfig(configPath);
    config.controlPlaneUrl = checkControlPlaneUrl(config.controlPlaneUrl);
    await runAgent(config, spawnRunner);
    return;
  }
  console.log(usage);
  process.exitCode = command ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
