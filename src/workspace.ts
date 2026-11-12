// Files of a hired employee on the person's disk: every write goes through one gate that keeps it inside the
// employee's own workspace folder, and a record of what was written lets a later update tell the plugin's files from
// the person's.
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isID, isVersion } from "./catalog/grammar.ts";
import { Refusal } from "./catalog/types.ts";
import { hexSum } from "./catalog/verify.ts";
import { workspaceFolder } from "./render/openclaw.ts";
import { checkTreePath, type Tree } from "./render/tree.ts";

export const RECORD_FILE = ".harnsy/hire.json";

/** What the plugin wrote into a workspace: which employee, and the SHA-256 of every file as it wrote it. */
export interface HireRecord {
  v: 1;
  id: string;
  version: string;
  agent: string; // the OpenClaw agent id
  seq: number; // the feed it came from
  plugin: string; // the plugin version that wrote it
  files: Record<string, string>;
}

/** The files of a tree by their path inside the workspace. */
export function workspaceFiles(tree: Tree): Map<string, Uint8Array> {
  const home = workspaceFolder(tree.name) + "/", files = new Map<string, Uint8Array>();
  for (const f of tree.files) {
    if (!f.path.startsWith(home)) throw new Refusal("a path that would leave the employee's workspace; nothing is written");
    const rel = f.path.slice(home.length);
    checkTreePath(rel);
    files.set(rel, f.content);
  }
  return files;
}

/**
 * The place of rel under root. Refuses a path that is not clean, that resolves outside root, or that passes through a
 * link: nothing is ever read or written through a link someone left in the workspace.
 */
export function target(root: string, rel: string): string {
  checkTreePath(rel);
  const base = resolve(root), full = resolve(base, ...rel.split("/"));
  if (!full.startsWith(base + sep)) throw new Refusal("a path that would leave the employee's workspace; nothing is written");
  let at = base;
  for (const part of ["", ...rel.split("/")]) {
    at = part === "" ? at : join(at, part);
    const st = lstatSync(at, { throwIfNoEntry: false });
    if (!st) break;
    if (st.isSymbolicLink()) throw new Refusal(`${rel}: a link stands in the way; this plugin does not read or write through links`);
    if (at !== full && !st.isDirectory()) throw new Refusal(`${rel}: a file stands where a folder should be`);
  }
  return full;
}

/** Whether a folder is free to become a workspace: it is not there, or it is an empty folder. */
export function isFree(root: string): boolean {
  const st = lstatSync(root, { throwIfNoEntry: false });
  return !st || (st.isDirectory() && readdirSync(root).length === 0);
}

/** The SHA-256 of the file at rel, or null when there is no plain file there. */
export function currentSum(root: string, rel: string): string | null {
  const full = target(root, rel);
  const st = lstatSync(full, { throwIfNoEntry: false });
  return st?.isFile() ? hexSum(readFileSync(full)) : null;
}

/** Writes a file that must not be there yet. Files are data: none is made executable. */
export function writeNew(root: string, rel: string, content: Uint8Array): void {
  const full = target(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, { flag: "wx", mode: 0o644 });
}

/** Writes a file in the place of the one that is there, in one step. */
export function replace(root: string, rel: string, content: Uint8Array): void {
  const full = target(root, rel), tmp = `${full}.harnsy-tmp`;
  mkdirSync(dirname(full), { recursive: true });
  rmSync(tmp, { force: true });
  writeFileSync(tmp, content, { flag: "wx", mode: 0o644 });
  renameSync(tmp, full);
}

/** Removes a file, and the folders it leaves empty, up to the workspace itself (which stays). */
export function remove(root: string, rel: string): void {
  const full = target(root, rel), base = resolve(root);
  rmSync(full, { force: true });
  for (let dir = dirname(full); dir.startsWith(base + sep); dir = dirname(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
  }
}

/** Takes back a hire that did not finish: the files written, the folders left empty, the workspace if nothing else is in it. */
export function rollback(root: string, written: readonly string[]): void {
  for (const rel of [...written].reverse()) {
    try {
      remove(root, rel);
    } catch {
      // what cannot be removed stays; the caller reports the hire as failed either way
    }
  }
  try {
    rmdirSync(resolve(root));
  } catch {
    // not empty, or not there
  }
}

export function writeRecord(root: string, rec: HireRecord): void {
  replace(root, RECORD_FILE, Buffer.from(JSON.stringify(rec, null, 2) + "\n", "utf8"));
}

/**
 * Reads the record of a workspace; null when the plugin wrote none. The file is data like any other in a workspace an
 * agent works in: its names are checked again before they are used.
 */
export function readRecord(root: string): HireRecord | null {
  if (currentSum(root, RECORD_FILE) === null) return null;
  const bad = new Refusal(`${join(root, ...RECORD_FILE.split("/"))} is damaged: it is this plugin's record of what it wrote there`);
  let rec: HireRecord;
  try {
    rec = JSON.parse(readFileSync(target(root, RECORD_FILE), "utf8")) as HireRecord;
  } catch {
    throw bad;
  }
  if (typeof rec !== "object" || rec === null || rec.v !== 1 || typeof rec.id !== "string" || !isID(rec.id) || typeof rec.version !== "string" ||
    !isVersion(rec.version) || typeof rec.agent !== "string" || typeof rec.files !== "object" || rec.files === null) throw bad;
  for (const [rel, sum] of Object.entries(rec.files)) {
    if (typeof sum !== "string" || !/^[0-9a-f]{64}$/.test(sum) || !isOurs(rel)) throw bad;
  }
  return rec;
}

/** Whether a path inside a workspace is one this plugin writes: never the person's own files or the agent's memory. */
export function isOurs(rel: string): boolean {
  try {
    checkTreePath(rel);
  } catch {
    return false;
  }
  return ["SOUL.md", "AGENTS.md", "IDENTITY.md", "NOTICE.md", "docs/persona-casebook.md"].includes(rel) || rel.startsWith("skills/");
}
