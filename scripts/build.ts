// Builds dist/index.js: the plugin and its one library (fflate) in a single readable file. OpenClaw installs a plugin
// from git without running a build, so dist/ is committed; `npm test` fails when it is not in step with src/.
import { build, type BuildOptions } from "esbuild";
import { join } from "node:path";

/** The options of the build; the test that compares dist/ with src/ uses the same. */
export const options: BuildOptions = {
  absWorkingDir: join(import.meta.dirname, ".."),
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  external: ["openclaw/*"],
  legalComments: "inline",
  charset: "utf8",
  logLevel: "warning",
};

if (import.meta.filename === process.argv[1]) {
  await build({ ...options, outfile: "dist/index.js" });
}
