// A small employee with one skill, and helpers the catalog tests share.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirSource } from "../../src/catalog/source.ts";
import { loadRelease, type Release } from "../../src/catalog/release.ts";
import { bytes, HOST, type Files, type Kit } from "./kit.ts";

export function sample(name: string): Files {
  const doc = {
    schema: "harnsy.employee/v1",
    persona: { name: "Vera", character: "Calm and exact." },
    role: { name, department: "engineering", mandate: "Reviews Go code.", deliverable: "A verdict per change.",
      prompt: `You are the ${name}, an AI agent.`, tagline: "Finds the race before it ships." },
    competencies: [{ key: "review-go", name: "Go review", summary: "Reads a change for races." }],
    license: "CC-BY-4.0",
    skills: [{ name: "race-hunt", description: "Find data races." }],
  };
  return new Map([
    ["bundle.json", bytes(JSON.stringify(doc, null, 2))],
    ["docs/persona-casebook.md", bytes("### C1. A race\n")],
    ["skills/race-hunt/SKILL.md", bytes("---\nname: race-hunt\ndescription: Find data races.\n---\nRun the race detector.\n")],
  ]);
}

/** A fresh empty folder that the test run removes with the system's temporary files. */
export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "hr-openclaw-"));
}

/** Loads the release in dir under the kit's key, as of the kit's now. */
export function load(k: Kit, dir: string): Promise<Release> {
  return loadRelease(dirSource(dir), [k.key], HOST, k.now);
}

/** The refusal a promise ends with, as text; fails when it does not refuse. */
export async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof Error && err.name === "Refusal") return err.message;
    throw err;
  }
  throw new Error("want a refusal, got a result");
}
