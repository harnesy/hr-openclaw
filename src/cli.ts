// The terminal command: `openclaw harnsy-hr <search|show|hire|update|list|fire>`. OpenClaw hands the plugin its
// Commander program; this file only names the commands and their flags and passes the words on.
import { Refusal } from "./catalog/types.ts";
import { searchCommand, showCommand } from "./commands/browse.ts";
import type { Context } from "./commands/context.ts";
import { hireCommand } from "./commands/hire.ts";
import { fireCommand, listCommand } from "./commands/staff.ts";
import { updateCommand } from "./commands/update.ts";
import { PLUGIN_ID } from "./version.ts";

/** The part of Commander's Command this plugin uses. */
export interface Program {
  command(nameAndArgs: string): Program;
  description(text: string): Program;
  option(flags: string, description: string): Program;
  action(fn: (...args: any[]) => unknown): Program;
}

export const CLI_DESCRIPTION = "Hire AI employees from the signed catalog hr.harnsy.dev as OpenClaw agents";

/** What a failed command says: the refusal's own sentence, or a short line for a fault nobody planned. */
export function failureText(err: unknown): string {
  if (err instanceof Refusal) return `${PLUGIN_ID}: ${err.message}`;
  return `${PLUGIN_ID}: stopped by an unexpected fault (${err instanceof Error ? err.message : "unknown"}); nothing more was done`;
}

/** Registers the command. context makes what a run needs; fail is told what went wrong (it prints and sets the exit code). */
export function registerCli(program: Program, context: () => Context, fail: (text: string) => void): void {
  const run = (fn: (cx: Context, ...args: any[]) => unknown) => async (...args: any[]) => {
    try {
      await fn(context(), ...args);
    } catch (err) {
      fail(failureText(err));
    }
  };
  const root = program.command(PLUGIN_ID).description(CLI_DESCRIPTION);
  root.command("search [words...]").description("Search the catalog by words (a role, a skill, a need); no words lists everyone")
    .option("--department <name>", "only this department, for example finance")
    .option("--limit <n>", "how many to show, at most 20 (10 when left out)")
    .action(run((cx, words: string[], o: { department?: string; limit?: string }) =>
      searchCommand(cx, (words ?? []).join(" "), { department: o.department, limit: o.limit === undefined ? undefined : Number(o.limit) })));
  root.command("show <id>").description("Show one employee: what it needs, the files a hire writes, its notice")
    .action(run((cx, id: string) => showCommand(cx, id)));
  root.command("hire <id>").description("Hire an employee as an OpenClaw agent with a workspace of its own; shows everything first and asks")
    .option("--yes", "do not ask (for scripts)")
    .action(run((cx, id: string, o: { yes?: boolean }) => hireCommand(cx, id, { yes: o.yes })));
  root.command("update <id>").description("Bring a hired employee to the catalog's current version; files you changed are asked about")
    .option("--yes", "do not ask; files you changed are kept")
    .option("--replace-edited", "also replace the files you changed")
    .action(run((cx, id: string, o: { yes?: boolean; replaceEdited?: boolean }) => updateCommand(cx, id, { yes: o.yes, replaceEdited: o.replaceEdited })));
  root.command("list").description("List the employees hired on this machine").action(run((cx) => listCommand(cx)));
  root.command("fire <id>").description("Delete a hired employee's agent (OpenClaw moves its workspace to the Trash); asks first")
    .option("--yes", "do not ask (for scripts)")
    .action(run((cx, id: string, o: { yes?: boolean }) => fireCommand(cx, id, { yes: o.yes })));
}
