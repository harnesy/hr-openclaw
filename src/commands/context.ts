// What a command needs from the world around it. The plugin's entry file fills it in with the real things; tests
// with their own.
import { clip, isID } from "../catalog/grammar.ts";
import { fetchEmployee, fetchFeed, findEntry } from "../catalog/release.ts";
import { httpSource, type Source } from "../catalog/source.ts";
import type { Employee, VerifiedFeed } from "../catalog/types.ts";
import { CATALOG_HOST, Refusal } from "../catalog/types.ts";
import { catalogConfig, CATALOG_KEYS, NO_KEY } from "../keys.ts";
import type { Runner } from "../openclaw.ts";
import { renderOpenClaw } from "../render/openclaw.ts";
import type { Tree } from "../render/tree.ts";
import { rememberSeq, seenSeq } from "../state.ts";
import { USER_AGENT } from "../version.ts";

export interface Context {
  env: Record<string, string | undefined>;
  stateDir: string; // OpenClaw's state directory
  now: () => Date;
  out: (text: string) => void; // prints a block of text
  ask: ((question: string) => Promise<boolean>) | null; // asks the person yes or no; null where no person can answer
  openclaw: Runner;
  testCatalog?: boolean; // the command line said --test-catalog: without it a test catalog is never read
  chat?: boolean; // the command came from a chat, where a test catalog is never read
  source?: (base: string) => Source; // where the catalog is read from; the network when left out
  keys?: readonly { kid: string; pub: string }[]; // the built-in keys; tests bring their own
}

export interface Catalog {
  feed: VerifiedFeed;
  src: Source;
  warning: string; // for a test catalog, the sentence that names it in every question; empty for the real one
}

/**
 * Fetches the feed and verifies it. Which catalog is read is decided in one place, catalogConfig: it refuses, before
 * anything is opened or written, a test catalog the command line did not ask for. Refuses when no key is built in;
 * refuses a feed older than the newest this machine has seen, and remembers a newer one. A test catalog's feed number
 * is kept apart (test:<kid>): a stand neither reads nor moves the number kept for a built-in key.
 */
export async function openCatalog(cx: Context): Promise<Catalog> {
  const cfg = catalogConfig(cx.env, cx.keys ?? CATALOG_KEYS, { testCatalog: cx.testCatalog, chat: cx.chat });
  if (cfg.keys.length === 0) throw new Refusal(NO_KEY);
  if (cfg.testNote !== "") cx.out(cfg.testNote);
  const slot = (kid: string) => (cfg.test ? `test:${kid}` : kid);
  const src = (cx.source ?? ((base) => httpSource(base, USER_AGENT)))(cfg.base);
  const feed = await fetchFeed(src, cfg.keys, CATALOG_HOST, cx.now(), (kid) => seenSeq(cx.stateDir, slot(kid)));
  rememberSeq(cx.stateDir, slot(feed.key.kid), feed.feed.seq);
  const warning = !cfg.test ? "" :
    `This is a test catalog, not ${CATALOG_HOST}: it is read from ${cfg.base} and signed by the key ${clip(feed.key.kid)}. `;
  return { feed, src, warning };
}

/** Refuses what is not an id before it is looked up. What was typed is not echoed: it may be anything. */
export function checkID(id: string): void {
  if (!isID(id)) throw new Refusal("that is not an employee id: want <publisher>/<name>, for example harnsy/accountant");
}

export interface Hired {
  feed: VerifiedFeed;
  warning: string; // see Catalog
  employee: Employee;
  tree: Tree;
}

/** Fetches one employee from the catalog, verifies it and renders its workspace. */
export async function employeeFor(cx: Context, id: string): Promise<Hired> {
  checkID(id);
  const { feed, src, warning } = await openCatalog(cx);
  const entry = findEntry(feed, id);
  if (!entry) {
    const revoked = feed.feed.revoked.some((r) => r.startsWith(id + "@"));
    throw new Refusal(revoked ? `${id}: its current version was withdrawn from the catalog and is not served` : `${id} is not in the catalog`);
  }
  const employee = await fetchEmployee(src, feed, CATALOG_HOST, entry);
  return { feed, warning, employee, tree: renderOpenClaw(employee) };
}

/** Refuses, before anything is fetched or shown, where nobody can answer and no yes was given beforehand. */
export function needPerson(cx: Context, yes: boolean | undefined): void {
  if (!yes && !cx.ask) throw new Refusal("this step waits for a person's yes: run it in a terminal, or pass --yes");
}

/** Asks the person, unless the yes was given beforehand. */
export async function confirm(cx: Context, yes: boolean | undefined, question: string): Promise<boolean> {
  needPerson(cx, yes);
  return yes ? true : cx.ask!(question);
}
