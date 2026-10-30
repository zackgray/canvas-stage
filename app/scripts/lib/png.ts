/** Tiny PNG helpers over pngjs (pure JS, no native addon). PNG only. */
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

export type Raster = {
  width: number;
  height: number;
  /** Bit depth per channel as stored in the file (8 or 16). */
  bitDepth: number;
  /** RGBA, 4 values per pixel, at native depth (0-255 or 0-65535). */
  data: Uint8Array | Uint16Array;
  /** 255 or 65535. */
  maxValue: number;
};

export function readPng(path: string): Raster {
  const buf = readFileSync(path);
  // Peek the IHDR bit depth (byte 24) so 16-bit files keep their precision.
  const bitDepth = buf[24] === 16 ? 16 : 8;
  const png = PNG.sync.read(buf, { skipRescale: true });
  // pngjs already returns a Uint16Array (one element per sample) for 16-bit input with skipRescale, and a
  // Buffer for 8-bit. Use it as-is: re-viewing the 16-bit buffer would read half the image as out of range.
  const raw = png.data as unknown as Uint8Array | Uint16Array;
  if (bitDepth === 16 && !(raw instanceof Uint16Array)) throw new Error(`${path}: 16-bit PNG decoded to 8-bit samples`);
  const data = raw instanceof Uint16Array ? raw : new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
  if (data.length !== png.width * png.height * 4) {
    throw new Error(`${path}: decoded ${data.length} samples, expected ${png.width * png.height * 4}`);
  }
  return {
    width: png.width,
    height: png.height,
    bitDepth,
    data,
    maxValue: bitDepth === 16 ? 65535 : 255,
  };
}

/** Luma-free grey value of a pixel, normalised to 0..1 (mean of RGB). */
export function grey01(r: Raster, i: number): number {
  const o = i * 4;
  return (r.data[o] + r.data[o + 1] + r.data[o + 2]) / (3 * r.maxValue);
}

/** Mean normalised grey value over a horizontal band [y0, y1) of rows. */
export function bandMean(r: Raster, y0: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(r.height, y1); y++) {
    for (let x = 0; x < r.width; x++) {
      sum += grey01(r, y * r.width + x);
      n++;
    }
  }
  return n ? sum / n : 0;
}
