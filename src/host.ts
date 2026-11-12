// The real things a command works with when OpenClaw runs the plugin: its state directory, the terminal, the person.
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Context } from "./commands/context.ts";
import { spawnRunner } from "./openclaw.ts";

/** OpenClaw's state directory: what OpenClaw itself says, else its documented place. */
export function stateDirOf(resolve: (() => unknown) | undefined, env: Record<string, string | undefined>): string {
  try {
    const dir = resolve?.();
    if (typeof dir === "string" && dir !== "") return dir;
  } catch {
    // fall through to the documented place
  }
  return env["OPENCLAW_STATE_DIR"] || join(homedir(), ".openclaw");
}

/** Asks yes or no in the terminal; anything but y or yes is a no. */
async function askInTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^(y|yes)$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

/** What a command needs, for a run in a terminal. */
export function terminalContext(stateDir: string): Context {
  return {
    env: process.env, stateDir, now: () => new Date(), out: (text) => console.log(text),
    ask: process.stdin.isTTY && process.stdout.isTTY ? askInTerminal : null, openclaw: spawnRunner(),
  };
}

/** Prints why a command stopped and makes the run end with an error. */
export function failInTerminal(text: string): void {
  console.error(text);
  process.exitCode = 1;
}
