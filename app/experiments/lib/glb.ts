/** Minimal GLB reader: JSON chunk + typed views of float/uint accessors. Enough to inspect positions/UVs. */
import { readFileSync } from "node:fs";

export type Glb = { json: Record<string, any>; bin: Buffer };

export function readGlb(path: string): Glb {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  let off = 12; let json: Record<string, any> = {}; let bin = Buffer.alloc(0);
  while (off < b.length) {
    const len = b.readUInt32LE(off); const type = b.readUInt32LE(off + 4);
    const body = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  return { json, bin };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function accessor(g: Glb, index: number): { data: Float32Array | Uint32Array | Uint16Array | Uint8Array; size: number; count: number } {
  const a = g.json.accessors[index];
  const v = g.json.bufferViews[a.bufferView];
  const size = COMPONENTS[a.type];
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = a.count * size;
  const stride = v.byteStride;
  const Ctor = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array;
  if (stride && stride !== size * Ctor.BYTES_PER_ELEMENT) throw new Error("interleaved accessors not supported");
  const copy = Buffer.from(g.bin.subarray(start, start + n * Ctor.BYTES_PER_ELEMENT));
  return { data: new Ctor(copy.buffer, copy.byteOffset, n), size, count: a.count };
}

/** First primitive's attribute by name (POSITION, TEXCOORD_0, NORMAL, COLOR_0...). */
export function attribute(g: Glb, name: string) {
  const idx = g.json.meshes?.[0]?.primitives?.[0]?.attributes?.[name];
  return idx === undefined ? undefined : accessor(g, idx);
}
