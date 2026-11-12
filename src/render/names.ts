// What a renderer reads of an employee before it writes a word.
import { CASEBOOK_FILE } from "../catalog/grammar.ts";
import type { Employee } from "../catalog/types.ts";

/** The employee's display title. */
export function title(e: Employee): string {
  return e.entry.title !== "" ? e.entry.title : e.doc.role.name;
}

export const hasCasebook = (e: Employee) => e.files.has(CASEBOOK_FILE);
