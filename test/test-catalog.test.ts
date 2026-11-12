// A test catalog (a stand) is read only when two things agree: the environment names it and the command line says
// --test-catalog. The environment alone can come from a file (OpenClaw fills it from a .env of the current folder);
// a word of the command line cannot.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { registerCli } from "../src/cli.ts";
import { searchCommand, showCommand } from "../src/commands/browse.ts";
import type { Context } from "../src/commands/context.ts";
import { hireCommand } from "../src/commands/hire.ts";
import { updateCommand } from "../src/commands/update.ts";
import { catalogConfig } from "../src/keys.ts";
import { seenSeq, stateFile } from "../src/state.ts";
import { Kit } from "./kit/kit.ts";
import { recorder } from "./kit/program.ts";
import { refusal, sample, tempDir } from "./kit/sample.ts";
import { answer, chat, world } from "./kit/world.ts";

const FEED = "http://127.0.0.1:8800";
const NO_FLAG = (names: string, verb: string, noun: string) => `${names} ${verb} set, but --test-catalog was not given: a test catalog is read only ` +
  `when the command line says so. Nothing was fetched or written. Unset the ${noun} to read hr.harnsy.dev.`;

/** A machine that reads the «real» catalog under the key c1, and a stand whose own key is also named c1. */
function machine() {
  const real = new Kit(), stand = new Kit(), realDir = tempDir(), standDir = tempDir();
  real.key.kid = stand.key.kid = "c1";
  const pack = real.pack("harnsy/reviewer", "1.0.0", sample("reviewer"));
  real.release(realDir, [pack]);
  stand.release(standDir, [stand.pack("harnsy/reviewer", "1.0.0", sample("reviewer"))], (f) => { f.seq = Number.MAX_SAFE_INTEGER; });
  const w = world(real, realDir), standSource = world(stand, standDir).cx().source!;
  const pub = `c1:${Buffer.from(stand.key.pub).toString("base64")}`;
  let opened = 0, fetched = 0;
  const counting: Context["source"] = (base) => {
    opened++;
    const src = standSource(base);
    return { get: (path, max) => { fetched++; return src.get(path, max); } };
  };
  return { real, realDir, pack, w, pub, counting, count: () => [opened, fetched] };
}

test("the environment alone never switches a test catalog on: the command refuses, nothing is fetched or written", async () => {
  const m = machine(), { w } = m, both = { HARNSY_HR_FEED: FEED, HARNSY_HR_PUB: m.pub };
  const cx = (env: Context["env"]) => w.cx({ env, source: m.counting });
  const runs = (env: Context["env"]) => [() => searchCommand(cx(env), "reviewer"), () => showCommand(cx(env), "harnsy/reviewer"),
    () => hireCommand(cx(env), "harnsy/reviewer", { yes: true }), () => updateCommand(cx(env), "harnsy/reviewer", { yes: true, replaceEdited: true })];

  // On a machine that has read nothing yet there is no state file, and there is none afterwards.
  const before = w.snapshot();
  assert.equal(await refusal(hireCommand(cx(both), "harnsy/reviewer", { yes: true })), NO_FLAG("HARNSY_HR_FEED and HARNSY_HR_PUB", "are", "variables"));
  assert.equal(existsSync(stateFile(w.stateDir)), false, "no state file appears");
  assert.deepEqual(w.snapshot(), before);

  // On a machine with a hire from the real catalog: every command refuses, the state file keeps its bytes.
  await hireCommand(w.cx(), "harnsy/reviewer", { yes: true });
  const state = readFileSync(stateFile(w.stateDir)), files = w.snapshot(), calls = w.calls.length;
  for (const [env, want] of [[both, NO_FLAG("HARNSY_HR_FEED and HARNSY_HR_PUB", "are", "variables")],
    [{ HARNSY_HR_FEED: FEED }, NO_FLAG("HARNSY_HR_FEED", "is", "variable")],
    [{ HARNSY_HR_PUB: m.pub, HARNSY_HR_FEED: "" }, NO_FLAG("HARNSY_HR_PUB", "is", "variable")]] as const) {
    for (const run of runs(env)) assert.equal(await refusal(run()), want);
  }
  assert.deepEqual(m.count(), [0, 0], "no source was opened and nothing was fetched");
  assert.deepEqual(readFileSync(stateFile(w.stateDir)), state, "the state file is byte for byte as it was");
  assert.deepEqual(w.snapshot(), files);
  assert.equal(w.calls.length, calls, "OpenClaw was not called");

  // The same through the terminal command as OpenClaw registers it.
  const { program, commands } = recorder(), failures: string[] = [];
  registerCli(program, () => cx(both), (text) => failures.push(text));
  await commands.get("harnsy-hr hire")!.action!("harnsy/reviewer", { yes: true }, {});
  await commands.get("harnsy-hr update")!.action!("harnsy/reviewer", { yes: true, replaceEdited: true }, {});
  assert.deepEqual(failures, Array(2).fill("harnsy-hr: " + NO_FLAG("HARNSY_HR_FEED and HARNSY_HR_PUB", "are", "variables")));
  assert.deepEqual(m.count(), [0, 0]);
  assert.deepEqual(readFileSync(stateFile(w.stateDir)), state);
});

