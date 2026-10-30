// (tidy wave) The kit clay finish writes where the time went into clay.json (the page's phases, sanitised, plus its own encode),
// and with massing pieces it encodes massing.mp4 BESIDE clay.mp4: the massing encode starts with the finish, not after it, and
// the clay is called done only when both are; a massing failure is recorded, never the clay's failure. Real ffmpeg for clay.mp4.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseClayTiming } from '../../../src/shared/clayTiming.ts'
import { shotPaths, type ClayExport } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { KitStore } from '../../stage3d/store.ts'
import { lockTake } from '../../takes/store.ts'
import { ClayService } from '../service.ts'

const FRAMES = 9
let pub = '', kitId = '', locks = 0
const sample = { t: 0, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24 }
const lock = () => lockTake(pub, { worldId: kitId, packId: 'mocap-0000beef', fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: 100 + locks++, samples: [sample] }, new Date('2026-10-25T01:00:00.000Z')).take
const clayDir = (take: string) => path.join(pub, shotPaths(take).clay)
const readClay = (take: string) => JSON.parse(readFileSync(path.join(clayDir(take), 'clay.json'), 'utf8')) as ClayExport
const until = async (ok: () => boolean, ms = 60_000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)) } }
function writeFinals(take: string) {
  mkdirSync(clayDir(take), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1920x1088:r=24', '-frames:v', String(FRAMES), '-start_number', '0', path.join(clayDir(take), 'final_%03d.png')], { windowsHide: true })
}

beforeAll(() => {
  pub = mkdtempSync(path.join(tmpdir(), 'kit-timing-'))
  kitId = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'kit timing test' }, new Date('2026-10-25T00:00:00.000Z')).id
})
afterAll(() => rmSync(pub, { recursive: true, force: true }))

describe('kit clay timing and the massing encode beside it', () => {
  it('starts the massing encode with the finish, holds "done" until it ends, and records both encodes with the page\'s phases', async () => {
    const take = lock()
    writeFinals(take.id)
    let massingStarted = false, release: (why: string | null) => void = () => {}
    const svc = new ClayService({
      publicDir: pub, appDir: pub, python: () => undefined, hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false },
      finishMassing: (_p, id) => { expect(id).toBe(take.id); massingStarted = true; return new Promise((r) => { release = r }) },
    })
    const timing = { frames: 9, renderMs: 12.4, readbackMs: 30, encodeMs: 200, encodeOn: 'worker', uploadMs: -5, junk: 'x' }
    expect(svc.finish({ takeId: take.id, timing, massing: true }).code).toBe(202)
    expect(massingStarted).toBe(true) // beside clay.mp4's encode, not after it
    await new Promise((r) => setTimeout(r, 1500)) // clay.mp4 of 9 frames is long encoded by now
    expect(readClay(take.id).status).toBe('running') // but the clay waits for the massing video
    release(null)
    await until(() => readClay(take.id).status !== 'running')
    const clay = readClay(take.id)
    expect(clay.status).toBe('done')
    expect(clay.timing).toMatchObject({ frames: 9, renderMs: 12, readbackMs: 30, encodeMs: 200, encodeOn: 'worker' })
    expect(clay.timing!.uploadMs).toBeUndefined() // a negative number is dropped, unknown keys too
    expect(clay.timing).not.toHaveProperty('junk')
    expect(clay.timing!.ffmpegMs).toBeGreaterThan(0)
    expect(clay.timing!.massingFfmpegMs).toBeGreaterThanOrEqual(1000)
    expect(clay.timing!.massingError).toBeUndefined()
  })

  it('a massing encode that fails is recorded on the clay, which is still done; no massing asked = none run', async () => {
    const take = lock()
    writeFinals(take.id)
    const warn = console.warn
    console.warn = () => {}
    try {
      let calls = 0
      const svc = new ClayService({
        publicDir: pub, appDir: pub, python: () => undefined, hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false },
        finishMassing: async () => { calls++; return '3 of 9 massing frames are missing' },
      })
      svc.finish({ takeId: take.id, massing: true })
      await until(() => readClay(take.id).status !== 'running')
      expect(readClay(take.id)).toMatchObject({ status: 'done', timing: { massingError: '3 of 9 massing frames are missing' } })
      const plain = lock()
      writeFinals(plain.id)
      svc.finish({ takeId: plain.id })
      await until(() => readClay(plain.id).status !== 'running')
      expect(calls).toBe(1)
      expect(readClay(plain.id).timing?.massingFfmpegMs).toBeUndefined()
    } finally { console.warn = warn }
  })

  it('parses only known, finite, non-negative page fields', () => {
    expect(parseClayTiming(null)).toBeUndefined()
    expect(parseClayTiming([1])).toBeUndefined()
    expect(parseClayTiming({ waitMs: Number.NaN, encodeOn: 'gpu' })).toBeUndefined()
    expect(parseClayTiming({ captureMs: 1e12, encodeOn: 'mixed', ffmpegMs: 5 })).toEqual({ captureMs: 24 * 3600_000, encodeOn: 'mixed' }) // the server's own fields are not the page's to set
  })
})
