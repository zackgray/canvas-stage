// Layout-To-Render over a temp public dir: a locked take (T1's take.json + clay/clay.json + clay.mp4), an approved hero still
// (T2's hero/<id>.json + .png), a world meta.json, the job runner's fake Cloud and a fake ffprobe. No network, no Python.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { startKey, type ClayExport, type HeroStill, type TakeRecord } from '../../../src/shared/shotContract.ts'
import type { VideoFacts } from '../../clip/ffmpeg.ts'
import { permissiveInfo, rig as jobRig } from '../../jobs/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import type { JobRuntime } from '../../jobs/index.ts'
import { call, JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { resetFinishing, type RunPython } from '../finish.ts'
import { l2rGraph } from '../graph.ts'
import { labL2R } from '../plugin.ts'
import type { L2RDeps } from '../run.ts'
import { shotDirs } from '../spec.ts'

export const APP = path.resolve(import.meta.dirname, '..', '..', '..')
export const TAKE = 'take-2026-10-22T19-00-00-000'
export const STILL = 'still-2026-10-22T19-10-00-000'
export const WORLD = 'loc-2026-10-22T13-56-07-249'
export const FRAMES = 49
type Handler = Parameters<typeof call>[0]

const sample = { t: 0, position: [1, 1.6, 4] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 5 }
export const KEY = startKey(sample, 35, 12)

export const l2rJob = (id: string, wait: () => Promise<void> = async () => {}): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 90000 }, wait,
  getOutputs: (node: string) => (node === 'save_t' ? [{ name: 'out.mp4', toFile: async (p: string) => writeFileSync(p, `l2r of ${id}`) }] : []),
}) as unknown as Job

export interface WorldOpts {
  cap?: number | null
  /** clay.json frames (default FRAMES) */
  clayFrames?: number
  /** what ffprobe says the clay.mp4 has (default FRAMES) */
  clayProbe?: number
  clay?: false | Partial<ClayExport>
  still?: false | Partial<HeroStill>
  /** what ffprobe says the raw has */
  rawFacts?: VideoFacts
}

export function world(o: WorldOpts = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'l2r-'))
  const pub = path.join(root, 'public')
  const d = shotDirs(pub, TAKE)
  for (const x of [d.clay, d.hero]) mkdirSync(x, { recursive: true })
  const take: TakeRecord = { id: TAKE, worldId: WORLD, packId: null, fps: 24, frames: FRAMES, samples: [sample], focal: 35, viewAspect: 16 / 9, perfStart: 12,
    startKey: KEY, lockedAt: '2026-10-22T19:00:00.000Z', createdAt: '2026-10-22T19:00:00.000Z' }
  writeFileSync(d.take, JSON.stringify(take))
  if (o.clay !== false) {
    const clay: ClayExport = { takeId: TAKE, startKey: KEY, mp4: `/lab-assets/shots/${TAKE}/clay/clay.mp4`, frames: o.clayFrames ?? FRAMES, width: 1920, height: 1088, status: 'done', ...o.clay }
    writeFileSync(path.join(d.clay, 'clay.json'), JSON.stringify(clay))
    writeFileSync(path.join(d.clay, 'clay.mp4'), 'clay')
  }
  if (o.still !== false) {
    const still: HeroStill = { id: STILL, takeId: TAKE, startKey: KEY, png: `/lab-assets/shots/${TAKE}/hero/${STILL}.png`, seed: 1, jobId: null, credits: 1, approved: true,
      createdAt: '2026-10-22T19:10:00.000Z', ...o.still }
    writeFileSync(path.join(d.hero, `${STILL}.json`), JSON.stringify(still))
    writeFileSync(path.join(d.hero, `${STILL}.png`), 'png')
  }
  const loc = path.join(pub, 'lab-assets', 'locations', WORLD)
  mkdirSync(loc, { recursive: true })
  writeFileSync(path.join(loc, 'meta.json'), JSON.stringify({ description: 'a muddy medieval battlefield at dusk, a burning wooden palisade, low heavy clouds',
    lighting: 'Dusk: a deep blue sky, orange firelight on the smoke, the ground dark' }))

  const cap = o.cap === undefined ? 500 : o.cap
  const jobs = jobRig({ cap })
  const queue: Job[] = []
  const order: string[] = []
  const submitted: { json: Record<string, { inputs: Record<string, unknown> }> }[] = []
  const info = permissiveInfo(l2rGraph({ prompt: 'p', seed: 1, frames: 9, prefix: 'x', layoutSize: { w: 1280, h: 720 } }))
  const runtime = (over: Partial<Parameters<typeof jobs.restart>[0]> = {}): JobRuntime => jobs.restart({
    submit: async (wf) => {
      jobs.submits++
      const recs = readdirSync(d.l2r).filter((f) => /^l2r-.*\.json$/.test(f))
      order.push(`submit intent:${recs.length}`)
      order.push(`ledger-before-submit:${/submitted/.test(jobs.ledger())}`)
      submitted.push({ json: JSON.parse(JSON.stringify(wf.json)) })
      return queue.shift() ?? l2rJob(`bbbbbbbb-0000-4000-8000-00000000090${jobs.submits}`, async () => { order.push(`wait ledger:${/submitted/.test(jobs.ledger())}`) })
    },
    fetchInfo: async () => info, ...over,
  }, cap)
  const probe = async (file: string): Promise<VideoFacts> => file.endsWith('clay.mp4') ? { width: 1920, height: 1088, frames: o.clayProbe ?? FRAMES }
    : file.endsWith('-raw.mp4') ? (o.rawFacts ?? { width: 1920, height: 1088, frames: FRAMES }) : { width: 1920, height: 1088, frames: FRAMES }
  const py: { calls: string[][]; fail?: string } = { calls: [] }
  const run: RunPython = async (python, args) => {
    py.calls.push([python, ...args])
    if (py.fail) throw new Error(py.fail)
    const o = args.indexOf('--out') // colormatch.py --out <f>, ffmpeg's last argument, else <script> <in> <out>
    writeFileSync(o >= 0 ? args[o + 1] : python === 'ffmpeg' ? args.at(-1)! : args[2], 'mp4')
  }
  const deps = (rt: JobRuntime, over: Partial<L2RDeps> = {}): L2RDeps => ({ runtime: () => rt, probe, python: () => '/venv/python', ...over })
  return { root, pub, dirs: d, take, jobs, queue, order, submitted, runtime, deps, py, run }
}
export type World = ReturnType<typeof world>

