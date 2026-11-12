import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeOf } from "../src/catalog/release.ts";
import type { Employee } from "../src/catalog/types.ts";
import { credit, notice } from "../src/render/notice.ts";
import { renderOpenClaw } from "../src/render/openclaw.ts";
import { staff } from "./kit/staff.ts";

/** A made-up employee with the fields a notice reads. */
function worker(publisher: string, publisherName: string, licence: string): Employee {
  return {
    entry: { id: `${publisher}/sample`, version: "1.0.0", title: "Sample", publisher, publisherName, published: "2026-03-04",
      cvUrl: "", licenseNote: "" } as Employee["entry"],
    manifest: { createdAt: "" } as Employee["manifest"],
    manifestSha256: "",
    doc: { license: licence, attribution: [] } as unknown as Employee["doc"],
    files: new Map(),
  };
}

const tail = (publisher: string) =>
  ` Source: https://hr.harnsy.dev/e/${publisher}/sample. Changes: rendered for a test. Provided as is, without warranty of any kind (see the licence).`;
const ccBy = " Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).";
const cc0 = " Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).";
const none = " No licence is stated for this employee: do not copy or redistribute it.";
const listed = "\nhr.harnsy.dev lists this work; it is not made or endorsed by harnsy.\n";
const ours = "\nThe names and logos «harnsy» and «hr.harnsy.dev», and the picture of this employee (not included here), are not covered by this licence.\n";
const theirs = "\nThe names and logos «harnsy» and «hr.harnsy.dev» are not covered by this licence.\n";

// Who is credited and how, by publisher and licence.
const wording: [name: string, e: Employee, want: string][] = [
  ["own, CC BY: the copyright notice", worker("harnsy", "harnsy", "CC-BY-4.0"),
    "Sample 1.0.0 by harnsy (Pavel Buchnev), © 2026 Pavel Buchnev (harnsy)." + ccBy + tail("harnsy") + "\n" + ours],
  ["own, CC0: no copyright notice beside a dedication", worker("harnsy", "harnsy", "CC0-1.0"),
    "Sample 1.0.0 by harnsy (Pavel Buchnev)." + cc0 + tail("harnsy") + "\n" + ours],
  ["own, no licence: all rights reserved", worker("harnsy", "harnsy", ""),
    "Sample 1.0.0 by harnsy (Pavel Buchnev), © 2026 Pavel Buchnev (harnsy)." + none + tail("harnsy") + "\n" + ours],
  ["another publisher, CC BY: its copyright notice, not ours", worker("octo", "Octo Press", "CC-BY-4.0"),
    "Sample 1.0.0 by Octo Press, © 2026 Octo Press, published on hr.harnsy.dev." + ccBy + tail("octo") + "\n" + listed + theirs],
  ["another publisher, CC0", worker("octo", "Octo Press", "CC0-1.0"), "Sample 1.0.0 by Octo Press." + cc0 + tail("octo") + "\n" + listed + theirs],
  ["another publisher without a display name", worker("octo", "", "CC-BY-4.0"),
    "Sample 1.0.0 by octo, © 2026 octo, published on hr.harnsy.dev." + ccBy + tail("octo") + "\n" + listed + theirs],
  ["an unknown licence is named as written", worker("octo", "Octo Press", "MPL-2.0"),
    "Sample 1.0.0 by Octo Press, © 2026 Octo Press, published on hr.harnsy.dev. Licensed under MPL-2.0." + tail("octo") + "\n" + listed + theirs],
];
for (const [name, e, want] of wording) {
  test(`notice wording: ${name}`, () => assert.equal(notice(e, "rendered for a test"), want));
}

test("the feed's licence note is marked as the publisher's text", () => {
  for (const [publisher, want] of [["harnsy", "\nNote from harnsy: Keep the names.\n"], ["octo", "\nNote from the publisher: Keep the names.\n"]] as const) {
    const e = worker(publisher, "", "CC-BY-4.0");
    e.entry.licenseNote = "Keep the names.";
    assert.ok(notice(e, "x").includes(want), publisher);
  }
});

