// The catalog public keys this plugin trusts, and where it reads the catalog from.
import { parseKey } from "./catalog/verify.ts";
import type { Key } from "./catalog/types.ts";
import { CATALOG_HOST, Refusal } from "./catalog/types.ts";

// ====================================================================================================================
// EMPTY SLOT: the catalog's public key «c1» is not published yet.
//
// When it is, add one line here: its key id and the base64 of the raw 32-byte Ed25519 public key, and rebuild dist/.
// Until then this list is empty and every command that reads the catalog refuses: a feed whose signature cannot be
// checked is never used. A key is never taken from the network, from the feed itself or from a config file.
// ====================================================================================================================
export const CATALOG_KEYS: readonly { kid: string; pub: string }[] = [
  // { kid: "c1", pub: "<base64 of the raw 32-byte Ed25519 public key>" },
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

export const NO_KEY = "This version of the plugin has no catalog key built in yet, so it cannot check the catalog's signature and reads nothing from it. Update the plugin once the key is published.";
