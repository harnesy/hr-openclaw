// The catalog public keys this plugin trusts, and where it reads the catalog from.
import { parseKey } from "./catalog/verify.ts";
import type { Key } from "./catalog/types.ts";
import { CATALOG_HOST, Refusal } from "./catalog/types.ts";
import { printable } from "./gotext.ts";

// ====================================================================================================================
// The catalog's public keys: each line is a key id and the base64 of the raw 32-byte Ed25519 public key. They are
// public; the private halves never leave the catalog's publisher.
//
// A feed is used only when its signature verifies under one of these keys. A key is never taken from the network,
// from the feed itself or from a config file. When the catalog moves to a new key, its line is added here and dist/
// is rebuilt; a feed signed under a key id that is not in this list is refused («update the plugin»).
// ====================================================================================================================
export const CATALOG_KEYS: readonly { kid: string; pub: string }[] = [
  { kid: "c1", pub: "WMZK4GiSTfBo5ZeMNZjDRextsTDGfoCU1KF6jlrqVjM=" },
];

/** Where the catalog is read from and which keys its signatures are checked against. */
export interface CatalogConfig {
  base: string; // the address the feed and the bundles are fetched from
  keys: Key[];
  test: boolean; // a test catalog, not hr.harnsy.dev
  testNote: string; // one line to print when a test catalog is in use; empty for the real one
}

/** How a command was called: what, besides the environment, decides which catalog it reads. */
export interface Call {
  testCatalog?: boolean; // the command line carried --test-catalog
  chat?: boolean; // the command came from a chat
}

const FEED = "HARNSY_HR_FEED", PUB = "HARNSY_HR_PUB", FLAG = "--test-catalog";
const LOOPBACK = new Set(["127.0.0.1", "[::1]", "localhost"]);

/**
 * Refuses unless the environment and the command line agree. The environment can be filled from a file (OpenClaw
 * reads a .env of the current folder), a word of the command line cannot: so the variables alone switch nothing on,
 * and a chat, which has no command line, never reads a test catalog.
 */
function gate(set: string[], call: Call): void {
  if (call.chat && set.length > 0) {
    throw new Refusal(`A test catalog is set in this machine's environment (${set.join(", ")}). It is never read from a chat; nothing was fetched.`);
  }
  if (set.length > 0 && !call.testCatalog) {
    const many = set.length > 1;
    throw new Refusal(`${set.join(" and ")} ${many ? "are" : "is"} set, but ${FLAG} was not given: a test catalog is read only when the ` +
      `command line says so. Nothing was fetched or written. Unset the variable${many ? "s" : ""} to read ${CATALOG_HOST}.`);
  }
  if (set.length === 0 && call.testCatalog) {
    throw new Refusal(`${FLAG} was given, but neither ${FEED} nor ${PUB} is set: there is no test catalog to read.`);
  }
}

/** The address of a test catalog: https, or plain http to this machine itself. Given back without what is not fetched. */
function testAddress(feed: string): string {
  let url: URL | undefined;
  try {
    url = new URL(feed);
  } catch {
    // refused below
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Refusal(`${FEED}: want an http(s) address without a query, for example http://127.0.0.1:8850`);
  }
  if (url.protocol === "http:" && !LOOPBACK.has(url.hostname)) {
    throw new Refusal(`${FEED}: plain http is taken only for this machine itself (127.0.0.1, [::1], localhost); use https for any other address.`);
  }
  return (url.origin + url.pathname).replace(/\/+$/, "");
}

/** The one key a test catalog is checked against: <kid>:<base64 of the raw key>. */
function testKey(pub: string): Key {
  const cut = pub.indexOf(":");
  if (cut < 1) throw new Refusal(`${PUB}: want <kid>:<base64 of the raw 32-byte Ed25519 public key>`);
  return parseKey(pub.slice(0, cut), pub.slice(cut + 1));
}

/**
 * The one place that decides which catalog a command reads. The real catalog with the built-in keys, unless a stand
 * is named by the environment AND the command line says --test-catalog (see gate):
 *   HARNSY_HR_FEED  an address that replaces https://hr.harnsy.dev for fetching (the feed must still name hr.harnsy.dev)
 *   HARNSY_HR_PUB   <kid>:<base64 of the raw key>, the only key trusted while it is set
 * It refuses before anything is opened; an empty variable counts as not set.
 */
export function catalogConfig(env: Record<string, string | undefined>, builtIn = CATALOG_KEYS, call: Call = {}): CatalogConfig {
  const feed = env[FEED] ?? "", pub = env[PUB] ?? "";
  gate([[FEED, feed], [PUB, pub]].filter(([, value]) => value !== "").map(([name]) => name!), call);
  const test = feed !== "" || pub !== "";
  const keys = pub !== "" ? [testKey(pub)] : builtIn.map((k) => parseKey(k.kid, k.pub));
  const base = feed !== "" ? testAddress(feed) : `https://${CATALOG_HOST}`;
  const testNote = !test ? "" :
    `A test catalog is in use (${FEED} or ${PUB} is set): reading ${base}, trusting ${keys.map((k) => printable(k.kid)).join(", ") || "no key"}.`;
  return { base, keys, test, testNote };
}

// Said when the key list is empty, which the plugin as shipped never is: nothing is read without a key to check it by.
export const NO_KEY = "This build of the plugin has no catalog key built in, so it cannot check the catalog's signature and reads nothing from it.";
