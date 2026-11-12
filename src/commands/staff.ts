// The employees hired on this machine: list them, fire one. Only what this plugin hired: an agent of the person's own
// is never listed as an employee and never deleted here.
import { lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { shortName } from "../catalog/grammar.ts";
import { Refusal } from "../catalog/types.ts";
import { deleteAgent, listAgents } from "../openclaw.ts";
import { workspaceFolder } from "../render/openclaw.ts";
import { readRecord, type HireRecord } from "../workspace.ts";
import { checkID, confirm, type Context } from "./context.ts";
import { cli } from "./text.ts";

/** The records of every workspace this plugin wrote under the state directory. */
export function hired(stateDir: string): { root: string; rec: HireRecord }[] {
  const out: { root: string; rec: HireRecord }[] = [];
  let names: string[];
  try {
    names = readdirSync(stateDir).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    const root = join(stateDir, name);
    if (!name.startsWith("workspace-") || !lstatSync(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    try {
      const rec = readRecord(root);
      if (rec && workspaceFolder(shortName(rec.id)) === name) out.push({ root, rec });
    } catch {
      // a damaged record is not a hire to list; update and fire say what is wrong with it
    }
  }
  return out;
}

/** `list`: who was hired here. It reads the disk only: nothing is fetched. */
export function listCommand(cx: Context): void {
  const all = hired(cx.stateDir);
  if (all.length === 0) return cx.out(`Nobody is hired yet. Find someone: ${cli("search <words>")}`);
  cx.out(all.map(({ root, rec }) => `${rec.id}  ${rec.version}  agent «${rec.agent}»  ${root}`).join("\n"));
}

export interface FireOptions {
  yes?: boolean;
}

/** `fire <id>`: after a yes, OpenClaw deletes the agent (it moves the workspace, state and transcripts to the Trash). */
export async function fireCommand(cx: Context, id: string, opts: FireOptions = {}): Promise<void> {
  checkID(id);
  const root = join(cx.stateDir, workspaceFolder(shortName(id))), rec = readRecord(root);
  if (!rec || rec.id !== id) {
    throw new Refusal(`${id} was not hired by this plugin on this machine (${cli("list")} shows who was). An agent of your own is removed with: openclaw agents delete <id>`);
  }
  const agent = (await listAgents(cx.openclaw)).find((a) => a.id === rec.agent);
  if (!agent) throw new Refusal(`OpenClaw has no agent «${rec.agent}» any more; the folder ${root} is left as it is`);
  if (resolve(agent.workspace) !== resolve(root)) {
    throw new Refusal(`the OpenClaw agent «${rec.agent}» works in ${agent.workspace}, not in the folder this plugin wrote: it is not deleted here`);
  }
  const question = `Fire ${id}? OpenClaw deletes the agent «${rec.agent}» and moves its workspace, state and transcripts to the Trash.`;
  if (!(await confirm(cx, opts.yes, question))) return cx.out("Nothing was changed.");
  await deleteAgent(cx.openclaw, rec.agent);
  cx.out(`Fired: the OpenClaw agent «${rec.agent}» (${id}) is deleted.`);
}
