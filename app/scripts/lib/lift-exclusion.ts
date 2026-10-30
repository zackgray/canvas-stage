/**
 * What the lift keeps out of the background match, and the record of it. Close framings put the fighters at 60-67 % of
 * the frame's height; a box grown by half (the old rule) then covers ~90 % of the frame and the registration fails (8
 * inliers vs 200). The default now is the actors' own SAM masks (scripts/lift_performance.py `actors`), dilated a little.
 * The legacy grown box stays selectable (--exclusion boxes[:margin]) to reproduce an old pack.
 */

export const DEFAULT_MASK_DILATE = 0.0125; // fraction of the frame width (24 px at 1920)
export const LEGACY_BOX_MARGIN = 0.5;

export type ExclusionSpec =
  | { kind: "masks"; dilate: number }
  | { kind: "boxes"; margin: number };

export interface ExclusionRecord {
  kind: "masks" | "box";
  spec: string;
  frameSize?: [number, number];
  excludedFraction?: { frame0: number; pairMin: number; pairMax: number; pairMean: number };
  dilateFractionOfWidth?: number;
  dilatePx?: number;
}

/** "masks", "masks:0.02", "boxes", "boxes:0.1" */
export function parseExclusion(s: string | undefined): ExclusionSpec {
  const [kind, arg] = (s ?? "masks").split(":");
  const n = arg === undefined ? undefined : Number(arg);
  if (n !== undefined && !(Number.isFinite(n) && n >= 0 && n < 1)) throw new Error(`--exclusion ${s}: the number must be in [0, 1)`);
  if (kind === "masks") return { kind, dilate: n ?? DEFAULT_MASK_DILATE };
  if (kind === "boxes") return { kind, margin: n ?? LEGACY_BOX_MARGIN };
  throw new Error(`--exclusion ${s}: expected masks[:dilate] or boxes[:margin]`);
}

/** The union of the boxes grown by `margin` of their size per side, as fractions of the pack frame (x0,y0,x1,y1). */
export function grownBoxRect(boxes: number[][], margin: number, W: number, H: number): number[] {
  const ux0 = Math.min(...boxes.map((b) => b[0])), uy0 = Math.min(...boxes.map((b) => b[1]));
  const ux1 = Math.max(...boxes.map((b) => b[2])), uy1 = Math.max(...boxes.map((b) => b[3]));
  const gx = (ux1 - ux0) * margin, gy = (uy1 - uy0) * margin;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return [c((ux0 - gx) / W), c((uy0 - gy) / H), c((ux1 + gx) / W), c((uy1 + gy) / H)].map((v) => Number(v.toFixed(4)));
}

/** The `match` step's exclusion argument. */
export function matchArg(spec: ExclusionSpec, boxes: number[][], W: number, H: number): string {
  return spec.kind === "masks" ? `masks:${spec.dilate}` : `box:${grownBoxRect(boxes, spec.margin, W, H).join(",")}`;
}

/** A cached match.json made under another exclusion must not be reused silently. */
export function exclusionMatches(cached: ExclusionRecord | undefined, arg: string): boolean {
  if (!cached) return false;
  return `${cached.kind}:${cached.spec}` === arg;
}

/** The `ffmpeg` arguments that encode the 1920 source beside the pack's 960 one (same codec as source.mp4). */
export function source1920Args(framesDir: string, frames: number, fps: number, out: string): string[] {
  return ["-v", "error", "-y", "-framerate", String(fps), "-start_number", "0", "-i", `${framesDir}/f_%03d.png`,
    "-frames:v", String(frames), "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv444p", "-r", String(fps), out];
}

export const SOURCE_1920 = { file: "source1920.mp4", width: 1920 } as const;
