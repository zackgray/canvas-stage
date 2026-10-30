import { describe, expect, it } from "vitest";
import { backgroundScale, cleanActors, components, dilate, quantiseShared, resampleAffine, resampleNearest, smoothSeries } from "../lift-depth.ts";

const W = 40, H = 30;
const fill = (v: number) => new Float32Array(W * H).fill(v);
/** a w x h rectangle of 1s at (x, y) */
const rect = (x: number, y: number, w: number, h: number, m = new Uint8Array(W * H)) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m[j * W + i] = 1;
  return m;
};

describe("backgroundScale", () => {
  it("recovers the set's scale on the background, ignoring the kept-out actors", () => {
    const zSet = Float32Array.from({ length: W * H }, (_, i) => 4 + (i % 7));
    const z = zSet.map((v) => v / 1.37);
    const actor = rect(10, 10, 8, 8);
    for (let i = 0; i < z.length; i++) if (actor[i]) z[i] = 0.5; // actors in front: not the set's depth
    const keep = actor.map((v) => 1 - v);
    const s = backgroundScale(z, zSet, keep);
    expect(s.scale).toBeCloseTo(1.37, 5);
    expect(s.relResidual).toBeLessThan(1e-6);
    expect(s.n).toBe(W * H - 64);
  });

  it("is robust to a minority of wrong pixels and skips invalid depth", () => {
    const zSet = fill(10), z = fill(5);
    z[0] = NaN; zSet[1] = NaN;
    for (let i = 2; i < 200; i++) z[i] = 1; // 16 % outliers
    const s = backgroundScale(z, zSet, new Uint8Array(W * H).fill(1));
    expect(s.scale).toBe(2);
    expect(s.n).toBe(W * H - 2);
  });
});

describe("cleanActors", () => {
  it("keeps the blob, pulls wall-bled pixels to the blob median and clamps to ±15 %", () => {
    const zSet = fill(10), z = fill(10);
    const mask = rect(5, 5, 13, 13);
    for (let i = 0; i < z.length; i++) if (mask[i]) z[i] = 5;
    z[8 * W + 8] = 9.9;  // bled to the wall -> the median (5)
    z[9 * W + 9] = 2;    // far too near -> clamped to 4.25 then median-filtered away
    const c = cleanActors(z, zSet, mask, W, H);
    expect(c.depth[8 * W + 8]).toBe(5);
    expect(c.depth[9 * W + 9]).toBe(5);
    expect(c.mask.reduce((s, v) => s + v, 0)).toBe(169);
    expect(Number.isNaN(c.depth[0])).toBe(true);
  });

  it("drops blobs smaller than 150 px from depth and mask", () => {
    const mask = rect(1, 1, 5, 5, rect(20, 10, 13, 13));
    const z = fill(3);
    const c = cleanActors(z, fill(10), mask, W, H);
    expect(c.mask[2 * W + 2]).toBe(0);
    expect(Number.isNaN(c.depth[2 * W + 2])).toBe(true);
    expect(c.depth[15 * W + 25]).toBe(3);
  });
});

describe("pixel helpers", () => {
  it("labels 8-connected components", () => {
    const m = rect(0, 0, 2, 2, rect(2, 2, 2, 2, rect(10, 10, 3, 1)));
    const { sizes } = components(m, W, H);
    expect(sizes.slice(1)).toEqual([8, 3]);
  });

  it("dilates a pixel to a square", () => {
    const d = dilate(rect(10, 10, 1, 1), W, H, 2);
    expect(d.reduce((s, v) => s + v, 0)).toBe(25);
    expect(d[8 * W + 8]).toBe(1);
    expect(d[7 * W + 10]).toBe(0);
  });

  it("nearest-resamples 2:1 by pixel centres", () => {
    const z = Float32Array.from({ length: 4 * 2 }, (_, i) => i);
    expect([...resampleNearest(z, 4, 2, 2, 1)]).toEqual([5, 7]);
  });

  it("smooths a series: a one-frame spike is removed, a constant is kept", () => {
    expect(smoothSeries([5, 5, 5, 9, 5, 5, 5, 5])).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    const ramp = smoothSeries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ramp[5]).toBeCloseTo(6, 10);
  });
});

describe("quantiseShared", () => {
  it("gives every frame one metersPerUnit and round-trips to the quantum", () => {
    const a = Float32Array.from([0, NaN, 2, 4]), b = Float32Array.from([8, NaN, NaN, 1]);
    const q = quantiseShared([a, b]);
    expect(q.metersPerUnit).toBeCloseTo(8 / 65535, 12);
    expect(q.values[1][0]).toBe(65535);
    expect(q.values[0][0]).toBe(0);
    expect(q.values[0][1]).toBe(0);
    expect(q.values[0][3] * q.metersPerUnit).toBeCloseTo(4, 3);
    expect(q.values[1][3] * q.metersPerUnit).toBeCloseTo(1, 3);
    expect(q.values[0].length).toBe(4);
  });
});

describe("resampleAffine (the set's depth under the cropped pack)", () => {
  it("equals resampleNearest for a plain size change, and reads the zoomed centre for a crop", () => {
    const W = 8, H = 4, z = Float32Array.from({ length: W * H }, (_, i) => i);
    const k = 2; // 4x2 output of the 8x4 map: output px -> source px (pixel centres)
    expect([...resampleAffine(z, W, H, 4, 2, [k, 0, 0.5 * k - 0.5, 0, k, 0.5 * k - 0.5])]).toEqual([...resampleNearest(z, W, H, 4, 2)]);
    // a 2x crop about the centre at the same size: the output corners read the middle of the map
    const c = (W - 1) / 2, cy = (H - 1) / 2;
    const out = resampleAffine(z, W, H, W, H, [0.5, 0, c - 0.5 * c, 0, 0.5, cy - 0.5 * cy]);
    expect(out[0]).toBe(z[Math.round(cy - 0.5 * cy) * W + Math.round(c - 0.5 * c)]);
    expect(out[W * H - 1]).toBe(z[Math.round(cy + 0.5 * cy) * W + Math.round(c + 0.5 * c)]);
  });
});
