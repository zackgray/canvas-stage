/**
 * Stabilisation maths for scripts/lift-performance.ts (pure). A generated "locked-off" clip still creeps (E29: a ~5 %
 * zoom about the centre over 4 s). Per frame, ORB + RANSAC (the Python helper) fits a similarity S_i taking frame-0
 * pixels to frame-i pixels; the noise is removed by fitting each parameter with a quadratic in time PINNED to the
 * identity at frame 0 (frame 0 is the camera we keep), and every frame is resampled through it.
 * A registration R (set-still pixels -> frame-0 pixels) puts frame 0 in the location's projector camera, so the frame-i
 * sampling map is S_i ∘ R: set pixel -> frame-i pixel (cv2.warpAffine with WARP_INVERSE_MAP).
 *
 * Affines are OpenCV 2x3 row-major [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f.
 * A similarity is [p, q, tx, ty] = [[p, -q, tx], [q, p, ty]] (scale = hypot(p, q), angle = atan2(q, p)).
 */

export type Affine = [number, number, number, number, number, number];
export type Similarity = [number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 0, 1, 0];
const IDENTITY_SIM: Similarity = [1, 0, 0, 0];

export interface RawMatch {
  /** frame index */
  i: number;
  /** cv2.estimateAffinePartial2D result (frame 0 -> frame i), or null when the fit failed */
  A: Affine | null;
  inliers: number;
}

export const similarityOf = (A: Affine): Similarity => [(A[0] + A[4]) / 2, (A[3] - A[1]) / 2, A[2], A[5]];
export const affineOf = ([p, q, tx, ty]: Similarity): Affine => [p, -q, tx, q, p, ty];

/** B ∘ A: apply A first, then B. */
export function compose(B: Affine, A: Affine): Affine {
  return [
    B[0] * A[0] + B[1] * A[3], B[0] * A[1] + B[1] * A[4], B[0] * A[2] + B[1] * A[5] + B[2],
    B[3] * A[0] + B[4] * A[3], B[3] * A[1] + B[4] * A[4], B[3] * A[2] + B[4] * A[5] + B[5],
  ];
}

