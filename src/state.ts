// What the plugin remembers between runs: the highest feed sequence it has seen per catalog key, so that an older
// feed, still validly signed, cannot be replayed to it. One small JSON file under OpenClaw's state directory.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Refusal } from "./catalog/types.ts";
import { PLUGIN_ID } from "./version.ts";

export const stateFile = (stateDir: string) => join(stateDir, PLUGIN_ID, "state.json");

function read(file: string): Record<string, number> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Refusal(`the plugin's state file cannot be read (${file}); nothing is fetched until it can`);
  }
  try {
    const seq = (JSON.parse(text) as { seq?: unknown }).seq;
    if (typeof seq !== "object" || seq === null || Array.isArray(seq)) throw new Error("no seq");
    const out: Record<string, number> = {};
    for (const [kid, n] of Object.entries(seq)) {
      if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error("not a number");
      out[kid] = n;
    }
    return out;
  } catch {
    throw new Refusal(`the plugin's state file is damaged (${file}): it holds the newest catalog feed this machine has seen. ` +
      "Fix or remove it yourself to go on; removing it forgets that feed.");
  }
}

/** The highest feed sequence seen under the key kid; 0 when none. */
export function seenSeq(stateDir: string, kid: string): number {
  return read(stateFile(stateDir))[kid] ?? 0;
}

/** Remembers a feed sequence when it is higher than the one kept. */
export function rememberSeq(stateDir: string, kid: string, seq: number): void {
  const file = stateFile(stateDir), all = read(file);
  if ((all[kid] ?? 0) >= seq) return;
  all[kid] = seq;
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ seq: all }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}
