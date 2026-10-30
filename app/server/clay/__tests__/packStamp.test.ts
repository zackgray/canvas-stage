// Per-take performance, the clay's walk stamp (PLAN-PER-TAKE-PERFORMANCE.md §2, WP2): the page sends the performer it captured
// with as `packId` on the finish; the finish refuses, free and before anything is written, frames of another walk than the take's
// (409); a stored stamp that is not the take's reads as not prepared (Render: clay_stale; the still: no depth, refused unbilled).
// Clays made before the stamp pass, so a legacy take's prepared frames stay renderable. No ffmpeg, no Cloud.
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, describe, expect, it } from 'vitest'
import { shotPaths, type ClayExport } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { clayDepthAt } from '../../hero/kitInputs.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from '../../hero/__tests__/kitRig.ts'
import { mount, TAKE } from '../../hero/__tests__/rig.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { readiness } from '../../l2r/inputs.ts'
import { KitStore } from '../../stage3d/store.ts'
import { lockTake } from '../../takes/store.ts'
import { ClayService } from '../service.ts'
import { PACK_STAMP_MISMATCH, PACK_STAMP_STALE } from '../stamps.ts'
import { frameFile } from '../upload.ts'

const FRAMES = 9, PACK = 'mocap-0000beef'
const pub = mkdtempSync(path.join(tmpdir(), 'clay-stamp-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const kitId = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'clay stamp test' }, new Date('2026-10-29T10:00:00.000Z')).id
const sample = { t: 0, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24, focus: 3 }
let locks = 0
const lock = () => lockTake(pub, { worldId: kitId, packId: PACK, fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: locks++, samples: [sample] },
  new Date(Date.parse('2026-10-29T10:01:00.000Z') + locks * 1000)).take
const clayDir = (take: string) => path.join(pub, shotPaths(take).clay)

/** what the page uploads, as far as the finish reads it: n files with a 1920x1088 PNG header */
function writeFinals(take: string) {
  mkdirSync(clayDir(take), { recursive: true })
  const h = Buffer.alloc(26)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(h, 0)
  h.write('IHDR', 12, 'ascii'); h.writeUInt32BE(1920, 16); h.writeUInt32BE(1088, 20); h[24] = 8; h[25] = 2
  for (let i = 0; i < FRAMES; i++) writeFileSync(path.join(clayDir(take), frameFile('final', i)), h)
}
const spawned: string[] = []
const service = () => new ClayService({ publicDir: pub, appDir: pub, python: () => undefined, hasFfmpeg: () => true, probeFrames: async () => FRAMES,
  runner: { flushMs: 0, keepFrames: () => false, alive: () => false,
    spawn: (cmd) => { spawned.push(cmd); return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 1 }) } } })
const finish = (takeId: string, body: object) => { const s = service(); try { return s.finish({ takeId, ...body }) } finally { s.runner.stop() } }
const clayJson = (take: string) => JSON.parse(readFileSync(path.join(clayDir(take), 'clay.json'), 'utf8')) as ClayExport

describe('the clay finish and the walk stamp', () => {
  it('refuses frames of another walk than the take\'s, free: 409 in plain words, nothing written, nothing encoded', () => {
    const take = lock()
    writeFinals(take.id)
    const n = spawned.length
    const r = finish(take.id, { packId: 'mocap-0000cafe' })
    expect(r).toEqual({ code: 409, body: { error: PACK_STAMP_MISMATCH, code: 'perf_mismatch' } })
    expect(existsSync(path.join(clayDir(take.id), 'clay.json'))).toBe(false)
    expect(spawned.length).toBe(n)
    expect(finish(take.id, { packId: null }).code).toBe(409) // "no performer" is another walk too
    expect(finish(take.id, { packId: 7 }).code).toBe(400)
  })

  it('stores the take\'s own stamp; an older page that sends none makes an unstamped clay, as before', () => {
    const take = lock()
    writeFinals(take.id)
    const r = finish(take.id, { packId: PACK })
    expect([r.code, (r.body as { clay: ClayExport }).clay.packId, clayJson(take.id).packId]).toEqual([202, PACK, PACK])
    const old = lock()
    writeFinals(old.id)
    expect(finish(old.id, {}).code).toBe(202)
    expect('packId' in clayJson(old.id)).toBe(false)
  })
})

/** the hero rig's kit take (packId mocap-0000beef, a done clay with depth) with its clay restamped; clay.mp4 on disk for Render */
function stamped(packId: string | null | undefined): KitTake {
  const t = kitTake()
  const f = path.join(t.clayDir, 'clay.json')
  const clay = JSON.parse(readFileSync(f, 'utf8'))
  writeFileSync(f, JSON.stringify(packId === undefined ? clay : { ...clay, packId }))
  writeFileSync(path.join(t.clayDir, 'clay.mp4'), 'clay')
  return t
}
const CLAY_CODES = /^(no_clay|clay_)/
const clayMissing = (t: KitTake) => readiness(t.pub, TAKE).missing.filter((m) => CLAY_CODES.test(m.code))
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))

describe('a stored stamp that is not the take\'s walk reads as not prepared', () => {
  it('Render: clay_stale, pointed at preparing the frames again', () => {
    expect(clayMissing(stamped('mocap-0000cafe'))).toEqual([expect.objectContaining({ code: 'clay_stale', message: PACK_STAMP_STALE, where: expect.stringMatching(/prepares the frames/) })])
  })

  it('the still: no depth at any frame, the preview shows none, the press is refused before anything is billed', async () => {
    const t = stamped('mocap-0000cafe')
    expect(clayDepthAt(t.pub, t.take, 0)).toBeNull()
    const p = await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
    expect(p.body).toMatchObject({ depthUrl: null })
    t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()))
    const r = await hero(t).render({})
    expect([r.status, r.body.code, t.jobs.submits]).toEqual([409, 'no_depth', 0])
  })

  it('the take\'s own stamp, and a legacy unstamped clay of a take whose walk has since moved, stay prepared and renderable', () => {
    for (const t of [stamped('mocap-0000beef'), stamped(undefined)]) {
      expect(clayMissing(t)).toEqual([])
      expect(clayDepthAt(t.pub, t.take, 0)).not.toBeNull()
    }
  })
})
