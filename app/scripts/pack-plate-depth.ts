/**
 * Backfill a performance pack lifted before t29 with its plate's own depth (background_depth.png + the manifest's
 * `backgroundDepth`), from the lift's cached work dir — no model runs, local and free. New lifts write it themselves
 * (lift-performance.ts). The work dir must be the one this pack was written from: its plate (background.png, or
 * plate1920-*.png for a 1920 plate) must be byte-identical to the pack's and its depth.json FOV must match lift.json's.
 *
 *   npx tsx scripts/pack-plate-depth.ts --id <pack id> --work <lift work dir>
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { writeGrey16 } from "../experiments/lib/png16.ts";
import { toPerformance } from "../src/project/performance.ts";
import { plateWorkCandidates } from "./lib/lift-plate.ts";
import { PLATE_DEPTH_FILE, readLocation } from "./lib/performance-pack.ts";
import { cleanPixels, encodePlanar16, plateDepth } from "./lib/plate-depth.ts";
import { readPng } from "./lib/png.ts";

const APP = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(APP, "public");
const { values: a } = parseArgs({ options: { id: { type: "string" }, work: { type: "string" } } });
if (!a.id || !a.work) { console.error("--id <pack id> --work <lift work dir>"); process.exit(2); }
const dir = path.join(PUBLIC, "lab-assets", "performances", a.id);
const pack = toPerformance(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")));
const lift = JSON.parse(readFileSync(path.join(dir, "lift.json"), "utf8")) as { depth: { fovXDeg: number; perFrame: { scale: number }[] } };
const depthJson = JSON.parse(readFileSync(path.join(a.work, "depth.json"), "utf8")) as { fovXDeg: number; size: [number, number] };
const packPlate = readFileSync(path.join(dir, pack.background));
if (!plateWorkCandidates().some((f) => existsSync(path.join(a.work!, f)) && readFileSync(path.join(a.work!, f)).equals(packPlate))) {
  throw new Error(`no plate in ${a.work} (${plateWorkCandidates().join(", ")}) is this pack's plate: not the work dir it was lifted from`);
}
if (Math.abs(depthJson.fovXDeg - lift.depth.fovXDeg) > 1e-3 || depthJson.size[0] !== pack.width || depthJson.size[1] !== pack.height) {
  throw new Error(`${a.work}/depth.json (${depthJson.fovXDeg}°, ${depthJson.size}) does not match the pack (${lift.depth.fovXDeg}°, ${pack.width}x${pack.height})`);
}
if (lift.depth.perFrame.length !== pack.frames) throw new Error(`lift.json has ${lift.depth.perFrame.length} scales for ${pack.frames} frames`);

const W = pack.width, H = pack.height;
const pad = (i: number) => String(i).padStart(3, "0");
const grey = (f: string) => { const p = readPng(f); return Uint8Array.from({ length: W * H }, (_, i) => (p.data[i * 4] > p.maxValue / 2 ? 1 : 0)); };
const frames = Array.from({ length: pack.frames }, (_, i) => {
  const buf = readFileSync(path.join(a.work!, "depth", `z_${pad(i)}.f32`));
  const z = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const keep = cleanPixels({ mask: grey(path.join(a.work!, "sam", `mask_${pad(i)}.png`)), valid: grey(path.join(a.work!, "stab", `valid_${pad(i)}.png`)) }, W, H);
  return { z, scale: lift.depth.perFrame[i].scale, keep };
});
const z = plateDepth(frames, W, H);
const loc = readLocation(PUBLIC, pack.locationId);
const enc = encodePlanar16(z, loc.metersPerUnit);
writeGrey16(path.join(dir, PLATE_DEPTH_FILE), W, H, enc.values);
const next = toPerformance({ ...pack, backgroundDepth: { file: PLATE_DEPTH_FILE, metersPerUnit: loc.metersPerUnit } });
const tmp = path.join(dir, "manifest.json.tmp");
writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
renameSync(tmp, path.join(dir, "manifest.json"));
const ok = z.filter((v) => v > 0);
const sorted = Float32Array.from(ok).sort();
console.log(`${a.id}: ${PLATE_DEPTH_FILE} ${W}x${H}, ${((1 - ok.length / z.length) * 100).toFixed(2)} % without depth, ` +
  `${sorted[0]?.toFixed(2)}–${sorted[sorted.length - 1]?.toFixed(2)} m (median ${sorted[sorted.length >> 1]?.toFixed(2)}), ${enc.clamped} px clamped at ${(65535 * loc.metersPerUnit).toFixed(2)} m`);