test("a chat never reads a test catalog: with a variable set search and show refuse, list still answers", async () => {
  const m = machine(), { w } = m;
  await hireCommand(w.cx(), "harnsy/reviewer", { yes: true });
  const state = readFileSync(stateFile(w.stateDir)), files = w.snapshot();
  const said = (env: Context["env"], args: string, over: Partial<Context> = {}) => chat(w.cx({ env, source: m.counting, ...over }), args);
  const both = { HARNSY_HR_FEED: FEED, HARNSY_HR_PUB: m.pub };
  for (const args of ["search reviewer", "show harnsy/reviewer", "search --test-catalog reviewer", "show harnsy/reviewer --test-catalog"]) {
    assert.equal(await said(both, args), "harnsy-hr: A test catalog is set in this machine's environment (HARNSY_HR_FEED, HARNSY_HR_PUB). " +
      "It is never read from a chat; nothing was fetched.", args);
    assert.match(await said({ HARNSY_HR_FEED: FEED }, args), /environment \(HARNSY_HR_FEED\)\. It is never read from a chat; nothing was fetched\.$/);
    assert.match(await said({ HARNSY_HR_PUB: m.pub }, args), /environment \(HARNSY_HR_PUB\)\. It is never read from a chat; nothing was fetched\.$/);
    assert.match(await said(both, args, { testCatalog: true }), /never read from a chat/, "a chat cannot carry the word of the command line");
  }
  assert.match(await said(both, "list"), /^harnsy\/reviewer  1\.0\.0  agent «reviewer»/, "list reads no catalog");
  assert.match(await said(both, "hire harnsy/reviewer"), /In a terminal:\n  openclaw harnsy-hr hire harnsy\/reviewer$/);
  assert.deepEqual(m.count(), [0, 0]);
  assert.deepEqual(readFileSync(stateFile(w.stateDir)), state);
  assert.deepEqual(w.snapshot(), files);
});

test("--test-catalog without a variable is refused: there is no test catalog to read", async () => {
  const m = machine(), { w } = m, before = w.snapshot();
  const cx = w.cx({ env: { HARNSY_HR_FEED: "", HARNSY_HR_PUB: "" }, testCatalog: true, source: m.counting });
  for (const run of [() => searchCommand(cx, ""), () => showCommand(cx, "harnsy/reviewer"), () => hireCommand(cx, "harnsy/reviewer", { yes: true })]) {
    assert.equal(await refusal(run()), "--test-catalog was given, but neither HARNSY_HR_FEED nor HARNSY_HR_PUB is set: there is no test catalog to read.");
  }
  assert.deepEqual(m.count(), [0, 0]);
  assert.equal(existsSync(stateFile(w.stateDir)), false);
  assert.deepEqual(w.snapshot(), before);
});

