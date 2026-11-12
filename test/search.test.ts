import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DEPARTMENT_BYTES, MAX_QUERY_BYTES, MAX_QUERY_TERMS, search } from "../src/search.ts";
import { bytes, Kit, type Files } from "./kit/kit.ts";
import { load, tempDir } from "./kit/sample.ts";

/** A bundle with the fields a search reads. */
function person(name: string, department: string, tagline: string, competency: string, ...keywords: string[]): Files {
  const doc = { schema: "harnsy.employee/v1", persona: { name: "Ada" },
    role: { name, department, tagline, keywords, prompt: "You are an AI agent." },
    competencies: [{ key: "c", name: competency }], license: "CC-BY-4.0" };
  return new Map([["bundle.json", bytes(JSON.stringify(doc))]]);
}

async function entries(people: [id: string, files: Files][]) {
  const k = new Kit(), dir = tempDir();
  k.release(dir, people.map(([id, files]) => k.pack(id, "1.0.0", files)));
  return (await load(k, dir)).feed.entries;
}

const staff = () => entries([
  ["harnsy/bookkeeper", person("bookkeeper", "finance", "Keeps the ledger tidy every day.", "Ledger entries", "accounting records", "invoices")],
  ["harnsy/accountant", person("accountant", "finance", "Closes your month on a calendar.", "Month-end close", "reconcile invoices")],
  ["harnsy/reviewer", person("reviewer", "engineering", "Finds the race before it ships.", "Go review", "code review", "pull request")],
  ["harnsy/developer-go", person("developer-go", "engineering", "Ships small Go services.", "Go services", "backend")],
]);

const ids = (found: { entries: { id: string }[] }) => found.entries.map((e) => e.id.replace("harnsy/", "")).join(" ");

const cases: [name: string, text: string, department: string, limit: number, want: string][] = [
  ["no words: everyone, in the feed's order", "", "", 0, "bookkeeper accountant reviewer developer-go"],
  ["the title beats a keyword", "accountant", "", 0, "accountant bookkeeper"],
  ["a phrase a person types", "Find me someone to review Go code", "", 0, "reviewer developer-go"],
  ["more words matched come first", "go services backend", "", 0, "developer-go reviewer"],
  ["a department alone", "", "finance", 0, "bookkeeper accountant"],
  ["words within a department", "invoices", "engineering", 0, ""],
  ["any letter case", "INVOICES", "Finance", 0, "bookkeeper accountant"],
  ["nothing matches", "zeppelin pilot", "", 0, ""],
  ["the persona's name", "ada", "", 2, "bookkeeper accountant"],
];
for (const [name, text, department, limit, want] of cases) {
  test(`search: ${name}`, async () => assert.equal(ids(search(await staff(), text, department, limit)), want));
}

test("a page holds what was asked for, at most 20; the total counts every match", async () => {
  const all = await staff();
  for (const [limit, want] of [[0, 4], [-5, 4], [1, 1], [500, 4]] as const) {
    const found = search(all, "", "", limit);
    assert.equal(found.entries.length, want, `limit ${limit}`);
    assert.equal(found.total, 4);
  }
  const many = Array.from({ length: 30 }, () => all[0]!);
  assert.equal(search(many, "", "", 500).entries.length, 20);
});

test("«accountant» and «account executive» share a stem; the one the person named comes first", async () => {
  const two = await entries([
    ["harnsy/account-executive", person("account executive", "sales", "Prepares your sales calls.", "Call preparation")],
    ["harnsy/accountant", person("accountant", "finance", "Closes your month on a calendar.", "Month-end close")],
  ]);
  for (const [text, want] of [
    ["accountant", "accountant account-executive"],
    ["find an Accountants", "accountant account-executive"],
    ["account executive", "account-executive accountant"],
    ["accounting", "account-executive accountant"], // neither is named: the feed's order
    ["an executive for sales", "account-executive"],
  ] as const) {
    assert.equal(ids(search(two, text)), want, text);
  }
});

/** n different made-up words, each of the given length. */
const words = (n: number, length: number) => Array.from({ length: n }, (_, i) => "q" + String(i).padStart(length - 1, "0")).join(" ");

// What a person types is short. A request above the limits is refused, not cut, and the refusal does not repeat what
// was typed; the work of a search is at most MAX_QUERY_TERMS words per employee.
test("a long request is refused", async () => {
  const all = await staff();
  for (const [name, text, department, want] of [
    ["64 KB of different words", words(8000, 7), "", /^query: /],
    ["one byte over the query limit", "a".repeat(MAX_QUERY_BYTES + 1), "", /^query: 257 bytes, at most 256; say it in a few words$/],
    ["one word more than the most", words(MAX_QUERY_TERMS + 1, 4), "", /^query: 17 different words, at most 16; say it in a few words$/],
    ["a long department", "", "d".repeat(MAX_DEPARTMENT_BYTES + 1), /^department: /],
  ] as const) {
    let msg = "";
    assert.throws(() => search(all, text, department), (err: Error) => { msg = err.message; return err.name === "Refusal"; }, name);
    assert.match(msg, want, name);
    assert.ok(msg.length <= 200 && !/q000|aaaa|dddd/.test(msg), `the refusal must be short and must not repeat the request: ${msg}`);
  }
  assert.deepEqual([MAX_QUERY_BYTES, MAX_QUERY_TERMS], [256, 16]);
  const most = words(MAX_QUERY_TERMS, 15) + " ";
  assert.equal(most.length, MAX_QUERY_BYTES);
  search(all, most, "d".repeat(MAX_DEPARTMENT_BYTES));
  // A word said again is one word: it neither counts against the limit nor adds to the score.
  assert.equal(ids(search(all, "invoices ".repeat(28).trim())), "bookkeeper accountant");
});
