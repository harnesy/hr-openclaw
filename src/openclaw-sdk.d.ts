// The part of OpenClaw's plugin SDK (v2026.11.3) this plugin uses, declared here by hand: the openclaw package is some
// 275 MB unpacked, too much to install for a few types. OpenClaw provides the real module when it loads the plugin.
declare module "openclaw/plugin-sdk/plugin-entry" {
  export interface CliDescriptor {
    name: string;
    description: string;
    hasSubcommands: boolean;
  }
  export interface PluginApi {
    runtime?: { state?: { resolveStateDir?: () => unknown } };
    registerCli(registrar: (ctx: { program: unknown }) => void | Promise<void>, opts?: { descriptors?: readonly CliDescriptor[] }): void;
    registerCommand(command: {
      name: string;
      description: string;
      acceptsArgs?: boolean;
      handler: (ctx: { args?: string }) => Promise<{ text: string }> | { text: string };
    }): void;
  }
  export function definePluginEntry(entry: { id: string; name: string; description: string; register(api: PluginApi): void }): unknown;
}
