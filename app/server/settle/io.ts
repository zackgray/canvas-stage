/**
 * Files of a settle turn. In: a lab view export (public/lab-assets/renders/<view>/{color,mask,depth}.png + meta.json).
 * Raw Cloud outputs land in <view>/settled-<model>/raw/ (kept: they were paid for). Out, in <view>/settled-<model>/,
 * exactly what the lab's loadSettledView reads:
 *   color.png  the filled view (outside the hole mask: the export, bit for bit)
 *   depth.png  16-bit grey, LINEAR metres (value * metersPerUnit), near-dark, 0 = invalid; aligned and snapped
 *   mask.png   the hole mask it was filled from (white = hole)
 *   meta.json  camera (world pose, vfov, aspect), metersPerUnit, alignment fit + residuals, the view's source (its
 *              depth model sets the gate's scale bound when the lab re-checks the fit on load)
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readPng } from '../../scripts/lib/png.ts'
import { readExr } from '../../experiments/lib/exr.ts'
import { attribute, readGlb } from '../../experiments/lib/glb.ts'
import { writeGrey16 } from '../../experiments/lib/png16.ts'
import { quantiseMetres } from './moge.ts'
import type { SettleInputs, SettleResult } from './process.ts'

export interface ViewMeta {
  source?: string
  width: number
  height: number
  depth: { near: number; far: number }
  camera: { position: number[]; quaternion: number[]; vfovDeg: number; aspect: number }
}

export const RAW = { filled: 'filled.png', depth: 'depth.exr', valid: 'valid.png', points: 'points.glb' } as const

export async function readViewMeta(viewDir: string): Promise<ViewMeta> {
  for (const f of ['color.png', 'mask.png', 'depth.png', 'meta.json']) {
    if (!existsSync(path.join(viewDir, f))) throw Object.assign(new Error(`export has no ${f}`), { status: 400 })
  }
  const m = JSON.parse(await readFile(path.join(viewDir, 'meta.json'), 'utf8')) as ViewMeta
  if (!(m.width > 0) || !(m.height > 0) || !m.camera || !(m.depth?.near > 0) || !(m.depth?.far > m.depth.near)) {
    throw Object.assign(new Error('export meta.json lacks size, camera or depth range'), { status: 400 })
  }
  return m
}

/** The export's own depth (raw 16-bit) and hole mask (white = hole), checked against its meta size. */
export function readViewRasters(viewDir: string, m: ViewMeta): { refRaw: Uint16Array; holes: Uint8Array } {
  const N = m.width * m.height
  const d = readPng(path.join(viewDir, 'depth.png'))
  const k = readPng(path.join(viewDir, 'mask.png'))
  if (d.width * d.height !== N || k.width * k.height !== N) throw new Error('export depth/mask size differs from meta')
  if (d.bitDepth !== 16) throw new Error('export depth.png must be 16-bit')
  const refRaw = new Uint16Array(N)
  const holes = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    refRaw[i] = d.data[i * 4]
    holes[i] = k.data[i * 4] / k.maxValue >= 0.5 ? 1 : 0
  }
  return { refRaw, holes }
}

/** MoGe's raw outputs as SettleInputs fields; checks the filled view kept the export's size. */
export function readRaw(rawDir: string, m: ViewMeta): Pick<SettleInputs, 'moge' | 'mogeValid' | 'points'> {
  const filled = readPng(path.join(rawDir, RAW.filled))
  if (filled.width !== m.width || filled.height !== m.height) throw new Error(`filled view ${filled.width}x${filled.height}, export ${m.width}x${m.height}`)
  const moge = readExr(path.join(rawDir, RAW.depth))
  const v = readPng(path.join(rawDir, RAW.valid))
  const valid = new Float32Array(v.width * v.height)
  for (let i = 0; i < valid.length; i++) valid[i] = v.data[i * 4] / v.maxValue
  return { moge, mogeValid: valid, points: readPoints(path.join(rawDir, RAW.points)) }
}

/** Vertex positions and uvs of MoGe's point-map GLB (the fit input for moge.ts fitInverse). */
export function readPoints(glbPath: string): { positions: Float32Array; uvs: Float32Array } {
  const g = readGlb(glbPath)
  const pos = attribute(g, 'POSITION'), uv = attribute(g, 'TEXCOORD_0')
  if (!pos || !uv) throw new Error(`${glbPath}: no POSITION/TEXCOORD_0`)
  return { positions: pos.data as Float32Array, uvs: uv.data as Float32Array }
}

const pick = (a: { rmse: number; medianRel: number; p90Rel: number; n: number }) =>
  ({ n: a.n, rmse: a.rmse, medianRel: a.medianRel, p90Rel: a.p90Rel })

export async function writeSettled(
  outDir: string, viewDir: string, rawDir: string, view: string, model: string, m: ViewMeta, r: SettleResult,
  extra: Record<string, unknown>,
): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await rm(path.join(outDir, 'meta.json'), { force: true }) // a re-settle: the old folder stops loading first
  const q = quantiseMetres(r.depth)
  writeGrey16(path.join(outDir, 'depth.png'), m.width, m.height, q.values)
  await copyFile(path.join(viewDir, 'mask.png'), path.join(outDir, 'mask.png'))
  await copyFile(path.join(rawDir, RAW.filled), path.join(outDir, 'color.png'))
  const a = r.alignment
  // meta.json last: the loader keys on it, so a half-written folder never looks like a settled view
  await writeFile(path.join(outDir, 'meta.json'), JSON.stringify({
    kind: 'settled view', view, source: m.source, inpaint: model, width: m.width, height: m.height, camera: m.camera,
    depth: { encoding: '16-bit linear metres, near-dark, 0 = invalid', metersPerUnit: q.metersPerUnit },
    mogeFit: r.fit,
    alignment: {
      applied: r.applied, scale: a.scale, shift: a.shift, rmse: a.rmse,
      scaleOnly: { ...pick(r.scaleOnly), scale: r.scaleOnly.scale, all: pick(r.scaleOnly.all) },
      withShift: { ...pick(r.withShift), scale: r.withShift.scale, shift: r.withShift.shift, all: pick(r.withShift.all) },
    },
    holes: { before: r.holesBefore, after: r.holesAfter, sky: r.skyFraction, note: 'fractions of the frame; sky = MoGe-empty pixels connected to the top edge' },
    ...extra,
  }, null, 2) + '\n')
}
