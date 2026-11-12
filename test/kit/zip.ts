// A zip writer for tests: it writes what it is told, also what no honest tool would (a name twice, a symlink, a size
// that is not true), so a test can break one thing.
import { deflateRawSync } from "node:zlib";
import { crc32 } from "node:zlib";

export interface RawEntry {
  name: string;
  data: Uint8Array;
  store?: boolean; // keep the bytes as they are instead of deflating
  creator?: number; // «version made by»: the high byte is the system (3 is unix)
  attrs?: number; // external attributes
  size?: number; // the unpacked size the headers claim, when not the true one
  crc?: number; // the checksum the headers claim, when not the true one
  flags?: number;
}

/** Writes the entries as a zip, in order. */
export function zipRaw(entries: RawEntry[]): Buffer {
  const parts: Buffer[] = [], dir: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = e.store ? Buffer.from(e.data) : deflateRawSync(e.data);
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0); // version needed
    common.writeUInt16LE(e.flags ?? 0x800, 2); // names are UTF-8
    common.writeUInt16LE(e.store ? 0 : 8, 4);
    common.writeUInt32LE(0x00210000, 6); // time and date: 1980-01-01
    common.writeUInt32LE(e.crc ?? crc32(e.data), 10);
    common.writeUInt32LE(packed.length, 14);
    common.writeUInt32LE(e.size ?? e.data.length, 18);
    common.writeUInt16LE(name.length, 22);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, name, packed]);
    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(e.attrs ?? 0, 6);
    tail.writeUInt32LE(offset, 10);
    const made = Buffer.alloc(2);
    made.writeUInt16LE(e.creator ?? 20, 0);
    dir.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), made, common, tail, name]));
    parts.push(local);
    offset += local.length;
  }
  const dirBytes = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBytes, end]);
}

/** Writes files as a zip in the given order; a name that has no file is left out. */
export function zip(order: string[], files: Map<string, Uint8Array>): Buffer {
  return zipRaw(order.filter((name) => files.has(name)).map((name) => ({ name, data: files.get(name)! })));
}
