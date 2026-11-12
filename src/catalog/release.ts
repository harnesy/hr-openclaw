// Reads a release from a source and verifies it: the feed first, then each bundle asked for against its feed entry.
import { openBundle } from "./bundle.ts";
import { localPath, openFeed } from "./feed.ts";
import type { Source } from "./source.ts";
import type { Employee, Entry, Key, VerifiedFeed } from "./types.ts";
import { MAX_BUNDLE, MAX_FEED, Refusal } from "./types.ts";

/** Fetches v1/feed.json and its signature and verifies the feed (see openFeed). */
export async function fetchFeed(src: Source, keys: readonly Key[], host: string, now: Date, seen?: (kid: string) => number): Promise<VerifiedFeed> {
  const feed = await src.get("v1/feed.json", MAX_FEED);
  const sig = await src.get("v1/feed.json.sig", MAX_FEED);
  return openFeed(feed, sig, keys, host, now, seen);
}

/** The entry of id in a verified feed, or undefined: not listed, not an employee, or revoked. */
export function findEntry(vf: VerifiedFeed, id: string): Entry | undefined {
  return vf.entries.findLast((e) => e.id === id);
}

/** Fetches one bundle of a verified feed and verifies it against its entry. */
export async function fetchEmployee(src: Source, vf: VerifiedFeed, host: string, e: Entry): Promise<Employee> {
  const rel = localPath(e.url, host);
  if (rel === null) throw new Refusal(`${e.id}@${e.version}: url not on ${host}`);
  try {
    return openBundle(vf.key, host, e, await src.get(rel, MAX_BUNDLE));
  } catch (err) {
    if (err instanceof Refusal) throw new Refusal(`${e.id}@${e.version}: ${err.message}`);
    throw err;
  }
}

/** A whole verified release: the feed and every employee it serves, in the feed's order. */
export interface Release {
  feed: VerifiedFeed;
  employees: Employee[];
}

/** Reads and verifies a whole release. Any fault refuses all of it. */
export async function loadRelease(src: Source, keys: readonly Key[], host: string, now: Date): Promise<Release> {
  const feed = await fetchFeed(src, keys, host, now);
  const employees: Employee[] = [];
  for (const e of feed.entries) employees.push(await fetchEmployee(src, feed, host, e));
  return { feed, employees };
}

/** The employee with that id in a release, or undefined. */
export function employeeOf(r: Release, id: string): Employee | undefined {
  return r.employees.findLast((e) => e.entry.id === id);
}
