/** Per-pixel comparison behind pixel-diff.ts (split out so it can be tested without running the CLI). */
import { basename } from "node:path";
import { grey01, readPng, type Raster } from "./png.ts";

export type Stats = { pixels: number; changed: number; maxAbs: number; meanAbs: number };
export type PairReport = { frame: string; outside: Stats; inside: Stats | null };

function insideMask(mask: Raster, i: number): boolean {
  const alpha = mask.data[i * 4 + 3] / mask.maxValue;
  if (!Number.isFinite(alpha) || !Number.isFinite(grey01(mask, i))) throw new Error(`mask: unreadable sample at pixel ${i}`);
  return alpha >= 0.5 && grey01(mask, i) >= 0.5;
}

export function comparePair(aPath: string, bPath: string, maskPath: string | undefined, tol: number): PairReport {
  const a = readPng(aPath);
  const b = readPng(bPath);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`${basename(aPath)}: size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const mask = maskPath ? readPng(maskPath) : undefined;
  if (mask && (mask.width !== a.width || mask.height !== a.height)) {
    throw new Error(`mask ${basename(maskPath!)} is ${mask.width}x${mask.height}, images are ${a.width}x${a.height}`);
  }
  const acc = [0, 1].map(() => ({ pixels: 0, changed: 0, maxAbs: 0, sumAbs: 0 }));
  const sa = 255 / a.maxValue;
  const sb = 255 / b.maxValue;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const bucket = acc[mask && insideMask(mask, i) ? 1 : 0];
    bucket.pixels++;
    let pixMax = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a.data[i * 4 + c] * sa - b.data[i * 4 + c] * sb);
      // A sample that is not a finite number means the reader failed; fail loudly rather than count it unchanged.
      if (!Number.isFinite(d)) throw new Error(`${basename(aPath)}: unreadable sample at pixel ${i} channel ${c}`);
      bucket.sumAbs += d;
      if (d > pixMax) pixMax = d;
    }
    if (pixMax > bucket.maxAbs) bucket.maxAbs = pixMax;
    if (pixMax > tol) bucket.changed++;
  }
  const fin = (x: (typeof acc)[number]): Stats => ({
    pixels: x.pixels,
    changed: x.changed,
    maxAbs: Math.round(x.maxAbs * 1000) / 1000,
    meanAbs: x.pixels ? Math.round((x.sumAbs / (x.pixels * 4)) * 1e6) / 1e6 : 0,
  });
  return { frame: basename(aPath), outside: fin(acc[0]), inside: mask ? fin(acc[1]) : null };
}
