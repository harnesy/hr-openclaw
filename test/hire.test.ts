import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hireCommand } from "../src/commands/hire.ts";
import { hexSum } from "../src/catalog/verify.ts";
import { bytes, Kit, source, write } from "./kit/kit.ts";
import { refusal, tempDir } from "./kit/sample.ts";
import { staff, TESTDATA } from "./kit/staff.ts";
import { answer, world, type World } from "./kit/world.ts";

const golden = (id: string) => source(join(TESTDATA, "golden", "openclaw", id.replace("/", "-"), `workspace-${id.split("/")[1]}`));
const workspaces = (w: World) => readdirSync(w.stateDir).filter((n) => n.startsWith("workspace-")).sort();

async function fresh() {
  const { kit, dir } = await staff();
  return world(kit, dir);
}

test("hire --yes: the workspace holds exactly the reference tree, written before OpenClaw is asked to add the agent", async () => {
  const w = await fresh(), before = w.snapshot("workspace");
  let filesAtAdd: string[] = [];
  const cx = w.cx();
  const run = cx.openclaw;
  cx.openclaw = async (args) => {
    if (args[1] === "add") filesAtAdd = [...source(join(w.stateDir, "workspace-sample-skills")).keys()];
    return run(args);
  };
  await hireCommand(cx, "harnsy/sample-skills", { yes: true });

  const root = join(w.stateDir, "workspace-sample-skills"), got = source(root), want = golden("harnsy/sample-skills");
  for (const [path, b] of want) assert.ok(Buffer.from(got.get(path) ?? []).equals(Buffer.from(b)), `${path} differs from the reference tree`);
  assert.deepEqual([...got.keys()].sort(), [...want.keys(), ".harnsy/hire.json", "USER.md"].sort(), "USER.md is OpenClaw's own; nothing else is added");
  assert.ok(filesAtAdd.includes("SOUL.md") && filesAtAdd.includes("skills/loan-desk/SKILL.md") && filesAtAdd.includes(".harnsy/hire.json"));
  assert.deepEqual(w.calls.filter((c) => c[1] !== "list"), [
    ["agents", "add", "sample-skills", "--workspace", root, "--non-interactive", "--json"],
    ["agents", "set-identity", "--agent", "sample-skills", "--from-identity", "--json"],
  ]);
  const rec = JSON.parse(got.get(".harnsy/hire.json")!.toString());
  assert.deepEqual([rec.v, rec.id, rec.version, rec.agent, rec.seq], [1, "harnsy/sample-skills", "1.2.0", "sample-skills", 7]);
  assert.deepEqual(rec.files, Object.fromEntries([...want].map(([path, b]) => [path, hexSum(b)])));
  assert.deepEqual(w.snapshot("workspace"), before, "the default agent's workspace is byte for byte as it was");
  assert.match(w.printed.at(-1)!, /Hired: harnsy\/sample-skills 1\.2\.0 is the OpenClaw agent «sample-skills»/);
});

test("hire shows the card, what the employee needs, every file and the whole notice, then asks; a no writes nothing", async () => {
  const w = await fresh(), before = w.snapshot();
  await hireCommand(w.cx({ ask: answer(w, false) }), "harnsy/sample-scripts");
  const shown = w.printed[0]!, want = golden("harnsy/sample-scripts");
  assert.match(shown, /^harnsy\/sample-scripts  2\.0\.1  Sample binder \(Pru, operations\)/);
  assert.match(shown, /Licence: CC-BY-4\.0 AND MIT/);
  assert.match(shown, /Page: https:\/\/hr\.harnsy\.dev\/e\/harnsy\/sample-scripts/);
  assert.match(shown, /What it needs:\n- /);
  for (const path of want.keys()) assert.ok(shown.includes(`  ${path}  `), `the file list lacks ${path}`);
  assert.ok(shown.includes(want.get("NOTICE.md")!.toString().replace("# Notice\n\n", "").trimEnd()), "the notice is printed whole");
  assert.match(shown, /Among them: 1 script file\(s\) of its skills\. This plugin writes them as files and never runs them/);
  assert.deepEqual(w.questions, ["Hire harnsy/sample-scripts as the OpenClaw agent «sample-scripts»?"]);
  assert.equal(w.printed.at(-1), "Nothing was written.");
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(w.calls.filter((c) => c[1] !== "list"), []);
});

test("a feed that names no page for its employees, as the live catalog's: the page shown is the employee's address on the catalog", async () => {
  const kit = new Kit(), dir = tempDir();
  kit.release(dir, kit.catalog(join(TESTDATA, "employees")), (feed) => { for (const b of feed.bundles) delete b.cv_url; });
  const w = world(kit, dir);
  await hireCommand(w.cx({ ask: answer(w, false) }), "harnsy/sample-plain");
  assert.match(w.printed[0]!, /^  Page: https:\/\/hr\.harnsy\.dev\/e\/harnsy\/sample-plain$/m);
});

