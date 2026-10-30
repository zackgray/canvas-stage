/** Layout-To-Render: ids, labels, paths and the price. Pure apart from path joins. */
import path from 'node:path'
import { shotPaths } from '../../src/shared/shotContract.ts'

/** An Error carrying the HTTP status (and optional code) the plugin answers with. */
export const httpError = (status: number, message: string, code?: string) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) })

export const L2R_KEY = 'l2r'
export const L2R_W = 1920
export const L2R_H = 1088
export const L2R_FPS = 24
export const DEFAULT_SEED = 42
export const MIN_FRAMES = 9
export const MAX_FRAMES = 289
/** the finish's grain (tune/settings.ts GRAIN_STD.standard) */
export const GRAIN_STD = 2.4

export const TAKE_RE = /^take-[\w-]{1,80}$/
export const RENDER_RE = /^l2r-[\w-]{1,80}$/
export const STILL_RE = /^[\w-]{1,100}$/

export const is8k1 = (n: number) => Number.isInteger(n) && n >= MIN_FRAMES && n <= MAX_FRAMES && (n - 1) % 8 === 0

/** `l2r take-… l2r-…`: the runner's label, how its records are found again (running, recover) */
export const l2rLabel = (takeId: string, renderId: string) => `l2r ${takeId} ${renderId}`
export const isL2RLabel = (label: string) => /^l2r take-[\w-]+ l2r-[\w-]+$/.test(label)
export function labelParts(label: string): { takeId: string; renderId: string } | null {
  const m = /^l2r (take-[\w-]+) (l2r-[\w-]+)$/.exec(label)
  return m && TAKE_RE.test(m[1]) && RENDER_RE.test(m[2]) ? { takeId: m[1], renderId: m[2] } : null
}

export const newRenderId = (now = new Date()) => `l2r-${now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')}`

/** absolute folders of one take under the public dir; the ids are checked first so nothing leaves shots/ */
export function shotDirs(publicDir: string, takeId: string) {
  if (!TAKE_RE.test(takeId)) throw new Error(`bad take id ${takeId}`)
  const p = shotPaths(takeId)
  const abs = (rel: string) => path.join(publicDir, ...rel.split('/'))
  return { root: abs(p.root), take: abs(p.take), clay: abs(p.clay), hero: abs(p.hero), l2r: abs(p.l2r) }
}
export const publicUrl = (takeId: string, kind: 'clay' | 'hero' | 'l2r', file: string) => `/${shotPaths(takeId)[kind]}/${file}`

export { l2rEstimate } from './price.ts'
