// "Edit this frame" (server/frameEdit) over a temp public dir: a locked take, one approved still on disk, the job runner's fake
// Cloud. No network, nothing real billed. Drives the route's own handler and the hero store's approve/list (the code the hero
// endpoint and Render's guard share), so a version made by an edit is proven to be a first-class still.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '@comfyorg/sdk'
import { startKey, type HeroStill, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { rig as jobRig, permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import type { JobRuntime } from '../../jobs/index.ts'
import { call, JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { approveStill, listStills } from '../../hero/store.ts'
import { buildFrameEditGraph, frameEditSaveNode } from '../graph.ts'
import { labFrameEdit } from '../plugin.ts'
import { FRAME_EDIT_CREDITS } from '../spec.ts'

const TAKE = 'take-2026-10-22T12-00-00-000'
const BASE = 'hero-2026-10-22T13-00-00-000-1'
const NOW = new Date('2026-10-22T15:00:00.000Z')
const SAMPLE = { t: 0, position: [1, 1.6, 4] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 4 }

const takeRecord = (): TakeRecord => ({
  id: TAKE, worldId: 'loc-1', packId: null, fps: 24, frames: 121, samples: [SAMPLE], focal: 35, viewAspect: 1.7778, perfStart: 0,
  startKey: startKey(SAMPLE, 35, 0), lockedAt: '2026-10-22T12:00:00.000Z', createdAt: '2026-10-22T12:00:00.000Z',
})
const baseStill = (over: Partial<HeroStill> = {}): HeroStill => ({
  id: BASE, takeId: TAKE, startKey: takeRecord().startKey, png: `/lab-assets/shots/${TAKE}/hero/${BASE}.png`, seed: 7,
  jobId: 'aaaaaaaa-0000-4000-8000-000000000099', credits: 3, approved: true, createdAt: '2026-10-22T13:00:00.000Z', ...over,
})

/** the fake Cloud's edit job: its SaveImage output lands the new version's png */
const editJob = (id: string, wait: () => Promise<void> = async () => {}): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 9000 }, wait,
  getOutputs: (node: string) => (node === frameEditSaveNode(1000) ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, `edited by ${id}`) }] : []),
}) as unknown as Job

function world(o: { cap?: number | null; base?: Partial<HeroStill> } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'frame-edit-'))
  const pub = path.join(root, 'public')
  const heroDir = path.join(pub, 'lab-assets', 'shots', TAKE, 'hero')
  mkdirSync(heroDir, { recursive: true })
  const take = takeRecord()
  writeFileSync(path.join(pub, 'lab-assets', 'shots', TAKE, 'take.json'), JSON.stringify(take))
  const base = baseStill(o.base)
  writeFileSync(path.join(heroDir, `${BASE}.png`), 'the approved frame')
  writeFileSync(path.join(heroDir, `${BASE}.json`), JSON.stringify(base))
  const jobs = jobRig({ cap: o.cap === undefined ? 500 : o.cap })
  const queue: Job[] = []
  const order: string[] = []
  const info = permissiveInfo(buildFrameEditGraph({ prompt: 'p', seed: 1000, prefix: 'x' }))
  const rt = (over: Partial<Parameters<typeof jobs.restart>[0]> = {}): JobRuntime => jobs.restart({
    submit: async (wf) => {
      jobs.submits++
      order.push(`intent-on-disk:${readdirSync(heroDir).some((f) => f.startsWith('intent-hero-'))}`)
      order.push(`still-jsons:${readdirSync(heroDir).filter((f) => /^hero-[\w-]+\.json$/.test(f)).length}`)
      void wf
      return queue.shift() ?? editJob(`aaaaaaaa-0000-4000-8000-0000000000${100 + jobs.submits}`)
    },
    fetchInfo: async () => info, ...over,
  }, o.cap === undefined ? 500 : o.cap)
  return { root, pub, heroDir, take, base, jobs, queue, order, rt: rt() }
}
type World = ReturnType<typeof world>

type Handler = Parameters<typeof call>[0]
function mount(w: World, rt: JobRuntime) {
  resetClaims()
  const routes: Record<string, Handler> = {}
  const p = labFrameEdit({ COMFY_BASE_URL: 'http://fake-comfy.invalid' }, { deps: { runtime: () => rt, seed: () => 1000, now: () => NOW } })
  ;(p.configureServer as (s: unknown) => void)({ config: { root: w.root, publicDir: w.pub }, middlewares: { use: (pre: string, h: Handler) => { routes[pre] = h } } })
  const h = routes['/__lab/frame-edit']
  const edit = (stillId = BASE, extra: object = {}) =>
    call(h, '/', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, stillId, prompt: 'remove the hat brim', ...extra }) })
  return { h, edit }
}

const until = async (ok: () => boolean, ms = 3000) => {
  const t0 = Date.now()
  while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 5)) }
}

beforeEach(() => { vi.useRealTimers(); resetClaims() })

