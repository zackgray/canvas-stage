import { describe, expect, it } from "vitest";
import {
  affineOf, apply, centreZoom, compose, coverScale, croppedFov, fitStabilisation, IDENTITY, pinnedQuadratic, pixelScale, samplingMaps, similarityOf, toCroppedPx,
  type Affine, type RawMatch,
} from "../lift-stabilise.ts";

/** E29's creep: a zoom about the frame centre, t = (1 - s) * centre, growing quadratically to ~5 % over 97 frames */
const W = 1920, H = 1088, N = 97;
const zoomAt = (i: number): Affine => {
  const s = 1 + 0.0002 * i + 0.0000032 * i * i;
  return [s, 0, (1 - s) * (W / 2), 0, s, (1 - s) * (H / 2)];
};

describe("pinnedQuadratic", () => {
  it("recovers an exact quadratic through the pinned start", () => {
    const t = [1, 2, 3, 5, 8, 13];
    const [c1, c2] = pinnedQuadratic(t, t.map((u) => 2 + 0.5 * u - 0.25 * u * u), 2);
    expect(c1).toBeCloseTo(0.5, 10);
    expect(c2).toBeCloseTo(-0.25, 10);
  });

  it("falls back to a constant with too few samples", () => {
    expect(pinnedQuadratic([4], [9], 1)).toEqual([0, 0]);
  });
});

describe("fitStabilisation", () => {
  it("recovers a quadratic zoom creep exactly and is the identity at frame 0", () => {
    const raw: RawMatch[] = Array.from({ length: N }, (_, i) => ({ i, A: zoomAt(i), inliers: 400 }));
    const fit = fitStabilisation(raw, N, W, H);
    expect(fit.frames[0]).toEqual([1, 0, 0, 0]);
    for (const i of [10, 50, 96]) affineOf(fit.frames[i]).forEach((v, k) => expect(v).toBeCloseTo(zoomAt(i)[k], 6));
    expect(fit.endScale).toBeCloseTo(zoomAt(96)[0], 8);
    expect(fit.residualPx).toBeLessThan(1e-6);
    expect(fit.used).toBe(N - 1);
  });

  it("smooths per-frame jitter and skips failed or weak fits", () => {
    const raw: RawMatch[] = Array.from({ length: N }, (_, i) => {
      const A = zoomAt(i);
      const j = i % 2 ? 1.5 : -1.5; // ±1.5 px of translation noise
      return { i, A: i === 30 ? null : ([A[0], A[1], A[2] + j, A[3], A[4], A[5] - j] as Affine), inliers: i === 40 ? 3 : 400 };
    });
    const fit = fitStabilisation(raw, N, W, H);
    expect(fit.used).toBe(N - 3);
    expect(fit.residualPx).toBeGreaterThan(1.4);
    const [x, y] = apply(affineOf(fit.frames[60]), 100, 100), [tx, ty] = apply(zoomAt(60), 100, 100);
    expect(Math.hypot(x - tx, y - ty)).toBeLessThan(0.3);
  });
});

describe("affine helpers", () => {
  it("similarity <-> affine round-trips a rotation + zoom", () => {
    const s = 1.03, r = 0.02;
    const A: Affine = [s * Math.cos(r), -s * Math.sin(r), 4, s * Math.sin(r), s * Math.cos(r), -2];
    affineOf(similarityOf(A)).forEach((v, k) => expect(v).toBeCloseTo(A[k], 12));
  });

  it("composes B after A", () => {
    const A: Affine = [2, 0, 1, 0, 2, 0], B: Affine = [1, 0, 0, 0, 1, 5];
    expect(apply(compose(B, A), 3, 4)).toEqual([7, 13]);
    expect(compose(IDENTITY, A)).toEqual(A);
  });

  it("pixelScale maps pixel centres between sizes", () => {
    // pixel 0 of a 960-wide image covers [0, 2) of a 1920-wide one: its centre is at 0.5
    expect(apply(pixelScale(2), 0, 0)).toEqual([0.5, 0.5]);
    expect(apply(pixelScale(2), 959, 543)).toEqual([1918.5, 1086.5]);
  });

  it("sampling maps apply the registration first, then the frame's creep", () => {
    const raw: RawMatch[] = Array.from({ length: N }, (_, i) => ({ i, A: zoomAt(i), inliers: 400 }));
    const reg: Affine = [1, 0, 3, 0, 1, -1];
    const maps = samplingMaps(fitStabilisation(raw, N, W, H), reg);
    expect(maps[0]).toEqual(reg);
    const [x, y] = apply(maps[96], 10, 20), [ex, ey] = apply(zoomAt(96), 13, 19);
    expect(x).toBeCloseTo(ex, 6);
    expect(y).toBeCloseTo(ey, 6);
  });
});

