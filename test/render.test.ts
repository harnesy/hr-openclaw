import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { employeeOf } from "../src/catalog/release.ts";
import { OPENCLAW_FILE_MAX, OPENCLAW_TOTAL_MAX, renderOpenClaw } from "../src/render/openclaw.ts";
import { checkTreePath } from "../src/render/tree.ts";
import { source } from "./kit/kit.ts";
import { staff, TESTDATA } from "./kit/staff.ts";

const lastLine = (s: string) => s.replace(/\n+$/, "").split("\n").at(-1)!;
const str = (b: Uint8Array | undefined) => Buffer.from(b ?? []).toString("utf8");

test("every test employee renders to exactly the golden tree hr-mcp renders for openclaw", async () => {
  const { release } = await staff();
  assert.equal(release.employees.length, 4);
  for (const e of release.employees) {
    const tree = renderOpenClaw(e);
    const want = source(join(TESTDATA, "golden", "openclaw", e.entry.id.replace("/", "-")));
    assert.deepEqual(tree.files.map((f) => f.path), [...want.keys()].sort(), e.entry.id);
    for (const f of tree.files) {
      assert.ok(Buffer.from(f.content).equals(want.get(f.path)!), `${e.entry.id}: ${f.path} differs from the golden file:\n${str(f.content)}`);
    }
  }
});

// An employee for OpenClaw is one agent workspace in a folder of its own. AGENTS.md carries the job (a sub-agent is
// given only that file), SOUL.md who it is, IDENTITY.md the name and the vibe as the lines OpenClaw parses. The
// person's own files (USER.md, MEMORY.md) and the first-run ritual (BOOTSTRAP.md) are never written.
test("an employee is one workspace folder with SOUL.md, AGENTS.md, IDENTITY.md and its skills", async () => {
  const { release } = await staff();
  for (const e of release.employees) {
    const tree = renderOpenClaw(e), id = e.entry.id, home = `workspace-${id.split("/")[1]}/`;
    const files = new Map<string, string>();
    for (const [i, f] of tree.files.entries()) {
      assert.ok(f.path.startsWith(home), `${id}: ${f.path} is outside ${home}`);
      assert.ok(!f.path.includes("..") && !f.path.includes("avatar"), f.path);
      if (i > 0) assert.ok(tree.files[i - 1]!.path < f.path, `${id}: files are not in path order at ${f.path}`);
      files.set(f.path.slice(home.length), str(f.content));
    }
    for (const never of ["USER.md", "MEMORY.md", "BOOTSTRAP.md", "TOOLS.md", "HEARTBEAT.md"]) assert.ok(!files.has(never), never);
    assert.deepEqual([tree.persona, tree.job, tree.noticeFile], [home + "SOUL.md", home + "AGENTS.md", home + "NOTICE.md"]);
    const soul = files.get("SOUL.md")!, agents = files.get("AGENTS.md")!, identity = files.get("IDENTITY.md")!.split("\n");
    for (const want of [e.doc.persona.character, "AI agent"]) assert.ok(soul.includes(want), `${id}: SOUL.md lacks ${want}`);
    assert.ok(!soul.includes(e.doc.role.prompt), `${id}: the job belongs in AGENTS.md, not in SOUL.md`);
    for (const want of [e.doc.role.mandate, e.doc.role.deliverable, e.doc.role.prompt, "AI agent"]) {
      assert.ok(agents.includes(want), `${id}: AGENTS.md lacks ${want}`);
    }
    for (const text of [soul, agents]) {
      const last = lastLine(text);
      assert.ok(last.includes(e.entry.cvUrl) && last.includes("rendered for openclaw") && last.includes(`${e.entry.title} ${e.entry.version}`), last);
    }
    for (const line of [`- Name: ${e.doc.persona.name || e.entry.title}`, `- Creature: AI agent, ${e.doc.role.name}`, `- Vibe: ${e.doc.role.tagline}`]) {
      assert.ok(identity.includes(line), `${id}: IDENTITY.md lacks the line ${line}`);
    }
    assert.ok(identity.some((l) => /^- Emoji: \S+$/u.test(l)), `${id}: IDENTITY.md lacks an emoji line`);
    assert.ok(files.get("NOTICE.md")!.includes(tree.notice), `${id}: the notice file must hold the notice`);
    let total = 0;
    for (const f of ["AGENTS.md", "SOUL.md", "IDENTITY.md"]) {
      const n = files.get(f)!.length; // UTF-16 units: what OpenClaw counts
      total += n;
      assert.ok(n > 0 && n <= OPENCLAW_FILE_MAX, `${id}: ${f} is ${n} characters`);
    }
    assert.ok(total <= OPENCLAW_TOTAL_MAX, `${id}: ${total} characters are loaded every session`);
    const all = [...files.values()].join("\n");
    for (const sealed of ["A made-up desk manual", "nodes", "[S1]"]) {
      assert.ok(!all.includes(sealed), `${id}: ${sealed} must not leave the bundle (sources and harnsy Max needs stay sealed)`);
    }
  }
});

