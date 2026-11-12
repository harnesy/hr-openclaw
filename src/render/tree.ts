// Turns a verified employee bundle into the files an agent system reads: who the employee is, its job, its skills
// byte for byte, and the notice with its licence and credits. A target differs only in where the files go and how the
// persona is split; this plugin has one target, an OpenClaw agent workspace, and the layout leaves room for another
// (an OpenClaw Template folder) without a rewrite.
import { CASEBOOK_FILE } from "../catalog/grammar.ts";
import type { Employee } from "../catalog/types.ts";
import { Refusal } from "../catalog/types.ts";
import { cleanPath, compareBytes } from "../gotext.ts";
import { notice } from "./notice.ts";

export { hasCasebook, title } from "./names.ts";

/** One file of a tree: its path from the place the tree is written to, with forward slashes. */
export interface TreeFile {
  path: string;
  content: Uint8Array;
}

/** An employee rendered for a target. */
export interface Tree {
  name: string; // the employee's short name: its id without the publisher
  persona: string; // the path of the file that says who the employee is; it ends with the credit line
  job: string; // the path of the file that holds the job
  noticeFile: string; // the path of the notice
  notice: string; // the notice's text: licence, source, changes, credits
  files: TreeFile[]; // in path order
}

/** Where a target keeps things. */
export interface Layout {
  change: string; // the «Changes:» of the notice
  persona: string; // path of the persona file
  job: string; // path of the file with the job, when it is not the persona file
  notice: string; // path of the notice
  casebook: string; // path of the casebook
  inside: string; // the folder the employee reads its own files from; paths it is told are from there
  skillDir: (skill: string) => string; // folder of a skill
  skillRef: (skill: string) => string; // how the persona file points at a skill
}

const text = (s: string) => Buffer.from(s, "utf8");

/** A file a target wrote itself. */
export const own = (path: string, body: string): TreeFile => ({ path, content: text(body) });

/**
 * Puts a tree together: the persona file and any other files a target wrote itself, the casebook, every skill file
 * unchanged, the notice.
 */
export function assemble(e: Employee, name: string, l: Layout, files: TreeFile[]): Tree {
  const t: Tree = { name, persona: l.persona, job: l.job || l.persona, noticeFile: l.notice, notice: notice(e, l.change), files: [...files] };
  t.files.push(own(l.notice, "# Notice\n\n" + t.notice));
  for (const [path, b] of e.files) {
    if (path.startsWith("skills/")) {
      const rest = path.slice("skills/".length), cut = rest.indexOf("/");
      const skill = cut < 0 ? rest : rest.slice(0, cut), file = cut < 0 ? "" : rest.slice(cut + 1);
      t.files.push({ path: `${l.skillDir(skill)}/${file}`, content: b });
    } else if (path === CASEBOOK_FILE) {
      t.files.push({ path: l.casebook, content: b });
    }
  }
  t.files.sort((a, b) => compareBytes(a.path, b.path));
  for (const f of t.files) checkTreePath(f.path);
  return t;
}

/**
 * The second gate, independent of the catalog's grammar: every path of a tree is relative, clean and stays inside the
 * place the tree is written to.
 */
export function checkTreePath(path: string): void {
  if (path === "" || path.startsWith("/") || /[\\\0]/.test(path) || cleanPath(path) !== path || path === ".." || path.startsWith("../")) {
    throw new Refusal("a rendered file would land outside the employee's folder; nothing is written");
  }
}
