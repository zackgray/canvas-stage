import { describe, expect, it } from "vitest";
import { cleanPixels, encodePlanar16, plateDepth } from "../plate-depth.ts";

const W = 6, H = 4, N = W * H;
const frame = (z: number, scale: number, keepAt: (k: number) => boolean) =>
  ({ z: new Float32Array(N).fill(z), scale, keep: Uint8Array.from({ length: N }, (_, k) => (keepAt(k) ? 1 : 0)) });

describe("plateDepth", () => {
  it("is the per-pixel median of the scaled depth over the frames where the pixel is clean", () => {
    const d = plateDepth([frame(4, 1, () => true), frame(5, 1.2, () => true), frame(100, 1, (k) => k !== 0), frame(3, 2, () => true)], W, H);
    expect(d[0]).toBeCloseTo(6); // 4, 6, 6 (the 100 is not clean there)
    expect(d[1]).toBeCloseTo(6); // 4, 6, 6, 100 -> (6 + 6) / 2
  });

  it("has no depth where a pixel is never clean or never valid", () => {
    const d = plateDepth([frame(4, 1, (k) => k > 2), frame(NaN, 1, () => true)], W, H);
    expect(d.slice(0, 3).every(Number.isNaN)).toBe(true);
    expect(d[3]).toBe(4);
  });

  it("keeps the actors out by the plate colour's margin", () => {
    const mask = new Uint8Array(N); mask[0] = 1;
    const keep = cleanPixels({ mask, valid: new Uint8Array(N).fill(1) }, W, H, 1);
    expect([keep[0], keep[1], keep[W], keep[W + 1], keep[2]]).toEqual([0, 0, 0, 0, 1]);
  });
});

describe("encodePlanar16", () => {
  it("quantises metres, 0 = no depth, clamps past full scale", () => {
    const { values, clamped } = encodePlanar16(Float32Array.from([NaN, 0, 1, 70]), 0.001);
    expect(Array.from(values)).toEqual([0, 0, 1000, 65535]);
    expect(clamped).toBe(1);
  });
});
