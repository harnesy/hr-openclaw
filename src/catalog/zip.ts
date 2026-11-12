// Reads a .harnsy file (a zip) within the format's limits: at most MAX_ZIP_FILES entries, MAX_BUNDLE bytes unpacked
// whatever the headers say, no name twice, no name that leaves the bundle, plain files only. The whole file is in
// memory; nothing is written to disk here.
import { Inflate } from "fflate";
import { cleanPath } from "../gotext.ts";
import { clip } from "./grammar.ts";
import { MAX_BUNDLE, MAX_ZIP_FILES, Refusal } from "./types.ts";

const END_SIG = 0x06054b50, DIR_SIG = 0x02014b50, LOCAL_SIG = 0x04034b50;
const END_LEN = 22, DIR_LEN = 46, LOCAL_LEN = 30;
const STORE = 0, DEFLATE = 8;
const SLICE = 4096; // packed bytes handed to the inflater at a time: bounds what one step can unpack

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc32: number;
  packed: number;
  size: number;
  regular: boolean;
  offset: number;
}

const notZip = (why: string) => new Refusal(`not a zip file: ${why}`);

/** Finds the end-of-central-directory record: the last 22 bytes, or earlier when the zip has a comment. */
function findEnd(v: DataView): number {
  for (let i = v.byteLength - END_LEN; i >= 0 && i >= v.byteLength - END_LEN - 0xffff; i--) {
    if (v.getUint32(i, true) === END_SIG && i + END_LEN + v.getUint16(i + 20, true) <= v.byteLength) return i;
  }
  throw notZip("no directory");
}

/** Unix file types that are not a plain file: fifo, character device, directory, block device, symlink, socket. */
const UNIX_SPECIAL = new Set([0x1000, 0x2000, 0x4000, 0x6000, 0xa000, 0xc000]);

/** Whether the entry is a plain file by the mode its creator recorded. */
function isRegular(name: string, creator: number, attrs: number): boolean {
  if (name.endsWith("/")) return false;
  const system = creator >>> 8;
  if (system === 3 || system === 19) return !UNIX_SPECIAL.has((attrs >>> 16) & 0xf000);
  if (system === 0 || system === 11 || system === 14) return (attrs & 0x10) === 0;
  return true;
}

function readDirectory(file: Uint8Array, v: DataView): ZipEntry[] {
  const end = findEnd(v);
  const count = v.getUint16(end + 10, true), dirSize = v.getUint32(end + 12, true), dirOffset = v.getUint32(end + 16, true);
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw notZip("zip64 is not read");
  if (dirOffset + dirSize > end) throw notZip("the directory is out of the file");
  const entries: ZipEntry[] = [];
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  let at = dirOffset;
  while (at + DIR_LEN <= end && v.getUint32(at, true) === DIR_SIG) {
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true);
    if (at + DIR_LEN + nameLen + extraLen + commentLen > end) throw notZip("a directory entry is cut short");
    let name: string;
    try {
      name = utf8.decode(file.subarray(at + DIR_LEN, at + DIR_LEN + nameLen));
    } catch {
      throw new Refusal("a zip entry's name is not UTF-8");
    }
    const packed = v.getUint32(at + 20, true), size = v.getUint32(at + 24, true), offset = v.getUint32(at + 42, true);
    if (packed === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw notZip("zip64 is not read");
    entries.push({ name, flags: v.getUint16(at + 8, true), method: v.getUint16(at + 10, true), crc32: v.getUint32(at + 16, true),
      packed, size, offset, regular: isRegular(name, v.getUint16(at + 4, true), v.getUint32(at + 38, true)) });
    at += DIR_LEN + nameLen + extraLen + commentLen;
  }
  if (entries.length !== count) throw notZip("the directory does not hold the entries it counts");
  return entries;
}

/** Whether a zip entry's name is a clean relative path with forward slashes. */
export function safeName(name: string): boolean {
  return name !== "" && !/[\\\0]/.test(name) && !name.startsWith("/") && cleanPath(name) === name &&
    name !== ".." && !name.startsWith("../");
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = (CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

/** Unpacks deflated bytes, stopping as soon as more than max bytes came out. */
function inflate(packed: Uint8Array, max: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Inflate((chunk) => {
    total += chunk.length;
    chunks.push(chunk);
  });
  for (let at = 0; total <= max; at += SLICE) {
    const last = at + SLICE >= packed.length;
    stream.push(packed.subarray(at, at + SLICE), last);
    if (last) break;
  }
  return Buffer.concat(chunks);
}

/** Reads one entry's bytes, at most left+1 of them: the caller refuses the bundle when more than left came out. */
function readEntry(file: Uint8Array, v: DataView, e: ZipEntry, left: number): Uint8Array {
  if (e.offset + LOCAL_LEN > file.length || v.getUint32(e.offset, true) !== LOCAL_SIG) throw notZip(`${clip(e.name)} has no header`);
  const start = e.offset + LOCAL_LEN + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  if (start + e.packed > file.length) throw notZip(`${clip(e.name)} is cut short`);
  if ((e.flags & 1) !== 0 || (e.method !== STORE && e.method !== DEFLATE)) throw new Refusal(`zip entry ${clip(e.name)}: not stored or deflated`);
  const packed = file.subarray(start, start + e.packed);
  let out: Uint8Array;
  try {
    out = e.method === STORE ? packed.subarray(0, left + 1) : inflate(packed, Math.min(left, e.size));
  } catch {
    throw new Refusal(`zip entry ${clip(e.name)} does not unpack`);
  }
  if (out.length > left) return out;
  if (out.length !== e.size || (e.crc32 !== 0 && crc32(out) !== e.crc32)) {
    throw new Refusal(`zip entry ${clip(e.name)}: its size or checksum differs from its header`);
  }
  return out;
}

/** Reads every file of a .harnsy file, by its name. */
export function unzip(file: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const entries = readDirectory(file, v);
  if (entries.length > MAX_ZIP_FILES) throw new Refusal(`${entries.length} zip entries, at most ${MAX_ZIP_FILES}`);
  const files = new Map<string, Uint8Array>();
  let left = MAX_BUNDLE;
  for (const e of entries) {
    if (files.has(e.name)) throw new Refusal(`${clip(e.name)} is in the zip twice`);
    if (!safeName(e.name) || !e.regular) throw new Refusal(`zip entry ${clip(e.name)}: not a plain file inside the bundle`);
    const b = readEntry(file, v, e, left);
    left -= b.length;
    if (left < 0) throw new Refusal(`unpacks to more than ${MAX_BUNDLE} bytes`);
    files.set(e.name, b);
  }
  return files;
}
