// An employee as an OpenClaw agent workspace in a folder of its own, workspace-<name>/: SOUL.md says who the employee
// is, AGENTS.md holds the job (a sub-agent is given only that file, so it also says who it is), IDENTITY.md the name
// and the vibe, skills/ its skills, which belong to this agent only. The person's own files (USER.md, MEMORY.md) and
// the first-run ritual (BOOTSTRAP.md) are never written.
import { shortName } from "../catalog/grammar.ts";
import type { Employee } from "../catalog/types.ts";
import { fields, trimSpace } from "../gotext.ts";
import { creditLine, intro, job, who, whoAmI } from "./persona.ts";
import { assemble, own, title, type Layout, type Tree } from "./tree.ts";

// What OpenClaw loads of a workspace at the start of a session (agents.defaults.bootstrapMaxChars and
// bootstrapTotalMaxChars); a longer file is cut. The casebook stays out of the loaded files for that reason.
export const OPENCLAW_FILE_MAX = 20000; // characters of one file
export const OPENCLAW_TOTAL_MAX = 60000; // characters of all loaded files together

/** The folder of an employee's workspace under OpenClaw's state directory. */
export const workspaceFolder = (name: string) => `workspace-${name}`;

export function renderOpenClaw(e: Employee): Tree {
  const name = shortName(e.entry.id), home = workspaceFolder(name) + "/";
  const l: Layout = {
    change: "rendered for openclaw", inside: home,
    persona: home + "SOUL.md", job: home + "AGENTS.md", notice: home + "NOTICE.md", casebook: home + "docs/persona-casebook.md",
    skillDir: (skill) => `${home}skills/${skill}`,
    skillRef: (skill) => "`" + skill + "` (a skill of this workspace)",
  };
  const soul = `# ${title(e)}\n\n` + intro(e) + who(e) + creditLine(e, l);
  const agents = `# ${title(e)}: the job\n\n` + whoAmI(e) + " This file is your job; your character is in `SOUL.md`.\n\n" +
    job(e, l) + creditLine(e, l);
  return assemble(e, name, l, [own(l.persona, soul), own(l.job, agents), own(home + "IDENTITY.md", identity(e))]);
}

/** IDENTITY.md: one `- Label: value` line per field, the form OpenClaw parses and writes itself. */
function identity(e: Employee): string {
  const name = e.doc.persona.name !== "" ? e.doc.persona.name : title(e);
  let b = `# IDENTITY.md\n\n- Name: ${oneLine(name)}\n- Creature: AI agent, ${oneLine(e.doc.role.name)}\n`;
  const vibe = oneLine(e.doc.role.tagline);
  if (vibe !== "") b += `- Vibe: ${vibe}\n`;
  return b + `- Emoji: ${emoji(e.doc.role.department)}\n`;
}

/** Joins a text into one line. */
const oneLine = (s: string) => fields(s).join(" ");

// One sign per department of the catalog. Each is a single character: no joined or tinted signs, which some readers
// take for hidden text.
const DEPARTMENT_EMOJI = new Map([
  ["content", "\u{1F4DD}"], ["data", "\u{1F4CA}"], ["design", "\u{1F3A8}"], ["engineering", "\u{1F527}"], ["finance", "\u{1F9EE}"],
  ["hr", "\u{1F465}"], ["legal", "\u{1F4DC}"], ["management", "\u{1F9ED}"], ["marketing", "\u{1F4E3}"], ["operations", "\u{1F4CB}"],
  ["product", "\u{1F4E6}"], ["sales", "\u{1F91D}"], ["support", "\u{1F3A7}"],
]);

const emoji = (department: string) => DEPARTMENT_EMOJI.get(trimSpace(department).toLowerCase()) ?? "\u{1F916}";
