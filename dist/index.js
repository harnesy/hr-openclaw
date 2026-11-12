// src/index.ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

// src/gotext.ts
var SPACE = "\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
var SPACES = new RegExp(`[${SPACE}]+`, "u");
var TRIM = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "gu");
function fields(s) {
  return s.split(SPACES).filter((w) => w !== "");
}
function trimSpace(s) {
  return s.replace(TRIM, "");
}
function byteLen(s) {
  return Buffer.byteLength(s, "utf8");
}
function compareBytes(a, b) {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
function cleanPath(p) {
  if (p === "") return ".";
  const rooted = p.startsWith("/");
  const out = [];
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
var HIDDEN = "\\u007f-\\u009f\\u2028\\u2029\\p{Cf}";
var UNPRINTABLE = new RegExp(`[\\u0000-\\u0008\\u000b-\\u001f${HIDDEN}]`, "gu");
function printable(s) {
  return s.replace(UNPRINTABLE, "");
}

// src/catalog/types.ts
var MAX_FEED = 4 << 20;
var MAX_BUNDLE = 8 << 20;
var MAX_ZIP_FILES = 128;
var CATALOG_HOST = "hr.harnsy.dev";
var Refusal = class extends Error {
  name = "Refusal";
};

// src/catalog/grammar.ts
var PART = /^[a-z0-9][a-z0-9-]{0,63}$/;
var SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
var AVATAR = /^avatar\.(png|jpe?g|webp)$/;
var SKILL_NAME = /^[a-z0-9-]{1,40}$/;
var SKILL_FILE = /^[A-Za-z0-9._-]{1,64}$/;
var SKILL_FOLDERS = /* @__PURE__ */ new Set(["scripts", "references", "assets"]);
var WINDOWS_RESERVED = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);
var CASEBOOK_FILE = "docs/persona-casebook.md";
function isID(id) {
  const parts = id.split("/");
  return parts.length === 2 && PART.test(parts[0] ?? "") && PART.test(parts[1] ?? "");
}
function isVersion(version) {
  return SEMVER.test(version);
}
function shortName(id) {
  const cut = id.indexOf("/");
  return cut < 0 ? "" : id.slice(cut + 1);
}
function isSkillFile(name) {
  if (!SKILL_FILE.test(name) || name.startsWith(".") || name.endsWith(".") || name.toLowerCase() === "skill.md") return false;
  const stem2 = name.split(".")[0] ?? "";
  return !WINDOWS_RESERVED.has(stem2.toUpperCase());
}
function isBundlePath(path) {
  if (path === "bundle.json" || path === CASEBOOK_FILE || AVATAR.test(path)) return true;
  const parts = path.split("/");
  if (parts[0] !== "skills" || !SKILL_NAME.test(parts[1] ?? "")) return false;
  if (parts.length === 3) return parts[2] === "SKILL.md" || parts[2] === "LICENSE";
  return parts.length === 4 && SKILL_FOLDERS.has(parts[2] ?? "") && isSkillFile(parts[3] ?? "");
}
var HIDDEN_CHAR = new RegExp(`[${HIDDEN}]`, "gu");
function clip(s, max2 = 130) {
  return JSON.stringify(s.length > max2 ? s.slice(0, max2) : s).replace(HIDDEN_CHAR, (c) => {
    const hex = c.codePointAt(0).toString(16);
    return hex.length > 4 ? `\\u{${hex}}` : `\\u${hex.padStart(4, "0")}`;
  });
}
function checkName(id, version) {
  if (!isID(id)) throw new Refusal(`id ${clip(id)}: want <publisher>/<name> in lowercase latin letters, digits and -`);
  if (!isVersion(version)) throw new Refusal(`${id}: version ${clip(version, 40)}: want MAJOR.MINOR.PATCH`);
}

// src/commands/browse.ts
import { join as join3 } from "node:path";

// src/render/names.ts
function title(e) {
  return e.entry.title !== "" ? e.entry.title : e.doc.role.name;
}
var hasCasebook = (e) => e.files.has(CASEBOOK_FILE);

// src/render/notice.ts
var OWN_PUBLISHER = "harnsy";
var OWN_AUTHOR = "harnsy (Pavel Buchnev)";
var OWN_HOLDER = "Pavel Buchnev (harnsy)";
var CC0 = "CC0-1.0";
var LICENCE_LINES = /* @__PURE__ */ new Map([
  ["CC-BY-4.0", "Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)."],
  [CC0, "Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)."]
]);
function sourceURL(e) {
  return e.entry.cvUrl !== "" ? e.entry.cvUrl : "https://hr.harnsy.dev/e/" + e.entry.id;
}
function year(e) {
  for (const d of [e.entry.published, e.manifest.createdAt]) {
    const b = Buffer.from(d, "utf8");
    if (b.length >= 4) return b.subarray(0, 4).toString("utf8");
  }
  return "";
}
function textLicence(expr) {
  for (const part of expr.split(" AND ")) {
    const id = trimSpace(part);
    const line = LICENCE_LINES.get(id);
    if (line !== void 0) return { line, dedicated: id === CC0 };
  }
  if (expr === "") return { line: "No licence is stated for this employee: do not copy or redistribute it.", dedicated: false };
  return { line: `Licensed under ${expr}.`, dedicated: false };
}
var isOwn = (e) => e.entry.publisher === OWN_PUBLISHER;
var publisherName = (e) => e.entry.publisherName !== "" ? e.entry.publisherName : e.entry.publisher;
function author(e, dedicated) {
  let name = publisherName(e), holder = publisherName(e), where = ", published on hr.harnsy.dev.";
  if (isOwn(e)) [name, holder, where] = [OWN_AUTHOR, OWN_HOLDER, "."];
  if (dedicated) return name + ".";
  const y = year(e);
  if (y !== "") holder = `${y} ${holder}`;
  return `${name}, © ${holder}${where}`;
}
function credit(e, change) {
  const { line, dedicated } = textLicence(e.doc.license);
  return `${title(e)} ${e.entry.version} by ${author(e, dedicated)} ${line} Source: ${sourceURL(e)}. Changes: ${change}. Provided as is, without warranty of any kind (see the licence).`;
}
function hasSkillLicence(e) {
  for (const path of e.files.keys()) {
    if (!path.startsWith("skills/")) continue;
    const rest = path.slice("skills/".length), cut = rest.indexOf("/");
    if (cut >= 0 && rest.slice(cut + 1) === "LICENSE") return true;
  }
  return false;
}
function notice(e, change) {
  let b = credit(e, change) + "\n";
  let from = "the publisher", names = "The names and logos «harnsy» and «hr.harnsy.dev» are not covered by this licence.";
  if (isOwn(e)) {
    from = OWN_PUBLISHER;
    names = "The names and logos «harnsy» and «hr.harnsy.dev», and the picture of this employee (not included here), are not covered by this licence.";
  } else {
    b += "\nhr.harnsy.dev lists this work; it is not made or endorsed by harnsy.\n";
  }
  if (e.entry.licenseNote !== "") b += `
Note from ${from}: ${e.entry.licenseNote}
`;
  if (hasSkillLicence(e)) {
    b += "\nSome skills carry another licence for the parts adapted from other works or for their scripts (for example MIT): it is the `LICENSE` file in that skill's folder, and it applies to those parts";
    if (e.doc.license !== "") b += ` (the bundle's licence: ${e.doc.license})`;
    b += ".\n";
  }
  if (e.doc.attribution.length > 0) {
    b += "\nBuilt on:\n";
    for (const a of e.doc.attribution) b += `- ${a.name}, ${a.url}, ${a.license}, ${a.modified ? "modified" : "not modified"}
`;
  }
  return b + "\n" + names + "\n";
}

// src/render/tree.ts
var text = (s) => Buffer.from(s, "utf8");
var own = (path, body) => ({ path, content: text(body) });
function assemble(e, name, l, files) {
  const t = { name, persona: l.persona, job: l.job || l.persona, noticeFile: l.notice, notice: notice(e, l.change), files: [...files] };
  t.files.push(own(l.notice, "# Notice\n\n" + t.notice));
  for (const [path, b] of e.files) {
    if (path.startsWith("skills/")) {
      const rest = path.slice("skills/".length), cut = rest.indexOf("/");
      const skill = cut < 0 ? rest : rest.slice(0, cut), file = cut < 0 ? "" : rest.slice(cut + 1);
      t.files.push({ path: `${l.skillDir(skill)}/${file}`, content: b });
    } else if (path === CASEBOOK_FILE) {
      t.files.push({ path: l.casebook, content: b });
    }
  }
  t.files.sort((a, b) => compareBytes(a.path, b.path));
  for (const f of t.files) checkTreePath(f.path);
  return t;
}
function checkTreePath(path) {
  if (path === "" || path === "." || path.startsWith("/") || cleanPath(path) !== path || path === ".." || path.startsWith("../") || /[\\\u0000-\u001f\u007f-\u009f]/.test(path)) {
    throw new Refusal(`${clip(path)}: a path that would leave the place the employee is installed to; nothing is written`);
  }
}

// src/render/persona.ts
function section(heading, body) {
  body = trimSpace(body);
  return body === "" ? "" : `## ${heading}

${body}

`;
}
function whoAmI(e) {
  const n = e.doc.persona.name;
  const who2 = n !== "" ? `You are ${n}, the ${e.doc.role.name}.` : `You are the ${e.doc.role.name}.`;
  return who2 + " You are an AI agent, and you say so when asked.";
}
function intro(e) {
  let who2 = whoAmI(e) + " The character below shapes how you work and how you speak; it never changes what you must do: the person you work for and the rules of their project come first.";
  if (hasCasebook(e)) who2 += " Quote only from your casebook and never invent a quote.";
  return who2 + "\n\n";
}
function who(e) {
  const p = e.doc.persona;
  const decide = p.principles.map((x2, i2) => `${i2 + 1}. ${x2.text}
`).join("");
  const speak = p.voice.rules.map((r) => `- ${r}
`).join("") + p.voice.samples.map((s) => `- e.g. «${s.text}»
`).join("");
  return section("Character", p.character) + section("How you decide", decide) + section("How you speak", speak);
}
function job(e, l) {
  const r = e.doc.role;
  return section("Your job", r.mandate) + section("What you hand over", r.deliverable) + section("How you work", r.prompt) + section("What you know", competencies(e)) + section("What you need", needs(e)) + section("Your skills", skills(e, l)) + section("Casebook", casebook(e, l));
}
function competencies(e) {
  let b = "";
  for (const c of e.doc.competencies) {
    b += `### ${c.name}

`;
    if (c.summary !== "") b += c.summary + "\n\n";
    for (const [label, text3] of [["Knows", c.knows], ["Works", c.works], ["Hands over", c.handsOver]]) {
      if (text3 !== "") b += `- ${label}: ${text3}
`;
    }
    b += "\n";
  }
  return b;
}
function needs(e) {
  let b = "";
  for (const t of e.doc.requires.tools) {
    b += t.min !== "" ? `- Tool: \`${t.name}\` ${t.min} or newer
` : `- Tool: \`${t.name}\`
`;
  }
  for (const k of e.doc.requires.keys) {
    b += `- Key: \`${k}\` (the person sets it up; never ask for a key in a chat)
`;
  }
  return b;
}
function skills(e, l) {
  return e.doc.skills.map((s) => `- ${l.skillRef(s.name)}: ${s.description}
`).join("");
}
function casebook(e, l) {
  if (!hasCasebook(e)) return "";
  const principles = l.job !== "" ? "your principles" : "the principles above";
  const where = "`" + (l.casebook.startsWith(l.inside) ? l.casebook.slice(l.inside.length) : l.casebook) + "`";
  return `Worked cases are in ${where}. Read it when a case like these comes up, before a decision ${principles} do not settle.`;
}
function creditLine(e, l) {
  return "---\n\n" + credit(e, l.change) + "\n";
}

// src/render/openclaw.ts
var workspaceFolder = (name) => `workspace-${name}`;
function renderOpenClaw(e) {
  const name = shortName(e.entry.id), home = workspaceFolder(name) + "/";
  const l = {
    change: "assembled into an OpenClaw agent workspace",
    inside: home,
    persona: home + "SOUL.md",
    job: home + "AGENTS.md",
    notice: home + "NOTICE.md",
    casebook: home + "docs/persona-casebook.md",
    skillDir: (skill) => `${home}skills/${skill}`,
    skillRef: (skill) => "`" + skill + "` (a skill of this workspace)"
  };
  const soul = `# ${title(e)}

` + intro(e) + who(e) + creditLine(e, l);
  const agents = `# ${title(e)}: the job

` + whoAmI(e) + " This file is your job; your character is in `SOUL.md`.\n\n" + job(e, l) + creditLine(e, l);
  return assemble(e, name, l, [own(l.persona, soul), own(l.job, agents), own(home + "IDENTITY.md", identity(e))]);
}
function identity(e) {
  const name = e.doc.persona.name !== "" ? e.doc.persona.name : title(e);
  let b = `# IDENTITY.md

- Name: ${oneLine(name)}
- Creature: AI agent, ${oneLine(e.doc.role.name)}
`;
  const vibe = oneLine(e.doc.role.tagline);
  if (vibe !== "") b += `- Vibe: ${vibe}
`;
  return b + `- Emoji: ${emoji(e.doc.role.department)}
`;
}
var oneLine = (s) => fields(s).join(" ");
var DEPARTMENT_EMOJI = /* @__PURE__ */ new Map([
  ["content", "📝"],
  ["data", "📊"],
  ["design", "🎨"],
  ["engineering", "🔧"],
  ["finance", "🧮"],
  ["hr", "👥"],
  ["legal", "📜"],
  ["management", "🧭"],
  ["marketing", "📣"],
  ["operations", "📋"],
  ["product", "📦"],
  ["sales", "🤝"],
  ["support", "🎧"]
]);
var emoji = (department) => DEPARTMENT_EMOJI.get(trimSpace(department).toLowerCase()) ?? "🤖";

// src/search.ts
var DEFAULT_LIMIT = 10;
var MAX_LIMIT = 20;
var MAX_QUERY_BYTES = 256;
var MAX_QUERY_TERMS = 16;
var MAX_DEPARTMENT_BYTES = 64;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "on",
  "in",
  "with",
  "who",
  "that",
  "can",
  "me",
  "my",
  "i",
  "we",
  "our",
  "need",
  "find",
  "want",
  "someone",
  "somebody",
  "employee",
  "agent",
  "hire",
  "install",
  "hr"
]);
var NAME = 5;
var SKILL = 3;
var SUMMARY = 2;
var OTHER = 1;
function tokens(text3) {
  return text3.toLowerCase().split(/[^\p{L}\p{Nd}]+/u).filter((w) => w !== "");
}
function cutEnd(w, end) {
  return w.endsWith(end) && byteLen(w) - byteLen(end) >= 4 ? w.slice(0, w.length - end.length) : null;
}
var singular = (w) => cutEnd(w, "s") ?? w;
function stem(w) {
  for (const end of ["ments", "ment", "ings", "ing", "ants", "ant", "ers", "er", "ed", "es", "s"]) {
    const cut = cutEnd(w, end);
    if (cut !== null) return cut;
  }
  return w;
}
function indexOf(e) {
  const ix = { weights: /* @__PURE__ */ new Map(), named: /* @__PURE__ */ new Set() };
  const add = (weight, ...texts) => {
    for (const w of texts.flatMap(tokens).map(stem)) {
      if ((ix.weights.get(w) ?? 0) < weight) ix.weights.set(w, weight);
    }
  };
  const name = shortName(e.id);
  add(NAME, e.title, name);
  for (const w of tokens(`${e.title} ${name}`)) ix.named.add(singular(w));
  add(SKILL, ...e.skills, ...e.tags, ...e.keywords);
  add(SUMMARY, e.summary);
  add(OTHER, e.department, e.persona.name, ...e.industries);
  return ix;
}
function score(ix, word) {
  let best = ix.weights.get(word) ?? 0;
  if (byteLen(word) < 4) return best;
  for (const [w, weight] of ix.weights) {
    if (weight > best && byteLen(w) >= 4 && (w.startsWith(word) || word.startsWith(w))) best = weight;
  }
  return best;
}
function asked(text3, department) {
  if (byteLen(text3) > MAX_QUERY_BYTES) throw new Refusal(`query: ${byteLen(text3)} bytes, at most ${MAX_QUERY_BYTES}; say it in a few words`);
  if (byteLen(department) > MAX_DEPARTMENT_BYTES) {
    throw new Refusal(`department: at most ${MAX_DEPARTMENT_BYTES} bytes; it is one word, for example finance`);
  }
  const terms = /* @__PURE__ */ new Map();
  for (const w of tokens(text3)) {
    const t = { word: singular(w), stem: stem(w) };
    if (!STOP_WORDS.has(t.stem)) terms.set(`${t.word} ${t.stem}`, t);
  }
  if (terms.size > MAX_QUERY_TERMS) throw new Refusal(`query: ${terms.size} different words, at most ${MAX_QUERY_TERMS}; say it in a few words`);
  return [...terms.values()];
}
function search(entries, text3, department = "", limit = DEFAULT_LIMIT) {
  const terms = asked(text3, department);
  const hits = [];
  for (const e of entries) {
    if (department !== "" && department.toLowerCase() !== e.department.toLowerCase()) continue;
    const ix = indexOf(e), h = { e, matched: 0, score: 0, named: 0 };
    for (const t of terms) {
      const s = score(ix, t.stem);
      if (s > 0) h.matched++, h.score += s;
      if (ix.named.has(t.word)) h.named++;
    }
    if (h.matched > 0 || terms.length === 0) hits.push(h);
  }
  hits.sort((a, b) => b.matched - a.matched || b.score - a.score || b.named - a.named);
  const n = Math.min(limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);
  return { entries: hits.slice(0, n).map((h) => h.e), total: hits.length };
}

