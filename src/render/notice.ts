// The notice that travels with an installed employee. Its wording is fixed: it is what the licences ask for (author,
// copyright notice, licence and its address, source, changes, disclaimer, the works it is built on).
import type { Employee } from "../catalog/types.ts";
import { trimSpace } from "../gotext.ts";
import { title } from "./names.ts";

// The catalog's own publisher and how its works are credited.
const OWN_PUBLISHER = "harnsy";
const OWN_AUTHOR = "harnsy (Pavel Buchnev)";
const OWN_HOLDER = "Pavel Buchnev (harnsy)";

/** The id of the public-domain dedication: a work under it carries no copyright notice. */
const CC0 = "CC0-1.0";

/** Text licences the catalog takes, as a notice names them. */
const LICENCE_LINES = new Map([
  ["CC-BY-4.0", "Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)."],
  [CC0, "Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)."],
]);

/** The employee's page on the catalog. */
export function sourceURL(e: Employee): string {
  return e.entry.cvUrl !== "" ? e.entry.cvUrl : "https://hr.harnsy.dev/e/" + e.entry.id;
}

/** The year the employee was first published: the feed's date, else the day its file was packed. */
function year(e: Employee): string {
  for (const d of [e.entry.published, e.manifest.createdAt]) {
    const b = Buffer.from(d, "utf8");
    if (b.length >= 4) return b.subarray(0, 4).toString("utf8");
  }
  return "";
}

/**
 * Reads the bundle's licence expression: the line for the employee's text, and whether that text is dedicated to the
 * public domain. Other ids of the expression are the licences of parts of its skills.
 */
function textLicence(expr: string): { line: string; dedicated: boolean } {
  for (const part of expr.split(" AND ")) {
    const id = trimSpace(part);
    const line = LICENCE_LINES.get(id);
    if (line !== undefined) return { line, dedicated: id === CC0 };
  }
  if (expr === "") return { line: "No licence is stated for this employee: do not copy or redistribute it.", dedicated: false };
  return { line: `Licensed under ${expr}.`, dedicated: false };
}

/** Whether the employee is the catalog's own: its text is harnsy's, not another publisher's. */
const isOwn = (e: Employee) => e.entry.publisher === OWN_PUBLISHER;

const publisherName = (e: Employee) => (e.entry.publisherName !== "" ? e.entry.publisherName : e.entry.publisher);

/**
 * Names who made the work, with the copyright notice of its first publication. A work dedicated to the public domain
 * has no copyright notice: its author is named as a courtesy.
 */
function author(e: Employee, dedicated: boolean): string {
  let name = publisherName(e), holder = publisherName(e), where = ", published on hr.harnsy.dev.";
  if (isOwn(e)) [name, holder, where] = [OWN_AUTHOR, OWN_HOLDER, "."];
  if (dedicated) return name + ".";
  const y = year(e);
  if (y !== "") holder = `${y} ${holder}`;
  return `${name}, © ${holder}${where}`;
}

/**
 * The head of the notice in one line: who made the work, its licence, where it is, what was changed. It is also the
 * last line of the persona file, so the credit survives when only that file is copied.
 */
export function credit(e: Employee, change: string): string {
  const { line, dedicated } = textLicence(e.doc.license);
  return `${title(e)} ${e.entry.version} by ${author(e, dedicated)} ${line} Source: ${sourceURL(e)}. Changes: ${change}.` +
    " Provided as is, without warranty of any kind (see the licence).";
}

/** Whether a skill of the employee carries its own LICENSE file. */
function hasSkillLicence(e: Employee): boolean {
  for (const path of e.files.keys()) {
    if (!path.startsWith("skills/")) continue;
    const rest = path.slice("skills/".length), cut = rest.indexOf("/");
    if (cut >= 0 && rest.slice(cut + 1) === "LICENSE") return true;
  }
  return false;
}

/**
 * The text that travels with an installed employee: the credit line, who stands behind the work, the publisher's
 * note, the licence of parts of its skills, the works it is built on as the bundle lists them, and what the licence
 * does not cover.
 */
export function notice(e: Employee, change: string): string {
  let b = credit(e, change) + "\n";
  let from = "the publisher", names = "The names and logos «harnsy» and «hr.harnsy.dev» are not covered by this licence.";
  if (isOwn(e)) {
    from = OWN_PUBLISHER;
    names = "The names and logos «harnsy» and «hr.harnsy.dev», and the picture of this employee (not included here), are not covered by this licence.";
  } else {
    b += "\nhr.harnsy.dev lists this work; it is not made or endorsed by harnsy.\n";
  }
  if (e.entry.licenseNote !== "") b += `\nNote from ${from}: ${e.entry.licenseNote}\n`;
  if (hasSkillLicence(e)) {
    b += "\nSome skills carry another licence for the parts adapted from other works or for their scripts (for example MIT): it is the `LICENSE` file in that skill's folder, and it applies to those parts";
    if (e.doc.license !== "") b += ` (the bundle's licence: ${e.doc.license})`;
    b += ".\n";
  }
  if (e.doc.attribution.length > 0) {
    b += "\nBuilt on:\n";
    for (const a of e.doc.attribution) b += `- ${a.name}, ${a.url}, ${a.license}, ${a.modified ? "modified" : "not modified"}\n`;
  }
  return b + "\n" + names + "\n";
}