test("OpenClaw answers agents add with something that is not an agent id: it is neither handed back to OpenClaw nor recorded", async () => {
  const w = await fresh(), cx = w.cx(), run = cx.openclaw;
  cx.openclaw = async (args) => {
    const r = await run(args);
    return args[1] === "add" ? { ...r, stdout: JSON.stringify({ agentId: "--force" }) } : r;
  };
  await hireCommand(cx, "harnsy/sample-skills", { yes: true });
  assert.deepEqual(w.calls.filter((c) => c[1] === "set-identity"), [["agents", "set-identity", "--agent", "sample-skills", "--from-identity", "--json"]]);
  const rec = JSON.parse(readFileSync(join(w.stateDir, "workspace-sample-skills", ".harnsy", "hire.json"), "utf8"));
  assert.equal(rec.agent, "sample-skills");
  assert.ok(!w.printed.join("\n").includes("--force"));
});

test("hire without a person and without --yes is refused; nothing is written", async () => {
  const w = await fresh(), before = w.snapshot();
  let fetched = 0;
  const cx = w.cx({ source: () => ({ get: async () => { fetched++; return Buffer.alloc(0); } }) });
  assert.match(await refusal(hireCommand(cx, "harnsy/sample-plain")), /waits for a person's yes.*--yes/);
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual([fetched, w.printed.length, w.calls.length], [0, 0, 0], "nothing is fetched, shown or run when nobody can answer");
});

test("a script of a skill is written as data: not executable, never run", async () => {
  const w = await fresh();
  await hireCommand(w.cx(), "harnsy/sample-scripts", { yes: true });
  const script = join(w.stateDir, "workspace-sample-scripts", "skills", "label-print", "scripts", "labels.py");
  assert.ok(existsSync(script));
  if (process.platform !== "win32") assert.equal((await import("node:fs")).statSync(script).mode & 0o111, 0, "no execute bit");
  assert.deepEqual(w.calls.map((c) => c.slice(0, 2).join(" ")).filter((c) => !c.startsWith("agents ")), [], "only OpenClaw's agents commands are run");
});

test("an agent of that name already exists: stop, say so, write nothing", async () => {
  const w = await fresh();
  w.agents.set("sample-plain", join(w.stateDir, "somewhere-else"));
  const before = w.snapshot();
  assert.match(await refusal(hireCommand(w.cx(), "harnsy/sample-plain", { yes: true })), /an OpenClaw agent «sample-plain» already exists; nothing was changed/);
  assert.deepEqual(w.snapshot(), before);
  assert.equal(w.printed.length, 0, "nothing is shown or asked before the stop");
});

test("the workspace folder already holds files: stop, say so, overwrite nothing", async () => {
  const w = await fresh();
  write(join(w.stateDir, "workspace-sample-plain", "SOUL.md"), bytes("# Somebody's own soul\n"));
  const before = w.snapshot();
  assert.match(await refusal(hireCommand(w.cx(), "harnsy/sample-plain", { yes: true })), /workspace-sample-plain already holds files; nothing was changed/);
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(w.calls.filter((c) => c[1] !== "list"), []);
});

test("a second hire lives beside the first; neither touches the other or the default agent", async () => {
  const w = await fresh(), main = w.snapshot("workspace");
  await hireCommand(w.cx(), "harnsy/sample-skills", { yes: true });
  const first = w.snapshot("workspace-sample-skills");
  await hireCommand(w.cx(), "octo/sample-guest", { yes: true });
  assert.deepEqual(workspaces(w), ["workspace-sample-guest", "workspace-sample-skills"]);
  assert.deepEqual(w.snapshot("workspace-sample-skills"), first);
  assert.deepEqual(w.snapshot("workspace"), main);
  assert.deepEqual([...w.agents.keys()], ["main", "sample-skills", "sample-guest"]);
});

test("OpenClaw does not add the agent: the files written for it are removed again", async () => {
  const w = await fresh(), before = w.snapshot();
  w.failAdd = true;
  assert.match(await refusal(hireCommand(w.cx(), "harnsy/sample-skills", { yes: true })), /OpenClaw did not add the agent \(agents add failed\); the files written for it were removed/);
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(workspaces(w), []);
});

test("the name line OpenClaw rewrites in IDENTITY.md is put back: the employee keeps its own name", async () => {
  const w = await fresh();
  await hireCommand(w.cx(), "harnsy/sample-skills", { yes: true });
  assert.match(readFileSync(join(w.stateDir, "workspace-sample-skills", "IDENTITY.md"), "utf8"), /^- Name: Otis$/m);
});

test("what is not an id is refused before anything is fetched, and is not echoed", async () => {
  const w = await fresh();
  let fetched = 0;
  const cx = w.cx({ source: () => ({ get: async () => { fetched++; return Buffer.alloc(0); } }) });
  for (const bad of ["bookkeeper", "harnsy/../../etc", "harnsy/x; rm -rf ~", "--yes", "harnsy/X"]) {
    const msg = await refusal(hireCommand(cx, bad, { yes: true }));
    assert.match(msg, /not an employee id: want <publisher>\/<name>/);
    assert.ok(!msg.includes(bad));
  }
  assert.equal(fetched, 0);
  assert.equal(w.calls.length, 0);
});

test("an employee the catalog does not list is not hired", async () => {
  const w = await fresh();
  assert.match(await refusal(hireCommand(w.cx(), "harnsy/nobody", { yes: true })), /harnsy\/nobody is not in the catalog/);
});
