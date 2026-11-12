import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeflateRaw, deflateRawSync } from "node:zlib";
import { MAX_BUNDLE, MAX_ZIP_FILES } from "../src/catalog/types.ts";
import { hexSum } from "../src/catalog/verify.ts";
import { unzip } from "../src/catalog/zip.ts";
import { bytes, Kit } from "./kit/kit.ts";
import { zipRaw, type RawEntry } from "./kit/zip.ts";
import { load, refusal, sample, tempDir } from "./kit/sample.ts";

const big = Buffer.alloc(MAX_BUNDLE / 2 + 1, "a");
const x = bytes("x");
const many = (n: number): RawEntry[] => Array.from({ length: n }, (_, i) => ({ name: `f${i}`, data: x }));
const mode = (m: number) => (m << 16) >>> 0;
const SYMLINK = mode(0xa1ff), DIRECTORY = mode(0x41ed), FIFO = mode(0x11a4), PLAIN = mode(0x81a4);

// A bundle whose zip breaks the format's limits is refused even when the feed names its hash.
const unsafe: { name: string; entries: RawEntry[]; want: string }[] = [
  { name: "a name that climbs out", entries: [{ name: "manifest.json", data: bytes("{}") }, { name: "../../etc/cron.d/x", data: x }],
    want: "not a plain file inside the bundle" },
  { name: "a name that climbs out from inside", entries: [{ name: "skills/../../x", data: x }], want: "not a plain file inside the bundle" },
  { name: "an absolute name", entries: [{ name: "/etc/passwd", data: x }], want: "not a plain file inside the bundle" },
  { name: "a name with a backslash", entries: [{ name: "skills\\..\\..\\x", data: x }], want: "not a plain file inside the bundle" },
  { name: "a name with a NUL", entries: [{ name: "a\0b", data: x }], want: "not a plain file inside the bundle" },
  { name: "a name that is not clean", entries: [{ name: "a//b", data: x }], want: "not a plain file inside the bundle" },
  { name: "a name that is not UTF-8", entries: [{ name: "a", data: x }], want: "not UTF-8" },
  { name: "a name twice", entries: [{ name: "bundle.json", data: bytes("{}") }, { name: "bundle.json", data: bytes("{}") }], want: "in the zip twice" },
  { name: "a symlink", entries: [{ name: "skills/a/SKILL.md", data: bytes("/etc/passwd"), creator: 3 << 8, attrs: SYMLINK }],
    want: "not a plain file inside the bundle" },
  { name: "a folder", entries: [{ name: "skills/", data: Buffer.alloc(0), creator: 3 << 8, attrs: DIRECTORY }], want: "not a plain file inside the bundle" },
  { name: "a folder by its mode", entries: [{ name: "skills", data: Buffer.alloc(0), creator: 3 << 8, attrs: DIRECTORY }], want: "not a plain file inside the bundle" },
  { name: "a folder as DOS marks it", entries: [{ name: "skills", data: Buffer.alloc(0), creator: 0, attrs: 0x10 }], want: "not a plain file inside the bundle" },
  { name: "a named pipe", entries: [{ name: "pipe", data: Buffer.alloc(0), creator: 3 << 8, attrs: FIFO }], want: "not a plain file inside the bundle" },
  { name: "more than it may unpack to", entries: [{ name: "a", data: big }, { name: "b", data: big }], want: "unpacks to more than" },
  { name: "more than it may unpack to, the headers saying less", entries: [{ name: "a", data: big, size: 10 }, { name: "b", data: big, size: 10 }],
    want: "size or checksum differs" },
  { name: "too many entries", entries: many(MAX_ZIP_FILES + 1), want: "zip entries" },
  { name: "a file longer than its header says", entries: [{ name: "a", data: bytes("longer"), size: 3 }], want: "size or checksum differs" },
  { name: "a file shorter than its header says", entries: [{ name: "a", data: bytes("short"), size: 9 }], want: "size or checksum differs" },
  { name: "a file whose checksum is wrong", entries: [{ name: "a", data: bytes("data"), crc: 1 }], want: "size or checksum differs" },
  { name: "an encrypted file", entries: [{ name: "a", data: bytes("data"), flags: 0x801 }], want: "not stored or deflated" },
];

for (const c of unsafe) {
  test(`unsafe zip refused: ${c.name}`, async () => {
    const k = new Kit(), dir = tempDir();
    const p = k.pack("harnsy/reviewer", "1.0.0", sample("reviewer"));
    p.file = zipRaw(c.entries);
    if (c.name === "a name that is not UTF-8") p.file[p.file.length - 22 - 1] = 0xff; // the last byte of the directory: the name
    p.entry.size = p.file.length;
    p.entry.sha256 = hexSum(p.file);
    k.release(dir, [p]);
    const msg = await refusal(load(k, dir));
    assert.ok(msg.includes(c.want), `refused with «${msg}», want it to say «${c.want}»`);
  });
}

test("a zip is read: deflated and stored files, an empty file, a plain unix file", () => {
  const files = unzip(zipRaw([
    { name: "a.txt", data: bytes("hello") },
    { name: "d/stored.bin", data: Buffer.alloc(70000, 7), store: true },
    { name: "d/deflated.bin", data: Buffer.alloc(300000, "ab") },
    { name: "empty", data: Buffer.alloc(0) },
    { name: "unix.sh", data: bytes("#!/bin/sh\n"), creator: 3 << 8, attrs: PLAIN },
  ]));
  assert.deepEqual([...files.keys()], ["a.txt", "d/stored.bin", "d/deflated.bin", "empty", "unix.sh"]);
  assert.equal(Buffer.from(files.get("a.txt")!).toString(), "hello");
  assert.equal(files.get("d/stored.bin")!.length, 70000);
  assert.deepEqual(Buffer.from(files.get("d/deflated.bin")!), Buffer.alloc(300000, "ab"));
  assert.equal(files.get("empty")!.length, 0);
});

