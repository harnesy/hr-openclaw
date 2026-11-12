// The shapes of a signed release of the hr.harnsy.dev employee catalog (bundle v1), as the reference implementation
// reads them.

/** Limits of bundle v1. */
export const MAX_FEED = 4 << 20; // feed.json
export const MAX_BUNDLE = 8 << 20; // a .harnsy file, and all its files unpacked
export const MAX_ZIP_FILES = 128; // entries in a .harnsy file

/** The catalog's host: every url of a feed must be on it. */
export const CATALOG_HOST = "hr.harnsy.dev";

/** A catalog public key and the id the signatures name it by. */
export interface Key {
  kid: string;
  pub: Uint8Array; // the raw 32-byte Ed25519 public key
}

/** One public credit of a bundle. */
export interface Attribution {
  name: string;
  url: string;
  license: string;
  modified: boolean;
}

/** One bundle of the feed: its card and where its file is. */
export interface Entry {
  id: string;
  kind: string;
  version: string;
  title: string;
  summary: string;
  persona: { name: string };
  department: string;
  industries: string[];
  tags: string[];
  skills: string[];
  keywords: string[];
  published: string;
  updated: string;
  publisherName: string;
  url: string;
  sha256: string;
  size: number;
  publisher: string;
  avatarUrl: string;
  cvUrl: string;
  subtitle: string;
  licenseNote: string;
  license: string;
  attribution: Attribution[];
}

/** v1/feed.json. */
export interface Feed {
  v: number;
  seq: number;
  expires: string;
  bundles: Entry[];
  revoked: string[];
}

/** A bundle's manifest.json: what the file is and the SHA-256 of every other file but signatures/*. */
export interface Manifest {
  format: string;
  formatVersion: number;
  id: string;
  version: string;
  kind: string;
  publisher: string;
  createdAt: string;
  cvUrl: string;
  files: Map<string, string>;
}

/** The payload of signatures/catalog.jws. */
export interface Claims {
  iss: string;
  sub: string;
  ver: string;
  manifestSha256: string;
  iat: number;
}

export interface Competency {
  key: string;
  name: string;
  summary: string;
  knows: string;
  works: string;
  handsOver: string;
}

/** bundle.json: the employee. */
export interface Bundle {
  schema: string;
  persona: {
    name: string;
    character: string;
    principles: { text: string }[];
    voice: { rules: string[]; samples: { text: string }[] };
  };
  role: {
    name: string;
    department: string;
    mandate: string;
    deliverable: string;
    prompt: string;
    tagline: string;
    industries: string[];
    keywords: string[];
  };
  // The harnsy Max list of a bundle is not read: it means nothing outside harnsy.
  requires: { tools: { name: string; min: string }[]; keys: string[] };
  competencies: Competency[];
  license: string;
  attribution: Attribution[];
  skills: { name: string; description: string }[];
}

/** One verified bundle. */
export interface Employee {
  entry: Entry;
  manifest: Manifest;
  manifestSha256: string;
  doc: Bundle;
  files: Map<string, Uint8Array>; // every file the manifest lists, by its path in the bundle
}

/** A feed that verified: its signature, version, expiry, and the shape of every entry it serves. */
export interface VerifiedFeed {
  feed: Feed;
  key: Key; // the key that signed it; every bundle of it must be signed by the same
  expires: Date;
  entries: Entry[]; // employees only, revoked versions left out, in the feed's order
}

/** A refusal of the catalog's data: the sentence says what did not verify. */
export class Refusal extends Error {
  override name = "Refusal";
}
