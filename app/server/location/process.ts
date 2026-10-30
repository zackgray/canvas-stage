/**
 * The offline half of picking a master, pure: MoGe-2's raw outputs on the still -> metric depth in the projection
 * lab's MoGe format -> a manifest shot. Same code path as E2 (experiments/e2-process.ts), no new conventions:
 *   metres = 1 / (a·e + b), a, b fitted per image against MoGe's point-map GLB (server/settle/moge.ts fitInverse);
 *   NaN where MoGe's valid mask < 0.5 (sky); quantised by quantiseMetres to 16-bit LINEAR near-dark, 0 = invalid,
 *   metersPerUnit = max / 65535 — what the lab's metric passthrough (manifest `metric: true`) reads back.
 * The lens: MoGe's own vertical FOV (MoGeGeometryToFOV), as E2; the GLB-implied FOV only when the text is missing.
 */
import { fitInverse, mogeMetres, quantiseMetres, type InverseFit, type MogeRender } from '../settle/moge.ts'
import type { Framing, LocationShot } from './types.ts'

export const DEPTH_MODEL = 'moge-2-vitl'
export const MANIFEST_NOTE = 'Locations made in the projection lab (server/location). fovDeg = MoGe-2 vertical FOV, degrees. ' +
  'Metric depths: linear metres = value * metersPerUnit, near-dark, 0 = invalid / sky.'

export interface MogeOutputs {
  render: MogeRender
  /** MoGe's valid mask, 0..1 per pixel (0 = sky / invalid) */
  valid: ArrayLike<number>
  points: { positions: Float32Array; uvs: Float32Array }
  /** MoGeGeometryToFOV's text output, if it came back */
  vfovText: string | null
}

export interface MetricDepth {
  values: Uint16Array
  metersPerUnit: number
  fit: InverseFit
  /** the projector's vertical FOV for this still, degrees, rounded to 0.01 like E2 */
  vfovDeg: number
  vfovFrom: 'moge' | 'point map'
  /** fraction of the frame with depth */
  validFraction: number
}

export function parseVfov(text: string | null): number | null {
  const v = Number((text ?? '').trim())
  return text !== null && Number.isFinite(v) && v > 0 && v < 180 ? v : null
}

export function metricDepth(m: MogeOutputs): MetricDepth {
  const fit = fitInverse(m.points.positions, m.points.uvs, m.render)
  const z = mogeMetres(m.render, fit, m.valid)
  const q = quantiseMetres(z)
  let n = 0
  for (const v of q.values) if (v > 0) n++
  const moge = parseVfov(m.vfovText)
  const vfov = moge ?? fit.vfovDeg
  return { values: q.values, metersPerUnit: q.metersPerUnit, fit, vfovDeg: Math.round(vfov * 100) / 100,
    vfovFrom: moge !== null ? 'moge' : 'point map', validFraction: n / q.values.length }
}

/**
 * Sanity bounds before a depth map becomes a set. E2's three MoGe fits: R² 0.99994-0.99998, vfov 32.1-40.8°,
 * MoGeGeometryToFOV and the point map within 0.1° of each other. A broken output fails at least one of these.
 */
export const GATE = { minR2: 0.99, minVfov: 10, maxVfov: 120, maxVfovGap: 3, minValid: 0.05 } as const

/** Why this depth must not become a set, or null when it is sane. */
export function refuseDepth(d: MetricDepth): string | null {
  const why: string[] = []
  if (!(d.fit.r2 >= GATE.minR2)) why.push(`MoGe depth does not match its own point map (R² ${d.fit.r2.toFixed(4)} < ${GATE.minR2})`)
  if (!(d.vfovDeg >= GATE.minVfov && d.vfovDeg <= GATE.maxVfov)) why.push(`vertical FOV ${d.vfovDeg}° outside ${GATE.minVfov}-${GATE.maxVfov}°`)
  if (d.vfovFrom === 'moge' && !(Math.abs(d.vfovDeg - d.fit.vfovDeg) <= GATE.maxVfovGap)) {
    why.push(`MoGe FOV ${d.vfovDeg}° disagrees with its point map (${d.fit.vfovDeg.toFixed(2)}°)`)
  }
  if (!(d.validFraction >= GATE.minValid)) why.push(`only ${(d.validFraction * 100).toFixed(1)} % of the frame has depth`)
  return why.length ? why.join('; ') : null
}

export interface ShotInput {
  id: string
  width: number
  height: number
  prompt: string
  seed: number
  description: string
  framing: Framing
  batch: string
  candidate: number
  depth: Pick<MetricDepth, 'metersPerUnit' | 'vfovDeg'>
}

/** URLs of a location's files, relative to the site root. */
export const locationUrls = (id: string) => ({
  image: `/lab-assets/locations/${id}/still.png`,
  depth: `/lab-assets/locations/${id}/depth-moge-2.png`,
  valid: `/lab-assets/locations/${id}/valid-moge-2.png`,
})

/** The manifest shot, shaped like experiments/e2/manifest.json's MoGe entries (shot- and entry-level fovDeg). */
export function locationShot(s: ShotInput): LocationShot {
  const u = locationUrls(s.id)
  return {
    id: s.id, image: u.image, width: s.width, height: s.height, prompt: s.prompt, seed: s.seed,
    fovDeg: s.depth.vfovDeg, metric: true, skyMask: u.valid,
    depths: [{
      model: DEPTH_MODEL, path: u.depth, convention: 'near-dark', bitDepth: 16, metersPerUnit: s.depth.metersPerUnit,
      metric: true, fovDeg: s.depth.vfovDeg, note: 'linear metres, 0 = sky/invalid',
    }],
    description: s.description, framing: s.framing, batch: s.batch, candidate: s.candidate,
  }
}

/** The manifest with `shot` appended (or replacing a shot of the same id); keeps any other fields. */
export function withShot(manifest: unknown, shot: LocationShot): { note: string; shots: unknown[] } {
  const m = manifest && typeof manifest === 'object' ? (manifest as { shots?: unknown }) : {}
  const shots = Array.isArray(m.shots) ? m.shots.filter((s) => (s as { id?: unknown })?.id !== shot.id) : []
  return { ...(m as object), note: MANIFEST_NOTE, shots: [...shots, shot] }
}
