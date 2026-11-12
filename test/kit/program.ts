import type { Program } from "../../src/cli.ts";

/** Records what a Commander program is told. */
export function recorder() {
  const commands = new Map<string, { options: string[]; action?: (...args: any[]) => unknown }>();
  const make = (path: string): Program => {
    const self: Program = {
      command(spec) { const name = `${path} ${spec.split(" ")[0]}`.trim(); commands.set(name, { options: [] }); return make(name); },
      description() { return self; },
      option(flags) { commands.get(path)!.options.push(flags.split(" ")[0]!); return self; },
      action(fn) { commands.get(path)!.action = fn; return self; },
    };
    return self;
  };
  return { program: make(""), commands };
}
