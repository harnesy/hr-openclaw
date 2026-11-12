// Search of the feed's cards by words and department, with the ranking of the reference implementation: employees
// that match more words come first, then the better matches, then the ones named by the very word, then the feed's
// order. It runs on the person's machine: the words are never sent anywhere.
import type { Entry } from "./catalog/types.ts";
import { byteLen } from "./gotext.ts";
import { shortName } from "./catalog/grammar.ts";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 20;
const MAX_QUERY_BYTES = 256;
const MAX_TERMS = 16;

// Words too common in a request to tell one employee from another.
const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "for", "to", "of", "on", "in", "with", "who", "that", "can", "me", "my",
  "i", "we", "our", "need", "find", "want", "someone", "somebody", "employee", "agent", "hire", "install", "hr"]);

// A field's weight: where a word is found says how much the employee is about it.
const NAME = 5, SKILL = 3, SUMMARY = 2, OTHER = 1;

interface Index {
  weights: Map<string, number>; // stems, each with the weight of the best field it stands in
  named: Set<string>; // the words of its title and id as written, in the singular
}

/** Splits text into lowercase words of letters and digits. */
function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{Nd}]+/u).filter((w) => w !== "");
}

function cutEnd(w: string, end: string): string | null {
  return w.endsWith(end) && byteLen(w) - byteLen(end) >= 4 ? w.slice(0, w.length - end.length) : null;
}

/** Drops a plural s, so that «accountants» names the «accountant». */
const singular = (w: string) => cutEnd(w, "s") ?? w;

/** Cuts a common English ending, so that «accountant» finds «accounting». A rough cut for matching, not grammar. */
function stem(w: string): string {
  for (const end of ["ments", "ment", "ings", "ing", "ants", "ant", "ers", "er", "ed", "es", "s"]) {
    const cut = cutEnd(w, end);
    if (cut !== null) return cut;
  }
  return w;
}

function indexOf(e: Entry): Index {
  const ix: Index = { weights: new Map(), named: new Set() };
  const add = (weight: number, ...texts: string[]) => {
    for (const w of texts.flatMap(tokens).map(stem)) {
      if ((ix.weights.get(w) ?? 0) < weight) ix.weights.set(w, weight);
    }
  };
  const name = shortName(e.id);
  add(NAME, e.title, name);
  for (const w of tokens(`${e.title} ${name}`)) ix.named.add(singular(w));
  add(SKILL, ...e.skills, ...e.tags, ...e.keywords);
  add(SUMMARY, e.summary);
  add(OTHER, e.department, e.persona.name, ...e.industries);
  return ix;
}

/** How well the index answers one word: the best weight among the words it matches. */
function score(ix: Index, word: string): number {
  let best = ix.weights.get(word) ?? 0;
  if (byteLen(word) < 4) return best; // a short word («go», «ui») matches only itself
  for (const [w, weight] of ix.weights) {
    if (weight > best && byteLen(w) >= 4 && (w.startsWith(word) || word.startsWith(w))) best = weight;
  }
  return best;
}

export interface Found {
  entries: Entry[]; // one page
  total: number; // how many employees match in all
}

/**
 * Finds employees: those in the department, when one is given, that match at least one word of the text. No words
 * lists everyone in the feed's order. A long request is cut: it cannot make the search slow.
 */
export function search(entries: readonly Entry[], text: string, department = "", limit = DEFAULT_LIMIT): Found {
  const asked = tokens(Buffer.from(text, "utf8").subarray(0, MAX_QUERY_BYTES).toString("utf8"))
    .map((w) => ({ word: singular(w), stem: stem(w) })).filter((t) => !STOP_WORDS.has(t.stem)).slice(0, MAX_TERMS);
  const hits: { e: Entry; matched: number; score: number; named: number }[] = [];
  for (const e of entries) {
    if (department !== "" && department.toLowerCase() !== e.department.toLowerCase()) continue;
    const ix = indexOf(e), h = { e, matched: 0, score: 0, named: 0 };
    for (const t of asked) {
      const s = score(ix, t.stem);
      if (s > 0) (h.matched++, (h.score += s));
      if (ix.named.has(t.word)) h.named++;
    }
    if (h.matched > 0 || asked.length === 0) hits.push(h);
  }
  hits.sort((a, b) => b.matched - a.matched || b.score - a.score || b.named - a.named); // stable: the feed's order last
  const n = Math.min(limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);
  return { entries: hits.slice(0, n).map((h) => h.e), total: hits.length };
}
