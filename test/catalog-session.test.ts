import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { chatCommand } from "../src/chat.ts";
import { registerCli } from "../src/cli.ts";
import { searchCommand, showCommand } from "../src/commands/browse.ts";
import { hireCommand } from "../src/commands/hire.ts";
import { listCommand } from "../src/commands/staff.ts";
import { updateCommand } from "../src/commands/update.ts";
import { CATALOG_KEYS, catalogConfig, NO_KEY } from "../src/keys.ts";
import { rememberSeq, seenSeq, stateFile } from "../src/state.ts";
import { bytes, Kit, write } from "./kit/kit.ts";
import { recorder } from "./kit/program.ts";
import { refusal, sample, tempDir } from "./kit/sample.ts";
import { world } from "./kit/world.ts";

function stand() {
  const k = new Kit(), dir = tempDir();
  const pack = k.pack("harnsy/reviewer", "1.0.0", sample("reviewer"));
  k.release(dir, [pack]);
  return { k, dir, pack, w: world(k, dir) };
}

test("the plugin as shipped trusts exactly one catalog key, c1, and reads the real catalog", () => {
  assert.deepEqual(CATALOG_KEYS.map((key) => key.kid), ["c1"]);
  const cfg = catalogConfig({});
  assert.deepEqual(cfg.keys.map((key) => [key.kid, key.pub.length]), [["c1", 32]]);
  assert.equal(Buffer.from(cfg.keys[0]!.pub).toString("base64"), "WMZK4GiSTfBo5ZeMNZjDRextsTDGfoCU1KF6jlrqVjM=");
  assert.deepEqual([cfg.base, cfg.testNote], ["https://hr.harnsy.dev", ""]);
});

test("a feed signed under another key than the built-in one is refused; nothing is written", async () => {
  const { w } = stand(), before = w.snapshot();
  const cx = w.cx({ keys: undefined });
  for (const run of [() => searchCommand(cx, "reviewer"), () => hireCommand(cx, "harnsy/reviewer", { yes: true })]) {
    assert.match(await refusal(run()), /kid "t1" is not a catalog key this plugin knows; update the plugin/);
  }
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(w.calls, []);
});

test("with no catalog key at all every command that reads the catalog refuses and nothing is fetched", async () => {
  const { w } = stand(), before = w.snapshot();
  let fetched = 0;
  const cx = w.cx({ keys: [], source: () => ({ get: async () => { fetched++; return Buffer.alloc(0); } }) });
  for (const run of [() => searchCommand(cx, "reviewer"), () => showCommand(cx, "harnsy/reviewer"),
    () => hireCommand(cx, "harnsy/reviewer", { yes: true })]) {
    assert.equal(await refusal(run()), NO_KEY);
  }
  assert.equal(NO_KEY, "This build of the plugin has no catalog key built in, so it cannot check the catalog's signature and reads nothing from it.");
  assert.equal(fetched, 0, "nothing is fetched when nothing could be verified");
  assert.deepEqual(w.snapshot(), before);
  listCommand(cx);
  assert.match(w.printed.at(-1)!, /Nobody is hired yet/, "list reads the disk only and still works");
});

test("a stand is named by two environment variables, and every command says first that a test catalog is in use", async () => {
  const { k, w } = stand(), pub = `t1:${Buffer.from(k.key.pub).toString("base64")}`;
  const bases: string[] = [], note = "A test catalog is in use (HARNSY_HR_FEED or HARNSY_HR_PUB is set): reading http://127.0.0.1:8800, trusting t1.";
  const cx = () => w.cx({ keys: [], env: { HARNSY_HR_FEED: "http://127.0.0.1:8800", HARNSY_HR_PUB: pub },
    source: (base) => { bases.push(base); return w.cx().source!(base); } });
  const { program, commands } = recorder();
  registerCli(program, cx, (text) => { w.printed.push(text); });
  const run = (verb: string, ...args: unknown[]) => commands.get(`harnsy-hr ${verb}`)!.action!(...args);
  for (const [verb, args] of [["search", [["reviewer"], {}]], ["show", ["harnsy/reviewer"]], ["hire", ["harnsy/reviewer", { yes: true }]],
    ["update", ["harnsy/reviewer", { yes: true }]], ["list", [{}]], ["fire", ["harnsy/reviewer", { yes: true }]]] as const) {
    w.printed.length = 0;
    await run(verb, ...args);
    assert.equal(w.printed[0], note, verb);
    assert.ok(w.printed.length > 1 && !w.printed[1]!.startsWith("harnsy-hr:"), `${verb}: ${w.printed[1]}`);
  }
  assert.deepEqual([...new Set(bases)], ["http://127.0.0.1:8800"]);
  for (const args of ["search reviewer", "list", "hire harnsy/reviewer"]) assert.ok((await chatCommand(cx(), args)).startsWith(note + "\n\n"), args);
  const real = recorder();
  registerCli(real.program, () => w.cx(), () => {});
  w.printed.length = 0;
  await real.commands.get("harnsy-hr list")!.action!({});
  assert.ok(!w.printed.join("\n").includes("test catalog"), "the real catalog is not announced");

  assert.equal(catalogConfig({}, []).base, "https://hr.harnsy.dev");
  assert.equal(catalogConfig({}, []).testNote, "");
  assert.match(catalogConfig({ HARNSY_HR_FEED: "http://x" }, []).testNote, /trusting no key/);
  assert.deepEqual(catalogConfig({ HARNSY_HR_PUB: pub }, [{ kid: "c1", pub: pub.slice(3) }]).keys.map((key) => key.kid), ["t1"],
    "while a test key is set it is the only key trusted");
  for (const bad of ["t1", ":abc", "t1:not-a-key", "t1:" + Buffer.alloc(31).toString("base64")]) {
    assert.throws(() => catalogConfig({ HARNSY_HR_PUB: bad }, []), /HARNSY_HR_PUB|catalog key/, bad);
  }
});