test("every file of every skill is in the tree unchanged, with its licence beside it", async () => {
  const { release } = await staff();
  for (const e of release.employees) {
    const tree = renderOpenClaw(e);
    for (const [name, b] of e.files) {
      if (!name.startsWith("skills/")) continue;
      const f = tree.files.find((f) => f.path === `workspace-${tree.name}/${name}`);
      assert.ok(f && Buffer.from(f.content).equals(Buffer.from(b)), `${e.entry.id}: ${name} is missing or changed`);
    }
  }
});

test("a tagline or a name with a line break does not break IDENTITY.md's lines; an unknown department still gets a sign", async () => {
  const e = structuredClone((await staff()).release.employees[0]!);
  e.doc.role.tagline = "Counts twice.\nWrites it  down once.\n";
  e.doc.persona.name = "Otis\n- Avatar: https://evil.example/a.png";
  e.doc.role.department = "a department nobody listed";
  const identity = str(renderOpenClaw(e).files.find((f) => f.path.endsWith("/IDENTITY.md"))!.content).split("\n");
  assert.ok(identity.includes("- Vibe: Counts twice. Writes it down once."), identity.join("\n"));
  assert.ok(identity.includes("- Name: Otis - Avatar: https://evil.example/a.png"));
  assert.ok(identity.some((l) => /^- Emoji: \S+$/u.test(l)));
  assert.equal(identity.filter((l) => l.startsWith("- ")).length, 4);
});

// The catalog refuses a release with a name outside its grammar; the renderer checks again, on its own, that every path
// it hands out is relative, clean and stays inside.
test("a path that would leave the place the employee is installed to is never part of a tree", async () => {
  for (const bad of ["", ".", "/etc/x", "../x", "a/../../x", "a//b", "a\\b", "a/./b", "..", "a/", "a\nb", "a\u0007b", "a\u0085b"]) {
    assert.throws(() => checkTreePath(bad), /a path that would leave the place the employee is installed to/, JSON.stringify(bad));
  }
  checkTreePath("workspace-a/skills/b/scripts/run.py");
  const base = employeeOf((await staff()).release, "harnsy/sample-skills")!;
  const cases: [name: string, id: string, file: string][] = [
    ["an id that climbs out", "harnsy/../../../../tmp/x", ""],
    ["an id with a new line", "harnsy/x\npermissionMode: bypassPermissions", ""],
    ["an id with a backslash", "harnsy/x\\..\\y", ""],
    ["a skill folder that climbs out", "harnsy/x", "skills/../../evil/SKILL.md"],
    ["a skill file that climbs out", "harnsy/x", "skills/s/../../../evil"],
    ["a skill without a name", "harnsy/x", "skills//SKILL.md"],
  ];
  for (const [name, id, file] of cases) {
    const e = structuredClone(base);
    e.entry.id = id;
    if (file !== "") e.files.set(file, Buffer.from("x"));
    assert.throws(() => renderOpenClaw(e), /a path that would leave the place the employee is installed to/, name);
  }
  const plain = structuredClone(base);
  plain.files.set("skills/s/scripts/run.sh", Buffer.from("x"));
  assert.ok(renderOpenClaw(plain).files.some((f) => f.path === "workspace-sample-skills/skills/s/scripts/run.sh"));
});
