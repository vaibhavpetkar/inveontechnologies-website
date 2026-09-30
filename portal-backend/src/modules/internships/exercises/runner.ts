/**
 * Runs student code for the auto-checked exercises.
 *
 * Production uses Judge0 (hosted on RapidAPI, or self-hosted), which runs
 * each program in its own sandbox with no network and strict limits. The
 * portal never executes student code itself in production.
 *
 * The "local" runner executes code directly on this machine with a timeout.
 * It has no sandbox, so it only exists for development and the exercise
 * verifier, and refuses to start when NODE_ENV is production.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "../../shared/logger.js";
import type { RunLanguage } from "./types.js";

export interface RunResult {
  status: "ok" | "compile_error" | "runtime_error" | "timeout";
  stdout: string;
  stderr: string;
}

export interface CodeRunner {
  name: "judge0" | "local";
  run(language: RunLanguage, source: string, stdin: string): Promise<RunResult>;
}

export class RunnerUnavailableError extends Error {}

const MAX_OUTPUT = 64 * 1024;

// ---------- Judge0 ----------

/** Judge0 CE language ids; override with PORTAL_JUDGE0_LANGUAGE_IDS="python=92,java=91". */
const JUDGE0_IDS: Record<RunLanguage, number> = { javascript: 63, python: 71, c: 50, cpp: 54, csharp: 51, java: 62, sql: 82 };

export function judge0Runner(opts: { url: string; key?: string; languageIds?: string }): CodeRunner {
  const ids = { ...JUDGE0_IDS };
  for (const pair of (opts.languageIds ?? "").split(",")) {
    const [lang, id] = pair.split("=").map((s) => s.trim());
    if (lang in ids && Number(id) > 0) ids[lang as RunLanguage] = Number(id);
  }
  const base = opts.url.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.key) {
    const host = new URL(base).host;
    if (host.endsWith("rapidapi.com")) {
      headers["X-RapidAPI-Key"] = opts.key;
      headers["X-RapidAPI-Host"] = host;
    } else {
      headers["X-Auth-Token"] = opts.key;
    }
  }
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, "base64").toString("utf8") : "");
  return {
    name: "judge0",
    async run(language, source, stdin) {
      let res: Response;
      try {
        res = await fetch(`${base}/submissions?base64_encoded=true&wait=true`, {
          method: "POST",
          headers,
          body: JSON.stringify({ language_id: ids[language], source_code: b64(source), stdin: b64(stdin), cpu_time_limit: 5, wall_time_limit: 10, memory_limit: 256000 }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        logger.warn({ err }, "judge0 unreachable");
        throw new RunnerUnavailableError("The code checker is unreachable right now");
      }
      if (!res.ok) {
        logger.warn({ status: res.status, body: (await res.text()).slice(0, 500) }, "judge0 error");
        throw new RunnerUnavailableError(res.status === 429 ? "The code checker is busy; try again in a minute" : "The code checker returned an error");
      }
      const body = (await res.json()) as { status?: { id: number }; stdout?: string; stderr?: string; compile_output?: string; message?: string };
      const id = body.status?.id ?? 0;
      // 3 accepted/ran, 4 wrong answer (unused: we compare ourselves), 5 time limit, 6 compile error, 7-12 runtime errors, 13-14 internal.
      if (id === 13 || id === 14) throw new RunnerUnavailableError("The code checker had an internal error");
      const stdout = unb64(body.stdout).slice(0, MAX_OUTPUT);
      if (id === 5) return { status: "timeout", stdout, stderr: "Time limit exceeded" };
      if (id === 6) return { status: "compile_error", stdout, stderr: unb64(body.compile_output) };
      if (id >= 7) return { status: "runtime_error", stdout, stderr: unb64(body.stderr) || unb64(body.message) };
      return { status: "ok", stdout, stderr: unb64(body.stderr) };
    },
  };
}

// ---------- Local (development only) ----------

function exec(cmd: string, args: string[], opts: { cwd: string; stdin?: string; timeoutMs: number }): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d;
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += d;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: String(err.message), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(opts.stdin ?? "");
  });
}

