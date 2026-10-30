/**
 * Lift a locked-off performance clip into a location's set: a performance pack (src/project/performance.ts) at
 * public/lab-assets/performances/<id>/. Local and free (no Comfy job). Steps, each cached in the work dir:
 *   frames   ffmpeg: the clip's frames at full size (capped at MAX_FRAMES)
 *   actors   (py) SAM 2.1 masks of the actors on the unstabilised frames: what the match keeps out (lib/lift-exclusion.ts)
 *   match    (py) ORB similarity frame 0 -> frame i, and the registration set still -> frame 0; the exclusion it used is
 *            recorded in lift.json
 *   stab     fit the creep (quadratic pinned at frame 0) and compose with the registration -> per-frame maps; crop to
 *            the centred set-aspect rectangle every frame covers (no stabilisation border), the camera's FOV narrowed
 *   warp     (py) every frame resampled from the full-size clip into that cropped projector camera at the pack size
 *   sam      (py) SAM 2.1 actor masks from the box (+ optional point) prompts on frame 0
 *   depth    (py) MoGe-2 per frame with the set's FOV fixed (and the legacy 960 median plate: --plate legacy)
 *   source1920  the same maps at 1920 wide, straight from the full-size frames -> src1920/ (the plate and finals read it)
 *   plate    (py lift_plate.py) the clean plate at 1920 from those frames: real single-frame pixels where the set is static
 *            (the temporal median averages sub-pixel jitter and was built at 960, then magnified ~3x on a long lens)
 *   pack     per-frame scale onto the set's metres (static background), actor clean-up, 16-bit planar depth, the
 *            plate's own depth (median of the scaled depth where clean: the set behind the performance, t29), pack
 *   encode   src1920/ -> <pack>/source1920.mp4 (finals)
 *
 *   npx tsx scripts/lift-performance.ts --clip <mp4> --location <loc id> --id <pack id> --label "<label>"
 *     (--prompt "<text>" | --prompt-json <json with "prompt">) --box x0,y0,x1,y1 [--box …] [--point x,y …]
 *     [--width 960] [--exclusion masks[:dilate]|boxes[:margin]] [--plate sharp|median|legacy] [--python <python with torch/transformers/moge>] [--work <dir>] [--redo]
 * Boxes and points are in PACK pixels (width x the set's aspect) on frame 0 BEFORE the crop (the clip's first frame
 * scaled to the pack width), one box per actor; the lift moves them into the cropped frame. See scripts/README.md.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { MAX_FRAMES } from "../src/project/performance.ts";
import { backgroundScale, cleanActors, dilate, frameMedian, quantiseShared, resampleAffine, smoothSeries } from "./lib/lift-depth.ts";
import {
  centreZoom, compose, coverScale, croppedFov, fitStabilisation, pixelScale, samplingMaps, toCroppedPx, type Affine, type RawMatch,
} from "./lib/lift-stabilise.ts";
import { SOURCE_1920, exclusionMatches, matchArg, parseExclusion, source1920Args, type ExclusionRecord } from "./lib/lift-exclusion.ts";
import { projectorCamera, readLocation, updateIndex, writePack } from "./lib/performance-pack.ts";
import { parsePlateMode, plateSize, plateWorkFile } from "./lib/lift-plate.ts";
import { cleanPixels, encodePlanar16, plateDepth } from "./lib/plate-depth.ts";
import { readPng } from "./lib/png.ts";

const APP = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(APP, "public");
const { values: a } = parseArgs({ options: {
  clip: { type: "string" }, location: { type: "string" }, id: { type: "string" }, label: { type: "string" },
  prompt: { type: "string" }, "prompt-json": { type: "string" }, box: { type: "string", multiple: true }, point: { type: "string", multiple: true },
  width: { type: "string", default: "960" }, exclusion: { type: "string" }, plate: { type: "string" }, python: { type: "string", default: process.env.LIFT_PYTHON ?? "python" },
  work: { type: "string" }, redo: { type: "boolean", default: false },
} });
const nums = (s: string, n: number, what: string) => {
  const v = s.split(",").map(Number);
  if (v.length !== n || !v.every(Number.isFinite)) throw new Error(`--${what} ${s}: expected ${n} numbers`);
  return v;
};
if (!a.clip || !a.location || !a.id || !a.label || !a.box?.length || !(a.prompt || a["prompt-json"])) {
  console.error("--clip --location --id --label --box (and --prompt or --prompt-json) are required");
  process.exit(2);
}
const boxes = a.box.map((b) => nums(b, 4, "box"));
const points = a.point?.map((p) => nums(p, 2, "point")) ?? null;
if (points && points.length !== boxes.length) throw new Error("give one --point per --box, or none");
const prompt = a.prompt ?? (JSON.parse(readFileSync(a["prompt-json"]!, "utf8")) as { prompt: string }).prompt;

const loc = readLocation(PUBLIC, a.location);
const SW = loc.shot.width, SH = loc.shot.height, aspect = SW / SH;
const W = Number(a.width), H = Math.round(W / aspect);
const WORK = a.work ?? path.join(tmpdir(), `lift-${a.id}`);
if (a.redo) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const py = (...args: string[]) => execFileSync(a.python!, ["-I", path.join(APP, "scripts", "lift_performance.py"), ...args], { stdio: "inherit" });
const step = (name: string, done: string, run: () => void) => {
  if (existsSync(path.join(WORK, done))) return console.log(`${name}: cached`);
  const t0 = Date.now();
  run();
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
};
const plateMode = parsePlateMode(a.plate);
const pyPlate = (...args: string[]) => execFileSync(a.python!, ["-I", path.join(APP, "scripts", "lift_plate.py"), ...args], { stdio: "inherit" });
const pad = (i: number) => String(i).padStart(3, "0");
const frameCount = () => readdirSync(path.join(WORK, "full")).filter((f) => /^f_\d+\.png$/.test(f)).length;

step("frames", "full/f_000.png", () => {
  mkdirSync(path.join(WORK, "full"), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a.clip!, "-frames:v", String(MAX_FRAMES), "-start_number", "0", path.join(WORK, "full", "f_%03d.png")]);
});
const fps = (() => {
  const r = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", a.clip!]).toString().trim();
  const [n, d] = r.split("/").map(Number);
  return d ? n / d : n;
})();

// what the background match keeps out: the actors' SAM masks (default; fighters can fill 60-67 % of the frame, where
// the old grown box covered ~90 % of it), or the legacy grown box. The masks come from the unstabilised frames.
const exclusion = parseExclusion(a.exclusion);
const matchExclusion = matchArg(exclusion, boxes, W, H);
if (exclusion.kind === "masks") {
  writeFileSync(path.join(WORK, "actors-prompts.json"), JSON.stringify({ boxes: boxes.map((b) => b.map(Math.round)), points: points?.map((p) => p.map(Math.round)) ?? null }));
  step("actors", `actors/mask_${pad(frameCount() - 1)}.png`, () => py("actors", WORK, path.join(WORK, "actors-prompts.json"), String(W), String(H)));
}
const matchFile = path.join(WORK, "match.json");
if (existsSync(matchFile) && !exclusionMatches((JSON.parse(readFileSync(matchFile, "utf8")) as { exclusion?: ExclusionRecord }).exclusion, matchExclusion)) {
  throw new Error(`the cached match in ${WORK} was made under another exclusion than ${matchExclusion}: rerun with --redo`);
}
step("match", "match.json", () => py("match", WORK, loc.still, matchExclusion));

const match = JSON.parse(readFileSync(path.join(WORK, "match.json"), "utf8")) as {
  frameSize: [number, number]; frames: RawMatch[]; register: { A: Affine | null; inliers: number }; exclusion: ExclusionRecord;
};
const [FW, FH] = match.frameSize;
if (Math.abs(FW / FH - aspect) > 0.01 * aspect) throw new Error(`clip ${FW}x${FH} does not have the set's aspect (${SW}x${SH})`);
if (!match.register.A || match.register.inliers < 200) {
  throw new Error(`frame 0 does not register to the set's still (${match.register.inliers} inliers): the clip was not shot from this location's camera`);
}
const stab = fitStabilisation(match.frames, match.frames.length, FW, FH);
// still px -> frame-0 px at the still's size, then to the frame's own size
const register = compose(pixelScale(FW / SW), match.register.A);
const uncropped = samplingMaps(stab, register);
// the crop every frame covers (Lanczos margin included): a centred zoom of the set's camera, so no frame has a black edge
const crop = coverScale(uncropped, SW, SH, FW, FH);
if (crop < 0.75) throw new Error(`the stabilised frames share only ${(crop * 100).toFixed(1)} % of the set's width: too much camera creep to lift`);
const Z = centreZoom(crop, SW, SH);
writeFileSync(path.join(WORK, "stab.json"), JSON.stringify({ stillSize: [SW, SH], crop, maps: uncropped.map((M) => compose(M, Z)) }));
console.log(`stab: creep to scale ${stab.endScale.toFixed(4)} by the last frame, residual ${stab.residualPx.toFixed(2)} px, ${stab.used} fits used; crop ${(crop * 100).toFixed(2)} %`);
step("warp", `stab/f_${pad(match.frames.length - 1)}.png`, () => py("warp", WORK, String(W), String(H)));
// every pixel of every frame must be covered (a stale uncropped warp in the work dir fails here: rerun with --redo)
for (let i = 0; i < match.frames.length; i++) {
  const v = readPng(path.join(WORK, "stab", `valid_${pad(i)}.png`));
  let bad = 0;
  for (let k = 0; k < W * H; k++) if (v.data[k * 4] <= v.maxValue / 2) bad++;
  if (bad) throw new Error(`frame ${i}: ${bad} px outside the clip after the crop (a stale warp in ${WORK}? rerun with --redo)`);
}
const cropped = (p: number[]) => toCroppedPx(p[0], p[1], crop, W, H);
writeFileSync(path.join(WORK, "prompts.json"), JSON.stringify({
  boxes: boxes.map((b) => [...cropped(b), ...cropped([b[2], b[3]])].map((v) => Math.round(v))),
  points: points?.map((p) => cropped(p).map((v) => Math.round(v))) ?? null,
}));
step("sam", `sam/mask_${pad(match.frames.length - 1)}.png`, () => py("sam", WORK, path.join(WORK, "prompts.json")));
// the pack's camera: the set's projector, field of view narrowed by the crop
const vfov = croppedFov(loc.shot.fovDeg, crop);
const fovX = (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;
step("depth", "depth.json", () => py("depth", WORK, fovX.toFixed(4)));

// the 1920 source (the same maps, one resample from the full frames): the plate and the finals both read it
const W2 = SOURCE_1920.width, H2 = Math.round(W2 / aspect);
step("source1920", `src1920/f_${pad(match.frames.length - 1)}.png`, () => py("warp", WORK, String(W2), String(H2), path.join(WORK, "src1920"), "direct"));
const plateFile = path.join(WORK, plateWorkFile(plateMode));
if (plateMode !== "legacy") step("plate", plateWorkFile(plateMode), () => pyPlate(WORK, plateFile, plateMode));
const plateSz = plateMode === "legacy" ? { width: W, height: H } : plateSize(aspect);

// ---- pack: depth onto the set's metres, actors cleaned -------------------------------------------------------------
const N = match.frames.length;
const zSet = resampleAffine(loc.depth, SW, SH, W, H, compose(Z, pixelScale(SW / W))); // pack px -> set still px
const grey = (f: string) => { const p = readPng(f); return Uint8Array.from({ length: W * H }, (_, i) => (p.data[i * 4] > p.maxValue / 2 ? 1 : 0)); };
const actors: Float32Array[] = [], masks: Uint8Array[] = [], scales: { scale: number; relResidual: number; n: number }[] = [];
const plateFrames: { z: Float32Array; scale: number; keep: Uint8Array }[] = [];
for (let i = 0; i < N; i++) {
  const buf = readFileSync(path.join(WORK, "depth", `z_${pad(i)}.f32`));
  const z = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const mask = grey(path.join(WORK, "sam", `mask_${pad(i)}.png`)), valid = grey(path.join(WORK, "stab", `valid_${pad(i)}.png`));
  const near = dilate(mask, W, H, 4);
  const keep = valid.map((v, k) => (v && !near[k] ? 1 : 0));
  const s = backgroundScale(z, zSet, keep, 3);
  if (!(s.scale > 0)) throw new Error(`frame ${i}: no clean background to fit the depth scale on`);
  scales.push(s);
  plateFrames.push({ z, scale: s.scale, keep: cleanPixels({ mask, valid }, W, H) });
  const c = cleanActors(z.map((v) => v * s.scale), zSet, mask, W, H);
  actors.push(c.depth);
  masks.push(c.mask);
}
const amed = actors.map(frameMedian);
let last = amed.find((m) => m > 0) ?? 0;
const sm = smoothSeries(amed.map((m) => (m > 0 ? (last = m) : last))); // a frame with no actor holds the previous value
for (let i = 0; i < N; i++) if (amed[i] > 0) { const k = sm[i] / amed[i]; actors[i] = actors[i].map((v) => v * k); }
const q = quantiseShared(actors);
// the set behind the actors: the plate's own depth, on the location's 16-bit scale (t29)
const plate = encodePlanar16(plateDepth(plateFrames, W, H), loc.metersPerUnit);
plateFrames.length = 0;
const meanAbsDiff = (v: number[]) => v.slice(1).reduce((s, x, i) => s + Math.abs(x - v[i]), 0) / Math.max(1, v.length - 1);

const dir = path.join(PUBLIC, "lab-assets", "performances", a.id);
const pack = writePack(dir, {
  id: a.id, label: a.label, locationId: a.location, fps, width: W, height: H, source: projectorCamera(vfov, aspect), prompt,
}, { color: Array.from({ length: N }, (_, i) => path.join(WORK, "stab", `f_${pad(i)}.png`)), depth: q.values, mask: masks, metersPerUnit: q.metersPerUnit },
plateFile, { values: plate.values, metersPerUnit: loc.metersPerUnit });
updateIndex(path.dirname(dir), pack.id);
// the finals' source: the 1920 frames above, encoded
execFileSync("ffmpeg", source1920Args(path.join(WORK, "src1920"), N, fps, path.join(dir, SOURCE_1920.file)));
const sc = scales.map((s) => s.scale).sort((x, y) => x - y);
writeFileSync(path.join(dir, "lift.json"), JSON.stringify({
  clip: path.basename(a.clip), location: a.location, madeAt: new Date().toISOString(), credits: 0,
  register: { A: match.register.A, inliers: match.register.inliers, note: "set-still px -> clip frame-0 px (cv2 2x3)" },
  exclusion: { ...match.exclusion, arg: matchExclusion, note: "what the background match kept out: SAM masks of the actors on the unstabilised frames, dilated (or a legacy grown box)" },
  source1920: { file: SOURCE_1920.file, width: W2, height: H2, note: "the stab.json maps resampled once from the full-size frames (warp direct), H.264 4:4:4 CRF 4" },
  stabilise: { coeffs: stab.coeffs, endScale: stab.endScale, residualPx: stab.residualPx, used: stab.used, model: "similarity, quadratic in time pinned at frame 0" },
  crop: { scale: crop, setVfovDeg: loc.shot.fovDeg, vfovDeg: vfov, note: "centred set-aspect rectangle every stabilised frame covers, resampled from the full-size clip to the pack size; the pack camera is the set projector with this vfov" },
  plate: { file: "background.png", ...plateSz, mode: plateMode, note: plateMode === "legacy"
    ? "per-pixel temporal median of the 960 stabilised frames (the pre-1920 rule)"
    : "built from the 1920 source frames (src1920): sharp = real single-frame pixels, frames ranked by typicality to the temporal median, filled where an actor stood from the next; median = the 1920 temporal median. Its depth stays at the pack size" },
  sam: { model: "facebook/sam2.1-hiera-small", boxes, points },
  depth: { model: "Ruicheng/moge-2-vitl-normal", fovXDeg: fovX, vfovDeg: vfov, fit: "per-frame scale = median(set / MoGe) over clean background",
    scale: { min: sc[0], median: sc[sc.length >> 1], max: sc[sc.length - 1] }, perFrame: scales,
    actorMedianM: amed, actorJitterM: { raw: meanAbsDiff(amed), smoothed: meanAbsDiff(sm) },
    plate: { file: pack.backgroundDepth?.file, rule: "per-pixel median of the scaled depth where the pixel is clean (the plate colour's rule)", clampedPx: plate.clamped } },
}, null, 1) + "\n");
console.log(`${pack.id}: ${pack.frames} f @ ${pack.fps} fps ${W}x${H}, depth mpu ${q.metersPerUnit.toExponential(3)}, ` +
  `bg scale ${sc[0].toFixed(3)}-${sc[sc.length - 1].toFixed(3)} (median ${sc[sc.length >> 1].toFixed(3)}), actor jitter ` +
  `${(meanAbsDiff(amed) * 100).toFixed(1)} -> ${(meanAbsDiff(sm) * 100).toFixed(1)} cm -> ${dir}`);
