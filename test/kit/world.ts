// A person's machine for a test: OpenClaw's state directory with the default agent's workspace in it, an OpenClaw
// that behaves as v2026.11.3 was seen to behave (see fakeOpenClaw), and a context that records what a command prints.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chatCommand } from "../../src/chat.ts";
import type { Context } from "../../src/commands/context.ts";
import { dirSource } from "../../src/catalog/source.ts";
import type { Runner, RunResult } from "../../src/openclaw.ts";
import type { Kit } from "./kit.ts";
import { source, write } from "./kit.ts";
import { tempDir } from "./sample.ts";

export interface World {
  stateDir: string;
  calls: string[][]; // every openclaw command line, as the argument array it was run with
  printed: string[];
  agents: Map<string, string>; // id → workspace
  failAdd: boolean; // make `agents add` fail
  questions: string[];
  cx(over?: Partial<Context>): Context;
  /** Every file under the state directory but the plugin's own state, by path. */
  snapshot(under?: string): Map<string, Buffer>;
}

const ok = (stdout: unknown): RunResult => ({ code: 0, stdout: JSON.stringify(stdout, null, 2), stderr: "" });

/**
 * OpenClaw's agent commands as the real one behaved in a clean room: `agents add` leaves the files of a filled
 * workspace alone but puts the agent's id into the Name line of IDENTITY.md and adds USER.md; `agents delete` moves
 * the workspace away.
 */
function fakeOpenClaw(w: World): Runner {
  return async (args) => {
    w.calls.push([...args]);
    const [group, verb, ...rest] = args;
    if (group !== "agents") return { code: 1, stdout: "", stderr: `unknown command ${group}` };
    if (verb === "list") return ok([...w.agents].map(([id, workspace]) => ({ id, workspace, isDefault: id === "main" })));
    if (verb === "add") {
      const name = rest[0]!, workspace = rest[rest.indexOf("--workspace") + 1]!;
      if (w.failAdd || w.agents.has(name) || !rest.includes("--non-interactive")) return { code: 1, stdout: "", stderr: "agents add failed" };
      mkdirSync(workspace, { recursive: true });
      const identity = join(workspace, "IDENTITY.md");
      if (existsSync(identity)) writeFileSync(identity, readFileSync(identity, "utf8").replace(/^- Name: .*$/m, `- Name: ${name}`));
      writeFileSync(join(workspace, "USER.md"), "# USER.md\n");
      w.agents.set(name, workspace);
      return ok({ agentId: name, name, workspace });
    }
    if (verb === "set-identity") return ok({ agentId: rest[rest.indexOf("--agent") + 1] });
    if (verb === "delete") {
      const id = rest[0]!, workspace = w.agents.get(id);
      if (!workspace || !rest.includes("--force")) return { code: 1, stdout: "", stderr: "agents delete failed" };
      renameSync(workspace, join(w.stateDir, `trash-${id}`));
      w.agents.delete(id);
      return ok({ agentId: id });
    }
    return { code: 1, stdout: "", stderr: `unknown command agents ${verb}` };
  };
}

/** A machine whose OpenClaw reads the catalog release in dir under the kit's key. */
export function world(k: Kit, dir: string): World {
  const stateDir = join(tempDir(), ".openclaw"), main = join(stateDir, "workspace");
  for (const [name, text] of [["SOUL.md", "# My own soul\n"], ["AGENTS.md", "# My own rules\n"], ["MEMORY.md", "remember the milk\n"],
    ["skills/mine/SKILL.md", "---\nname: mine\ndescription: Mine.\n---\n"]] as const) {
    write(join(main, ...name.split("/")), Buffer.from(text));
  }
  const w: World = {
    stateDir, calls: [], printed: [], questions: [], failAdd: false, agents: new Map([["main", main]]),
    cx(over = {}) {
      return {
        env: {}, stateDir, now: () => k.now, out: (text) => { w.printed.push(text); }, ask: null, openclaw: fakeOpenClaw(w),
        source: () => dirSource(dir), keys: [{ kid: k.key.kid, pub: Buffer.from(k.key.pub).toString("base64") }], ...over,
      };
    },
    snapshot(under = "") {
      const files = source(join(stateDir, under)) as Map<string, Buffer>;
      for (const path of [...files.keys()]) if (under === "" && path.startsWith("harnsy-hr/")) files.delete(path);
      return files;
    },
  };
  return w;
}

/** An answer to every question the plugin asks; the questions are kept. */
export const answer = (w: World, yes: boolean | ((question: string) => boolean)) => async (question: string) => {
  w.questions.push(question);
  return typeof yes === "function" ? yes(question) : yes;
};

/** What a chat command answers: the text inside the one code block every answer is sent as. */
export async function chat(cx: Context, args: string): Promise<string> {
  const said = await chatCommand(cx, args);
  assert.ok(said.startsWith("```\n") && said.endsWith("\n```"), `a chat answer is one code block: ${said}`);
  return said.slice(4, -4);
}
