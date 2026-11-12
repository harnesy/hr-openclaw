import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { hireCommand } from "../src/commands/hire.ts";
import { fireCommand, listCommand } from "../src/commands/staff.ts";
import { updateCommand } from "../src/commands/update.ts";
import { bytes, Kit, write, type Files } from "./kit/kit.ts";
import { refusal, sample, tempDir } from "./kit/sample.ts";
import { answer, world } from "./kit/world.ts";

const ID = "harnsy/reviewer";

/** A machine with harnsy/reviewer 1.0.0 hired, and a catalog that now serves 1.1.0: one skill changed, one new, one gone. */
async function hiredThenReleased(change: (src: Files) => void = () => {}) {
  const k = new Kit(), dir = tempDir(), w = world(k, dir), root = join(w.stateDir, "workspace-reviewer");
  const old = sample("reviewer");
  old.set("skills/old-way/SKILL.md", bytes("---\nname: old-way\ndescription: The old way.\n---\n"));
  k.release(dir, [k.pack(ID, "1.0.0", old)]);
  await hireCommand(w.cx(), ID, { yes: true });
  writeFileSync(join(root, "MEMORY.md"), "what the agent learnt\n");
  const next = sample("reviewer");
  next.set("skills/race-hunt/SKILL.md", bytes("---\nname: race-hunt\ndescription: Find data races.\n---\nRun the race detector twice.\n"));
  next.set("skills/race-hunt/references/notes.md", bytes("# Notes\n"));
  change(next);
  k.release(dir, [k.pack(ID, "1.1.0", next)], (f) => { f.seq = 8; });
  w.printed.length = 0;
  w.calls.length = 0;
  return { k, dir, w, root };
}

const read = (root: string, rel: string) => readFileSync(join(root, ...rel.split("/")), "utf8");

test("update: the plugin's files move to the new version; the agent's memory and the person's files stay", async () => {
  const { w, root } = await hiredThenReleased();
  await updateCommand(w.cx(), ID, { yes: true });
  assert.match(read(root, "skills/race-hunt/SKILL.md"), /detector twice/);
  assert.equal(read(root, "skills/race-hunt/references/notes.md"), "# Notes\n");
  assert.equal(existsSync(join(root, "skills", "old-way")), false, "a skill the new version no longer has is removed, with its folder");
  assert.equal(read(root, "MEMORY.md"), "what the agent learnt\n");
  assert.equal(read(root, "USER.md"), "# USER.md\n");
  assert.match(read(root, "NOTICE.md"), /Reviewer 1\.1\.0 by harnsy/);
  assert.match(read(root, "SOUL.md"), /Reviewer 1\.1\.0 by harnsy/);
  const rec = JSON.parse(read(root, ".harnsy/hire.json"));
  assert.deepEqual([rec.version, rec.seq, rec.agent], ["1.1.0", 8, "reviewer"]);
  assert.ok(!("skills/old-way/SKILL.md" in rec.files) && "skills/race-hunt/references/notes.md" in rec.files);
  assert.match(w.printed[0]!, /^harnsy\/reviewer: 1\.0\.0 → 1\.1\.0\nWritten anew:/);
  assert.match(w.printed.at(-1)!, /^Updated: harnsy\/reviewer is at 1\.1\.0\.$/);
  assert.deepEqual(w.calls, [], "IDENTITY.md did not change: OpenClaw is not called");

  w.printed.length = 0;
  await updateCommand(w.cx(), ID, { yes: true });
  assert.deepEqual(w.printed, ["harnsy/reviewer 1.1.0: every file is current."]);
});

test("update asks before replacing a file the person changed; a no keeps it, and the next update asks again", async () => {
  const { w, root } = await hiredThenReleased();
  writeFileSync(join(root, "SOUL.md"), "# My reviewer, tuned by hand\n");
  await updateCommand(w.cx({ ask: answer(w, (q) => !q.includes("SOUL.md")) }), ID);
  assert.deepEqual(w.questions, ["Update harnsy/reviewer in " + root + "?", "SOUL.md was changed since the hire. Replace it with the new version?"]);
  assert.equal(read(root, "SOUL.md"), "# My reviewer, tuned by hand\n");
  assert.match(read(root, "AGENTS.md"), /Reviewer 1\.1\.0 by harnsy/);
  assert.match(w.printed[0]!, /Changed by you since the hire[^\n]*\n  SOUL\.md/);
  assert.match(w.printed.at(-1)!, /1 file\(s\) you changed were kept as they are/);

  w.questions.length = 0;
  await updateCommand(w.cx({ ask: answer(w, true) }), ID);
  assert.ok(w.questions.includes("SOUL.md was changed since the hire. Replace it with the new version?"));
  assert.match(read(root, "SOUL.md"), /Reviewer 1\.1\.0 by harnsy/);
});