// src/catalog/decode.ts
function fail(where, want) {
  throw new Refusal(`${where}: want ${want}`);
}
function parseJSON(bytes, where) {
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    throw new Refusal(`${where}: not JSON`);
  }
}
function obj(v, where) {
  if (v === void 0 || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) fail(where, "an object");
  return v;
}
function str(o, key, where) {
  const v = o[key];
  if (v === void 0 || v === null) return "";
  if (typeof v !== "string") fail(`${where}.${key}`, "a string");
  return v;
}
function int(o, key, where) {
  const v = o[key];
  if (v === void 0 || v === null) return 0;
  if (typeof v !== "number" || !Number.isSafeInteger(v)) fail(`${where}.${key}`, "a whole number");
  return v;
}
function bool(o, key, where) {
  const v = o[key];
  if (v === void 0 || v === null) return false;
  if (typeof v !== "boolean") fail(`${where}.${key}`, "true or false");
  return v;
}
function list(o, key, where, item) {
  const v = o[key];
  if (v === void 0 || v === null) return [];
  if (!Array.isArray(v)) fail(`${where}.${key}`, "a list");
  return v.map((x2, i2) => item(x2, `${where}.${key}[${i2}]`));
}
function strItem(v, where) {
  if (v === null) return "";
  if (typeof v !== "string") fail(where, "a string");
  return v;
}
function strs(o, key, where) {
  return list(o, key, where, strItem);
}
function attribution(v, where) {
  const o = obj(v, where);
  return { name: str(o, "name", where), url: str(o, "url", where), license: str(o, "license", where), modified: bool(o, "modified", where) };
}
function entry(v, where) {
  const o = obj(v, where);
  const s = (key) => str(o, key, where);
  return {
    id: s("id"),
    kind: s("kind"),
    version: s("version"),
    title: s("title"),
    summary: s("summary"),
    persona: { name: str(obj(o["persona"], `${where}.persona`), "name", `${where}.persona`) },
    department: s("department"),
    industries: strs(o, "industries", where),
    tags: strs(o, "tags", where),
    skills: strs(o, "skills", where),
    keywords: strs(o, "keywords", where),
    published: s("published"),
    updated: s("updated"),
    publisherName: s("publisher_name"),
    url: s("url"),
    sha256: s("sha256"),
    size: int(o, "size", where),
    publisher: s("publisher"),
    avatarUrl: s("avatar_url"),
    cvUrl: s("cv_url"),
    subtitle: s("subtitle"),
    licenseNote: s("license_note"),
    license: s("license"),
    attribution: list(o, "attribution", where, attribution)
  };
}
function decodeFeed(bytes) {
  const o = obj(parseJSON(bytes, "feed.json"), "feed.json");
  return {
    v: int(o, "v", "feed.json"),
    seq: int(o, "seq", "feed.json"),
    expires: str(o, "expires", "feed.json"),
    bundles: list(o, "bundles", "feed.json", entry),
    revoked: strs(o, "revoked", "feed.json")
  };
}
function decodeManifest(bytes) {
  const w = "manifest.json";
  const o = obj(parseJSON(bytes, w), w);
  const files = /* @__PURE__ */ new Map();
  for (const [name, sum] of Object.entries(obj(o["files"], `${w}.files`))) {
    files.set(name, strItem(sum, `${w}.files`));
  }
  return {
    format: str(o, "format", w),
    formatVersion: int(o, "format_version", w),
    id: str(o, "id", w),
    version: str(o, "version", w),
    kind: str(o, "kind", w),
    publisher: str(o, "publisher", w),
    createdAt: str(o, "created_at", w),
    cvUrl: str(o, "cv_url", w),
    files
  };
}
function decodeClaims(bytes) {
  const w = "catalog.jws claims";
  const o = obj(parseJSON(bytes, w), w);
  return { iss: str(o, "iss", w), sub: str(o, "sub", w), ver: str(o, "ver", w), manifestSha256: str(o, "manifest_sha256", w), iat: int(o, "iat", w) };
}
function competency(v, where) {
  const o = obj(v, where);
  const s = (key) => str(o, key, where);
  return { key: s("key"), name: s("name"), summary: s("summary"), knows: s("knows"), works: s("works"), handsOver: s("hands_over") };
}
function text2(v, where) {
  return { text: str(obj(v, where), "text", where) };
}
function skills2(o, where) {
  const v = o["skills"];
  if (v === void 0 || v === null) return [];
  if (!Array.isArray(v)) fail(`${where}.skills`, "a list");
  const out = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const ref = item;
    const name = ref["name"], description = ref["description"] ?? "";
    if (typeof name === "string" && name !== "" && typeof description === "string") out.push({ name, description });
  }
  return out;
}
function decodeBundle(bytes) {
  const w = "bundle.json";
  const o = obj(parseJSON(bytes, w), w);
  const p = obj(o["persona"], `${w}.persona`), r = obj(o["role"], `${w}.role`);
  const voice = obj(p["voice"], `${w}.persona.voice`), req = obj(o["requires"], `${w}.requires`);
  const rs = (key) => str(r, key, `${w}.role`);
  return {
    schema: str(o, "schema", w),
    persona: {
      name: str(p, "name", `${w}.persona`),
      character: str(p, "character", `${w}.persona`),
      principles: list(p, "principles", `${w}.persona`, text2),
      voice: { rules: strs(voice, "rules", `${w}.persona.voice`), samples: list(voice, "samples", `${w}.persona.voice`, text2) }
    },
    role: {
      name: rs("name"),
      department: rs("department"),
      mandate: rs("mandate"),
      deliverable: rs("deliverable"),
      prompt: rs("prompt"),
      tagline: rs("tagline"),
      industries: strs(r, "industries", `${w}.role`),
      keywords: strs(r, "keywords", `${w}.role`)
    },
    requires: {
      tools: list(req, "tools", `${w}.requires`, (v, where) => {
        const t = obj(v, where);
        return { name: str(t, "name", where), min: str(t, "min", where) };
      }),
      keys: strs(req, "keys", `${w}.requires`)
    },
    competencies: list(o, "competencies", w, competency),
    license: str(o, "license", w),
    attribution: list(o, "attribution", w, attribution),
    skills: skills2(o, w)
  };
}

