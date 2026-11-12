// The release of the made-up employees under test/testdata/employees.
import { join } from "node:path";
import type { Release } from "../../src/catalog/release.ts";
import { Kit } from "./kit.ts";
import { load, tempDir } from "./sample.ts";

export const TESTDATA = join(import.meta.dirname, "..", "testdata");

export interface Staff {
  kit: Kit;
  dir: string; // the release on disk
  release: Release;
}

let cached: Promise<Staff> | undefined;

export function staff(): Promise<Staff> {
  return (cached ??= (async () => {
    const kit = new Kit(), dir = tempDir();
    kit.release(dir, kit.catalog(join(TESTDATA, "employees")));
    return { kit, dir, release: await load(kit, dir) };
  })());
}