test("a test catalog keeps its feed number apart: a stand whose key is named c1 cannot lock the real catalog out", async () => {
  const m = machine(), { w } = m, env = { HARNSY_HR_FEED: FEED, HARNSY_HR_PUB: m.pub };
  await searchCommand(w.cx(), "");
  assert.equal(seenSeq(w.stateDir, "c1"), 7);

  await hireCommand(w.cx({ env, testCatalog: true, source: m.counting }), "harnsy/reviewer", { yes: true });
  assert.ok(w.agents.has("reviewer"), "with the flag and the variables the hire goes through");
  assert.equal(w.printed.find((text) => text.includes("test catalog")),
    "A test catalog is in use (HARNSY_HR_FEED or HARNSY_HR_PUB is set): reading http://127.0.0.1:8800, trusting c1.");
  assert.deepEqual(JSON.parse(readFileSync(stateFile(w.stateDir), "utf8")), { seq: { c1: 7, "test:c1": Number.MAX_SAFE_INTEGER } },
    "the number kept for the built-in c1 is as it was");

  m.real.release(m.realDir, [m.pack], (f) => { f.seq = 8; });
  await searchCommand(w.cx(), "");
  assert.equal(seenSeq(w.stateDir, "c1"), 8, "a later release of the real catalog is read, not refused as older");
  assert.equal(seenSeq(w.stateDir, "test:c1"), Number.MAX_SAFE_INTEGER);

  // Only the address named, the built-in key kept: the number still goes to the test slot.
  const other = machine();
  await searchCommand(other.w.cx({ env: { HARNSY_HR_FEED: FEED }, testCatalog: true }), "");
  assert.deepEqual(JSON.parse(readFileSync(stateFile(other.w.stateDir), "utf8")), { seq: { "test:c1": 7 } });
});

test("with a test catalog the question itself names the address and the key", async () => {
  const m = machine(), { w } = m, env = { HARNSY_HR_FEED: FEED + "/", HARNSY_HR_PUB: m.pub };
  const warning = "This is a test catalog, not hr.harnsy.dev: it is read from http://127.0.0.1:8800 and signed by the key \"c1\". ";
  const cx = () => w.cx({ env, testCatalog: true, source: m.counting, ask: answer(w, true) });
  await hireCommand(cx(), "harnsy/reviewer");
  assert.deepEqual(w.questions, [warning + "Hire harnsy/reviewer as the OpenClaw agent «reviewer»?"]);
  assert.equal(w.printed[0], "A test catalog is in use (HARNSY_HR_FEED or HARNSY_HR_PUB is set): reading http://127.0.0.1:8800, trusting c1.",
    "and the line about it is the first thing printed");

  const root = w.agents.get("reviewer")!;
  writeFileSync(join(root, "SOUL.md"), "# my own\n");
  writeFileSync(join(root, "AGENTS.md"), "# my own\n");
  w.questions.length = 0;
  await updateCommand(cx(), "harnsy/reviewer");
  assert.equal(w.questions[0], `${warning}Update harnsy/reviewer in ${root}?`);
  assert.deepEqual(w.questions.slice(1).sort(), [warning + "AGENTS.md was changed since the hire. Replace it with the new version?",
    warning + "SOUL.md was changed since the hire. Replace it with the new version?"]);
});

test("plain http is taken for this machine itself only; any other address needs https, and no request is made", async () => {
  const m = machine(), { w } = m;
  const LOOPBACK_ONLY = "HARNSY_HR_FEED: plain http is taken only for this machine itself (127.0.0.1, [::1], localhost); use https for any other address.";
  for (const feed of ["http://stand.example", "http://192.168.1.20:8800", "http://127.0.0.2:8800", "http://localhost.example:8800", "http://[::2]:8800",
    "http://0.0.0.0:8800"]) {
    const cx = w.cx({ env: { HARNSY_HR_FEED: feed, HARNSY_HR_PUB: m.pub }, testCatalog: true, source: m.counting });
    assert.equal(await refusal(hireCommand(cx, "harnsy/reviewer", { yes: true })), LOOPBACK_ONLY, feed);
    assert.equal(await refusal(searchCommand(cx, "")), LOOPBACK_ONLY, feed);
  }
  assert.deepEqual(m.count(), [0, 0], "refused before a source is opened: no request can have been made");
  assert.equal(existsSync(stateFile(w.stateDir)), false);
  const base = (feed: string) => catalogConfig({ HARNSY_HR_FEED: feed }, [], { testCatalog: true }).base;
  assert.deepEqual(["http://127.0.0.1:8800", "http://[::1]:8800/", "http://localhost:8800", "http://LOCALHOST", "https://stand.example/x/"].map(base),
    ["http://127.0.0.1:8800", "http://[::1]:8800", "http://localhost:8800", "http://localhost", "https://stand.example/x"]);
  for (const bad of ["ftp://127.0.0.1", "file:///etc", "127.0.0.1:8800", "not an address", "https://user:pw@stand.example", "https://stand.example/?a=b",
    "https://stand.example/#x"]) {
    assert.throws(() => base(bad), /^Refusal: HARNSY_HR_FEED: want an http\(s\) address without a query, for example http:\/\/127\.0\.0\.1:8850$/, bad);
  }
});
