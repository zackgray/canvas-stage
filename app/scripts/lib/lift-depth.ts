/**
 * Depth maths for scripts/lift-performance.ts (pure). Per-frame MoGe-2 depth (run with the set's own FOV) is put in
 * the set's metres by a scale fitted on the static background (median of set / frame over clean background pixels,
 * as E29), then the actors are cleaned with E26/E29's recipe: per blob, pixels that bled to the wall go to the blob's
 * median and the rest are clamped to median ±15 %, a 7x7 median over the blob, and the per-frame actor median is
 * median-5 + mean-7 smoothed in time. Arrays are row-major, NaN = no depth. Encoding goes through the shipped
 * server/settle/moge.ts quantiseMetres, with one metersPerUnit shared by every frame.
 */
import { quantiseMetres } from "../../server/settle/moge.ts";

/** Nearest-sample a depth map to another size of the same view (pixel centres). */
export function resampleNearest(z: Float32Array, W: number, H: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(H - 1, Math.max(0, Math.round(((y + 0.5) * H) / h - 0.5)));
    for (let x = 0; x < w; x++) out[y * w + x] = z[sy * W + Math.min(W - 1, Math.max(0, Math.round(((x + 0.5) * W) / w - 0.5)))];
  }
  return out;
}

/** Square dilation of a 0/1 mask by `r` pixels (separable max). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = mask[y * w + k];
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x];
    out[y * w + x] = v;
  }
  return out;
}

export function median(v: number[]): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface ScaleFit {
  /** set metres per MoGe metre */
  scale: number;
  /** median |scale·z − z_set| / z_set over the pixels used */
  relResidual: number;
  /** pixels used */
  n: number;
}

/** Scale taking `z` onto `zSet` over pixels where keep = 1 and both depths are valid (every `stride`-th pixel). */
export function backgroundScale(z: Float32Array, zSet: Float32Array, keep: Uint8Array, stride = 1): ScaleFit {
  const r: number[] = [];
  for (let i = 0; i < z.length; i += stride) if (keep[i] && z[i] > 0 && zSet[i] > 0) r.push(zSet[i] / z[i]);
  const scale = median(r);
  return { scale, relResidual: median(r.map((q) => Math.abs(scale / q - 1))), n: r.length };
}

/** 8-connected components of a 0/1 mask: labels (0 = background, 1..count) and pixel count per label. */
export function components(mask: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(mask.length), sizes = [0], stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = sizes.length;
    let n = 0;
    labels[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, px = p % w, py = (p - px) / w;
      n++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy, q = y * w + x;
        if (x >= 0 && x < w && y >= 0 && y < h && mask[q] && !labels[q]) { labels[q] = id; stack.push(q); }
      }
    }
    sizes.push(n);
  }
  return { labels, sizes };
}

export const ACTOR = { minBlob: 150, clamp: 0.15, bleed: 0.98, window: 7 } as const;

/**
 * Actor-only depth for one frame: `z` already in set metres, `zSet` the set behind it. Blobs under minBlob pixels are
 * dropped (their mask pixels come back 0). Returns depth (NaN off the actors) and the mask actually kept.
 */
export function cleanActors(z: Float32Array, zSet: Float32Array, mask: Uint8Array, w: number, h: number, o = ACTOR) {
  const { labels, sizes } = components(mask, w, h);
  const vals: number[][] = sizes.map(() => []);
  for (let i = 0; i < z.length; i++) if (labels[i] && z[i] > 0) vals[labels[i]].push(z[i]);
  const med = vals.map(median);
  const a = new Float32Array(z.length).fill(NaN), kept = new Uint8Array(z.length);
  for (let i = 0; i < z.length; i++) {
    const l = labels[i];
    if (!l || sizes[l] < o.minBlob || !(med[l] > 0)) continue;
    const m = med[l];
    const bled = !(z[i] > 0) || (zSet[i] > 0 && z[i] >= zSet[i] * o.bleed); // on (or behind) the wall -> the blob
    a[i] = Math.min(m * (1 + o.clamp), Math.max(m * (1 - o.clamp), bled ? m : z[i]));
    kept[i] = 1;
  }
  // median over each pixel's valid neighbours of the same blob
  const out = new Float32Array(z.length).fill(NaN), r = o.window >> 1, win: number[] = [];
  for (let i = 0; i < z.length; i++) {
    if (!kept[i]) continue;
    const x0 = i % w, y0 = (i - x0) / w;
    win.length = 0;
    for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const q = y * w + x;
      if (kept[q] && labels[q] === labels[i]) win.push(a[q]);
    }
    out[i] = median(win);
  }
  return { depth: out, mask: kept };
}

/** Median over a centred window (edges repeat the end value), then a centred mean. */
export function smoothSeries(v: number[], medianWin = 5, meanWin = 7): number[] {
  const at = (s: number[], i: number) => s[Math.min(s.length - 1, Math.max(0, i))];
  const m = v.map((_, i) => median(Array.from({ length: medianWin }, (_, k) => at(v, i + k - (medianWin >> 1)))));
  return m.map((_, i) => Array.from({ length: meanWin }, (_, k) => at(m, i + k - (meanWin >> 1))).reduce((s, x) => s + x, 0) / meanWin);
}

/** Median of the finite positive values of a frame. */
export function frameMedian(z: Float32Array): number {
  const v: number[] = [];
  for (const x of z) if (x > 0) v.push(x);
  return median(v);
}

/** Every frame quantised by the shipped quantiseMetres with ONE metersPerUnit (the clip's max depth -> 65535). */
export function quantiseShared(frames: Float32Array[]): { values: Uint16Array[]; metersPerUnit: number } {
  let max = 0;
  for (const z of frames) for (const v of z) if (Number.isFinite(v) && v > max) max = v;
  let metersPerUnit = 1;
  const values = frames.map((z) => {
    const padded = new Float32Array(z.length + 1); // the shared max as a sentinel, so every frame gets the same scale
    padded.set(z);
    padded[z.length] = max;
    const q = quantiseMetres(padded);
    metersPerUnit = q.metersPerUnit;
    return q.values.slice(0, z.length);
  });
  return { values, metersPerUnit };
}

/** Nearest-sample `z` (W x H) at `A`(output px) for every pixel of a w x h output (A: output px -> z px). */
export function resampleAffine(z: Float32Array, W: number, H: number, w: number, h: number, A: [number, number, number, number, number, number]): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(W - 1, Math.max(0, Math.round(A[0] * x + A[1] * y + A[2])));
    const sy = Math.min(H - 1, Math.max(0, Math.round(A[3] * x + A[4] * y + A[5])));
    out[y * w + x] = z[sy * W + sx];
  }
  return out;
}