// src/catalog/verify.ts
import { createHash, createPublicKey, verify } from "node:crypto";
function hexSum(b) {
  return createHash("sha256").update(b).digest("hex");
}
var SPKI_HEAD = Buffer.from("302a300506032b6570032100", "hex");
function ed25519Verify(pub, message, sig) {
  if (pub.length !== 32 || sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_HEAD, pub]), format: "der", type: "spki" });
    return verify(null, message, key, sig);
  } catch {
    return false;
  }
}
function base64Std(s) {
  s = s.replace(/[\r\n]/g, "");
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  return Buffer.from(s, "base64");
}
function base64Url(s) {
  s = s.replace(/[\r\n]/g, "");
  if (s.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  return Buffer.from(s, "base64url");
}
function feedSigKid(sig) {
  return str(obj(parseJSON(sig, "feed.json.sig"), "feed.json.sig"), "kid", "feed.json.sig");
}
function verifyFeedSig(key, feed, sig) {
  const s = obj(parseJSON(sig, "feed.json.sig"), "feed.json.sig");
  const kid = str(s, "kid", "feed.json.sig");
  if (kid !== key.kid) throw new Refusal(`feed.json.sig: kid ${clip(kid)}, want ${clip(key.kid)}`);
  const raw = base64Std(str(s, "sig", "feed.json.sig"));
  if (raw === null || !ed25519Verify(key.pub, feed, raw)) throw new Refusal("feed.json.sig does not verify");
}
function verifyJWS(key, token) {
  const parts = Buffer.from(token ?? new Uint8Array()).toString("latin1").split(".");
  if (parts.length !== 3) throw new Refusal("catalog.jws: not a compact JWS");
  const [head, payload, sig] = parts.map(base64Url);
  if (!head || !payload || !sig) throw new Refusal("catalog.jws: not base64url");
  let alg = "", kid = "";
  try {
    const h = obj(parseJSON(head, "catalog.jws header"), "catalog.jws header");
    alg = str(h, "alg", "catalog.jws header");
    kid = str(h, "kid", "catalog.jws header");
  } catch {
    throw new Refusal("catalog.jws: header is not read");
  }
  if (alg !== "EdDSA" || kid !== key.kid) throw new Refusal(`catalog.jws: header alg ${clip(alg)}, kid ${clip(kid)}`);
  if (!ed25519Verify(key.pub, Buffer.from(`${parts[0]}.${parts[1]}`, "latin1"), sig)) {
    throw new Refusal("catalog.jws does not verify");
  }
  return decodeClaims(payload);
}
function parseKey(kid, b64) {
  const pub = base64Std(trimSpace(b64));
  if (pub === null || pub.length !== 32 || kid === "") {
    throw new Refusal("catalog key: want a kid and the base64 of the raw 32-byte Ed25519 public key");
  }
  return { kid, pub };
}

// node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i2 = 0; i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i32(b[30]);
  for (var i2 = 1; i2 < 30; ++i2) {
    for (var j = b[i2]; j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u16(mb);
  for (; i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u16(mb);
  for (i2 = 1; i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i2 = 0; i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1; i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  // determined by compression function
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i2 = 0; i2 < hcLen; ++i2) {
          clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0; i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}

// src/catalog/zip.ts
var END_SIG = 101010256;
var DIR_SIG = 33639248;
var LOCAL_SIG = 67324752;
var END_LEN = 22;
var DIR_LEN = 46;
var LOCAL_LEN = 30;
var STORE = 0;
var DEFLATE = 8;
var SLICE = 4096;
var notZip = (why) => new Refusal(`not a zip file: ${why}`);
function findEnd(v) {
  for (let i2 = v.byteLength - END_LEN; i2 >= 0 && i2 >= v.byteLength - END_LEN - 65535; i2--) {
    if (v.getUint32(i2, true) === END_SIG && i2 + END_LEN + v.getUint16(i2 + 20, true) <= v.byteLength) return i2;
  }
  throw notZip("no directory");
}
var UNIX_SPECIAL = /* @__PURE__ */ new Set([4096, 8192, 16384, 24576, 40960, 49152]);
function isRegular(name, creator, attrs) {
  if (name.endsWith("/")) return false;
  const system = creator >>> 8;
  if (system === 3 || system === 19) return !UNIX_SPECIAL.has(attrs >>> 16 & 61440);
  if (system === 0 || system === 11 || system === 14) return (attrs & 16) === 0;
  return true;
}
function readDirectory(file, v) {
  const end = findEnd(v);
  const count = v.getUint16(end + 10, true), dirSize = v.getUint32(end + 12, true), dirOffset = v.getUint32(end + 16, true);
  if (count === 65535 || dirSize === 4294967295 || dirOffset === 4294967295) throw notZip("zip64 is not read");
  if (dirOffset + dirSize > end) throw notZip("the directory is out of the file");
  const entries = [];
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  let at = dirOffset;
  while (at + DIR_LEN <= end && v.getUint32(at, true) === DIR_SIG) {
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true);
    if (at + DIR_LEN + nameLen + extraLen + commentLen > end) throw notZip("a directory entry is cut short");
    let name;
    try {
      name = utf8.decode(file.subarray(at + DIR_LEN, at + DIR_LEN + nameLen));
    } catch {
      throw new Refusal("a zip entry's name is not UTF-8");
    }
    const packed = v.getUint32(at + 20, true), size2 = v.getUint32(at + 24, true), offset = v.getUint32(at + 42, true);
    if (packed === 4294967295 || size2 === 4294967295 || offset === 4294967295) throw notZip("zip64 is not read");
    entries.push({
      name,
      flags: v.getUint16(at + 8, true),
      method: v.getUint16(at + 10, true),
      crc32: v.getUint32(at + 16, true),
      packed,
      size: size2,
      offset,
      regular: isRegular(name, v.getUint16(at + 4, true), v.getUint32(at + 38, true))
    });
    at += DIR_LEN + nameLen + extraLen + commentLen;
  }
  if (entries.length !== count) throw notZip("the directory does not hold the entries it counts");
  return entries;
}
function safeName(name) {
  return name !== "" && !/[\\\0]/.test(name) && !name.startsWith("/") && cleanPath(name) === name && name !== ".." && !name.startsWith("../");
}
var CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function crc32(b) {
  let c = 4294967295;
  for (let i2 = 0; i2 < b.length; i2++) c = (CRC_TABLE[(c ^ b[i2]) & 255] ^ c >>> 8) >>> 0;
  return (c ^ 4294967295) >>> 0;
}
function inflate(packed, max2) {
  const chunks = [];
  let total = 0;
  const stream = new Inflate((chunk) => {
    total += chunk.length;
    chunks.push(chunk);
  });
  for (let at = 0; total <= max2; at += SLICE) {
    const last = at + SLICE >= packed.length;
    stream.push(packed.subarray(at, at + SLICE), last);
    if (last) break;
  }
  return Buffer.concat(chunks);
}
function readEntry(file, v, e, left) {
  if (e.offset + LOCAL_LEN > file.length || v.getUint32(e.offset, true) !== LOCAL_SIG) throw notZip(`${clip(e.name)} has no header`);
  const start = e.offset + LOCAL_LEN + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  if (start + e.packed > file.length) throw notZip(`${clip(e.name)} is cut short`);
  if ((e.flags & 1) !== 0 || e.method !== STORE && e.method !== DEFLATE) throw new Refusal(`zip entry ${clip(e.name)}: not stored or deflated`);
  const packed = file.subarray(start, start + e.packed);
  let out;
  try {
    out = e.method === STORE ? packed.subarray(0, left + 1) : inflate(packed, Math.min(left, e.size));
  } catch {
    throw new Refusal(`zip entry ${clip(e.name)} does not unpack`);
  }
  if (out.length > left) return out;
  if (out.length !== e.size || e.crc32 !== 0 && crc32(out) !== e.crc32) {
    throw new Refusal(`zip entry ${clip(e.name)}: its size or checksum differs from its header`);
  }
  return out;
}
function unzip(file) {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const entries = readDirectory(file, v);
  if (entries.length > MAX_ZIP_FILES) throw new Refusal(`${entries.length} zip entries, at most ${MAX_ZIP_FILES}`);
  const files = /* @__PURE__ */ new Map();
  let left = MAX_BUNDLE;
  for (const e of entries) {
    if (files.has(e.name)) throw new Refusal(`${clip(e.name)} is in the zip twice`);
    if (!safeName(e.name) || !e.regular) throw new Refusal(`zip entry ${clip(e.name)}: not a plain file inside the bundle`);
    const b = readEntry(file, v, e, left);
    left -= b.length;
    if (left < 0) throw new Refusal(`unpacks to more than ${MAX_BUNDLE} bytes`);
    files.set(e.name, b);
  }
  return files;
}

// src/catalog/bundle.ts
var SIGNATURE_FILE = "signatures/catalog.jws";
function openBundle(key, host, e, file) {
  if (file.length !== e.size || hexSum(file) !== e.sha256) throw new Refusal("size or sha256 differs from the feed");
  const all = unzip(file);
  const mb = all.get("manifest.json");
  if (!mb) throw new Refusal("no manifest.json");
  const manifestSha256 = hexSum(mb);
  const m = decodeManifest(mb);
  if (m.format !== "harnsy-bundle" || m.formatVersion !== 1 || m.id !== e.id || m.version !== e.version || m.kind !== "employee") {
    throw new Refusal(`manifest names ${clip(m.id)}@${clip(m.version)} (${clip(m.format)} v${m.formatVersion}, ${clip(m.kind)})`);
  }
  const files = /* @__PURE__ */ new Map();
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

// src/catalog/feed.ts
function localPath(url, host) {
  const prefix = `https://${host}/`;
  if (!url.startsWith(prefix)) return null;
  const rel = url.slice(prefix.length);
  if (rel === "" || /[\\?#\0]/.test(rel) || cleanPath(rel) !== rel || rel === ".." || rel.startsWith("../") || rel.startsWith("/")) return null;
  return rel;
}
var RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.,]\d+)?(Z|[+-]\d{2}:\d{2})$/;
function parseTime(s) {
  if (!RFC3339.test(s)) return null;
  const t = Date.parse(s.replace(",", "."));
  return Number.isNaN(t) ? null : new Date(t);
}
function checkEntry(e, host) {
  checkName(e.id, e.version);
  for (const [name, url] of [["cv_url", e.cvUrl], ["avatar_url", e.avatarUrl]]) {
    if (url !== "" && !url.startsWith(`https://${host}/`)) throw new Refusal(`${e.id}: ${name} not on ${host}`);
  }
}
function openFeed(feedBytes, sig, keys, host, now, seen = () => 0) {
  const kid = feedSigKid(sig);
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Refusal(`feed.json.sig: kid ${clip(kid)} is not a catalog key this plugin knows; update the plugin`);
  }
  verifyFeedSig(key, feedBytes, sig);
  const feed = decodeFeed(feedBytes);
  const expires = parseTime(feed.expires);
  if (feed.v !== 1 || expires === null || expires.getTime() <= now.getTime()) {
    throw new Refusal(`feed.json: v ${feed.v}, expires ${clip(feed.expires)} (now ${now.toISOString()})`);
  }
  const minSeq = seen(key.kid);
  if (feed.seq < minSeq) {
    throw new Refusal(`feed.json: seq ${feed.seq} is older than seq ${minSeq} this machine has already seen; an old feed is refused`);
  }
  const revoked = new Set(feed.revoked);
  const entries = [];
  for (const e of feed.bundles) {
    if (e.kind !== "employee") continue;
    checkEntry(e, host);
    if (revoked.has(`${e.id}@${e.version}`)) continue;
    if (localPath(e.url, host) === null) throw new Refusal(`${e.id}@${e.version}: url not on ${host}`);
    entries.push(e);
  }
  return { feed, key, expires, entries };
}

// src/catalog/release.ts
async function fetchFeed(src, keys, host, now, seen) {
  const feed = await src.get("v1/feed.json", MAX_FEED);
  const sig = await src.get("v1/feed.json.sig", MAX_FEED);
  return openFeed(feed, sig, keys, host, now, seen);
}
function findEntry(vf, id) {
  return vf.entries.findLast((e) => e.id === id);
}
async function fetchEmployee(src, vf, host, e) {
  const rel = localPath(e.url, host);
  if (rel === null) throw new Refusal(`${e.id}@${e.version}: url not on ${host}`);
  try {
    return openBundle(vf.key, host, e, await src.get(rel, MAX_BUNDLE));
  } catch (err2) {
    if (err2 instanceof Refusal) throw new Refusal(`${e.id}@${e.version}: ${err2.message}`);
    throw err2;
  }
}

// src/catalog/source.ts
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
var IDLE_MS = 3e4;
var DEADLINE_MS = 6e4;
function httpSource(base, userAgent, deadlineMs = DEADLINE_MS) {
  const root = new URL(base.endsWith("/") ? base : base + "/");
  if (root.protocol !== "https:" && root.protocol !== "http:") throw new Refusal("the catalog address is not http(s)");
  const request = root.protocol === "https:" ? httpsRequest : httpRequest;
  return {
    get(path, max2) {
      const url = new URL(path.split("/").map(encodeURIComponent).join("/"), root);
      return new Promise((resolve3, reject) => {
        const refuse = (why) => reject(new Refusal(`${url.host}/${path}: ${why}`));
        const req = request(url, { method: "GET", headers: { "User-Agent": userAgent }, agent: false, timeout: IDLE_MS }, (res) => {
          if (res.statusCode !== 200) {
            res.destroy();
            return refuse(`the catalog answered ${res.statusCode}`);
          }
          const chunks = [];
          let n = 0;
          res.on("data", (c) => {
            chunks.push(c);
            if ((n += c.length) > max2) {
              res.destroy();
              refuse(`more than ${max2} bytes`);
            }
          });
          res.on("end", () => resolve3(Buffer.concat(chunks)));
          res.on("error", () => refuse("the download broke off"));
        });
        AbortSignal.timeout(deadlineMs).addEventListener("abort", () => {
          refuse(`not whole after ${deadlineMs / 1e3} seconds; the download was stopped`);
          req.destroy();
        }, { once: true });
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", (err2) => refuse(`cannot be fetched (${err2.message})`));
        req.end();
      });
    }
  };
}

// src/keys.ts
var CATALOG_KEYS = [
  { kid: "c1", pub: "WMZK4GiSTfBo5ZeMNZjDRextsTDGfoCU1KF6jlrqVjM=" }
];
var FEED = "HARNSY_HR_FEED";
var PUB = "HARNSY_HR_PUB";
var FLAG = "--test-catalog";
var LOOPBACK = /* @__PURE__ */ new Set(["127.0.0.1", "[::1]", "localhost"]);
function gate(set, call) {
  if (call.chat && set.length > 0) {
    throw new Refusal(`A test catalog is set in this machine's environment (${set.join(", ")}). It is never read from a chat; nothing was fetched.`);
  }
  if (set.length > 0 && !call.testCatalog) {
    const many = set.length > 1;
    throw new Refusal(`${set.join(" and ")} ${many ? "are" : "is"} set, but ${FLAG} was not given: a test catalog is read only when the command line says so. Nothing was fetched or written. Unset the variable${many ? "s" : ""} to read ${CATALOG_HOST}.`);
  }
  if (set.length === 0 && call.testCatalog) {
    throw new Refusal(`${FLAG} was given, but neither ${FEED} nor ${PUB} is set: there is no test catalog to read.`);
  }
}
function testAddress(feed) {
  let url;
  try {
    url = new URL(feed);
  } catch {
  }
  if (!url || url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Refusal(`${FEED}: want an http(s) address without a query, for example http://127.0.0.1:8850`);
  }
  if (url.protocol === "http:" && !LOOPBACK.has(url.hostname)) {
    throw new Refusal(`${FEED}: plain http is taken only for this machine itself (127.0.0.1, [::1], localhost); use https for any other address.`);
  }
  return (url.origin + url.pathname).replace(/\/+$/, "");
}
function testKey(pub) {
  const cut = pub.indexOf(":");
  if (cut < 1) throw new Refusal(`${PUB}: want <kid>:<base64 of the raw 32-byte Ed25519 public key>`);
  return parseKey(pub.slice(0, cut), pub.slice(cut + 1));
}
function catalogConfig(env, builtIn = CATALOG_KEYS, call = {}) {
  const feed = env[FEED] ?? "", pub = env[PUB] ?? "";
  gate([[FEED, feed], [PUB, pub]].filter(([, value]) => value !== "").map(([name]) => name), call);
  const test = feed !== "" || pub !== "";
  const keys = pub !== "" ? [testKey(pub)] : builtIn.map((k) => parseKey(k.kid, k.pub));
  const base = feed !== "" ? testAddress(feed) : `https://${CATALOG_HOST}`;
  const testNote = !test ? "" : `A test catalog is in use (${FEED} or ${PUB} is set): reading ${base}, trusting ${keys.map((k) => printable(k.kid)).join(", ") || "no key"}.`;
  return { base, keys, test, testNote };
}
var NO_KEY = "This build of the plugin has no catalog key built in, so it cannot check the catalog's signature and reads nothing from it.";

// src/state.ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// src/version.ts
var VERSION = "0.1.0";
var PLUGIN_ID = "harnsy-hr";
var USER_AGENT = `hr-openclaw/${VERSION}`;

// src/state.ts
var stateFile = (stateDir) => join(stateDir, PLUGIN_ID, "state.json");
function read(file) {
  let text3;
  try {
    text3 = readFileSync(file, "utf8");
  } catch (err2) {
    if (err2.code === "ENOENT") return {};
    throw new Refusal(`the plugin's state file cannot be read (${file}); nothing is fetched until it can`);
  }
  try {
    const seq = JSON.parse(text3).seq;
    if (typeof seq !== "object" || seq === null || Array.isArray(seq)) throw new Error("no seq");
    const out = {};
    for (const [kid, n] of Object.entries(seq)) {
      if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error("not a number");
      out[kid] = n;
    }
    return out;
  } catch {
    throw new Refusal(`the plugin's state file is damaged (${file}): it holds the newest catalog feed this machine has seen. Fix or remove it yourself to go on; removing it forgets that feed.`);
  }
}
function seenSeq(stateDir, kid) {
  return read(stateFile(stateDir))[kid] ?? 0;
}
function rememberSeq(stateDir, kid, seq) {
  const file = stateFile(stateDir), all = read(file);
  if ((all[kid] ?? 0) >= seq) return;
  all[kid] = seq;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ seq: all }, null, 2) + "\n", { mode: 384 });
  renameSync(tmp, file);
}

