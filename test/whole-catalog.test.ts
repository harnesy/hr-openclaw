// The cross-check on a whole real catalog. It is not part of the repository: it runs only when these are set.
//   HR_OPENCLAW_STAND      a signed release as the site serves it (the folder that holds v1/feed.json)
//   HR_OPENCLAW_STAND_PUB  its public key, <kid>:<base64 of the raw key>
//   HR_OPENCLAW_TREES      what hr-mcp renders for the target openclaw: <publisher>/<name>/workspace-<name>/…
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadRelease } from "../src/catalog/release.ts";
import { dirSource } from "../src/catalog/source.ts";
import { CATALOG_HOST } from "../src/catalog/types.ts";
import { hexSum, parseKey } from "../src/catalog/verify.ts";
import { OPENCLAW_FILE_MAX, OPENCLAW_TOTAL_MAX, renderOpenClaw } from "../src/render/openclaw.ts";
import { source } from "./kit/kit.ts";

const { HR_OPENCLAW_STAND: stand, HR_OPENCLAW_STAND_PUB: pub, HR_OPENCLAW_TREES: trees } = process.env;
const skip = stand && pub && trees ? false : "set HR_OPENCLAW_STAND, HR_OPENCLAW_STAND_PUB and HR_OPENCLAW_TREES to run it";

test("the whole catalog verifies and renders byte for byte as hr-mcp renders it", { skip }, async () => {
  const [kid, b64] = pub!.split(":");
  const release = await loadRelease(dirSource(stand!), [parseKey(kid!, b64!)], CATALOG_HOST, new Date());
  const want = readdirSync(trees!).flatMap((p) => readdirSync(join(trees!, p)).map((n) => `${p}/${n}`)).sort();
  assert.deepEqual(release.employees.map((e) => e.entry.id).sort(), want, "the release and the reference trees name other employees");
  let files = 0;
  for (const e of release.employees) {
    const tree = renderOpenClaw(e), home = `workspace-${tree.name}/`;
    assert.ok(existsSync(join(trees!, e.entry.id, home)), `${e.entry.id}: no reference tree`);
    const ref = source(join(trees!, e.entry.id));
    assert.deepEqual(tree.files.map((f) => f.path), [...ref.keys()].sort(), e.entry.id);
    let total = 0;
    for (const f of tree.files) {
      assert.ok(Buffer.from(f.content).equals(ref.get(f.path)!), `${e.entry.id}: ${f.path} differs from the reference`);
      const rel = f.path.slice(home.length);
      if (rel.startsWith("skills/")) assert.equal(hexSum(f.content), e.manifest.files.get(rel), `${e.entry.id}: ${rel}`);
      if (["SOUL.md", "AGENTS.md", "IDENTITY.md"].includes(rel)) {
        const n = Buffer.from(f.content).toString("utf8").length;
        total += n;
        assert.ok(n <= OPENCLAW_FILE_MAX, `${e.entry.id}: ${rel} is ${n} characters`);
      }
      files++;
    }
    assert.ok(total <= OPENCLAW_TOTAL_MAX, `${e.entry.id}: ${total} characters are loaded every session`);
  }
  console.log(`# ${release.employees.length} employees, ${files} files, feed seq ${release.feed.feed.seq}`);
});
