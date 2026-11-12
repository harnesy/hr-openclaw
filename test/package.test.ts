// The package as OpenClaw installs it: dist/ in step with src/, one version everywhere, the manifest and the entry
// naming the same plugin, and the repository's own limits.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { options } from "../scripts/build.ts";
import { CHAT_DESCRIPTION } from "../src/chat.ts";
import { CLI_DESCRIPTION } from "../src/cli.ts";
import { PLUGIN_ID, VERSION } from "../src/version.ts";

const ROOT = join(import.meta.dirname, "..");
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");
const pkg = JSON.parse(read("package.json")), manifest = JSON.parse(read("openclaw.plugin.json"));

test("dist/index.js is what src/ builds to (run `npm run build` and commit it when this fails)", async () => {
  const built = await build({ ...options, write: false, outfile: "dist/index.js" });
  assert.equal(built.outputFiles![0]!.text === read("dist", "index.js"), true, "dist/index.js is not in step with src/");
});

test("the built file needs nothing installed: only Node's own modules and OpenClaw's plugin SDK are imported", () => {
  const dist = read("dist", "index.js");
  const imports = [...dist.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]!);
  assert.ok(imports.length > 0);
  for (const from of imports) assert.ok(from.startsWith("node:") || from === "openclaw/plugin-sdk/plugin-entry", from);
  assert.deepEqual(pkg.dependencies ?? {}, {}, "a git install runs `npm install --omit=dev`: there must be nothing to install");
  for (const never of ["require(", "eval(", "new Function", "child_process.exec", "execSync", "worker_threads", "/home/", "/tmp/"]) {
    assert.ok(!dist.includes(never), `dist/index.js holds ${never}`);
  }
  assert.equal([...dist.matchAll(/\bspawn\(/g)].length, 1, "one place starts a program: the openclaw command, with an argument array");
});

test("one version and one id everywhere", () => {
  assert.equal(pkg.version, VERSION);
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.id, PLUGIN_ID);
  assert.deepEqual(manifest.cliCommands, [{ name: PLUGIN_ID, description: CLI_DESCRIPTION, hasSubcommands: true }]);
  assert.deepEqual(manifest.commandAliases, [{ name: PLUGIN_ID, kind: "runtime-slash" }]);
  assert.deepEqual(manifest.activation, { onStartup: false, onCommands: [PLUGIN_ID] });
  assert.deepEqual(manifest.configSchema, { type: "object", additionalProperties: false, properties: {} });
  assert.deepEqual(pkg.openclaw.extensions, ["./dist/index.js"]);
  assert.ok(CHAT_DESCRIPTION.length > 0);
  for (const key of ["tools", "hooks", "services", "mcpServers", "skills", "channels", "providers"]) {
    assert.equal(key in manifest, false, `the manifest declares no ${key}`);
  }
});

test("the licences travel with the package", () => {
  assert.match(read("LICENSE"), /^MIT License\n\nCopyright \(c\) 2026 Pavel Buchnev \(harnsy\)\n/);
  const lock = JSON.parse(read("package-lock.json")).packages["node_modules/fflate"];
  const third = read("THIRD_PARTY_LICENSES");
  assert.ok(third.includes(`fflate ${lock.version}`), "THIRD_PARTY_LICENSES names the fflate version that is bundled");
  assert.ok(third.includes(read("node_modules", "fflate", "LICENSE").trim()), "THIRD_PARTY_LICENSES holds fflate's licence text whole");
  assert.match(read("NOTICE"), /fflate/);
  for (const file of ["dist", "openclaw.plugin.json", "LICENSE", "NOTICE", "THIRD_PARTY_LICENSES", "README.md"]) {
    assert.ok(pkg.files.includes(file), `package.json files lacks ${file}`);
  }
});

test("no source file is longer than 300 lines", () => {
  for (const dir of ["src", "test", "scripts"]) {
    for (const d of readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })) {
      if (!d.isFile() || !d.name.endsWith(".ts") || d.parentPath.includes("testdata")) continue;
      const lines = readFileSync(join(d.parentPath, d.name), "utf8").split("\n").length - 1;
      assert.ok(lines <= 300, `${join(d.parentPath, d.name)}: ${lines} lines`);
    }
  }
});
