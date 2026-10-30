/**
 * The committed stage car (O-01): the E24 stage-ready car decimated to a size the browser and the guide export can afford.
 *   npx tsx scripts/decimate-car.ts [targetTriangles=80000] [sourceBase=public/lab-assets/experiments/e24/car-a]
 * In (gitignored, made by experiments/e24_car.ts from the E9 TripoSplat mesh): public/lab-assets/experiments/e24/car-a.bin/.json
 * — already metres, levelled, scaled, tyre contacts at y = 0, X/Z centred; that frame is kept as is.
 * Out (tracked): public/assets/car/car-a.bin (Float32 positions, Float32 normals, Float32 linear vertex colours, Uint32
 * indices) + car-a.json (the carAsset.ts layout, with `normals` so the browser does not compute them).
 * Quadric decimation with meshoptimizer's simplifier (MIT), vertex colours as a weighted attribute so the paint edges hold.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";

const APP = resolve(import.meta.dirname, "..");
const SRC = resolve(process.argv[3] ?? join(APP, "public", "lab-assets", "experiments", "e24", "car-a"));
const OUT = join(APP, "public", "assets", "car");
const TARGET_TRIANGLES = Number(process.argv[2] ?? 80_000);
/** Colour error counts against geometric error at this weight (colours are 0..1, the error is relative to the car's size). */
const COLOR_WEIGHT = 0.5;

const meta = JSON.parse(readFileSync(`${SRC}.json`, "utf8"));
const raw = readFileSync(`${SRC}.bin`);
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const at = <T>(k: string, make: (b: ArrayBuffer, o: number, c: number) => T): T => {
  const [off, bytes] = meta.layout[k];
  return make(buf, off, bytes / 4);
};
const P = at("positions", (b, o, c) => new Float32Array(b, o, c));
const C = at("colors", (b, o, c) => new Float32Array(b, o, c));
const I = at("indices", (b, o, c) => new Uint32Array(b, o, c));

await MeshoptSimplifier.ready;
const t0 = performance.now();
const [simplified, relError] = MeshoptSimplifier.simplifyWithAttributes(
  I, P, 3, C, 3, [COLOR_WEIGHT, COLOR_WEIGHT, COLOR_WEIGHT], null, TARGET_TRIANGLES * 3, 0.05, ["Prune"],
);
const [remap, n] = MeshoptSimplifier.compactMesh(simplified);
const ms = Math.round(performance.now() - t0);

// compactMesh renumbered `simplified` in place; remap[old] = new (0xffffffff = dropped)
const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
for (let v = 0; v < remap.length; v++) {
  const w = remap[v];
  if (w === 0xffffffff) continue;
  for (let k = 0; k < 3; k++) { pos[w * 3 + k] = P[v * 3 + k]; col[w * 3 + k] = C[v * 3 + k]; }
}
const idx = simplified;

// Area-weighted vertex normals, as three's computeVertexNormals makes them.
const nor = new Float32Array(n * 3);
for (let t = 0; t < idx.length; t += 3) {
  const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
  const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
  const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
  const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nor[v + k] += f[k];
}
for (let v = 0; v < n * 3; v += 3) {
  const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]) || 1;
  for (let k = 0; k < 3; k++) nor[v + k] /= l;
}

const bbox = (p: Float32Array) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
  return { mn, mx };
};
const b = bbox(pos);
const bytes = n * 12;

mkdirSync(OUT, { recursive: true });
const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(col.buffer), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength)]);
writeFileSync(join(OUT, "car-a.bin"), bin);
const out = {
  source: `experiments/e24/car-a (${meta.vertices} vertices, ${meta.triangles} triangles) <- ${meta.source}`,
  vertices: n,
  triangles: idx.length / 3,
  layout: { positions: [0, bytes], normals: [bytes, bytes], colors: [bytes * 2, bytes], indices: [bytes * 3, idx.byteLength] },
  colorSpace: meta.colorSpace,
  frame: meta.frame,
  decimation: {
    tool: "meshoptimizer simplifyWithAttributes (quadric, MIT)",
    targetTriangles: TARGET_TRIANGLES,
    colorWeight: COLOR_WEIGHT,
    flags: ["Prune"],
    errorM: +(relError * MeshoptSimplifier.getScale(P, 3)).toFixed(4),
  },
  levelling: meta.levelling,
  scale: meta.scale,
  scaleZ: meta.scaleZ,
  sizeM: b.mx.map((v, k) => +(v - b.mn[k]).toFixed(3)),
  bbox: b,
};
writeFileSync(join(OUT, "car-a.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ ...out, bbox: undefined, levelling: undefined, bytes: bin.byteLength, ms }, null, 1));
