// The grammar of the catalog's publisher for ids, versions and the files a bundle may carry. A signed release is
// checked against it before any of its names becomes a path, a command argument or a line of a file: signed is not
// the same as well-formed.
import { Refusal } from "./types.ts";

const PART = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const AVATAR = /^avatar\.(png|jpe?g|webp)$/;
const SKILL_NAME = /^[a-z0-9-]{1,40}$/;
const SKILL_FILE = /^[A-Za-z0-9._-]{1,64}$/;
const SKILL_FOLDERS = new Set(["scripts", "references", "assets"]);

/** Device names Windows opens instead of a file, with any extension. */
const WINDOWS_RESERVED = new Set(["CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"]);

export const CASEBOOK_FILE = "docs/persona-casebook.md";

/** An employee's id: <publisher>/<name>, each part lowercase latin letters, digits and '-'. */
export function isID(id: string): boolean {
  const parts = id.split("/");
  return parts.length === 2 && PART.test(parts[0] ?? "") && PART.test(parts[1] ?? "");
}

/** A version: MAJOR.MINOR.PATCH in digits. */
export function isVersion(version: string): boolean {
  return SEMVER.test(version);
}

/** The id without its publisher: harnsy/accountant → accountant. */
export function shortName(id: string): string {
  return id.slice(id.indexOf("/") + 1);
}

/** A file name inside a skill's scripts/, references/ or assets/: a portable name no file system reads as another. */
function isSkillFile(name: string): boolean {
  if (!SKILL_FILE.test(name) || name.startsWith(".") || name.endsWith(".")) return false;
  const stem = name.split(".")[0] ?? "";
  return !WINDOWS_RESERVED.has(stem.toUpperCase());
}

/** Whether a manifest may list this path: only the shapes the publisher packs. */
export function isBundlePath(path: string): boolean {
  if (path === "bundle.json" || path === CASEBOOK_FILE || AVATAR.test(path)) return true;
  const parts = path.split("/");
  if (parts[0] !== "skills" || !SKILL_NAME.test(parts[1] ?? "")) return false;
  if (parts.length === 3) return parts[2] === "SKILL.md" || parts[2] === "LICENSE";
  return parts.length === 4 && SKILL_FOLDERS.has(parts[2] ?? "") && isSkillFile(parts[3] ?? "");
}

/** Refuses an id or a version outside the grammar. The value is not echoed whole: it may be anything. */
export function checkName(id: string, version: string): void {
  if (!isID(id)) throw new Refusal(`a bundle id ${clip(id)} is not <publisher>/<name> in lowercase latin letters, digits and '-'`);
  if (!isVersion(version)) throw new Refusal(`${id}: version ${clip(version)} is not MAJOR.MINOR.PATCH`);
}

/** A value for an error message: quoted, cut short, control characters shown as escapes. */
export function clip(s: string): string {
  return JSON.stringify(s.length > 80 ? s.slice(0, 80) + "…" : s);
}
