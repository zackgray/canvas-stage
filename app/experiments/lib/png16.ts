/** Write a 16-bit greyscale PNG (no deps: zlib deflate + crc32). values are 0..65535, top row first. */
import { readFileSync, writeFileSync } from "node:fs";
import { crc32, deflateSync, inflateSync } from "node:zlib";

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, crc]);
}

export function writeGrey16(path: string, width: number, height: number, values: Uint16Array): void {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 2));
  for (let y = 0; y < height; y++) {
    const o = y * (1 + width * 2);
    raw[o] = 0;
    for (let x = 0; x < width; x++) raw.writeUInt16BE(values[y * width + x], o + 1 + x * 2);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(path, Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}

/** Read a 16-bit greyscale PNG written by writeGrey16 (filter 0 rows only). */
export function readGrey16(path: string): { width: number; height: number; values: Uint16Array } {
  const b = readFileSync(path);
  let off = 8, width = 0, height = 0;
  const idat: Buffer[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString("ascii", off + 4, off + 8);
    if (type === "IHDR") { width = b.readUInt32BE(off + 8); height = b.readUInt32BE(off + 12); if (b[off + 16] !== 16 || b[off + 17] !== 0) throw new Error(`${path}: not 16-bit grey`); }
    else if (type === "IDAT") idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const values = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    const o = y * (1 + width * 2);
    if (raw[o] !== 0) throw new Error(`${path}: filtered rows not supported`);
    for (let x = 0; x < width; x++) values[y * width + x] = raw.readUInt16BE(o + 1 + x * 2);
  }
  return { width, height, values };
}