describe("the border crop (no black edge in any frame)", () => {
  // the sampling maps of a stabilised zoom creep: set px -> frame-i px, the frame zoomed in by up to ~5 %
  const maps = Array.from({ length: N }, (_, i) => zoomAt(i));
  const inside = (M: Affine, s: number, margin: number) => [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [W / 2, 0], [0, H / 2]].every(([x, y]) => {
    const [fx, fy] = apply(compose(M, centreZoom(s, W, H)), x, y);
    return fx >= margin - 1e-6 && fx <= W - 1 - margin + 1e-6 && fy >= margin - 1e-6 && fy <= H - 1 - margin + 1e-6;
  });

  it("is the largest centred zoom every frame covers, with the resampling margin", () => {
    const s = coverScale(maps, W, H, W, H, 4);
    const end = zoomAt(N - 1)[0];
    expect(s).toBeLessThan(1 / end); // the most-zoomed frame needs at least 1/scale, plus the margin
    expect(s).toBeGreaterThan(1 / end - 0.01);
    for (const M of maps) expect(inside(M, s, 4)).toBe(true);
    expect(maps.some((M) => !inside(M, s + 1e-4, 4))).toBe(true);
  });

  it("is 1 when nothing crept and the margin is 0; shrinks for a margin; follows a shift too", () => {
    expect(coverScale([IDENTITY], W, H, W, H, 0)).toBe(1);
    expect(coverScale([IDENTITY], W, H, W, H, 4)).toBeCloseTo((H / 2 - 0.5 - 4) / (H / 2 - 0.5), 4); // the short side binds
    const shifted: Affine = [1, 0, 30, 0, 1, 0]; // frame content 30 px to the left: the right edge is short
    const s = coverScale([shifted], W, H, W, H, 0);
    expect(inside(shifted, s, 0)).toBe(true);
    expect(s).toBeCloseTo(1 - 60 / (W - 1), 4);
  });

  it("the zoom keeps the still's centre and the pack's camera narrows to match", () => {
    const Z = centreZoom(0.9, W, H);
    expect(apply(Z, (W - 1) / 2, (H - 1) / 2)).toEqual([(W - 1) / 2, (H - 1) / 2]);
    expect(apply(Z, 0, 0)[0]).toBeCloseTo(0.05 * (W - 1), 9);
    // a 50.38° vfov cropped to 94.19 % (the warehouse lift): tan(v'/2) = s · tan(v/2)
    const v = croppedFov(50.38, 0.9419);
    expect(Math.tan((v * Math.PI) / 360)).toBeCloseTo(0.9419 * Math.tan((50.38 * Math.PI) / 360), 12);
    expect(croppedFov(50.38, 1)).toBeCloseTo(50.38, 12);
  });

  it("a point of the uncropped frame lands where the cropped frame shows it (SAM prompts move with the crop)", () => {
    const w = 960, h = 544, s = 0.9419;
    // uncropped pack px -> set still px; cropped pack px -> zoomed still px -> set still px: the same set point
    const [cx, cy] = toCroppedPx(400, 300, s, w, h);
    const viaCrop = apply(compose(centreZoom(s, W, H), pixelScale(W / w)), cx, cy);
    const direct = apply(pixelScale(W / w), 400, 300);
    expect(viaCrop[0]).toBeCloseTo(direct[0], 6);
    expect(viaCrop[1]).toBeCloseTo(direct[1], 6);
    expect(toCroppedPx((w - 1) / 2, (h - 1) / 2, s, w, h)).toEqual([(w - 1) / 2, (h - 1) / 2]);
  });
});
