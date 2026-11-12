// Builds signed catalog releases for tests, with a key made for the test. It packs a bundle the way the catalog's
// publisher does (manifest.json first, signatures/catalog.jws last), so a test can then break one thing.
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hexSum } from "../../src/catalog/verify.ts";
import type { Key } from "../../src/catalog/types.ts";
import { zip } from "./zip.ts";

/** The catalog's host in every test release. */
export const HOST = "hr.harnsy.dev";

export type Files = Map<string, Uint8Array>;
type Json = Record<string, any>;

/** A signed .harnsy file and its feed entry, as the feed's JSON holds it. */
export interface Packed {
  entry: Json;
  file: Buffer;
}

export const bytes = (s: string) => Buffer.from(s, "utf8");
const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/** A test catalog key and the moment the tests call «now». */
export class Kit {
  priv: KeyObject;
  key: Key;
  now = new Date("2026-11-12T10:00:00Z");

  constructor() {
    const pair = generateKeyPairSync("ed25519");
    this.priv = pair.privateKey;
    this.key = { kid: "t1", pub: pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32) };
  }

  /** Signs claims as signatures/catalog.jws. */
  jws(kid: string, claims: Json, alg = "EdDSA"): string {
    const head = `${b64u(bytes(JSON.stringify({ alg, kid, typ: "JWT" })))}.${b64u(bytes(JSON.stringify(claims)))}`;
    return `${head}.${b64u(sign(null, bytes(head), this.priv))}`;
  }

  /**
   * Builds the signed bundle of id@version from its files (bundle.json and what it carries). A listing.json among them
   * gives the card's title and tags and is not packed. edit may change the files right before they are zipped: after
   * the manifest and the signature were made. url, when given, is the path of the bundle's file in the release.
   */
  pack(id: string, version: string, src: Files, edit?: (files: Files) => void, url?: string): Packed {
    const files: Files = new Map([...src].filter(([name]) => name !== "listing.json"));
    const listing: Json = src.has("listing.json") ? JSON.parse(src.get("listing.json")!.toString()) : {};
    const doc: Json = JSON.parse(files.get("bundle.json")!.toString());
    const order = [...files.keys()].sort();
    const manifest = { format: "harnsy-bundle", format_version: 1, id, version, kind: "employee", publisher: id.split("/")[0],
      created_at: this.now.toISOString(), files: Object.fromEntries(order.map((name) => [name, hexSum(files.get(name)!)])) };
    const mb = bytes(JSON.stringify(manifest, null, 2));
    files.set("manifest.json", mb);
    files.set("signatures/catalog.jws", bytes(this.jws(this.key.kid,
      { iss: HOST, sub: id, ver: version, manifest_sha256: hexSum(mb), iat: Math.floor(this.now.getTime() / 1000) })));
    edit?.(files);
    const file = zip(["manifest.json", ...order, "signatures/catalog.jws"], files);
    return { file, entry: card(id, version, doc, listing, file, url ?? `packs/${id}/${version}.harnsy`) };
  }

  /** The feed of these bundles: seq 7, good for a week from the kit's now. */
  feed(packs: Packed[]): Json {
    return { v: 1, seq: 7, expires: new Date(this.now.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
      bundles: structuredClone(packs.map((p) => p.entry)), revoked: [] };
  }

  /** feed.json.sig for these bytes, under the name kid. */
  signFeed(kid: string, feed: Uint8Array): Buffer {
    return bytes(JSON.stringify({ kid, sig: sign(null, feed, this.priv).toString("base64") }));
  }

  /**
   * Writes a release into dir: every bundle at its feed url, v1/feed.json and v1/feed.json.sig. edit may change the
   * feed before it is signed.
   */
  release(dir: string, packs: Packed[], edit?: (feed: Json) => void): void {
    for (const p of packs) write(join(dir, ...String(p.entry.url).slice(`https://${HOST}/`.length).split("/")), p.file);
    const feed = this.feed(packs);
    edit?.(feed);
    const fb = bytes(JSON.stringify(feed, null, 2));
    write(join(dir, "v1", "feed.json"), fb);
    write(join(dir, "v1", "feed.json.sig"), this.signFeed(this.key.kid, fb));
  }

  /**
   * Packs the newest version of every employee under dir, laid out as the catalog repository's employees/ folder
   * (<publisher>/<name>/<version>/), in the order of their ids: what the feed lists.
   */
  catalog(dir: string): Packed[] {
    const packs: Packed[] = [];
    for (const publisher of readdirSync(dir).sort()) {
      for (const name of readdirSync(join(dir, publisher)).sort()) {
        const newest = readdirSync(join(dir, publisher, name)).sort(semverCompare).at(-1)!;
        packs.push(this.pack(`${publisher}/${name}`, newest, source(join(dir, publisher, name, newest))));
      }
    }
    return packs;
  }
}

function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  return (pa[0]! - pb[0]!) || (pa[1]! - pb[1]!) || (pa[2]! - pb[2]!);
}

/** The feed's card of a bundle. */
function card(id: string, version: string, doc: Json, listing: Json, file: Buffer, url: string): Json {
  const publisher = id.split("/")[0]!, role = doc.role ?? {};
  const name: string = role.name ?? "";
  return {
    id, kind: "employee", version, title: listing.title ?? name.charAt(0).toUpperCase() + name.slice(1),
    summary: role.tagline ?? "", persona: { name: doc.persona?.name ?? "" }, department: role.department,
    industries: role.industries, tags: listing.tags ?? [],
    skills: (doc.competencies ?? []).map((c: Json) => c.name).filter(Boolean).slice(0, 5), keywords: role.keywords,
    published: "2026-10-08", updated: "2026-11-01", publisher_name: listing.publisher_name ?? publisher,
    url: `https://${HOST}/${url}`, sha256: hexSum(file), size: file.length, publisher,
    cv_url: `https://${HOST}/e/${id}`, license_note: listing.license_note, license: doc.license, attribution: doc.attribution,
  };
}

/** Writes a file and the folders above it. */
export function write(file: string, b: Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, b);
}

/**
 * Reads a folder: every file by its path with forward slashes. A version folder of the catalog's layout (bundle.json,
 * listing.json, docs/, skills/) is read this way; the picture is left out: no test here needs it.
 */
export function source(dir: string): Files {
  const files: Files = new Map();
  for (const d of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!d.isFile()) continue;
    const full = join(d.parentPath, d.name);
    const rel = full.slice(dir.length + 1).split("\\").join("/");
    if (!rel.startsWith("avatar.")) files.set(rel, readFileSync(full));
  }
  return files;
}
