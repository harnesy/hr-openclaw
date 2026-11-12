// The catalog public keys this plugin trusts, and where it reads the catalog from.
import { parseKey } from "./catalog/verify.ts";
import type { Key } from "./catalog/types.ts";
import { CATALOG_HOST, Refusal } from "./catalog/types.ts";

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
  testNote: string; // one line to print when a test catalog is in use; empty for the real one
}

/**
 * The real catalog with the built-in keys, unless a stand is named by the environment:
 *   HARNSY_HR_FEED  an address that replaces https://hr.harnsy.dev for fetching (the feed must still name hr.harnsy.dev)
 *   HARNSY_HR_PUB   <kid>:<base64 of the raw key>, the only key trusted while it is set
 */
export function catalogConfig(env: Record<string, string | undefined>, builtIn = CATALOG_KEYS): CatalogConfig {
  const feed = env["HARNSY_HR_FEED"] ?? "", pub = env["HARNSY_HR_PUB"] ?? "";
  let keys = builtIn.map((k) => parseKey(k.kid, k.pub));
  if (pub !== "") {
    const cut = pub.indexOf(":");
    if (cut < 1) throw new Refusal("HARNSY_HR_PUB: want <kid>:<base64 of the raw 32-byte Ed25519 public key>");
    keys = [parseKey(pub.slice(0, cut), pub.slice(cut + 1))];
  }
  const base = feed !== "" ? feed : `https://${CATALOG_HOST}`;
  const testNote = feed === "" && pub === "" ? "" :
    `A test catalog is in use (HARNSY_HR_FEED or HARNSY_HR_PUB is set): reading ${base}, trusting ${keys.map((k) => k.kid).join(", ") || "no key"}.`;
  return { base, keys, testNote };
}

// Said when the key list is empty, which the plugin as shipped never is: nothing is read without a key to check it by.
export const NO_KEY = "This build of the plugin has no catalog key built in, so it cannot check the catalog's signature and reads nothing from it.";
