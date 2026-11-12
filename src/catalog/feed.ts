// The feed of a release: its signature over the exact bytes, its version and expiry, replay protection, and the shape
// of every entry it serves. Nothing of a feed is used before its signature verified.
import { decodeFeed } from "./decode.ts";
import { checkName, clip } from "./grammar.ts";
import type { Entry, Key, VerifiedFeed } from "./types.ts";
import { Refusal } from "./types.ts";
import { feedSigKid, verifyFeedSig } from "./verify.ts";
import { cleanPath } from "../gotext.ts";

/**
 * Turns a feed url into the file's path inside the release; null when the url is not a clean path on the catalog's own
 * https host.
 */
export function localPath(url: string, host: string): string | null {
  const prefix = `https://${host}/`;
  if (!url.startsWith(prefix)) return null;
  const rel = url.slice(prefix.length);
  if (rel === "" || /[\\?#\0]/.test(rel) || cleanPath(rel) !== rel || rel === ".." || rel.startsWith("../") || rel.startsWith("/")) return null;
  return rel;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.,]\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Reads a moment written as RFC 3339; null when it is written another way. */
function parseTime(s: string): Date | null {
  if (!RFC3339.test(s)) return null;
  const t = Date.parse(s.replace(",", "."));
  return Number.isNaN(t) ? null : new Date(t);
}

/** Checks one entry the feed serves before any of its names is used: id, version, and that its urls are the catalog's. */
function checkEntry(e: Entry, host: string): void {
  checkName(e.id, e.version);
  const prefix = `https://${host}/`;
  if (localPath(e.url, host) === null || (e.avatarUrl !== "" && !e.avatarUrl.startsWith(prefix)) ||
    (e.cvUrl !== "" && !e.cvUrl.startsWith(prefix))) {
    throw new Refusal(`${e.id}: url not on ${host}`);
  }
}

/**
 * Verifies feed.json against feed.json.sig under one of the pinned keys, for the catalog at host, as of now. seen gives
 * the highest feed sequence this machine has seen under a key: an older feed is a replay and is refused. Any fault
 * refuses the whole feed.
 */
export function openFeed(feedBytes: Uint8Array, sig: Uint8Array, keys: readonly Key[], host: string, now: Date,
  seen: (kid: string) => number = () => 0): VerifiedFeed {
  const kid = feedSigKid(sig);
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Refusal(`feed.json.sig: kid ${clip(kid)} is not a catalog key this plugin knows; update the plugin`);
  }
  verifyFeedSig(key, feedBytes, sig);
  const feed = decodeFeed(feedBytes);
  const expires = parseTime(feed.expires);
  if (feed.v !== 1 || expires === null || expires.getTime() <= now.getTime()) {
    throw new Refusal(`feed.json: v ${feed.v}, expires ${clip(feed.expires)} (now ${now.toISOString()})`);
  }
  const minSeq = seen(key.kid);
  if (feed.seq < minSeq) {
    throw new Refusal(`feed.json: seq ${feed.seq} is older than seq ${minSeq} this machine has already seen; an old feed is refused`);
  }
  const revoked = new Set(feed.revoked);
  const entries: Entry[] = [];
  for (const e of feed.bundles) {
    // Bundle v1 reads employees only; a revoked version is never served.
    if (e.kind !== "employee" || revoked.has(`${e.id}@${e.version}`)) continue;
    checkEntry(e, host);
    entries.push(e);
  }
  return { feed, key, expires, entries };
}
