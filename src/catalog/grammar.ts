// The grammar of the catalog's publisher for ids, versions and the files a bundle may carry. A signed release is
// checked against it before any of its names becomes a path, a command argument or a line of a file: signed is not
// the same as well-formed.
import { HIDDEN } from "../gotext.ts";
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
  const cut = id.indexOf("/");
  return cut < 0 ? "" : id.slice(cut + 1);
}

/**
 * A file name inside a skill's scripts/, references/ or assets/: a portable name no file system reads as another, not
 * hidden, not ending in a dot, not a device name on Windows, not SKILL.md in any letter case.
 */
function isSkillFile(name: string): boolean {
  if (!SKILL_FILE.test(name) || name.startsWith(".") || name.endsWith(".") || name.toLowerCase() === "skill.md") return false;
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

const HIDDEN_CHAR = new RegExp(`[${HIDDEN}]`, "gu");

/**
 * A value for an error message: quoted, cut short, and every character a terminal or a chat would act on instead of
 * showing (control and format characters) written as an escape. It may be anything.
 */
export function clip(s: string, max = 130): string {
  return JSON.stringify(s.length > max ? s.slice(0, max) : s).replace(HIDDEN_CHAR, (c) => {
    const hex = c.codePointAt(0)!.toString(16);
    return hex.length > 4 ? `\\u{${hex}}` : `\\u${hex.padStart(4, "0")}`;
  });
}

/** Refuses an id or a version outside the grammar. */
export function checkName(id: string, version: string): void {
  if (!isID(id)) throw new Refusal(`id ${clip(id)}: want <publisher>/<name> in lowercase latin letters, digits and -`);
  if (!isVersion(version)) throw new Refusal(`${id}: version ${clip(version, 40)}: want MAJOR.MINOR.PATCH`);
}