describe('the edit press', () => {
  it('is a NEW version beside the old one: the intent lands before the spend, nothing is overwritten', async () => {
    const w = world(); const m = mount(w, w.rt)
    const r = await m.edit()
    expect(r.status).toBe(200)
    const still = (r.body as { still: HeroStill & { editOf: string; prompt: string } }).still
    expect(still.id).not.toBe(BASE)
    expect(still.approved).toBe(false) // the frame stays what it was until the version is picked
    expect(still.editOf).toBe(BASE)
    expect(still.prompt).toBe('remove the hat brim')
    expect(w.order.slice(0, 2)).toEqual(['intent-on-disk:true', 'still-jsons:1']) // the spend came after the intent; only the old still's json exists yet
    expect(existsSync(path.join(w.heroDir, `${BASE}.png`))).toBe(true) // the version it started from is untouched
    expect(readFileSync(path.join(w.heroDir, `${BASE}.png`), 'utf8')).toBe('the approved frame')
    const all = await listStills(w.pub, TAKE, w.rt.store)
    expect(all.map((s) => s.id).sort()).toEqual([BASE, still.id].sort()) // versions append, never replace
    expect(all.find((s) => s.id === BASE)?.approved).toBe(true)
    expect(w.jobs.submits).toBe(1)
  })

  it('carries the base drawing\'s keyframe, cast card and sheet keys, so it goes stale exactly when the base would', async () => {
    const bibleKeys = { master: '77074ba4', prompt: '8b3655c8' }
    const w = world({ base: { approved: false, castId: 'driver-1', role: 'opening', frame: 0, bibleVersion: 2, bibleKeys } as Partial<HeroStill> })
    const r = await mount(w, w.rt).edit()
    const made = (r.body as { still: HeroStill & Record<string, unknown> }).still
    expect(made).toMatchObject({ castId: 'driver-1', role: 'opening', frame: 0, bibleVersion: 2, bibleKeys, approved: false })
    const listed = (await listStills(w.pub, TAKE, w.rt.store)).find((s) => s.id === made.id) as HeroStill & Record<string, unknown>
    expect(listed.bibleKeys).toEqual(bibleKeys) // on disk, as the render's guard reads it
    expect(listed.id).toBe(made.id)
  })

  it('picking the new version is the shared approval path: it alone reads approved afterwards', async () => {
    const w = world(); const m = mount(w, w.rt)
    const still = (await m.edit()).body as { still: HeroStill }
    const picked = await approveStill(w.pub, w.take, still.still.id, w.rt.store)
    expect(picked.approved).toBe(true)
    const all = await listStills(w.pub, TAKE, w.rt.store)
    expect(all.filter((s) => s.approved).map((s) => s.id)).toEqual([still.still.id]) // what draw and render read
  })

  it('one edit at a time: a second edit while one runs is refused free, before any spend of its own', async () => {
    const w = world(); const m = mount(w, w.rt)
    let open!: () => void
    w.queue.push(editJob('aaaaaaaa-0000-4000-8000-000000000201', () => new Promise<void>((r) => { open = r })))
    const first = m.edit()
    await until(() => w.jobs.submits === 1)
    await until(() => typeof open === 'function') // the Cloud job is on its wait: the section is truly taken
    const second = await m.edit()
    expect(second.status).toBe(409) // busy: the section the draws and edits share
    open()
    const done = await first
    expect(done.status).toBe(200)
    expect(w.jobs.submits).toBe(1) // the refused press submitted nothing
  })

  it('a budget stop is free: 429, the intent is removed, nothing lands', async () => {
    const w = world({ cap: FRAME_EDIT_CREDITS - 1 }); const m = mount(w, w.rt)
    const r = await m.edit()
    expect(r.status).toBe(429)
    expect(readdirSync(w.heroDir).some((f) => f.startsWith('intent-'))).toBe(false)
    expect(w.jobs.submits).toBe(0)
  })

  it('a stale base still is refused free (409), before the target is even checked for money', async () => {
    const w = world({ base: { startKey: 'older-start' } })
    const m = mount(w, w.rt)
    const r = await m.edit()
    expect(r.status).toBe(409)
    expect((r.body as { code?: string }).code).toBe('stale')
    expect(w.jobs.submits).toBe(0)
  })

  it('an empty sentence is a free 400; camera words are the client-side warning only — the sentence goes as typed', async () => {
    const w = world(); const m = mount(w, w.rt)
    expect((await m.edit(BASE, { prompt: '   ' })).status).toBe(400)
    expect(w.jobs.submits).toBe(0)
    const r = await m.edit(BASE, { prompt: 'a low-angle tracking shot at dawn' })
    expect(r.status).toBe(200) // warned about in the UI, never rewritten here
  })

  it('refuses a foreign page (guard) before anything else', async () => {
    const w = world(); const m = mount(w, w.rt)
    const r = await call(m.h, '/', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: JSON.stringify({ takeId: TAKE, stillId: BASE, prompt: 'x' }) })
    expect(r.status).toBe(403)
    expect(w.jobs.submits).toBe(0)
  })
})
