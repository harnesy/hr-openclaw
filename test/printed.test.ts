// What reaches a terminal or a chat: catalog text is a third-party publisher's, signed or not. Characters that hide or
// reorder what a person reads are not printed; the files a hire writes keep every byte the catalog signed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { clip } from "../src/catalog/grammar.ts";
import { chatCommand } from "../src/chat.ts";
import { searchCommand, showCommand } from "../src/commands/browse.ts";
import { hireCommand } from "../src/commands/hire.ts";
import { printable } from "../src/gotext.ts";
import { renderOpenClaw } from "../src/render/openclaw.ts";
import { workspaceFiles } from "../src/workspace.ts";
import { bytes, Kit, write } from "./kit/kit.ts";
import { load, refusal, sample, tempDir } from "./kit/sample.ts";
import { world } from "./kit/world.ts";

// A bidi override, a zero-width space, an isolate, a C1 control (CSI), DEL, a soft hyphen, a byte-order mark, a tag.
const HIDDEN = ["‮", "​", "⁦", "\u009b", "\u007f", "­", "﻿", "\u{e0001}", "‍", "؜"];
const hides = (text: string) => HIDDEN.filter((c) => text.includes(c)).map((c) => "U+" + c.codePointAt(0)!.toString(16));

/** A release whose one employee carries hidden characters and Markdown in every text a person is shown. */
async function stand() {
  const k = new Kit(), dir = tempDir(), files = sample("reviewer");
  const doc = JSON.parse(files.get("bundle.json")!.toString());
  doc.persona.name = "Ve‮ra";
  doc.persona.character = "Calm​ and ⁦exact.";
  doc.role.tagline = "Finds the race\u009b31m before it ships. ```\n[free money](https://evil.example) @everyone `x`";
  doc.role.department = "engi­neering";
  doc.competencies[0].name = "Go﻿ review\u007f";
  doc.attribution = [{ title: "A\u{e0001} book", author: "An‍ author", license: "CC-BY-4.0", url: "https://example.org/book" }];
  files.set("bundle.json", bytes(JSON.stringify(doc, null, 2)));
  k.release(dir, [k.pack("harnsy/reviewer", "1.0.0", files)]);
  return { k, dir, w: world(k, dir) };
}

test("printable drops what hides or reorders text and keeps what is read", () => {
  for (const c of HIDDEN) assert.equal(printable(`a${c}b`), "ab", "U+" + c.codePointAt(0)!.toString(16));
  assert.equal(printable("a\u0000\u0007\u001b[31m\rb c "), "a[31mbc");
  const kept = "Line one\n\tÅsa — «Vera» 审计 🧮 ñ é ß";
  assert.equal(printable(kept), kept);
});

test("clip shows such characters as escapes, never raw", () => {
  assert.equal(clip("c​1"), "\"c\\u200b1\"", "a key id that only looks like c1 is shown for what it is");
  assert.equal(clip("\u009b31m\u007f‮\u{e0001} "), "\"\\u009b31m\\u007f\\u202e\\u{e0001}\\u2028\"");
  assert.equal(clip("a\u001b\n\"b\""), "\"a\\u001b\\n\\\"b\\\"\"");
  assert.equal(clip("plain é 审"), "\"plain é 审\"");
  for (const c of HIDDEN) assert.deepEqual(hides(clip(`x${c}y`)), []);
});

test("a key id with a control character in feed.json.sig is named in escapes, before any signature is checked", async () => {
  const { k, dir, w } = await stand(), feed = join(dir, "v1", "feed.json");
  write(feed + ".sig", k.signFeed("c1\u009b2J‮", readFileSync(feed)));
  const said = await refusal(searchCommand(w.cx(), ""));
  assert.equal(said, "feed.json.sig: kid \"c1\\u009b2J\\u202e\" is not a catalog key this plugin knows; update the plugin");
});

test("show, search and hire print none of them; the files a hire writes keep the catalog's bytes", async () => {
  const { k, dir, w } = await stand();
  const employee = (await load(k, dir)).employees[0]!, want = workspaceFiles(renderOpenClaw(employee));
  assert.ok(hides([...want.values()].map((b) => Buffer.from(b).toString()).join("")).length >= 6, "the rendered files do carry them");

  await searchCommand(w.cx(), "");
  await showCommand(w.cx(), "harnsy/reviewer");
  await hireCommand(w.cx(), "harnsy/reviewer", { yes: true });
  const printed = w.printed.join("\n");
  assert.deepEqual(hides(printed), []);
  assert.match(printed, /harnsy\/reviewer  1\.0\.0  Reviewer \(Vera, engineering\)/);
  assert.match(printed, /Good at: Go review\n/);

  const root = w.agents.get("reviewer")!;
  for (const [rel, content] of want) assert.deepEqual(readFileSync(join(root, ...rel.split("/"))), Buffer.from(content), rel);
});

test("a chat answer is one code block that catalog text cannot close", async () => {
  const { w } = await stand();
  for (const args of ["search", "show harnsy/reviewer", "list", "hire harnsy/reviewer", "help", "show harnsy/nobody", "show ```"]) {
    const said = await chatCommand(w.cx(), args);
    assert.ok(said.startsWith("```\n") && said.endsWith("\n```"), `${args}: ${said.slice(0, 40)}`);
    const body = said.slice(4, -4);
    assert.ok(!body.includes("`"), `${args}: a backtick is left in the block`);
    assert.deepEqual(hides(body), [], args);
  }
  const shown = (await chatCommand(w.cx(), "show harnsy/reviewer")).slice(4, -4);
  assert.match(shown, /Finds the race31m before it ships\. ''' \[free money\]\(https:\/\/evil\.example\) @everyone 'x'/,
    "the publisher's text is all there, as text");
});
