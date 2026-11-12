// Looking at the catalog: search and show. Neither writes anything but the feed's sequence number.
import { join } from "node:path";
import { workspaceFolder } from "../render/openclaw.ts";
import { DEFAULT_LIMIT, MAX_LIMIT, search } from "../search.ts";
import { type Context, employeeFor, openCatalog } from "./context.ts";
import { card, cli, describe } from "./text.ts";

export interface SearchOptions {
  department?: string;
  limit?: number;
}

/** `search [words…]`: cards of the employees that match; everyone when no words are given. */
export async function searchCommand(cx: Context, words: string, opts: SearchOptions = {}): Promise<void> {
  const { feed } = await openCatalog(cx);
  const limit = Number.isSafeInteger(opts.limit) ? opts.limit! : DEFAULT_LIMIT;
  const found = search(feed.entries, words, opts.department ?? "", limit);
  if (found.total === 0) return cx.out("No employee matches. Try other words, or run the search without words to see everyone.");
  const more = found.total - found.entries.length;
  cx.out([...found.entries.map(card), "",
    more > 0 ? `${found.entries.length} of ${found.total} shown: add words, or raise --limit (at most ${MAX_LIMIT}).` : `${found.total} found.`,
    `Look at one: ${cli("show <id>")}. Hire one: ${cli("hire <id>")}.`].join("\n\n").replace(/\n\n\n+/g, "\n\n"));
}

/** `show <id>`: the card, what the employee needs, the files a hire would write, the notice. */
export async function showCommand(cx: Context, id: string): Promise<void> {
  const h = await employeeFor(cx, id);
  cx.out(describe(h, join(cx.stateDir, workspaceFolder(h.tree.name))));
  cx.out(`Hire it (in a terminal): ${cli(`hire ${id}`)}`);
}