// The pointer goes with a LICENSE file in a skill, whatever the bundle's expression.
const pointers: [name: string, licence: string, files: string[], want: boolean][] = [
  ["a skill with a LICENSE under a plain expression", "CC-BY-4.0", ["skills/a/SKILL.md", "skills/a/LICENSE"], true],
  ["a skill with a LICENSE under AND", "CC-BY-4.0 AND MIT", ["skills/a/LICENSE"], true],
  ["AND without a LICENSE file", "CC-BY-4.0 AND MIT", ["skills/a/SKILL.md"], false],
  ["a LICENSE deeper in a skill is not the skill's own", "CC-BY-4.0", ["skills/a/references/LICENSE"], false],
  ["no skills", "CC-BY-4.0", [], false],
];
for (const [name, licence, files, want] of pointers) {
  test(`the notice points at skill licences: ${name}`, () => {
    const e = worker("harnsy", "", licence);
    for (const f of files) e.files.set(f, Buffer.from("x"));
    const pointer = "\nSome skills carry another licence for the parts adapted from other works or for their scripts (for example MIT): it is the " +
      `\`LICENSE\` file in that skill's folder, and it applies to those parts (the bundle's licence: ${licence}).\n`;
    assert.equal(notice(e, "x").includes(pointer), want);
  });
}

test("a bundle that names no date gets a notice without a year; the packing date stands in when there is one", () => {
  const e = worker("harnsy", "", "CC-BY-4.0");
  e.entry.published = "";
  assert.ok(credit(e, "x").includes("by harnsy (Pavel Buchnev), © Pavel Buchnev (harnsy)."));
  e.manifest.createdAt = "2027-01-02T03:04:05Z";
  assert.ok(credit(e, "x").includes("© 2027 Pavel Buchnev (harnsy)."));
});

// The credit that travels with an employee says what CC BY 4.0 asks for.
const notices: [id: string, want: string[], not: string[]][] = [
  ["harnsy/sample-plain", [
    "Sample librarian 1.0.0 by harnsy (Pavel Buchnev), © 2026 Pavel Buchnev (harnsy).",
    "Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
    "Source: https://hr.harnsy.dev/e/harnsy/sample-plain.",
    "Changes: rendered for openclaw.",
    "Provided as is, without warranty of any kind (see the licence).",
  ], ["Built on", "LICENSE"]],
  ["harnsy/sample-skills", [
    "Built on:",
    "- A Made-up Guide to Shelves — Example Author, https://example.org/shelves, CC-BY-4.0, modified",
    "- Loan Desk Notes, https://example.org/loans, CC0-1.0, not modified",
  ], ["LICENSE"]],
  ["harnsy/sample-scripts", [
    "Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
    "it is the `LICENSE` file in that skill's folder, and it applies to those parts (the bundle's licence: CC-BY-4.0 AND MIT).",
    "Note from harnsy: No rights in the names of the people mentioned are granted or implied.",
    "and the picture of this employee (not included here), are not covered by this licence.",
    "- Label Sizes Table, https://example.org/labels, MIT, modified",
  ], []],
  ["octo/sample-guest", [
    "Sample guest 1.0.0 by Octo Press. Dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/).",
    "hr.harnsy.dev lists this work; it is not made or endorsed by harnsy.",
    "The names and logos «harnsy» and «hr.harnsy.dev» are not covered by this licence.",
    "Source: https://hr.harnsy.dev/e/octo/sample-guest.",
  ], ["Pavel Buchnev", "CC BY 4.0", "©", "picture"]],
];
for (const [id, want, not] of notices) {
  test(`the notice of ${id}`, async () => {
    const text = renderOpenClaw(employeeOf((await staff()).release, id)!).notice;
    for (const w of want) assert.ok(text.includes(w), `the notice lacks «${w}»:\n${text}`);
    for (const n of not) assert.ok(!text.includes(n), `the notice must not say «${n}»:\n${text}`);
  });
}
