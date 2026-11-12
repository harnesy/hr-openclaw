// Checks a .harnsy file against its feed entry and returns the employee: size and SHA-256 before the zip is opened,
// then the manifest's names and file hashes, then the catalog's signature over the manifest.
import { decodeBundle, decodeManifest } from "./decode.ts";
import { clip, isBundlePath } from "./grammar.ts";
import type { Employee, Entry, Key } from "./types.ts";
import { Refusal } from "./types.ts";
import { hexSum, verifyJWS } from "./verify.ts";
import { unzip } from "./zip.ts";

const SIGNATURE_FILE = "signatures/catalog.jws";

/** Only files the manifest lists are kept. */
export function openBundle(key: Key, host: string, e: Entry, file: Uint8Array): Employee {
  if (file.length !== e.size || hexSum(file) !== e.sha256) throw new Refusal("size or sha256 differs from the feed");
  const all = unzip(file);
  const mb = all.get("manifest.json");
  if (!mb) throw new Refusal("no manifest.json");
  const manifestSha256 = hexSum(mb);
  const m = decodeManifest(mb);
  if (m.format !== "harnsy-bundle" || m.formatVersion !== 1 || m.id !== e.id || m.version !== e.version || m.kind !== "employee") {
    throw new Refusal(`manifest names ${clip(m.id)}@${clip(m.version)} (${clip(m.format)} v${m.formatVersion}, ${clip(m.kind)})`);
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, sum] of m.files) {
    if (!isBundlePath(name)) throw new Refusal(`${clip(name)} is not a file a bundle carries`);
    const b = all.get(name);
    if (!b || name.startsWith("signatures/") || hexSum(b) !== sum) throw new Refusal(`${name} missing or its sha256 differs`);
    files.set(name, b);
  }
  const c = verifyJWS(key, all.get(SIGNATURE_FILE));
  if (c.iss !== host || c.sub !== e.id || c.ver !== e.version || c.manifestSha256 !== manifestSha256) {
    throw new Refusal(`catalog.jws claims (iss ${clip(c.iss)}, sub ${clip(c.sub)}, ver ${clip(c.ver)}) do not match`);
  }
  const bj = files.get("bundle.json");
  if (!bj) throw new Refusal("no bundle.json");
  return { entry: e, manifest: m, manifestSha256, doc: decodeBundle(bj), files };
}