// src/commands/context.ts
async function openCatalog(cx) {
  const cfg = catalogConfig(cx.env, cx.keys ?? CATALOG_KEYS, { testCatalog: cx.testCatalog, chat: cx.chat });
  if (cfg.keys.length === 0) throw new Refusal(NO_KEY);
  if (cfg.testNote !== "") cx.out(cfg.testNote);
  const slot = (kid) => cfg.test ? `test:${kid}` : kid;
  const src = (cx.source ?? ((base) => httpSource(base, USER_AGENT)))(cfg.base);
  const feed = await fetchFeed(src, cfg.keys, CATALOG_HOST, cx.now(), (kid) => seenSeq(cx.stateDir, slot(kid)));
  rememberSeq(cx.stateDir, slot(feed.key.kid), feed.feed.seq);
  const warning = !cfg.test ? "" : `This is a test catalog, not ${CATALOG_HOST}: it is read from ${cfg.base} and signed by the key ${clip(feed.key.kid)}. `;
  return { feed, src, warning };
}
function checkID(id) {
  if (!isID(id)) throw new Refusal("that is not an employee id: want <publisher>/<name>, for example harnsy/accountant");
}
async function employeeFor(cx, id) {
  checkID(id);
  const { feed, src, warning } = await openCatalog(cx);
  const entry2 = findEntry(feed, id);
  if (!entry2) {
    const revoked = feed.feed.revoked.some((r) => r.startsWith(id + "@"));
    throw new Refusal(revoked ? `${id}: its current version was withdrawn from the catalog and is not served` : `${id} is not in the catalog`);
  }
  const employee = await fetchEmployee(src, feed, CATALOG_HOST, entry2);
  return { feed, warning, employee, tree: renderOpenClaw(employee) };
}
function needPerson(cx, yes) {
  if (!yes && !cx.ask) throw new Refusal("this step waits for a person's yes: run it in a terminal, or pass --yes");
}
async function confirm(cx, yes, question) {
  needPerson(cx, yes);
  return yes ? true : cx.ask(question);
}