test("a feed copy with one byte changed is refused and nothing is written", async () => {
  const { dir, w } = stand(), before = w.snapshot();
  const feed = join(dir, "v1", "feed.json");
  write(feed, bytes(readFileSync(feed, "utf8").replace("Finds", "Hides")));
  for (const run of [() => hireCommand(w.cx(), "harnsy/reviewer", { yes: true }), () => searchCommand(w.cx(), "reviewer")]) {
    assert.match(await refusal(run()), /feed\.json\.sig does not verify/);
  }
  assert.deepEqual(w.snapshot(), before);
  assert.equal(w.calls.length, 0);
  assert.equal(existsSync(stateFile(w.stateDir)), false, "a feed that does not verify is not remembered either");
});

test("a bundle with one byte changed is refused and nothing is written", async () => {
  const { dir, w } = stand(), before = w.snapshot();
  const file = join(dir, "packs", "harnsy", "reviewer", "1.0.0.harnsy"), b = readFileSync(file);
  b[b.length >> 1]! ^= 1;
  writeFileSync(file, b);
  assert.match(await refusal(hireCommand(w.cx(), "harnsy/reviewer", { yes: true })), /harnsy\/reviewer@1\.0\.0: size or sha256 differs from the feed/);
  assert.deepEqual(w.snapshot(), before);
  assert.equal(w.calls.length, 0);
});

test("the highest feed sequence seen is remembered; an older feed, validly signed, is refused", async () => {
  const { k, dir, pack, w } = stand();
  await searchCommand(w.cx(), "");
  assert.equal(seenSeq(w.stateDir, "t1"), 7);
  k.release(dir, [pack], (f) => { f.seq = 9; });
  await searchCommand(w.cx(), "");
  assert.equal(seenSeq(w.stateDir, "t1"), 9);
  k.release(dir, [pack], (f) => { f.seq = 8; f.revoked = []; });
  const before = w.snapshot();
  for (const run of [() => searchCommand(w.cx(), ""), () => hireCommand(w.cx(), "harnsy/reviewer", { yes: true })]) {
    assert.match(await refusal(run()), /seq 8 is older than seq 9 this machine has already seen/);
  }
  assert.deepEqual(w.snapshot(), before);
  assert.equal(seenSeq(w.stateDir, "t1"), 9);
  k.release(dir, [pack], (f) => { f.seq = 9; });
  await searchCommand(w.cx(), "");
  assert.equal(seenSeq(w.stateDir, "other"), 0, "each key has its own count: a stand does not move the real catalog's");
});

test("the state file: kept small and private, never moved back, refused when damaged", async () => {
  const dir = tempDir();
  rememberSeq(dir, "c1", 5);
  rememberSeq(dir, "c1", 3);
  rememberSeq(dir, "t1", 1);
  assert.deepEqual(JSON.parse(readFileSync(stateFile(dir), "utf8")), { seq: { c1: 5, t1: 1 } });
  for (const damaged of ["", "{", `{"seq": []}`, `{"seq": {"c1": "7"}}`, `{"seq": {"c1": 1.5}}`]) {
    writeFileSync(stateFile(dir), damaged);
    assert.throws(() => seenSeq(dir, "c1"), /state file is damaged/, damaged);
    assert.throws(() => rememberSeq(dir, "c1", 9), /state file is damaged/, damaged);
  }
});

test("a feed signed under a key id this plugin does not know: update the plugin", async () => {
  const { k, dir, w } = stand(), feed = join(dir, "v1", "feed.json");
  write(feed + ".sig", k.signFeed("c2", readFileSync(feed)));
  assert.match(await refusal(searchCommand(w.cx(), "")), /kid "c2" is not a catalog key this plugin knows; update the plugin/);
});

test("a version withdrawn from the catalog is not hired, and an update says so", async () => {
  const { k, dir, pack, w } = stand();
  await hireCommand(w.cx(), "harnsy/reviewer", { yes: true });
  k.release(dir, [pack], (f) => { f.revoked = ["harnsy/reviewer@1.0.0"]; });
  const before = w.snapshot();
  assert.match(await refusal(updateCommand(w.cx(), "harnsy/reviewer", { yes: true })), /its current version was withdrawn from the catalog/);
  assert.deepEqual(w.snapshot(), before);
});
