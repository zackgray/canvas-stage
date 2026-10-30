/** Read the first channel of a float EXR into a Float32Array (top row first), via three's EXRLoader. */
import { readFileSync } from "node:fs";
import { FloatType } from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

export function readExr(path: string): { width: number; height: number; values: Float32Array } {
  const b = readFileSync(path);
  const loader = new EXRLoader();
  loader.setDataType(FloatType);
  const d = loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) as unknown as { width: number; height: number; data: Float32Array; format: number };
  const ch = d.data.length / (d.width * d.height);
  const out = new Float32Array(d.width * d.height);
  // EXRLoader flips to bottom-row-first for WebGL (flipY); undo so row 0 is the top of the image.
  for (let y = 0; y < d.height; y++) {
    const src = (d.height - 1 - y) * d.width;
    for (let x = 0; x < d.width; x++) out[y * d.width + x] = d.data[(src + x) * ch];
  }
  return { width: d.width, height: d.height, values: out };
}