export function mount(w: World, rt: JobRuntime, over: Partial<L2RDeps> = {}, env: Record<string, string> = { COMFY_BASE_URL: 'http://fake-comfy.invalid' }) {
  resetClaims(); resetFinishing()
  const routes: Record<string, Handler> = {}
  const p = labL2R({ LIFT_PYTHON: process.execPath, ...env }, { deps: w.deps(rt, over), finish: { run: w.run } })
  ;(p.configureServer as (s: unknown) => void)({ config: { root: APP, publicDir: w.pub, mode: 'test', envDir: APP }, middlewares: { use: (pre: string, h: Handler) => { routes[pre] = h } } })
  const h = routes['/__lab/l2r']
  const post = (url: string, b: unknown, headers: Record<string, string> = JSON_LOCAL) => call(h, url, { method: 'POST', headers, body: JSON.stringify(b) })
  return {
    status: (take = TAKE) => call(h, `/?take=${take}`),
    render: (extra: object = {}) => post('/', { takeId: TAKE, stillId: STILL, ...extra }),
    recover: (jobId: string) => post('/recover', { jobId }),
    finish: (renderId: string, extra: object = {}) => post('/finish', { renderId, ...extra }),
    post, h,
  }
}

export const until = async (ok: () => boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)) }
}

/** the stills on disk that record no Bible version are given `version` (drawn against the Bible a test puts down) */
export function stampStills(w: { dirs: { hero: string } }, version: number) {
  for (const f of readdirSync(w.dirs.hero).filter((n) => n.endsWith('.json'))) {
    const p = path.join(w.dirs.hero, f), s = JSON.parse(readFileSync(p, 'utf8')) as { bibleVersion?: number }
    if (s.bibleVersion === undefined) writeFileSync(p, JSON.stringify({ ...s, bibleVersion: version }))
  }
}
/** the version of the Bible a test put down for the world, if any */
export function bibleOn(w: { pub: string }): number | undefined {
  try { return (JSON.parse(readFileSync(path.join(w.pub, 'lab-assets', 'locations', WORLD, 'bible', 'bible.json'), 'utf8')) as { version: number }).version } catch { return undefined }
}