/** Runs the SQL with node:sqlite and prints rows like the sqlite3 shell does (a|b). */
const SQLITE_SCRIPT = `
const { DatabaseSync } = require("node:sqlite");
const src = require("fs").readFileSync(process.argv[1], "utf8");
const db = new DatabaseSync(":memory:");
const stmts = [];
let cur = "", q = null;
for (let i = 0; i < src.length; i++) {
  const ch = src[i];
  if (q) { cur += ch; if (ch === q) q = null; continue; }
  if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
  if (ch === "-" && src[i + 1] === "-") { while (i < src.length && src[i] !== "\\n") i++; cur += "\\n"; continue; }
  if (ch === ";") { if (cur.trim()) stmts.push(cur); cur = ""; continue; }
  cur += ch;
}
if (cur.trim()) stmts.push(cur);
for (const s of stmts) {
  const st = db.prepare(s);
  if (st.setReturnArrays) st.setReturnArrays(true);
  for (const r of st.all()) console.log(Object.values(r).map((v) => v === null ? "" : String(v)).join("|"));
}
`;

const available = new Map<string, boolean>();
async function has(cmd: string) {
  if (!available.has(cmd)) available.set(cmd, (await exec("sh", ["-c", `command -v ${cmd}`], { cwd: tmpdir(), timeoutMs: 5000 })).code === 0);
  return available.get(cmd)!;
}

export function localRunner(): CodeRunner {
  return {
    name: "local",
    async run(language, source, stdin) {
      const dir = await mkdtemp(path.join(tmpdir(), "exercise-"));
      try {
        const run = async (cmd: string, args: string[]): Promise<RunResult> => {
          const r = await exec(cmd, args, { cwd: dir, stdin, timeoutMs: 5000 });
          if (r.timedOut) return { status: "timeout", stdout: r.stdout, stderr: "Time limit exceeded" };
          return { status: r.code === 0 ? "ok" : "runtime_error", stdout: r.stdout, stderr: r.stderr };
        };
        const compile = async (cmd: string, args: string[]) => {
          if (!(await has(cmd))) throw new RunnerUnavailableError(`${cmd} isn't installed on this machine`);
          const r = await exec(cmd, args, { cwd: dir, timeoutMs: 30_000 });
          return r.code === 0 ? null : ({ status: "compile_error", stdout: "", stderr: r.stderr || r.stdout } as RunResult);
        };
        switch (language) {
          case "javascript":
            await writeFile(path.join(dir, "main.js"), source);
            return await run(process.execPath, ["main.js"]);
          case "python":
            await writeFile(path.join(dir, "main.py"), source);
            return await run("python3", ["main.py"]);
          case "c":
            await writeFile(path.join(dir, "main.c"), source);
            return (await compile("gcc", ["-O1", "-o", "main", "main.c", "-lm"])) ?? (await run(path.join(dir, "main"), []));
          case "cpp":
            await writeFile(path.join(dir, "main.cpp"), source);
            return (await compile("g++", ["-O1", "-std=c++17", "-o", "main", "main.cpp"])) ?? (await run(path.join(dir, "main"), []));
          case "java":
            await writeFile(path.join(dir, "Main.java"), source);
            return (await compile("javac", ["Main.java"])) ?? (await run("java", ["-cp", ".", "Main"]));
          case "csharp":
            await writeFile(path.join(dir, "main.cs"), source);
            return (await compile("mcs", ["-out:main.exe", "main.cs"])) ?? (await run("mono", ["main.exe"]));
          case "sql":
            await writeFile(path.join(dir, "main.sql"), source);
            return await run(process.execPath, ["--no-warnings", "-e", SQLITE_SCRIPT, path.join(dir, "main.sql")]);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

// ---------- Choosing one ----------

export interface RunnerEnv {
  NODE_ENV: string;
  PORTAL_CODE_RUNNER?: string;
  PORTAL_JUDGE0_URL?: string;
  PORTAL_JUDGE0_KEY?: string;
  PORTAL_JUDGE0_LANGUAGE_IDS?: string;
}

/** The configured runner, or null when code can't be run (rule checks still work). */
export function runnerFromEnv(env: RunnerEnv): CodeRunner | null {
  const mode = env.PORTAL_CODE_RUNNER ?? (env.PORTAL_JUDGE0_URL ? "judge0" : "off");
  if (mode === "judge0" && env.PORTAL_JUDGE0_URL) return judge0Runner({ url: env.PORTAL_JUDGE0_URL, key: env.PORTAL_JUDGE0_KEY, languageIds: env.PORTAL_JUDGE0_LANGUAGE_IDS });
  if (mode === "local") {
    if (env.NODE_ENV === "production") {
      logger.error("PORTAL_CODE_RUNNER=local is not allowed in production (no sandbox); code checks are off");
      return null;
    }
    return localRunner();
  }
  return null;
}
