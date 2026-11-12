// The chat command `/harnsy-hr`: it only looks (search, show, list). Hiring, updating and firing write files and wait
// for a person's yes, and nothing that waits for a person may run in a chat: for those it answers with the command to
// type in a terminal.
import { isID } from "./catalog/grammar.ts";
import { failureText } from "./cli.ts";
import { searchCommand, showCommand } from "./commands/browse.ts";
import type { Context } from "./commands/context.ts";
import { listCommand } from "./commands/staff.ts";
import { cli } from "./commands/text.ts";
import { PLUGIN_ID } from "./version.ts";

export const CHAT_DESCRIPTION = "Look at the AI employees of the catalog hr.harnsy.dev: search, show, list";

const HELP = [`/${PLUGIN_ID} search <words>   find employees by a role, a skill or a need`,
  `/${PLUGIN_ID} show <id>          one employee: what it needs, its files, its notice`,
  `/${PLUGIN_ID} list               who is hired on this machine`,
  `Hiring, updating and firing are done in a terminal: ${cli("hire <id>")}`].join("\n");

/**
 * Answers one chat command. The answer is text; nothing is asked and no file of a workspace is written. A chat has no
 * command line, so it never reads a test catalog: with one set in the environment, search and show refuse.
 */
export async function chatCommand(base: Omit<Context, "out" | "ask">, args: string): Promise<string> {
  const lines: string[] = [];
  const cx: Context = { ...base, out: (text) => { lines.push(text); }, ask: null, chat: true, testCatalog: false };
  const [verb = "", ...rest] = args.trim().split(/\s+/);
  try {
    if (verb === "search") await searchCommand(cx, rest.join(" "));
    else if (verb === "show") await showCommand(cx, rest[0] ?? "");
    else if (verb === "list") listCommand(cx);
    else if (verb === "hire" || verb === "update" || verb === "fire") {
      // What was typed is echoed only when it is an id: a chat may carry anything.
      const id = isID(rest[0] ?? "") ? rest[0]! : "<publisher>/<name>";
      lines.push(`This step writes files and waits for your yes, so it is not done from a chat. In a terminal:\n  ${cli(`${verb} ${id}`)}`);
    } else lines.push(HELP);
  } catch (err) {
    lines.push(failureText(err));
  }
  return lines.join("\n\n");
}
