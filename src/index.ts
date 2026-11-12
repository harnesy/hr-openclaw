// The plugin's entry: the only file that touches OpenClaw's plugin SDK. It registers one terminal command and one chat
// command. No tools for the model, no hooks, no background service, no telemetry: the plugin runs only when called.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { CHAT_DESCRIPTION, chatCommand } from "./chat.ts";
import { CLI_DESCRIPTION, registerCli, type Program } from "./cli.ts";
import { failInTerminal, stateDirOf, terminalContext } from "./host.ts";
import { PLUGIN_ID } from "./version.ts";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "harnsy HR",
  description: CLI_DESCRIPTION,
  register(api) {
    const context = () => terminalContext(stateDirOf(() => api.runtime?.state?.resolveStateDir?.(), process.env));
    api.registerCli(({ program }) => registerCli(program as Program, context, failInTerminal),
      { descriptors: [{ name: PLUGIN_ID, description: CLI_DESCRIPTION, hasSubcommands: true }] });
    api.registerCommand({
      name: PLUGIN_ID,
      description: CHAT_DESCRIPTION,
      acceptsArgs: true,
      handler: async (ctx) => ({ text: await chatCommand(context(), ctx.args ?? "") }),
    });
  },
});
