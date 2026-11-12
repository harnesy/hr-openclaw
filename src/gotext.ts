// Text helpers that behave as the Go standard library does, so that what this plugin renders and refuses is byte for
// byte what the reference implementation (hr-mcp, in Go) renders and refuses.

// Go's unicode.IsSpace: the characters strings.Fields and strings.TrimSpace treat as white space.
const SPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const SPACES = new RegExp(`[${SPACE}]+`, "u");
const TRIM = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "gu");

/** strings.Fields: the words of s, split around white space. */
export function fields(s: string): string[] {
  return s.split(SPACES).filter((w) => w !== "");
}

/** strings.TrimSpace. */
export function trimSpace(s: string): string {
  return s.replace(TRIM, "");
}

/** len(s) in Go: the length in UTF-8 bytes. */
export function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Orders strings as Go's < does: by their UTF-8 bytes. */
export function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** path.Clean for a slash-separated path. */
export function cleanPath(p: string): string {
  if (p === "") return ".";
  const rooted = p.startsWith("/");
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") out.push(part);
    else if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else if (!rooted) out.push("..");
  }
  const joined = out.join("/");
  if (rooted) return "/" + joined;
  return joined === "" ? "." : joined;
}

// Characters a person does not see but a terminal or a chat acts on: DEL and the C1 controls (U+009B starts an escape
// sequence), the line separators, and the Unicode format characters (category Cf: bidi overrides and isolates, zero
// width characters, the soft hyphen, the byte-order mark, tags). The inside of a character class.
export const HIDDEN = "\\u007f-\\u009f\\u2028\\u2029\\p{Cf}";
const UNPRINTABLE = new RegExp(`[\\u0000-\\u0008\\u000b-\\u001f${HIDDEN}]`, "gu");

/**
 * Text from the catalog made safe to print to a terminal or a chat: control characters other than a new line and a
 * tab are dropped, and so is every character that hides or reorders what is read. Only for what is printed: the files
 * a hire writes keep the catalog's bytes.
 */
export function printable(s: string): string {
  return s.replace(UNPRINTABLE, "");
}
