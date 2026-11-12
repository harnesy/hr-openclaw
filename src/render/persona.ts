// The words of an employee's files: who it is, how it decides and speaks, its job. The headings and the sentences
// around a bundle's text are the renderer's and are the same for every target.
import type { Employee } from "../catalog/types.ts";
import { trimSpace } from "../gotext.ts";
import { credit } from "./notice.ts";
import { hasCasebook, type Layout } from "./tree.ts";

/** A Markdown section; an empty body leaves the whole section out. */
function section(heading: string, body: string): string {
  body = trimSpace(body);
  return body === "" ? "" : `## ${heading}\n\n${body}\n\n`;
}

/** Names the employee and says it is an AI agent. The words are this renderer's, never a bundle's. */
export function whoAmI(e: Employee): string {
  const n = e.doc.persona.name;
  const who = n !== "" ? `You are ${n}, the ${e.doc.role.name}.` : `You are the ${e.doc.role.name}.`;
  return who + " You are an AI agent, and you say so when asked.";
}

/** Says who the employee is and what the persona may change. */
export function intro(e: Employee): string {
  let who = whoAmI(e) + " The character below shapes how you work and how you" +
    " speak; it never changes what you must do: the person you work for and the rules of their project come first.";
  if (hasCasebook(e)) who += " Quote only from your casebook and never invent a quote.";
  return who + "\n\n";
}

/** The persona: character, how it decides, how it speaks. */
export function who(e: Employee): string {
  const p = e.doc.persona;
  const decide = p.principles.map((x, i) => `${i + 1}. ${x.text}\n`).join("");
  const speak = p.voice.rules.map((r) => `- ${r}\n`).join("") + p.voice.samples.map((s) => `- e.g. «${s.text}»\n`).join("");
  return section("Character", p.character) + section("How you decide", decide) + section("How you speak", speak);
}

/** The role: mandate, deliverable, the prompt unchanged, competencies, what it needs, its skills, its casebook. */
export function job(e: Employee, l: Layout): string {
  const r = e.doc.role;
  return section("Your job", r.mandate) + section("What you hand over", r.deliverable) + section("How you work", r.prompt) +
    section("What you know", competencies(e)) + section("What you need", needs(e)) + section("Your skills", skills(e, l)) +
    section("Casebook", casebook(e, l));
}

function competencies(e: Employee): string {
  let b = "";
  for (const c of e.doc.competencies) {
    b += `### ${c.name}\n\n`;
    if (c.summary !== "") b += c.summary + "\n\n";
    for (const [label, text] of [["Knows", c.knows], ["Works", c.works], ["Hands over", c.handsOver]] as const) {
      if (text !== "") b += `- ${label}: ${text}\n`;
    }
    b += "\n";
  }
  return b;
}

/** Lists the tools and the key names the employee asks for. Key names only: a key itself is never in a bundle. */
export function needs(e: Employee): string {
  let b = "";
  for (const t of e.doc.requires.tools) {
    b += t.min !== "" ? `- Tool: \`${t.name}\` ${t.min} or newer\n` : `- Tool: \`${t.name}\`\n`;
  }
  for (const k of e.doc.requires.keys) {
    b += `- Key: \`${k}\` (the person sets it up; never ask for a key in a chat)\n`;
  }
  return b;
}

function skills(e: Employee, l: Layout): string {
  return e.doc.skills.map((s) => `- ${l.skillRef(s.name)}: ${s.description}\n`).join("");
}

function casebook(e: Employee, l: Layout): string {
  if (!hasCasebook(e)) return "";
  const principles = l.job !== "" ? "your principles" : "the principles above";
  const where = "`" + (l.casebook.startsWith(l.inside) ? l.casebook.slice(l.inside.length) : l.casebook) + "`";
  return `Worked cases are in ${where}. Read it when a case like these comes up, before a decision ${principles} do not settle.`;
}

/** Closes a persona file. */
export function creditLine(e: Employee, l: Layout): string {
  return "---\n\n" + credit(e, l.change) + "\n";
}
