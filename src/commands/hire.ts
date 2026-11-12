// hire: an employee from the catalog becomes an OpenClaw agent with a workspace of its own. Nothing is written before
// everything verified and the person said yes; nothing that exists is overwritten.
import { join } from "node:path";
import { Refusal } from "../catalog/types.ts";
import { hexSum } from "../catalog/verify.ts";
import { addAgent, listAgents, setIdentity } from "../openclaw.ts";
import { workspaceFolder } from "../render/openclaw.ts";
import { VERSION } from "../version.ts";
import { isFree, RECORD_FILE, replace, rollback, workspaceFiles, writeNew, writeRecord, type HireRecord } from "../workspace.ts";
import { confirm, type Context, employeeFor, type Hired } from "./context.ts";
import { cli, describe } from "./text.ts";

// Agent ids OpenClaw keeps for itself.
const RESERVED = new Set(["openclaw", "crestodian"]);

/** Stops before anything is asked or written when the agent or its folder is already there. */
async function preflight(cx: Context, name: string, root: string): Promise<void> {
  if (RESERVED.has(name)) throw new Refusal(`OpenClaw keeps the agent name «${name}» for itself: this employee cannot be hired under it`);
  const agents = await listAgents(cx.openclaw);
  if (agents.some((a) => a.id.toLowerCase() === name)) {
    throw new Refusal(`an OpenClaw agent «${name}» already exists; nothing was changed. If this plugin hired it, ${cli("update <id>")} ` +
      "brings its new version; otherwise it is yours and stays as it is.");
  }
  if (!isFree(root)) {
    throw new Refusal(`the folder ${root} already holds files; nothing was changed. This plugin never writes into a folder that is in use.`);
  }
}

/** The record of a hire: the employee, the agent, and the SHA-256 of every file as written. */
export function recordFor(h: Hired, agent: string): HireRecord {
  const e = h.employee.entry, files: Record<string, string> = {};
  for (const [rel, content] of workspaceFiles(h.tree)) files[rel] = hexSum(content);
  return { v: 1, id: e.id, version: e.version, agent, seq: h.feed.feed.seq, plugin: VERSION, files };
}

/** Writes the employee's files and the record of them; takes them back when one cannot be written. */
function writeAll(h: Hired, root: string, agent: string): string[] {
  const written: string[] = [];
  try {
    for (const [rel, content] of workspaceFiles(h.tree)) {
      writeNew(root, rel, content);
      written.push(rel);
    }
    written.push(RECORD_FILE);
    writeRecord(root, recordFor(h, agent));
  } catch (err) {
    rollback(root, written);
    throw err instanceof Refusal ? err : new Refusal(`a file could not be written (${(err as Error).message}); what was written was removed`);
  }
  return written;
}

export interface HireOptions {
  yes?: boolean;
}

/** `hire <id>`. */
export async function hireCommand(cx: Context, id: string, opts: HireOptions = {}): Promise<void> {
  const h = await employeeFor(cx, id);
  const name = h.tree.name, root = join(cx.stateDir, workspaceFolder(name));
  await preflight(cx, name, root);
  cx.out(describe(h, root));
  if (!(await confirm(cx, opts.yes, `Hire ${id} as the OpenClaw agent «${name}»?`))) return cx.out("Nothing was written.");
  await preflight(cx, name, root); // the answer may have taken a while
  const written = writeAll(h, root, name);
  let agent: string;
  try {
    agent = await addAgent(cx.openclaw, name, root);
  } catch (err) {
    rollback(root, written);
    throw new Refusal(`${(err as Error).message}; the files written for it were removed`);
  }
  // OpenClaw puts the agent's id into the Name line of IDENTITY.md when it adds an agent: the employee's own file goes
  // back, and OpenClaw is told to read the name and the sign from it.
  replace(root, "IDENTITY.md", workspaceFiles(h.tree).get("IDENTITY.md")!);
  const named = await setIdentity(cx.openclaw, agent);
  if (agent !== name) writeRecord(root, recordFor(h, agent));
  cx.out([`Hired: ${id} ${h.employee.entry.version} is the OpenClaw agent «${agent}», workspace ${root}.`,
    named ? "" : `OpenClaw did not take the name from IDENTITY.md; set it with: openclaw agents set-identity --agent ${agent} --from-identity`,
    "It uses the model your OpenClaw is set up with. Talk to it:",
    `  openclaw agent --agent ${agent} --message "Who are you, what do you do first, what do you hand over?"`,
    `Later: ${cli(`update ${id}`)} brings a new version, ${cli(`fire ${id}`)} removes the agent.`].filter((l) => l !== "").join("\n"));
}
