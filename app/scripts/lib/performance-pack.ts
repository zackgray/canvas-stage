/**
 * Writing a performance pack (src/project/performance.ts is the format) and reading a location as the lift needs it.
 * Server-side helpers for scripts/lift-performance.ts.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PerspectiveCamera, Vector3 } from "three";
import { writeGrey16 } from "../../experiments/lib/png16.ts";
import type { LocationShot } from "../../server/location/types.ts";
import { framePath, toPerformance, type PerformancePack } from "../../src/project/performance.ts";
import { readPng } from "./png.ts";

/** The projection lab's projector pose for every set (src/labs/projection/engine/Stage.ts PROJECTOR_POSITION/TARGET). */
export const PROJECTOR_POSITION: [number, number, number] = [0, 1.6, 0];
export const PROJECTOR_TARGET: [number, number, number] = [0, 1.0, -8];

/** The location's projector camera as a pack `source` (three.js lookAt, so it is exactly the lab's quaternion). */
export function projectorCamera(vfovDeg: number, aspect: number): PerformancePack["source"] {
  const cam = new PerspectiveCamera(vfovDeg, aspect);
  cam.position.fromArray(PROJECTOR_POSITION);
  cam.lookAt(new Vector3(...PROJECTOR_TARGET));
  const q = cam.quaternion;
  return { vfovDeg, aspect, position: [...PROJECTOR_POSITION], quaternion: [q.x, q.y, q.z, q.w] };
}

export interface Location {
  shot: LocationShot;
  still: string;
  /** the set's planar metres at the still's size, NaN = sky / invalid */
  depth: Float32Array;
  /** the 16-bit metric depth's metres per unit (a plate depth uses it too, so the lab's depth settings map both alike) */
  metersPerUnit: number;
}

export function readLocation(publicDir: string, id: string): Location {
  const manifest = path.join(publicDir, "lab-assets", "locations", "manifest.json");
  const shots = (JSON.parse(readFileSync(manifest, "utf8")).shots ?? []) as LocationShot[];
  const shot = shots.find((s) => s.id === id);
  if (!shot) throw new Error(`location ${id} is not in ${manifest}`);
  const d = shot.depths.find((x) => x.metric && x.convention === "near-dark" && x.bitDepth === 16);
  if (!d) throw new Error(`location ${id} has no 16-bit metric depth`);
  const png = readPng(path.join(publicDir, d.path));
  if (png.bitDepth !== 16 || png.width !== shot.width || png.height !== shot.height) throw new Error(`${d.path}: not a 16-bit ${shot.width}x${shot.height} depth`);
  const depth = new Float32Array(png.width * png.height);
  for (let i = 0; i < depth.length; i++) depth[i] = png.data[i * 4] > 0 ? png.data[i * 4] * d.metersPerUnit : NaN;
  return { shot, still: path.join(publicDir, shot.image), depth, metersPerUnit: d.metersPerUnit };
}

/** 8-bit grey PNG, 0/1 mask -> 0/255. */
export function writeMask(file: string, w: number, h: number, mask: Uint8Array): void {
  const png = new PNG({ width: w, height: h, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 });
  png.data = Buffer.from(mask.map((v) => (v ? 255 : 0)));
  writeFileSync(file, PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 }));
}

export interface PackFrames {
  /** colour PNG per frame (copied as-is) */
  color: string[];
  depth: Uint16Array[];
  mask: Uint8Array[];
  metersPerUnit: number;
}

/** The plate's 16-bit planar depth (scripts/lib/plate-depth.ts), written as background_depth.png. */
export interface PlateDepth { values: Uint16Array; metersPerUnit: number }
export const PLATE_DEPTH_FILE = "background_depth.png";

/** Write the whole pack; the manifest is shape-checked by the shared parser and written last. Returns it. */
export function writePack(dir: string, meta: Omit<PerformancePack, "frames" | "depth" | "files" | "sourceClip" | "background" | "backgroundDepth">,
  f: PackFrames, background: string, plate?: PlateDepth): PerformancePack {
  const pack = toPerformance({
    ...meta, frames: f.color.length, depth: { encoding: "planar-metres-16bit", metersPerUnit: f.metersPerUnit },
    files: { color: "frames/color_%03d.png", depth: "frames/depth_%03d.png", mask: "frames/mask_%03d.png" },
    sourceClip: "source.mp4", background: "background.png",
    ...(plate ? { backgroundDepth: { file: PLATE_DEPTH_FILE, metersPerUnit: plate.metersPerUnit } } : {}),
  });
  mkdirSync(path.join(dir, "frames"), { recursive: true });
  const { width: w, height: h } = pack;
  for (let i = 0; i < pack.frames; i++) {
    copyFileSync(f.color[i], path.join(dir, framePath(pack.files.color, i)));
    writeGrey16(path.join(dir, framePath(pack.files.depth, i)), w, h, f.depth[i]);
    writeMask(path.join(dir, framePath(pack.files.mask, i)), w, h, f.mask[i]);
  }
  copyFileSync(background, path.join(dir, pack.background));
  if (plate && pack.backgroundDepth) writeGrey16(path.join(dir, pack.backgroundDepth.file), w, h, plate.values);
  // CrossView's reference clip: E29's encoding (H.264 4:4:4, CRF 4) of the stabilised colour
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(pack.fps), "-start_number", "0", "-i", path.join(dir, "frames", "color_%03d.png"),
    "-frames:v", String(pack.frames), "-c:v", "libx264", "-crf", "4", "-pix_fmt", "yuv444p", "-r", String(pack.fps), path.join(dir, pack.sourceClip)]);
  const tmp = path.join(dir, "manifest.json.tmp");
  writeFileSync(tmp, JSON.stringify(pack, null, 2) + "\n");
  renameSync(tmp, path.join(dir, "manifest.json")); // last: a pack with a manifest has all its files
  return pack;
}

/**
 * performances/index.json: the pack ids the lab lists (a static server cannot list a folder). Adds `id` and drops ids
 * whose manifest is gone; sorted, written atomically.
 */
export function updateIndex(performancesDir: string, id: string): string[] {
  const file = path.join(performancesDir, "index.json");
  let ids: string[] = [];
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(v) ? v : (v as { performances?: unknown } | null)?.performances;
    if (Array.isArray(list)) ids = list.filter((x): x is string => typeof x === "string");
  } catch { /* no index yet */ }
  const next = [...new Set([...ids, id])].filter((x) => existsSync(path.join(performancesDir, x, "manifest.json"))).sort();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ performances: next }, null, 2) + "\n");
  renameSync(tmp, file);
  return next;
}