// src/workspace.ts
import { lstatSync, mkdirSync as mkdirSync2, readdirSync, readFileSync as readFileSync2, renameSync as renameSync2, rmdirSync, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join2, resolve, sep } from "node:path";

// src/openclaw.ts
import { spawn } from "node:child_process";
function spawnRunner(argv = process.argv, execPath = process.execPath) {
  return (args) => new Promise((resolve3) => {
    const cli2 = argv[1];
    if (!cli2) return resolve3({ code: 1, stdout: "", stderr: "the openclaw program that is running was not found" });
    const child = spawn(execPath, [cli2, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err2) => resolve3({ code: 1, stdout, stderr: stderr + err2.message }));
    child.on("close", (code) => resolve3({ code: code ?? 1, stdout, stderr }));
  });
}
var isAgentID = (s) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s);
function said(r) {
  const text3 = (r.stderr.trim() || r.stdout.trim()).split("\n").slice(-3).join(" ").slice(0, 400);
  return text3 === "" ? `exit code ${r.code}` : text3;
}
function json(stdout) {
  for (let at = stdout.search(/^[[{]/m); at >= 0; ) {
    try {
      return JSON.parse(stdout.slice(at));
    } catch {
      const next = stdout.slice(at + 1).search(/^[[{]/m);
      at = next < 0 ? -1 : at + 1 + next;
    }
  }
  return void 0;
}
async function listAgents(run) {
  const r = await run(["agents", "list", "--json"]);
  const list2 = r.code === 0 ? json(r.stdout) : void 0;
  if (!Array.isArray(list2)) throw new Refusal(`OpenClaw did not list its agents (${said(r)})`);
  return list2.flatMap((a) => {
    const o = a ?? {};
    return typeof o["id"] === "string" ? [{ id: o["id"], workspace: typeof o["workspace"] === "string" ? o["workspace"] : "" }] : [];
  });
}
async function addAgent(run, name, workspace) {
  const r = await run(["agents", "add", name, "--workspace", workspace, "--non-interactive", "--json"]);
  if (r.code !== 0) throw new Refusal(`OpenClaw did not add the agent (${said(r)})`);
  const id = json(r.stdout)?.agentId;
  return typeof id === "string" && isAgentID(id) ? id : name;
}
async function setIdentity(run, id) {
  return (await run(["agents", "set-identity", "--agent", id, "--from-identity", "--json"])).code === 0;
}
async function deleteAgent(run, id) {
  const r = await run(["agents", "delete", id, "--force", "--json"]);
  if (r.code !== 0) throw new Refusal(`OpenClaw did not delete the agent (${said(r)})`);
}

// src/workspace.ts
var RECORD_FILE = ".harnsy/hire.json";
function workspaceFiles(tree) {
  const home = workspaceFolder(tree.name) + "/", files = /* @__PURE__ */ new Map();
  for (const f of tree.files) {
    if (!f.path.startsWith(home)) throw new Refusal("a path that would leave the employee's workspace; nothing is written");
    const rel = f.path.slice(home.length);
    checkTreePath(rel);
    files.set(rel, f.content);
  }
  return files;
}
function target(root, rel) {
  checkTreePath(rel);
  const base = resolve(root), full = resolve(base, ...rel.split("/"));
  if (!full.startsWith(base + sep)) throw new Refusal("a path that would leave the employee's workspace; nothing is written");
  let at = base;
  for (const part of ["", ...rel.split("/")]) {
    at = part === "" ? at : join2(at, part);
    const st = lstatSync(at, { throwIfNoEntry: false });
    if (!st) break;
    if (st.isSymbolicLink()) throw new Refusal(`${rel}: a link stands in the way; this plugin does not read or write through links`);
    if (at !== full && !st.isDirectory()) throw new Refusal(`${rel}: a file stands where a folder should be`);
  }
  return full;
}
function isFree(root) {
  const st = lstatSync(root, { throwIfNoEntry: false });
  return !st || st.isDirectory() && readdirSync(root).length === 0;
}
function currentSum(root, rel) {
  const full = target(root, rel);
  const st = lstatSync(full, { throwIfNoEntry: false });
  return st?.isFile() ? hexSum(readFileSync2(full)) : null;
}
function writeNew(root, rel, content) {
  const full = target(root, rel);
  mkdirSync2(dirname2(full), { recursive: true });
  writeFileSync2(full, content, { flag: "wx", mode: 420 });
}
function replace(root, rel, content) {
  const full = target(root, rel), tmp = `${full}.harnsy-tmp`;
  mkdirSync2(dirname2(full), { recursive: true });
  rmSync(tmp, { force: true });
  writeFileSync2(tmp, content, { flag: "wx", mode: 420 });
  renameSync2(tmp, full);
}
function remove(root, rel) {
  const full = target(root, rel), base = resolve(root);
  rmSync(full, { force: true });
  for (let dir = dirname2(full); dir.startsWith(base + sep); dir = dirname2(dir)) {
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
  }
}
function rollback(root, written) {
  for (const rel of [...written].reverse()) {
    try {
      remove(root, rel);
    } catch {
    }
  }
  try {
    rmdirSync(resolve(root));
  } catch {
  }
}
function writeRecord(root, rec) {
  replace(root, RECORD_FILE, Buffer.from(JSON.stringify(rec, null, 2) + "\n", "utf8"));
}
function readRecord(root) {
  if (currentSum(root, RECORD_FILE) === null) return null;
  const bad = new Refusal(`${join2(root, ...RECORD_FILE.split("/"))} is damaged: it is this plugin's record of what it wrote there`);
  let rec;
  try {
    rec = JSON.parse(readFileSync2(target(root, RECORD_FILE), "utf8"));
  } catch {
    throw bad;
  }
  if (typeof rec !== "object" || rec === null || rec.v !== 1 || typeof rec.id !== "string" || !isID(rec.id) || typeof rec.version !== "string" || !isVersion(rec.version) || typeof rec.agent !== "string" || !isAgentID(rec.agent) || typeof rec.files !== "object" || rec.files === null) throw bad;
  for (const [rel, sum] of Object.entries(rec.files)) {
    if (typeof sum !== "string" || !/^[0-9a-f]{64}$/.test(sum) || !isOurs(rel)) throw bad;
  }
  return rec;
}
function isOurs(rel) {
  try {
    checkTreePath(rel);
  } catch {
    return false;
  }
  return ["SOUL.md", "AGENTS.md", "IDENTITY.md", "NOTICE.md", "docs/persona-casebook.md"].includes(rel) || rel.startsWith("skills/");
}

// src/commands/text.ts
var one = (s) => printable(s).replace(/\s+/g, " ").trim();
function card(e) {
  const who2 = [e.persona.name, e.department].map(one).filter((s) => s !== "").join(", ");
  const lines = [`${e.id}  ${e.version}  ${one(e.title)}${who2 === "" ? "" : ` (${who2})`}`];
  if (e.summary !== "") lines.push(`  ${one(e.summary)}`);
  if (e.skills.length > 0) lines.push(`  Good at: ${e.skills.map(one).join("; ")}`);
  return lines.join("\n");
}
function size(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
function describe(h, root) {
  const e = h.employee.entry, files = workspaceFiles(h.tree), need = printable(needs(h.employee)).trimEnd();
  const scripts = [...files.keys()].filter((p) => /^skills\/[^/]+\/scripts\//.test(p)).length;
  const lines = [
    card(e),
    `  Licence: ${one(h.employee.doc.license) || "none stated"}`,
    `  Page: ${one(sourceURL(h.employee))}`,
    "",
    "What it needs:",
    need === "" ? "- Nothing beyond the model your OpenClaw already uses." : need,
    "",
    `Files (${files.size}), written to ${root}:`
  ];
  for (const [rel, b] of files) lines.push(`  ${rel}  ${size(b.length)}`);
  if (scripts > 0) {
    lines.push("", `Among them: ${scripts} script file(s) of its skills. This plugin writes them as files and never runs them; the agent may run them later, as it may run any file in its workspace.`);
  }
  lines.push(
    "",
    "The agent's own files (USER.md, MEMORY.md) are OpenClaw's and yours: this plugin does not write them.",
    "",
    "Notice (kept in the workspace as NOTICE.md):",
    "",
    printable(h.tree.notice).trimEnd()
  );
  return lines.join("\n");
}
var cli = (rest) => `openclaw ${PLUGIN_ID} ${rest}`;

// src/commands/browse.ts
async function searchCommand(cx, words, opts = {}) {
  const { feed } = await openCatalog(cx);
  const limit = Number.isSafeInteger(opts.limit) ? opts.limit : DEFAULT_LIMIT;
  const found = search(feed.entries, words, opts.department ?? "", limit);
  if (found.total === 0) return cx.out("No employee matches. Try other words, or run the search without words to see everyone.");
  const more = found.total - found.entries.length;
  cx.out([
    ...found.entries.map(card),
    "",
    more > 0 ? `${found.entries.length} of ${found.total} shown: add words, or raise --limit (at most ${MAX_LIMIT}).` : `${found.total} found.`,
    `Look at one: ${cli("show <id>")}. Hire one: ${cli("hire <id>")}.`
  ].join("\n\n").replace(/\n\n\n+/g, "\n\n"));
}
async function showCommand(cx, id) {
  const h = await employeeFor(cx, id);
  cx.out(describe(h, join3(cx.stateDir, workspaceFolder(h.tree.name))));
  cx.out(`Hire it (in a terminal): ${cli(`hire ${id}`)}`);
}

// src/commands/hire.ts
import { join as join4 } from "node:path";
var RESERVED = /* @__PURE__ */ new Set(["openclaw", "crestodian"]);
async function preflight(cx, name, root) {
  if (RESERVED.has(name)) throw new Refusal(`OpenClaw keeps the agent name «${name}» for itself: this employee cannot be hired under it`);
  const agents = await listAgents(cx.openclaw);
  if (agents.some((a) => a.id.toLowerCase() === name)) {
    throw new Refusal(`an OpenClaw agent «${name}» already exists; nothing was changed. If this plugin hired it, ${cli("update <id>")} brings its new version; otherwise it is yours and stays as it is.`);
  }
  if (!isFree(root)) {
    throw new Refusal(`the folder ${root} already holds files; nothing was changed. This plugin never writes into a folder that is in use.`);
  }
}
function recordFor(h, agent) {
  const e = h.employee.entry, files = {};
  for (const [rel, content] of workspaceFiles(h.tree)) files[rel] = hexSum(content);
  return { v: 1, id: e.id, version: e.version, agent, seq: h.feed.feed.seq, plugin: VERSION, files };
}
function writeAll(h, root, agent) {
  const written = [];
  try {
    for (const [rel, content] of workspaceFiles(h.tree)) {
      writeNew(root, rel, content);
      written.push(rel);
    }
    written.push(RECORD_FILE);
    writeRecord(root, recordFor(h, agent));
  } catch (err2) {
    rollback(root, written);
    throw err2 instanceof Refusal ? err2 : new Refusal(`a file could not be written (${err2.message}); what was written was removed`);
  }
  return written;
}
async function hireCommand(cx, id, opts = {}) {
  checkID(id);
  needPerson(cx, opts.yes);
  const h = await employeeFor(cx, id);
  const name = h.tree.name, root = join4(cx.stateDir, workspaceFolder(name));
  await preflight(cx, name, root);
  cx.out(describe(h, root));
  if (!await confirm(cx, opts.yes, `${h.warning}Hire ${id} as the OpenClaw agent «${name}»?`)) return cx.out("Nothing was written.");
  await preflight(cx, name, root);
  const written = writeAll(h, root, name);
  let agent;
  try {
    agent = await addAgent(cx.openclaw, name, root);
  } catch (err2) {
    rollback(root, written);
    throw new Refusal(`${err2.message}; the files written for it were removed`);
  }
  replace(root, "IDENTITY.md", workspaceFiles(h.tree).get("IDENTITY.md"));
  const named = await setIdentity(cx.openclaw, agent);
  if (agent !== name) writeRecord(root, recordFor(h, agent));
  cx.out([
    `Hired: ${id} ${h.employee.entry.version} is the OpenClaw agent «${agent}», workspace ${root}.`,
    named ? "" : `OpenClaw did not take the name from IDENTITY.md; set it with: openclaw agents set-identity --agent ${agent} --from-identity`,
    "It uses the model your OpenClaw is set up with. Talk to it:",
    `  openclaw agent --agent ${agent} --message "Who are you, what do you do first, what do you hand over?"`,
    `Later: ${cli(`update ${id}`)} brings a new version, ${cli(`fire ${id}`)} removes the agent.`
  ].filter((l) => l !== "").join("\n"));
}

// src/commands/staff.ts
import { lstatSync as lstatSync2, readdirSync as readdirSync2 } from "node:fs";
import { join as join5, resolve as resolve2 } from "node:path";
function hired(stateDir) {
  const out = [];
  let names;
  try {
    names = readdirSync2(stateDir).sort();
  } catch {
    return out;
  }
  for (const name of names) {
    const root = join5(stateDir, name);
    if (!name.startsWith("workspace-") || !lstatSync2(root, { throwIfNoEntry: false })?.isDirectory()) continue;
    try {
      const rec = readRecord(root);
      if (rec && workspaceFolder(shortName(rec.id)) === name) out.push({ root, rec });
    } catch {
    }
  }
  return out;
}
function listCommand(cx) {
  const all = hired(cx.stateDir);
  if (all.length === 0) return cx.out(`Nobody is hired yet. Find someone: ${cli("search <words>")}`);
  cx.out(all.map(({ root, rec }) => `${rec.id}  ${rec.version}  agent «${rec.agent}»  ${root}`).join("\n"));
}
async function fireCommand(cx, id, opts = {}) {
  checkID(id);
  needPerson(cx, opts.yes);
  const root = join5(cx.stateDir, workspaceFolder(shortName(id))), rec = readRecord(root);
  if (!rec || rec.id !== id) {
    throw new Refusal(`${id} was not hired by this plugin on this machine (${cli("list")} shows who was). An agent of your own is removed with: openclaw agents delete <id>`);
  }
  const agent = (await listAgents(cx.openclaw)).find((a) => a.id === rec.agent);
  if (!agent) throw new Refusal(`OpenClaw has no agent «${rec.agent}» any more; the folder ${root} is left as it is`);
  if (resolve2(agent.workspace) !== resolve2(root)) {
    throw new Refusal(`the OpenClaw agent «${rec.agent}» works in ${agent.workspace}, not in the folder this plugin wrote: it is not deleted here`);
  }
  const question = `Fire ${id}? OpenClaw deletes the agent «${rec.agent}» and moves its workspace, state and transcripts to the Trash.`;
  if (!await confirm(cx, opts.yes, question)) return cx.out("Nothing was changed.");
  await deleteAgent(cx.openclaw, rec.agent);
  cx.out(`Fired: the OpenClaw agent «${rec.agent}» (${id}) is deleted.`);
}

// src/commands/update.ts
import { join as join6 } from "node:path";
function plan(root, rec, files) {
  const p = { write: [], edited: [], drop: [], left: [] };
  for (const [rel, content] of files) {
    const now = currentSum(root, rel), was = rec.files[rel];
    if (now === hexSum(content)) continue;
    if (rel === "NOTICE.md" || now === null && was === void 0 || now !== null && now === was) p.write.push(rel);
    else p.edited.push(rel);
  }
  for (const [rel, was] of Object.entries(rec.files)) {
    if (files.has(rel)) continue;
    const now = currentSum(root, rel);
    if (now === was) p.drop.push(rel);
    else if (now !== null) p.left.push(rel);
  }
  return p;
}
function summary(id, from, to, p, replaceEdited) {
  const lines = [`${id}: ${from === to ? `version ${to}` : `${from} → ${to}`}`];
  const list2 = (title2, rels) => rels.length > 0 && lines.push(title2, ...rels.map((r) => `  ${r}`));
  list2("Written anew:", p.write);
  list2(replaceEdited ? "Changed by you since the hire, replaced as you asked (--replace-edited):" : "Changed by you since the hire (each is asked about; kept unless you say yes):", p.edited);
  list2("No longer part of the employee, removed:", p.drop);
  list2("No longer part of the employee, but changed by you: kept as your own files:", p.left);
  return lines.join("\n");
}
async function chooseEdited(cx, opts, edited, warning) {
  if (opts.replaceEdited) return edited;
  const take = [];
  for (const rel of edited) {
    if (!opts.yes && cx.ask && await cx.ask(`${warning}${rel} was changed since the hire. Replace it with the new version?`)) take.push(rel);
  }
  return take;
}
async function updateCommand(cx, id, opts = {}) {
  checkID(id);
  needPerson(cx, opts.yes);
  const root = join6(cx.stateDir, workspaceFolder(shortName(id))), rec = readRecord(root);
  if (!rec || rec.id !== id) throw new Refusal(`${id} was not hired by this plugin on this machine (${cli("list")} shows who was)`);
  const h = await employeeFor(cx, id);
  const files = workspaceFiles(h.tree), p = plan(root, rec, files), to = h.employee.entry.version;
  if (p.write.length + p.edited.length + p.drop.length === 0) {
    writeRecord(root, { ...recordFor(h, rec.agent), files: keepSums(rec, files, []) });
    return cx.out(`${id} ${to}: every file is current.`);
  }
  cx.out(summary(id, rec.version, to, p, opts.replaceEdited));
  if (!await confirm(cx, opts.yes, `${h.warning}Update ${id} in ${root}?`)) return cx.out("Nothing was changed.");
  const take = await chooseEdited(cx, opts, p.edited, h.warning);
  for (const rel of [...p.write, ...take]) replace(root, rel, files.get(rel));
  for (const rel of p.drop) remove(root, rel);
  writeRecord(root, { ...recordFor(h, rec.agent), files: keepSums(rec, files, p.edited.filter((r) => !take.includes(r))) });
  if ([...p.write, ...take].includes("IDENTITY.md")) await setIdentity(cx.openclaw, rec.agent);
  const kept = p.edited.length - take.length;
  cx.out(`Updated: ${id} is at ${to}.` + (kept > 0 ? ` ${kept} file(s) you changed were kept as they are; --replace-edited replaces them.` : ""));
}
function keepSums(rec, files, kept) {
  const sums = {};
  for (const [rel, content] of files) {
    if (!kept.includes(rel)) sums[rel] = hexSum(content);
    else if (rec.files[rel] !== void 0) sums[rel] = rec.files[rel];
  }
  return sums;
}

// src/cli.ts
var TEST_CATALOG = ["--test-catalog", "read the test catalog that HARNSY_HR_FEED / HARNSY_HR_PUB name instead of hr.harnsy.dev (for stands)"];
var CLI_DESCRIPTION = "Hire AI employees from the signed catalog hr.harnsy.dev as OpenClaw agents";
function failureText(err2) {
  if (err2 instanceof Refusal) return `${PLUGIN_ID}: ${err2.message}`;
  return `${PLUGIN_ID}: stopped by an unexpected fault (${err2 instanceof Error ? err2.message : "unknown"}); nothing more was done`;
}
function registerCli(program, context, fail2) {
  const run = (fn) => async (...args) => {
    try {
      await fn(context(), ...args);
    } catch (err2) {
      fail2(failureText(err2));
    }
  };
  const stand = (cx, o) => ({ ...cx, testCatalog: o.testCatalog === true });
  const root = program.command(PLUGIN_ID).description(CLI_DESCRIPTION);
  root.command("search [words...]").description("Search the catalog by words (a role, a skill, a need); no words lists everyone").option("--department <name>", "only this department, for example finance").option("--limit <n>", "how many to show, at most 20 (10 when left out)").option(...TEST_CATALOG).action(run((cx, words, o) => searchCommand(stand(cx, o), (words ?? []).join(" "), { department: o.department, limit: o.limit === void 0 ? void 0 : Number(o.limit) })));
  root.command("show <id>").description("Show one employee: what it needs, the files a hire writes, its notice").option(...TEST_CATALOG).action(run((cx, id, o) => showCommand(stand(cx, o), id)));
  root.command("hire <id>").description("Hire an employee as an OpenClaw agent with a workspace of its own; shows everything first and asks").option("--yes", "do not ask (for scripts)").option(...TEST_CATALOG).action(run((cx, id, o) => hireCommand(stand(cx, o), id, { yes: o.yes })));
  root.command("update <id>").description("Bring a hired employee to the catalog's current version; files you changed are asked about").option("--yes", "do not ask; files you changed are kept").option("--replace-edited", "also replace the files you changed").option(...TEST_CATALOG).action(run((cx, id, o) => updateCommand(stand(cx, o), id, { yes: o.yes, replaceEdited: o.replaceEdited })));
  root.command("list").description("List the employees hired on this machine").action(run((cx) => listCommand(cx)));
  root.command("fire <id>").description("Delete a hired employee's agent (OpenClaw moves its workspace to the Trash); asks first").option("--yes", "do not ask (for scripts)").action(run((cx, id, o) => fireCommand(cx, id, { yes: o.yes })));
}

// src/chat.ts
var CHAT_DESCRIPTION = "Look at the AI employees of the catalog hr.harnsy.dev: search, show, list";
var HELP = [
  `/${PLUGIN_ID} search <words>   find employees by a role, a skill or a need`,
  `/${PLUGIN_ID} show <id>          one employee: what it needs, its files, its notice`,
  `/${PLUGIN_ID} list               who is hired on this machine`,
  `Hiring, updating and firing are done in a terminal: ${cli("hire <id>")}`
].join("\n");
async function chatCommand(base, args) {
  const lines = [];
  const cx = { ...base, out: (text3) => {
    lines.push(text3);
  }, ask: null, chat: true, testCatalog: false };
  const [verb = "", ...rest] = args.trim().split(/\s+/);
  try {
    if (verb === "search") await searchCommand(cx, rest.join(" "));
    else if (verb === "show") await showCommand(cx, rest[0] ?? "");
    else if (verb === "list") listCommand(cx);
    else if (verb === "hire" || verb === "update" || verb === "fire") {
      const id = isID(rest[0] ?? "") ? rest[0] : "<publisher>/<name>";
      lines.push(`This step writes files and waits for your yes, so it is not done from a chat. In a terminal:
  ${cli(`${verb} ${id}`)}`);
    } else lines.push(HELP);
  } catch (err2) {
    lines.push(failureText(err2));
  }
  return fenced(lines.join("\n\n"));
}
function fenced(text3) {
  return "```\n" + text3.replace(/`/g, "'") + "\n```";
}

// src/host.ts
import { homedir } from "node:os";
import { join as join7 } from "node:path";
import { createInterface } from "node:readline/promises";
function stateDirOf(resolve3, env) {
  try {
    const dir = resolve3?.();
    if (typeof dir === "string" && dir !== "") return dir;
  } catch {
  }
  return env["OPENCLAW_STATE_DIR"] || join7(homedir(), ".openclaw");
}
async function askInTerminal(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^(y|yes)$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}
function terminalContext(stateDir) {
  return {
    env: process.env,
    stateDir,
    now: () => /* @__PURE__ */ new Date(),
    out: (text3) => console.log(text3),
    ask: process.stdin.isTTY && process.stdout.isTTY ? askInTerminal : null,
    openclaw: spawnRunner()
  };
}
function failInTerminal(text3) {
  console.error(text3);
  process.exitCode = 1;
}

// src/index.ts
var index_default = definePluginEntry({
  id: PLUGIN_ID,
  name: "harnsy HR",
  description: CLI_DESCRIPTION,
  register(api) {
    const context = () => terminalContext(stateDirOf(() => api.runtime?.state?.resolveStateDir?.(), process.env));
    api.registerCli(
      ({ program }) => registerCli(program, context, failInTerminal),
      { descriptors: [{ name: PLUGIN_ID, description: CLI_DESCRIPTION, hasSubcommands: true }] }
    );
    api.registerCommand({
      name: PLUGIN_ID,
      description: CHAT_DESCRIPTION,
      acceptsArgs: true,
      handler: async (ctx) => ({ text: await chatCommand(context(), ctx.args ?? "") })
    });
  }
});
export {
  index_default as default
};