export function apply(A: Affine, x: number, y: number): [number, number] {
  return [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
}

/** Pixel map between two sizes of the same image (OpenCV pixel centres): small px -> big px, k = big / small. */
export const pixelScale = (k: number): Affine => [k, 0, 0.5 * k - 0.5, 0, k, 0.5 * k - 0.5];

/**
 * Least squares y(t) = y0 + c1 t + c2 t² with y0 fixed (the curve passes through (0, y0)). Returns [c1, c2].
 * Fewer than two usable samples -> a constant.
 */
export function pinnedQuadratic(t: number[], y: number[], y0: number): [number, number] {
  let s11 = 0, s12 = 0, s22 = 0, b1 = 0, b2 = 0;
  for (let k = 0; k < t.length; k++) {
    const u = t[k], v = y[k] - y0;
    s11 += u * u; s12 += u ** 3; s22 += u ** 4; b1 += u * v; b2 += u * u * v;
  }
  const det = s11 * s22 - s12 * s12;
  if (t.length < 2 || !(Math.abs(det) > 1e-12)) return [0, 0];
  return [(b1 * s22 - b2 * s12) / det, (s11 * b2 - s12 * b1) / det];
}

export interface StabiliseFit {
  /** per parameter p, q, tx, ty: [c1, c2] of the pinned quadratic */
  coeffs: [number, number][];
  /** smoothed similarity per frame (frame 0 = identity) */
  frames: Similarity[];
  /** frames whose raw fit was used */
  used: number;
  /** RMS of raw - fit, in pixels at the frame corners (how much creep was noise) */
  residualPx: number;
  /** fitted scale at the last frame (1 = no zoom) */
  endScale: number;
}

/** Fit the creep over `n` frames from per-frame raw matches (only fits with >= minInliers inliers count). */
export function fitStabilisation(raw: RawMatch[], n: number, width: number, height: number, minInliers = 50): StabiliseFit {
  const ok = raw.filter((r) => r.i > 0 && r.A && r.inliers >= minInliers);
  const t = ok.map((r) => r.i);
  const sims = ok.map((r) => similarityOf(r.A!));
  const coeffs = [0, 1, 2, 3].map((k) => pinnedQuadratic(t, sims.map((s) => s[k]), IDENTITY_SIM[k]));
  const at = (i: number): Similarity => IDENTITY_SIM.map((y0, k) => y0 + coeffs[k][0] * i + coeffs[k][1] * i * i) as Similarity;
  const frames = Array.from({ length: n }, (_, i) => at(i));
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  let se = 0, m = 0;
  for (const [j, r] of ok.entries()) {
    const A = affineOf(sims[j]), F = affineOf(at(r.i));
    for (const [x, y] of corners) {
      const [ax, ay] = apply(A, x, y), [fx, fy] = apply(F, x, y);
      se += (ax - fx) ** 2 + (ay - fy) ** 2; m++;
    }
  }
  const last = frames[n - 1];
  return { coeffs: coeffs as [number, number][], frames, used: ok.length, residualPx: m ? Math.sqrt(se / m) : 0, endScale: Math.hypot(last[0], last[1]) };
}

/** Per frame: set pixel -> frame-i pixel (the frame's similarity after the registration). */
export function samplingMaps(fit: StabiliseFit, register: Affine): Affine[] {
  return fit.frames.map((s) => compose(affineOf(s), register));
}

/**
 * The crop that removes the stabilisation border. Undoing the creep leaves every frame short of the set's edges (black
 * where frame i does not reach); the pack keeps only the centred rectangle, at the set's aspect, that EVERY frame covers,
 * scaled back to the pack size. A centred zoom keeps the projector's pose and principal point, so the pack's camera is
 * the set's with a narrower field of view (croppedFov): its pixels still register to the set.
 *
 * Zoom about the still's centre: output still px -> set still px (scale s <= 1 crops in).
 */
export function centreZoom(s: number, w: number, h: number): Affine {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  return [s, 0, cx - s * cx, 0, s, cy - s * cy];
}

/**
 * Largest s in (0, 1] whose centred zoom keeps the whole still (sw x sh pixel centres) inside every frame (fw x fh) —
 * `margin` frame pixels in from its edges, so the resampling kernel (Lanczos-4 reads 4 px out) never touches the border —
 * through each frame's sampling map (set px -> frame px). The covered region is convex and the rectangle is centred,
 * so the corners decide and a smaller zoom of a valid one is valid: bisection. 0 = even the centre is outside a frame.
 */
export function coverScale(maps: Affine[], sw: number, sh: number, fw: number, fh: number, margin = 4): number {
  const corners = [[0, 0], [sw - 1, 0], [0, sh - 1], [sw - 1, sh - 1]];
  const ok = (s: number) => {
    const Z = centreZoom(s, sw, sh);
    return maps.every((M) => corners.every(([x, y]) => {
      const [fx, fy] = apply(compose(M, Z), x, y);
      return fx >= margin && fx <= fw - 1 - margin && fy >= margin && fy <= fh - 1 - margin;
    }));
  };
  if (ok(1)) return 1;
  if (!ok(1e-6)) return 0;
  let lo = 1e-6, hi = 1;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

/** A field of view (degrees, either axis) after a centred crop to `s` of the frame's size. */
export const croppedFov = (fovDeg: number, s: number) => (2 * Math.atan(s * Math.tan((fovDeg * Math.PI) / 360)) * 180) / Math.PI;

/** A point in uncropped pack pixels (w x h) -> the same point in the cropped pack (centred zoom by s, scaled back). */
export function toCroppedPx(x: number, y: number, s: number, w: number, h: number): [number, number] {
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  return [cx + (x - cx) / s, cy + (y - cy) / s];
}
