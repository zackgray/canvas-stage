/**
 * The clean plate's depth (t29): the set behind a performance built from the performance's OWN plate, so the warp's
 * room is the source clip's room and not the location's AI still re-projected. Per pixel, the median over frames of
 * the lift's MoGe depth (already on the set's metres by the per-frame background scale) where that pixel is clean —
 * the same frames, clean rule and scale the plate colour (lift_performance.py `depth`) and the actors came from, so
 * set and actors share one camera and one depth model. A pixel that is never clean has no depth (NaN): a hole.
 */
import { dilate } from "./lift-depth.ts";

/** lift_performance.py builds the plate colour from pixels outside the actor mask dilated by a 19x19 kernel (9 px). */
export const PLATE_CLEAN_RADIUS = 9;

export interface PlateFrame {
  /** planar MoGe depth for the frame (NaN invalid), before the background scale */
  z: Float32Array;
  /** the lift's per-frame scale onto the set's metres (lift.json depth.perFrame[i].scale) */
  scale: number;
  /** 0/1: the actor mask (SAM) */
  mask: Uint8Array;
  /** 0/1: the pixel lies inside the stabilised frame */
  valid: Uint8Array;
}

/** Clean = inside the frame and not within PLATE_CLEAN_RADIUS px of an actor. */
export function cleanPixels(f: Pick<PlateFrame, "mask" | "valid">, w: number, h: number, r = PLATE_CLEAN_RADIUS): Uint8Array {
  const near = dilate(f.mask, w, h, r);
  return f.valid.map((v, k) => (v && !near[k] ? 1 : 0));
}

/** Per-pixel median of the scaled depth over the frames where the pixel is clean; NaN where it never is. */
export function plateDepth(frames: { z: Float32Array; scale: number; keep: Uint8Array }[], w: number, h: number): Float32Array {
  const n = w * h;
  for (const f of frames) if (f.z.length !== n || f.keep.length !== n) throw new Error(`plate depth: a frame is not ${w}x${h}`);
  const out = new Float32Array(n);
  const buf = new Float32Array(frames.length);
  for (let k = 0; k < n; k++) {
    let m = 0;
    for (const f of frames) {
      const v = f.z[k] * f.scale;
      if (f.keep[k] && v > 0 && Number.isFinite(v)) buf[m++] = v;
    }
    if (!m) { out[k] = NaN; continue; }
    const s = buf.subarray(0, m).sort();
    out[k] = m % 2 ? s[m >> 1] : (s[(m >> 1) - 1] + s[m >> 1]) / 2;
  }
  return out;
}

/** Planar metres -> 16-bit (value = round(metres / metersPerUnit), clamped to 1..65535; 0 = no depth). */
export function encodePlanar16(z: Float32Array, metersPerUnit: number): { values: Uint16Array; clamped: number } {
  const values = new Uint16Array(z.length);
  let clamped = 0;
  for (let k = 0; k < z.length; k++) {
    const v = z[k];
    if (!(v > 0) || !Number.isFinite(v)) continue;
    const q = Math.round(v / metersPerUnit);
    if (q > 65535) clamped++;
    values[k] = Math.min(65535, Math.max(1, q));
  }
  return { values, clamped };
}
