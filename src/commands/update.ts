// update: the hired employee is fetched and verified again, and the files this plugin wrote are brought to the new
// version. A file the person changed is theirs: it is replaced only after a yes for that file. Files the plugin never
// wrote (USER.md, MEMORY.md, the agent's notes) are not looked at.
import { join } from "node:path";
import { shortName } from "../catalog/grammar.ts";
import { Refusal } from "../catalog/types.ts";
import { hexSum } from "../catalog/verify.ts";
import { setIdentity } from "../openclaw.ts";
import { workspaceFolder } from "../render/openclaw.ts";
import { currentSum, readRecord, remove, replace, workspaceFiles, writeRecord, type HireRecord } from "../workspace.ts";
import { checkID, confirm, type Context, employeeFor, needPerson } from "./context.ts";
import { recordFor } from "./hire.ts";
import { cli } from "./text.ts";

export interface UpdateOptions {
  yes?: boolean;
  replaceEdited?: boolean;
}

/** What an update would do to the workspace. */
export interface Plan {
  write: string[]; // files of ours as we left them, or not there yet: written without a question
  edited: string[]; // files the person changed, removed or put there: replaced only after a yes for each
  drop: string[]; // files of ours as we left them that the new version no longer has: removed
  left: string[]; // files the new version no longer has that the person changed: kept, no longer ours
}

/** Compares the workspace with the record of the hire and with the new files. */
export function plan(root: string, rec: HireRecord, files: Map<string, Uint8Array>): Plan {
  const p: Plan = { write: [], edited: [], drop: [], left: [] };
  for (const [rel, content] of files) {
    const now = currentSum(root, rel), was = rec.files[rel];
    if (now === hexSum(content)) continue;
    // The notice is the credit the licences ask for: it is always kept current.
    if (rel === "NOTICE.md" || (now === null && was === undefined) || (now !== null && now === was)) p.write.push(rel);
    else p.edited.push(rel);
  }
  for (const [rel, was] of Object.entries(rec.files)) {
    if (files.has(rel)) continue;
    const now = currentSum(root, rel);
    if (now === was) p.drop.push(rel);
    else if (now !== null) p.left.push(rel);
  }
  return p;
}

function summary(id: string, from: string, to: string, p: Plan): string {
  const lines = [`${id}: ${from === to ? `version ${to}` : `${from} → ${to}`}`];
  const list = (title: string, rels: string[]) => rels.length > 0 && lines.push(title, ...rels.map((r) => `  ${r}`));
  list("Written anew:", p.write);
  list("Changed by you since the hire (each is asked about; kept unless you say yes):", p.edited);
  list("No longer part of the employee, removed:", p.drop);
  list("No longer part of the employee, but changed by you: kept as your own files:", p.left);
  return lines.join("\n");
}

/** Asks about each file the person changed; gives the ones to replace. */
async function chooseEdited(cx: Context, opts: UpdateOptions, edited: string[]): Promise<string[]> {
  if (opts.replaceEdited) return edited;
  const take: string[] = [];
  for (const rel of edited) {
    if (!opts.yes && cx.ask && (await cx.ask(`${rel} was changed since the hire. Replace it with the new version?`))) take.push(rel);
  }
  return take;
}

/** `update <id>`. */
export async function updateCommand(cx: Context, id: string, opts: UpdateOptions = {}): Promise<void> {
  checkID(id);
  needPerson(cx, opts.yes);
  const root = join(cx.stateDir, workspaceFolder(shortName(id))), rec = readRecord(root);
  if (!rec || rec.id !== id) throw new Refusal(`${id} was not hired by this plugin on this machine (${cli("list")} shows who was)`);
  const h = await employeeFor(cx, id);
  const files = workspaceFiles(h.tree), p = plan(root, rec, files), to = h.employee.entry.version;
  if (p.write.length + p.edited.length + p.drop.length === 0) {
    writeRecord(root, { ...recordFor(h, rec.agent), files: keepSums(rec, files, []) });
    return cx.out(`${id} ${to}: every file is current.`);
  }
  cx.out(summary(id, rec.version, to, p));
  if (!(await confirm(cx, opts.yes, `Update ${id} in ${root}?`))) return cx.out("Nothing was changed.");
  const take = await chooseEdited(cx, opts, p.edited);
  for (const rel of [...p.write, ...take]) replace(root, rel, files.get(rel)!);
  for (const rel of p.drop) remove(root, rel);
  writeRecord(root, { ...recordFor(h, rec.agent), files: keepSums(rec, files, p.edited.filter((r) => !take.includes(r))) });
  if ([...p.write, ...take].includes("IDENTITY.md")) await setIdentity(cx.openclaw, rec.agent);
  const kept = p.edited.length - take.length;
  cx.out(`Updated: ${id} is at ${to}.` + (kept > 0 ? ` ${kept} file(s) you changed were kept as they are; --replace-edited replaces them.` : ""));
}

/**
 * The sums to remember after an update: the new file's for everything written, the old one for a file the person
 * changed and kept, so that the next update still sees it as theirs.
 */
function keepSums(rec: HireRecord, files: Map<string, Uint8Array>, kept: string[]): Record<string, string> {
  const sums: Record<string, string> = {};
  for (const [rel, content] of files) {
    if (!kept.includes(rel)) sums[rel] = hexSum(content);
    else if (rec.files[rel] !== undefined) sums[rel] = rec.files[rel];
  }
  return sums;
}
