// What the commands print. Every word that comes from the catalog is printed as text: control characters are dropped
// first, so a bundle cannot move the cursor or recolour the terminal.
import type { Entry } from "../catalog/types.ts";
import { printable } from "../gotext.ts";
import { sourceURL } from "../render/notice.ts";
import { needs } from "../render/persona.ts";
import { PLUGIN_ID } from "../version.ts";
import { workspaceFiles } from "../workspace.ts";
import type { Hired } from "./context.ts";

const one = (s: string) => printable(s).replace(/\s+/g, " ").trim();

/** An employee as a search shows it. */
export function card(e: Entry): string {
  const who = [e.persona.name, e.department].map(one).filter((s) => s !== "").join(", ");
  const lines = [`${e.id}  ${e.version}  ${one(e.title)}${who === "" ? "" : ` (${who})`}`];
  if (e.summary !== "") lines.push(`  ${one(e.summary)}`);
  if (e.skills.length > 0) lines.push(`  Good at: ${e.skills.map(one).join("; ")}`);
  return lines.join("\n");
}

/** A size in bytes, as a person reads it. */
function size(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

/** The employee's card, what it needs, the files that would be written and the notice that goes with them. */
export function describe(h: Hired, root: string): string {
  const e = h.employee.entry, files = workspaceFiles(h.tree), need = printable(needs(h.employee)).trimEnd();
  const scripts = [...files.keys()].filter((p) => /^skills\/[^/]+\/scripts\//.test(p)).length;
  const lines = [card(e), `  Licence: ${one(h.employee.doc.license) || "none stated"}`, `  Page: ${one(sourceURL(h.employee))}`, "",
    "What it needs:", need === "" ? "- Nothing beyond the model your OpenClaw already uses." : need, "",
    `Files (${files.size}), written to ${root}:`];
  for (const [rel, b] of files) lines.push(`  ${rel}  ${size(b.length)}`);
  if (scripts > 0) {
    lines.push("", `Among them: ${scripts} script file(s) of its skills. This plugin writes them as files and never runs them; the agent may run them later, as it may run any file in its workspace.`);
  }
  lines.push("", "The agent's own files (USER.md, MEMORY.md) are OpenClaw's and yours: this plugin does not write them.",
    "", "Notice (kept in the workspace as NOTICE.md):", "", printable(h.tree.notice).trimEnd());
  return lines.join("\n");
}

/** The command a person types in a terminal. */
export const cli = (rest: string) => `openclaw ${PLUGIN_ID} ${rest}`;
