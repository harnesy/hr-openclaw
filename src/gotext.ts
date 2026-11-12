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

/** Text from the catalog made safe to print: control characters other than a new line and a tab are dropped. */
export function printable(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, "");
}
