// Reads the catalog's JSON into typed values the way the reference implementation does: a field that is missing or
// null is its zero value, a field of another type refuses the whole document.
import type { Attribution, Bundle, Claims, Competency, Entry, Feed, Manifest } from "./types.ts";
import { Refusal } from "./types.ts";

type Obj = Record<string, unknown>;

function fail(where: string, want: string): never {
  throw new Refusal(`${where}: want ${want}`);
}

export function parseJSON(bytes: Uint8Array, where: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    throw new Refusal(`${where}: not JSON`);
  }
}

export function obj(v: unknown, where: string): Obj {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) fail(where, "an object");
  return v as Obj;
}

export function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") fail(`${where}.${key}`, "a string");
  return v;
}

function int(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (v === undefined || v === null) return 0;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) fail(`${where}.${key}`, "a whole number");
  return v;
}

function bool(o: Obj, key: string, where: string): boolean {
  const v = o[key];
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") fail(`${where}.${key}`, "true or false");
  return v;
}

function list<T>(o: Obj, key: string, where: string, item: (v: unknown, where: string) => T): T[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${where}.${key}`, "a list");
  return v.map((x, i) => item(x, `${where}.${key}[${i}]`));
}

function strItem(v: unknown, where: string): string {
  if (v === null) return "";
  if (typeof v !== "string") fail(where, "a string");
  return v;
}

function strs(o: Obj, key: string, where: string): string[] {
  return list(o, key, where, strItem);
}

function attribution(v: unknown, where: string): Attribution {
  const o = obj(v, where);
  return { name: str(o, "name", where), url: str(o, "url", where), license: str(o, "license", where), modified: bool(o, "modified", where) };
}

function entry(v: unknown, where: string): Entry {
  const o = obj(v, where);
  const s = (key: string) => str(o, key, where);
  return {
    id: s("id"), kind: s("kind"), version: s("version"), title: s("title"), summary: s("summary"),
    persona: { name: str(obj(o["persona"], `${where}.persona`), "name", `${where}.persona`) },
    department: s("department"), industries: strs(o, "industries", where), tags: strs(o, "tags", where),
    skills: strs(o, "skills", where), keywords: strs(o, "keywords", where), published: s("published"),
    updated: s("updated"), publisherName: s("publisher_name"), url: s("url"), sha256: s("sha256"),
    size: int(o, "size", where), publisher: s("publisher"), avatarUrl: s("avatar_url"), cvUrl: s("cv_url"),
    subtitle: s("subtitle"), licenseNote: s("license_note"), license: s("license"),
    attribution: list(o, "attribution", where, attribution),
  };
}

export function decodeFeed(bytes: Uint8Array): Feed {
  const o = obj(parseJSON(bytes, "feed.json"), "feed.json");
  return {
    v: int(o, "v", "feed.json"), seq: int(o, "seq", "feed.json"), expires: str(o, "expires", "feed.json"),
    bundles: list(o, "bundles", "feed.json", entry), revoked: strs(o, "revoked", "feed.json"),
  };
}

export function decodeManifest(bytes: Uint8Array): Manifest {
  const w = "manifest.json";
  const o = obj(parseJSON(bytes, w), w);
  const files = new Map<string, string>();
  for (const [name, sum] of Object.entries(obj(o["files"], `${w}.files`))) {
    files.set(name, strItem(sum, `${w}.files`));
  }
  return {
    format: str(o, "format", w), formatVersion: int(o, "format_version", w), id: str(o, "id", w),
    version: str(o, "version", w), kind: str(o, "kind", w), publisher: str(o, "publisher", w),
    createdAt: str(o, "created_at", w), cvUrl: str(o, "cv_url", w), files,
  };
}

export function decodeClaims(bytes: Uint8Array): Claims {
  const w = "catalog.jws claims";
  const o = obj(parseJSON(bytes, w), w);
  return { iss: str(o, "iss", w), sub: str(o, "sub", w), ver: str(o, "ver", w), manifestSha256: str(o, "manifest_sha256", w), iat: int(o, "iat", w) };
}

function competency(v: unknown, where: string): Competency {
  const o = obj(v, where);
  const s = (key: string) => str(o, key, where);
  return { key: s("key"), name: s("name"), summary: s("summary"), knows: s("knows"), works: s("works"), handsOver: s("hands_over") };
}

function text(v: unknown, where: string): { text: string } {
  return { text: str(obj(v, where), "text", where) };
}

/** A bundle's skills list. An older bundle may hold plain strings there: labels that carry nothing, left out. */
function skills(o: Obj, where: string): { name: string; description: string }[] {
  const v = o["skills"];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${where}.skills`, "a list");
  const out: { name: string; description: string }[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const ref = item as Obj;
    const name = ref["name"], description = ref["description"] ?? "";
    if (typeof name === "string" && name !== "" && typeof description === "string") out.push({ name, description });
  }
  return out;
}

export function decodeBundle(bytes: Uint8Array): Bundle {
  const w = "bundle.json";
  const o = obj(parseJSON(bytes, w), w);
  const p = obj(o["persona"], `${w}.persona`), r = obj(o["role"], `${w}.role`);
  const voice = obj(p["voice"], `${w}.persona.voice`), req = obj(o["requires"], `${w}.requires`);
  const rs = (key: string) => str(r, key, `${w}.role`);
  return {
    schema: str(o, "schema", w),
    persona: {
      name: str(p, "name", `${w}.persona`), character: str(p, "character", `${w}.persona`),
      principles: list(p, "principles", `${w}.persona`, text),
      voice: { rules: strs(voice, "rules", `${w}.persona.voice`), samples: list(voice, "samples", `${w}.persona.voice`, text) },
    },
    role: {
      name: rs("name"), department: rs("department"), mandate: rs("mandate"), deliverable: rs("deliverable"),
      prompt: rs("prompt"), tagline: rs("tagline"), industries: strs(r, "industries", `${w}.role`),
      keywords: strs(r, "keywords", `${w}.role`),
    },
    requires: {
      tools: list(req, "tools", `${w}.requires`, (v, where) => {
        const t = obj(v, where);
        return { name: str(t, "name", where), min: str(t, "min", where) };
      }),
      keys: strs(req, "keys", `${w}.requires`),
    },
    competencies: list(o, "competencies", w, competency),
    license: str(o, "license", w),
    attribution: list(o, "attribution", w, attribution),
    skills: skills(o, w),
  };
}