test("update --yes never replaces a file the person changed; --replace-edited does", async () => {
  const { w, root } = await hiredThenReleased();
  writeFileSync(join(root, "AGENTS.md"), "# My rules\n");
  rmSync(join(root, "docs", "persona-casebook.md"));
  await updateCommand(w.cx(), ID, { yes: true });
  assert.equal(read(root, "AGENTS.md"), "# My rules\n");
  assert.equal(existsSync(join(root, "docs", "persona-casebook.md")), false, "a file the person removed is not put back unasked");
  assert.match(w.printed.find((t) => t.includes("AGENTS.md"))!, /each is asked about; kept unless you say yes\):\n  AGENTS\.md/);
  w.printed.length = 0;
  await updateCommand(w.cx(), ID, { yes: true, replaceEdited: true });
  assert.match(w.printed[0]!, /replaced as you asked \(--replace-edited\):\n  AGENTS\.md\n  docs\/persona-casebook\.md/);
  assert.match(read(root, "AGENTS.md"), /Reviewer 1\.1\.0 by harnsy/);
  assert.equal(read(root, "docs/persona-casebook.md"), "### C1. A race\n");
});

test("update keeps the notice current even when it was changed, and keeps a changed file the new version dropped", async () => {
  const { w, root } = await hiredThenReleased();
  writeFileSync(join(root, "NOTICE.md"), "no credits\n");
  writeFileSync(join(root, "skills", "old-way", "SKILL.md"), "---\nname: old-way\ndescription: Mine now.\n---\n");
  await updateCommand(w.cx(), ID, { yes: true });
  assert.match(read(root, "NOTICE.md"), /^# Notice\n\nReviewer 1\.1\.0 by harnsy/);
  assert.match(read(root, "skills/old-way/SKILL.md"), /Mine now/);
  assert.ok(!("skills/old-way/SKILL.md" in JSON.parse(read(root, ".harnsy/hire.json")).files), "it is the person's file from now on");
});

test("update does not write over a file of the person's that stands where a new file should go, unless told", async () => {
  const { w, root } = await hiredThenReleased();
  write(join(root, "skills", "race-hunt", "references", "notes.md"), bytes("my own notes\n"));
  await updateCommand(w.cx(), ID, { yes: true });
  assert.equal(read(root, "skills/race-hunt/references/notes.md"), "my own notes\n");
});

test("update refuses to write through a link left in the workspace; the file it points at is untouched", { skip: process.platform === "win32" }, async () => {
  const { w, root } = await hiredThenReleased();
  const outside = join(tempDir(), "outside.md");
  writeFileSync(outside, "outside the workspace\n");
  rmSync(join(root, "SOUL.md"));
  symlinkSync(outside, join(root, "SOUL.md"));
  assert.match(await refusal(updateCommand(w.cx(), ID, { yes: true, replaceEdited: true })), /SOUL\.md: a link stands in the way/);
  assert.equal(readFileSync(outside, "utf8"), "outside the workspace\n");
  rmSync(join(root, "SOUL.md"));
  rmSync(join(root, "skills"), { recursive: true });
  symlinkSync(tempDir(), join(root, "skills"));
  assert.match(await refusal(updateCommand(w.cx(), ID, { yes: true, replaceEdited: true })), /a link stands in the way/);
});

test("update and fire act only on what this plugin hired", async () => {
  const k = new Kit(), dir = tempDir(), w = world(k, dir);
  k.release(dir, [k.pack(ID, "1.0.0", sample("reviewer"))]);
  write(join(w.stateDir, "workspace-reviewer", "SOUL.md"), bytes("# A reviewer of my own\n"));
  w.agents.set("reviewer", join(w.stateDir, "workspace-reviewer"));
  const before = w.snapshot();
  assert.match(await refusal(updateCommand(w.cx(), ID, { yes: true })), /was not hired by this plugin on this machine/);
  assert.match(await refusal(fireCommand(w.cx(), ID, { yes: true })), /was not hired by this plugin.*openclaw agents delete <id>/);
  assert.match(await refusal(fireCommand(w.cx(), "main", { yes: true })), /not an employee id/);
  assert.deepEqual(w.snapshot(), before);
  assert.deepEqual(w.calls, []);
  assert.ok(w.agents.has("reviewer"));
});

test("a damaged record of a hire stops update and fire; nothing in it becomes a path", async () => {
  const { w, root } = await hiredThenReleased();
  const record = join(root, ".harnsy", "hire.json"), good = JSON.parse(readFileSync(record, "utf8"));
  for (const bad of [{ ...good, files: { "../../outside": "0".repeat(64) } }, { ...good, files: { "MEMORY.md": "0".repeat(64) } },
    { ...good, id: "harnsy/../x" }, { ...good, v: 2 }, { ...good, files: { "SOUL.md": "nope" } }, "{"]) {
    writeFileSync(record, typeof bad === "string" ? bad : JSON.stringify(bad));
    assert.match(await refusal(updateCommand(w.cx(), ID, { yes: true })), /hire\.json is damaged/);
    assert.match(await refusal(fireCommand(w.cx(), ID, { yes: true })), /hire\.json is damaged/);
  }
  assert.deepEqual(w.calls, []);
});

test("a record whose agent is not an OpenClaw agent id stops update and fire before OpenClaw is called", async () => {
  const { w, root } = await hiredThenReleased();
  const record = join(root, ".harnsy", "hire.json"), good = JSON.parse(readFileSync(record, "utf8"));
  for (const agent of ["--force", "../x", "a b", "", "-x", "x".repeat(65), "x\n", 7]) {
    writeFileSync(record, JSON.stringify({ ...good, agent }));
    assert.match(await refusal(updateCommand(w.cx(), ID, { yes: true, replaceEdited: true })), /hire\.json is damaged/, String(agent));
    assert.match(await refusal(fireCommand(w.cx(), ID, { yes: true })), /hire\.json is damaged/, String(agent));
    listCommand(w.cx());
    assert.match(w.printed.at(-1)!, /Nobody is hired yet/, "a damaged record is not a hire to list");
  }
  assert.deepEqual(w.calls, [], "OpenClaw is never run with a word out of a damaged record");
  assert.ok(w.agents.has("reviewer") && existsSync(join(root, "SOUL.md")));

  writeFileSync(record, JSON.stringify(good));
  await updateCommand(w.cx(), ID, { yes: true });
  assert.match(w.printed.at(-1)!, /^Updated: harnsy\/reviewer is at 1\.1\.0\.$/);
  await fireCommand(w.cx(), ID, { yes: true });
  assert.deepEqual(w.calls.at(-1), ["agents", "delete", "reviewer", "--force", "--json"]);
});

test("list names who is hired; fire deletes the agent through OpenClaw only after a yes", async () => {
  const { w, root } = await hiredThenReleased();
  listCommand(w.cx());
  assert.equal(w.printed.at(-1), `harnsy/reviewer  1.0.0  agent «reviewer»  ${root}`);

  await fireCommand(w.cx({ ask: answer(w, false) }), ID);
  assert.deepEqual(w.questions, ["Fire harnsy/reviewer? OpenClaw deletes the agent «reviewer» and moves its workspace, state and transcripts to the Trash."]);
  assert.equal(w.printed.at(-1), "Nothing was changed.");
  assert.ok(w.agents.has("reviewer") && existsSync(root));
  assert.match(await refusal(fireCommand(w.cx(), ID)), /waits for a person's yes/);

  await fireCommand(w.cx(), ID, { yes: true });
  assert.deepEqual(w.calls.at(-1), ["agents", "delete", "reviewer", "--force", "--json"]);
  assert.ok(!w.agents.has("reviewer") && !existsSync(root));
  assert.ok(w.agents.has("main") && existsSync(join(w.stateDir, "workspace", "SOUL.md")), "the default agent is still there");
  listCommand(w.cx());
  assert.match(w.printed.at(-1)!, /Nobody is hired yet/);
});

test("fire leaves an agent alone that works in another folder than the one this plugin wrote", async () => {
  const { w } = await hiredThenReleased();
  w.agents.set("reviewer", join(w.stateDir, "elsewhere"));
  assert.match(await refusal(fireCommand(w.cx(), ID, { yes: true })), /works in .*elsewhere, not in the folder this plugin wrote/);
  w.agents.delete("reviewer");
  assert.match(await refusal(fireCommand(w.cx(), ID, { yes: true })), /OpenClaw has no agent «reviewer» any more/);
  assert.equal(w.calls.some((c) => c[1] === "delete"), false);
});
