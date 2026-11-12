import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isFree, isOurs, remove, replace, rollback, target, writeNew } from "../src/workspace.ts";
import { bytes } from "./kit/kit.ts";
import { tempDir } from "./kit/sample.ts";

test("every write lands inside the workspace: a path that is not clean or climbs out is refused", () => {
  const root = join(tempDir(), "workspace-a");
  assert.equal(target(root, "skills/b/scripts/run.py"), join(root, "skills", "b", "scripts", "run.py"));
  for (const bad of ["../x", "a/../../x", "/etc/passwd", "a//b", "a\\..\\b", "", ".", "..", "a/./b", "a/"]) {
    assert.throws(() => target(root, bad), /outside the employee's folder/, JSON.stringify(bad));
    assert.throws(() => writeNew(root, bad, bytes("x")), /outside the employee's folder/);
  }
  assert.equal(existsSync(root), false, "a refused write makes no folder");
});

test("a new file is never written over one that is there; a replaced one changes in one step", () => {
  const root = join(tempDir(), "workspace-a");
  writeNew(root, "docs/a.md", bytes("one"));
  assert.throws(() => writeNew(root, "docs/a.md", bytes("two")), /EEXIST/);
  assert.equal(readFileSync(join(root, "docs", "a.md"), "utf8"), "one");
  replace(root, "docs/a.md", bytes("three"));
  assert.equal(readFileSync(join(root, "docs", "a.md"), "utf8"), "three");
  assert.equal(existsSync(join(root, "docs", "a.md.harnsy-tmp")), false);
});

test("nothing is read or written through a link", { skip: process.platform === "win32" }, () => {
  const base = tempDir(), root = join(base, "workspace-a"), outside = join(base, "outside");
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, "secret"), "secret");
  symlinkSync(outside, join(root, "skills", "evil"));
  symlinkSync(join(outside, "secret"), join(root, "SOUL.md"));
  for (const rel of ["skills/evil/SKILL.md", "SOUL.md"]) {
    assert.throws(() => target(root, rel), /a link stands in the way/);
    assert.throws(() => replace(root, rel, bytes("x")), /a link stands in the way/);
    assert.throws(() => remove(root, rel), /a link stands in the way/);
  }
  assert.equal(readFileSync(join(outside, "secret"), "utf8"), "secret");
  assert.deepEqual(existsSync(join(outside, "SKILL.md")), false);
  const linked = join(base, "workspace-b");
  symlinkSync(outside, linked);
  assert.throws(() => writeNew(linked, "SOUL.md", bytes("x")), /a link stands in the way/, "the workspace folder itself must not be a link");
  assert.equal(isFree(linked), false);
});

test("a folder is free when it is not there or empty; taking a hire back leaves what was there before", () => {
  const base = tempDir(), root = join(base, "workspace-a");
  assert.ok(isFree(root));
  mkdirSync(root);
  assert.ok(isFree(root));
  writeNew(root, "SOUL.md", bytes("x"));
  writeNew(root, "skills/a/scripts/run.py", bytes("x"));
  assert.equal(isFree(root), false);
  rollback(root, ["SOUL.md", "skills/a/scripts/run.py"]);
  assert.equal(existsSync(root), false, "the files, the folders they left empty and the workspace are gone");

  writeNew(root, "SOUL.md", bytes("x"));
  writeFileSync(join(root, "USER.md"), "the person's");
  rollback(root, ["SOUL.md"]);
  assert.deepEqual([existsSync(join(root, "SOUL.md")), readFileSync(join(root, "USER.md"), "utf8")], [false, "the person's"]);
  writeFileSync(join(root, "plain-file"), "x");
  assert.equal(isFree(join(root, "plain-file")), false);
});

test("the plugin's own files are the employee's: never the person's files or the agent's memory", () => {
  for (const ours of ["SOUL.md", "AGENTS.md", "IDENTITY.md", "NOTICE.md", "docs/persona-casebook.md", "skills/a/SKILL.md", "skills/a/scripts/x.py"]) assert.ok(isOurs(ours), ours);
  for (const not of ["USER.md", "MEMORY.md", "BOOTSTRAP.md", "memory/2026-11-12.md", ".harnsy/hire.json", "docs/other.md", "skills/../SOUL.md", "../SOUL.md", ""]) {
    assert.equal(isOurs(not), false, not);
  }
});