test("the most a bundle may hold is read: 128 entries, 8 MB", () => {
  const entries = many(MAX_ZIP_FILES - 1);
  entries.push({ name: "big", data: Buffer.alloc(MAX_BUNDLE - (MAX_ZIP_FILES - 1), "z") });
  assert.equal(unzip(zipRaw(entries)).size, MAX_ZIP_FILES);
});

test("a stored file past the limit is refused, and a deflated one that unpacks past it", () => {
  assert.throws(() => unzip(zipRaw([{ name: "a", data: Buffer.alloc(MAX_BUNDLE + 1), store: true }])), /unpacks to more than/);
  assert.throws(() => unzip(zipRaw([{ name: "a", data: Buffer.alloc(MAX_BUNDLE + 1) }])), /unpacks to more than/);
  assert.throws(() => unzip(zipRaw([{ name: "a", data: Buffer.alloc(64 << 20), size: 100 }])), /size or checksum differs/);
});

test("bytes that are not a zip are refused", () => {
  for (const bad of [Buffer.alloc(0), bytes("not a zip"), Buffer.alloc(100)]) {
    assert.throws(() => unzip(bad), /not a zip file/);
  }
  const cut = zipRaw([{ name: "a", data: bytes("data") }]);
  assert.throws(() => unzip(cut.subarray(10)), /not a zip file|does not unpack/);
});

// What a different inflater could read differently. Each verdict below is the one the reader has always given.
test("a deflated entry: a stream cut short, bytes after its end, one byte over what it may be", () => {
  const data = Buffer.from("the quick brown fox jumps over the lazy dog. ".repeat(40)), whole = deflateRawSync(data);
  const read = (e: Partial<RawEntry>) => unzip(zipRaw([{ name: "a", data, ...e }])).get("a")!;
  assert.deepEqual(Buffer.from(read({})), data);
  for (const cut of [1, 2, 5, whole.length >> 1, whole.length - 1]) {
    assert.throws(() => read({ packed: whole.subarray(0, whole.length - cut) }), /zip entry "a" does not unpack/, `cut by ${cut}`);
  }
  assert.throws(() => read({ packed: Buffer.alloc(0) }), /zip entry "a" does not unpack/, "no stream at all");
  assert.throws(() => read({ packed: Buffer.from([0x07, 0xff, 0xff]) }), /zip entry "a" does not unpack/, "a block type that does not exist");
  for (const tail of [Buffer.from([0]), Buffer.from("junk after the end"), whole]) {
    assert.deepEqual(Buffer.from(read({ packed: Buffer.concat([whole, tail]) })), data, "bytes after the stream's end, inside the packed length, are not read");
  }
  assert.throws(() => read({ size: data.length - 1 }), /its size or checksum differs from its header/, "one byte more than the header says");
  assert.throws(() => read({ size: data.length + 1 }), /its size or checksum differs from its header/, "one byte fewer than the header says");
});

test("the budget of a bundle is exact: 8 MB unpack, one byte more does not", () => {
  const half = Buffer.alloc(MAX_BUNDLE / 2, "h");
  assert.equal(unzip(zipRaw([{ name: "a", data: half }, { name: "b", data: half }])).size, 2);
  assert.throws(() => unzip(zipRaw([{ name: "a", data: half }, { name: "b", data: half }, { name: "c", data: x }])), /unpacks to more than 8388608 bytes/);
  assert.throws(() => unzip(zipRaw([{ name: "a", data: Buffer.alloc(MAX_BUNDLE + 1, "h") }])), /unpacks to more than 8388608 bytes/);
  assert.throws(() => unzip(zipRaw([{ name: "a", data: half }, { name: "b", data: Buffer.alloc(MAX_BUNDLE / 2 + 1, "h") }])), /unpacks to more than 8388608 bytes/);
});

test("a 512 MiB bomb in one entry is refused whatever size its header states, without unpacking it", async () => {
  // 512 MiB of zeros, deflated in pieces so the test itself never holds them.
  const deflater = createDeflateRaw(), parts: Buffer[] = [], piece = Buffer.alloc(1 << 20);
  deflater.on("data", (c: Buffer) => parts.push(c));
  const done = new Promise((resolve, reject) => deflater.on("end", resolve).on("error", reject));
  for (let i = 0; i < 512; i++) if (!deflater.write(piece)) await new Promise((resolve) => deflater.once("drain", resolve));
  deflater.end();
  await done;
  const packed = Buffer.concat(parts);
  assert.ok(packed.length < 1 << 20, `${packed.length} packed bytes`);
  const before = process.resourceUsage().maxRSS;
  for (const [size, want] of [[1024, /its size or checksum differs/], [MAX_BUNDLE, /unpacks to more than/], [0xfffffffe, /unpacks to more than/]] as const) {
    assert.throws(() => unzip(zipRaw([{ name: "bomb", data: Buffer.alloc(0), packed, size, crc: 1 }])), want, `header size ${size}`);
  }
  const grown = (process.resourceUsage().maxRSS - before) / 1024;
  assert.ok(grown < 96, `the reader's memory grew by ${grown.toFixed(0)} MiB: it must stay near the 8 MB a bundle may unpack to`);
});
