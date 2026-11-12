// The few things this plugin asks of OpenClaw itself, through its command line: list agents, add one, read its
// identity file, delete one. Every call is an argument array handed to the same openclaw program that is running:
// no shell, no string put together from catalog text.
import { spawn } from "node:child_process";
import { Refusal } from "./catalog/types.ts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs `openclaw <args…>` and gives what it printed. */
export type Runner = (args: readonly string[]) => Promise<RunResult>;

/** Runs the openclaw program this plugin was loaded by, with the same Node. */
export function spawnRunner(argv: readonly string[] = process.argv, execPath = process.execPath): Runner {
  return (args) => new Promise((resolve) => {
    const cli = argv[1];
    if (!cli) return resolve({ code: 1, stdout: "", stderr: "the openclaw program that is running was not found" });
    const child = spawn(execPath, [cli, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: stderr + err.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export interface Agent {
  id: string;
  workspace: string;
}

/** The last lines OpenClaw printed, for a refusal: what it said, cut short. */
function said(r: RunResult): string {
  const text = (r.stderr.trim() || r.stdout.trim()).split("\n").slice(-3).join(" ").slice(0, 400);
  return text === "" ? `exit code ${r.code}` : text;
}

/**
 * Reads the JSON a command printed; undefined when it printed something else. A line or two of another kind before
 * the JSON (a warning, a notice) does not hide it.
 */
export function json(stdout: string): unknown {
  for (let at = stdout.search(/^[[{]/m); at >= 0;) {
    try {
      return JSON.parse(stdout.slice(at));
    } catch {
      const next = stdout.slice(at + 1).search(/^[[{]/m);
      at = next < 0 ? -1 : at + 1 + next;
    }
  }
  return undefined;
}

/** `openclaw agents list --json`. */
export async function listAgents(run: Runner): Promise<Agent[]> {
  const r = await run(["agents", "list", "--json"]);
  const list = r.code === 0 ? json(r.stdout) : undefined;
  if (!Array.isArray(list)) throw new Refusal(`OpenClaw did not list its agents (${said(r)})`);
  return list.flatMap((a: unknown) => {
    const o = (a ?? {}) as Record<string, unknown>;
    return typeof o["id"] === "string" ? [{ id: o["id"], workspace: typeof o["workspace"] === "string" ? o["workspace"] : "" }] : [];
  });
}

/** `openclaw agents add <name> --workspace <dir> --non-interactive`; gives the id OpenClaw made of the name. */
export async function addAgent(run: Runner, name: string, workspace: string): Promise<string> {
  const r = await run(["agents", "add", name, "--workspace", workspace, "--non-interactive", "--json"]);
  if (r.code !== 0) throw new Refusal(`OpenClaw did not add the agent (${said(r)})`);
  const id = (json(r.stdout) as { agentId?: unknown } | undefined)?.agentId;
  return typeof id === "string" && id !== "" ? id : name;
}

/** `openclaw agents set-identity --agent <id> --from-identity`: OpenClaw reads the name and the sign from IDENTITY.md. */
export async function setIdentity(run: Runner, id: string): Promise<boolean> {
  return (await run(["agents", "set-identity", "--agent", id, "--from-identity", "--json"])).code === 0;
}

/** `openclaw agents delete <id> --force`: the person has already said yes to this plugin. */
export async function deleteAgent(run: Runner, id: string): Promise<void> {
  const r = await run(["agents", "delete", id, "--force", "--json"]);
  if (r.code !== 0) throw new Refusal(`OpenClaw did not delete the agent (${said(r)})`);
}
