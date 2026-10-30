// The hero-still endpoint over a temp public dir: a locked take on disk (T1's layout), a lifted perform session with a cast
// card that has a face image, a location with a fire in its description, and the job runner's fake Cloud. No network.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { startKey, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { emptyProject } from '../../../src/project/model.ts'
import { permissiveInfo, rig as jobRig } from '../../jobs/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import type { JobRuntime } from '../../jobs/index.ts'
import { call, JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { buildHeroGraph } from '../graph.ts'
import { labHero } from '../plugin.ts'
import type { HeroDeps } from '../run.ts'

export const TAKE = 'take-2026-10-22T12-00-00-000'
export const PACK = 'pack-one'
export const SID = 'perf-2026-10-21T09-00-00-000Z'
export const WORLD = 'loc-2026-10-22T13-56-07-249'
export const NOW = new Date('2026-10-22T15:00:00.000Z')
const SAMPLE = { t: 0, position: [1, 1.6, 4] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 4 }

export const takeRecord = (over: Partial<TakeRecord> = {}): TakeRecord => ({
  id: TAKE, worldId: WORLD, packId: PACK, fps: 24, frames: 121, samples: [SAMPLE], focal: 35, viewAspect: 1.7778, perfStart: 0,
  startKey: startKey(SAMPLE, 35, 0), lockedAt: '2026-10-22T12:00:00.000Z', createdAt: '2026-10-22T12:00:00.000Z', ...over,
})

/** a 1920x1088 PNG as far as the upload check reads (signature + IHDR) */
export function pngBytes(width = 1920, height = 1088): Buffer {
  const b = Buffer.alloc(64)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20)
  return b
}

export const heroJob = (id: string, wait: () => Promise<void> = async () => {}): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 9000 }, wait,
  getOutputs: (node: string) => (node.startsWith('o_') ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, `still of ${id}`) }] : []),
}) as unknown as Job

export interface WorldOpts { cap?: number | null; cast?: boolean; face?: boolean; opening?: boolean; take?: Partial<TakeRecord> }

export function world(o: WorldOpts = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hero-'))
  const pub = path.join(root, 'public')
  const take = takeRecord(o.take)
  const shot = path.join(pub, 'lab-assets', 'shots', TAKE)
  mkdirSync(path.join(shot, 'hero'), { recursive: true })
  writeFileSync(path.join(shot, 'take.json'), JSON.stringify(take))
  if (o.opening !== false) writeFileSync(path.join(shot, 'hero', 'opening.png'), pngBytes())
  const sess = path.join(pub, 'lab-assets', 'perform', SID)
  mkdirSync(path.join(sess, 'lift'), { recursive: true })
  mkdirSync(path.join(sess, 'place'), { recursive: true })
  writeFileSync(path.join(sess, 'lift', 'lift.json'), JSON.stringify({ sid: SID, status: 'done', packId: PACK }))
  writeFileSync(path.join(sess, 'place', 'place.json'), JSON.stringify({ sid: SID, cast: o.cast === false ? [] : [{ cardId: 'ana', version: 1 }], locationId: null }))
  const refs = o.face === false ? [] : ['/lab-assets/cast/ana/front.png', '/lab-assets/cast/ana/face.png']
  for (const r of refs) { mkdirSync(path.dirname(path.join(pub, r)), { recursive: true }); writeFileSync(path.join(pub, r), 'img') }
  const proj = emptyProject('default', 'Default', '2026-10-20T00:00:00.000Z')
  proj.ingredients.cast.push({ id: 'ana', name: 'Ana', versions: [{ version: 1, created: '2026-10-20T00:00:00.000Z', payload: { name: 'Ana', description: 'a battle-worn woman in her thirties with short dark hair and a dented steel helmet', references: refs, sheets: [] } }] })
  mkdirSync(path.join(pub, 'lab-assets', 'projects', 'default'), { recursive: true })
  writeFileSync(path.join(pub, 'lab-assets', 'projects', 'default', 'project.json'), JSON.stringify(proj))
  const loc = path.join(pub, 'lab-assets', 'locations', WORLD)
  mkdirSync(loc, { recursive: true })
  writeFileSync(path.join(loc, 'meta.json'), JSON.stringify({ result: { shot: { prompt: 'A muddy medieval battlefield at dusk, a burning wooden palisade with fire and flames, smoke drifting. Photo, 38mm lens, deep focus.' } } }))

  const jobs = jobRig({ cap: o.cap === undefined ? 500 : o.cap })
  const queue: Job[] = []
  const order: string[] = []
  const heroDir = path.join(shot, 'hero')
  const submitted: { json: Record<string, { inputs: Record<string, unknown> }> }[] = []
  const info = permissiveInfo(buildHeroGraph({ prompt: 'p', picks: [{ id: 'hero-x', seed: 1 }], prefix: 'x' }))
  const runtime = (over: Partial<Parameters<typeof jobs.restart>[0]> = {}): JobRuntime => jobs.restart({
    submit: async (wf) => {
      jobs.submits++
      order.push(`intent-on-disk:${readdirSync(heroDir).some((f: string) => f.startsWith('intent-hero-'))}`)
      order.push(`json-on-disk:${readdirSync(heroDir).some((f: string) => /^hero-[\w-]+\.json$/.test(f))}`)
      submitted.push({ json: JSON.parse(JSON.stringify(wf.json)) })
      return queue.shift() ?? heroJob(`aaaaaaaa-0000-4000-8000-00000000080${jobs.submits}`)
    },
    fetchInfo: async () => info, ...over,
  }, o.cap === undefined ? 500 : o.cap)
  return { root, pub, shot, heroDir, take, jobs, queue, order, submitted, runtime }
}
export type World = ReturnType<typeof world>

type Handler = Parameters<typeof call>[0]
export function mount(w: World, rt: JobRuntime, over: Partial<HeroDeps> = {}) {
  resetClaims()
  const routes: Record<string, Handler> = {}
  const p = labHero({ COMFY_BASE_URL: 'http://fake-comfy.invalid' }, { deps: { runtime: () => rt, seed: () => 1000, now: () => NOW, ...over } })
  ;(p.configureServer as (s: unknown) => void)({ config: { root: w.root, publicDir: w.pub }, middlewares: { use: (pre: string, h: Handler) => { routes[pre] = h } } })
  const h = routes['/__lab/hero']
  const body = (b: unknown) => ({ method: 'POST', headers: JSON_LOCAL, body: JSON.stringify(b) })
  return {
    list: (take = TAKE) => call(h, `/?take=${take}`),
    render: (extra: object = {}) => call(h, '/', body({ takeId: TAKE, ...extra })),
    approve: (stillId: string, takeId = TAKE) => call(h, '/approve', body({ takeId, stillId })),
    unapprove: (stillId: string, takeId = TAKE) => call(h, '/unapprove', body({ takeId, stillId })),
    opening: (buf: Buffer, q = `take=${TAKE}`, headers: Record<string, string> = { 'content-type': 'image/png', origin: 'http://localhost:5173' }) =>
      call(h, `/opening?${q}`, { method: 'POST', headers, body: buf }),
    raw: (url: string, o: Parameters<typeof call>[2] = {}) => call(h, url, o),
  }
}

export const until = async (ok: () => boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)) }
}
