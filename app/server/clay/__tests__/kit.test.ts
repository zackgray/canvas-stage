// Kit clay finish (wave 2) against the real seams: a kit world registered on disk, a take locked on it, finished 1920x1088
// frames as the page uploads them, then the real ClayService runs the real ffmpeg (no Python, no face model on disk), the
// video is counted by ffprobe, and Render's own readiness check (server/l2r/inputs.ts) reads the result. The panorama path is
// checked to still spawn the Python script.
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shotPaths, type ClayCamera, type ClayExport } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { probeVideo } from '../../clip/ffmpeg.ts'
import { readiness } from '../../l2r/inputs.ts'
import { KitStore } from '../../stage3d/store.ts'
import { lockTake } from '../../takes/store.ts'
import { kitFfmpegArgs } from '../kit.ts'
import { ClayService } from '../service.ts'
import { DEPTH_BYTES, frameFile } from '../upload.ts'

const FRAMES = 9
let pub = ''
const sample = { t: 0, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24, focus: 3 }
let locks = 0
/** a distinct take each time (an identical lock request is the same record) */
const lock = (worldId: string, at: string) => lockTake(pub, { worldId, packId: 'mocap-0000beef', fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: locks++, samples: [sample] }, new Date(at)).take
const clayDir = (take: string) => path.join(pub, shotPaths(take).clay)
const readClay = (take: string) => JSON.parse(readFileSync(path.join(clayDir(take), 'clay.json'), 'utf8')) as ClayExport & { pid?: number }
const until = async (ok: () => boolean, ms = 60_000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)) } }

/** what the page uploads: n grey 1920x1088 PNGs as final_NNN.png (made by ffmpeg here) */
function writeFinals(take: string, n: number, size = '1920x1088') {
  mkdirSync(clayDir(take), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=gray:s=${size}:r=24`, '-frames:v', String(n), '-start_number', '0', path.join(clayDir(take), 'final_%03d.png')], { windowsHide: true })
}

const spawnedCmds: string[] = []
const service = (over: Partial<ConstructorParameters<typeof ClayService>[0]> = {}) => new ClayService({
  publicDir: pub, appDir: pub, python: () => undefined, yunet: path.join(pub, 'no-such-yunet.onnx'), ...over,
  runner: { flushMs: 0, keepFrames: () => false, ...over.runner },
})

let kitId = ''
beforeAll(() => {
  pub = mkdtempSync(path.join(tmpdir(), 'kit-clay-'))
  kitId = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'kit clay test' }, new Date('2026-10-23T03:00:00.000Z')).id
})
afterAll(() => rmSync(pub, { recursive: true, force: true }))

describe('kit clay finish: ffmpeg only, accepted by Render', () => {
  it('refuses up front, before any encode, when ffprobe is missing (the frame count needs it)', () => {
    const take = lock(kitId, '2026-10-23T03:00:30.000Z')
    writeFinals(take.id, FRAMES)
    const r = service({ hasFfmpeg: () => true, hasFfprobe: () => false }).finish({ takeId: take.id })
    expect(r).toMatchObject({ code: 503, body: { error: expect.stringMatching(/ffprobe is not on PATH/) } })
    expect(existsSync(path.join(clayDir(take.id), 'clay.json'))).toBe(false)
  })

  it('encodes the finished frames with ffmpeg (no Python), writes a clay.json and stills Render accepts, and ffprobe counts the take\'s frames', async () => {
    const take = lock(kitId, '2026-10-23T03:01:00.000Z')
    writeFinals(take.id, FRAMES)
    const svc = service({ hasFfmpeg: () => true })
    const r = svc.finish({ takeId: take.id })
    expect(r.code).toBe(202)
    expect((r.body as { clay: ClayExport }).clay).toMatchObject({ status: 'running', method: 'browser', frames: FRAMES })
    await until(() => readClay(take.id).status !== 'running')
    const clay = readClay(take.id)
    expect(clay.error).toBeUndefined()
    expect(clay).toMatchObject({ status: 'done', takeId: take.id, startKey: take.startKey, frames: FRAMES, width: 1920, height: 1088, method: 'browser',
      mp4: `/${shotPaths(take.id).clay}/clay.mp4`, still: `/${shotPaths(take.id).clay}/clay-f0.png`, done: FRAMES })
    expect(clay.faceFrames).toBeUndefined()
    expect(clay.pid).toBeUndefined()
    expect((clay as { log?: string[] }).log).toEqual([]) // ffmpeg's -progress keys are progress, not log lines
    for (const s of ['f0', 'mid', 'last']) expect(existsSync(path.join(clayDir(take.id), `clay-${s}.png`))).toBe(true)
    // the raw frames go once the video landed, frame 0 too (clay-f0.png is its copy)
    expect(existsSync(path.join(clayDir(take.id), frameFile('final', 0)))).toBe(false)
    expect(existsSync(path.join(clayDir(take.id), frameFile('final', 4)))).toBe(false)

    const facts = await probeVideo(path.join(clayDir(take.id), 'clay.mp4'))
    expect(facts).toEqual({ width: 1920, height: 1088, frames: FRAMES })
    const ready = readiness(pub, take.id)
    expect(ready.clayFile).toBe(path.join(clayDir(take.id), 'clay.mp4'))
    expect(ready.missing.map((m) => m.code)).toEqual(['no_still'])
  }, 60_000)

  it('refuses a video whose frame count is not the take\'s (the guard Render relies on)', async () => {
    const take = lock(kitId, '2026-10-23T03:02:00.000Z')
    writeFinals(take.id, FRAMES)
    const svc = service({ hasFfmpeg: () => true, probeFrames: async () => FRAMES - 1 })
    expect(svc.finish({ takeId: take.id }).code).toBe(202)
    await until(() => readClay(take.id).status !== 'running')
    expect(readClay(take.id)).toMatchObject({ status: 'failed', mp4: null })
    expect(readClay(take.id).error).toMatch(/holds 8 frames, the take 9/)
    expect(readiness(pub, take.id).missing[0].code).toBe('clay_not_done')
  }, 60_000)

  it('refuses missing or wrongly sized frames before encoding anything', () => {
    const take = lock(kitId, '2026-10-23T03:03:00.000Z')
    writeFinals(take.id, FRAMES - 1)
    const svc = service({ hasFfmpeg: () => true })
    expect(svc.finish({ takeId: take.id })).toMatchObject({ code: 400, body: { error: expect.stringMatching(/1 of 9 clay frames are not uploaded \(first: 8\)/) } })
    writeFinals(take.id, FRAMES, '960x544')
    expect(svc.finish({ takeId: take.id })).toMatchObject({ code: 400, body: { error: expect.stringMatching(/not 1920x1088 PNGs/) } })
    expect(existsSync(path.join(clayDir(take.id), 'clay.json'))).toBe(false)
  })

  it('takes a prefixed world id (the lab\'s merged source list) as the kit world', () => {
    const take = lock(`locations/${kitId}`, '2026-10-23T03:04:00.000Z')
    const svc = service({ hasFfmpeg: () => false })
    expect(svc.finish({ takeId: take.id })).toMatchObject({ code: 400, body: { error: expect.stringMatching(/clay frames are not uploaded/) } })
  })

  it('the encode is e114_capture.ts\'s: libx264 crf 12 yuv420p at 24 fps, exactly the take\'s frames', () => {
    const a = kitFfmpegArgs('/d', 121, '/d/clay.mp4')
    expect(a.join(' ')).toMatch(/-framerate 24 -start_number 0 -i .*final_%03d\.png -frames:v 121 -c:v libx264 -pix_fmt yuv420p -crf 12 -r 24 \/d\/clay\.mp4$/)
  })
})

describe('panorama clay is unchanged', () => {
  it('still spawns the Python clay script with the face model, from the colour/depth/bg passes', () => {
    const take = lock('loc-a', '2026-10-23T03:05:00.000Z')
    mkdirSync(clayDir(take.id), { recursive: true })
    for (let i = 0; i < FRAMES; i++) {
      writeFileSync(path.join(clayDir(take.id), frameFile('colour', i)), 'png!')
      for (const k of ['depth', 'bg'] as const) { const p = path.join(clayDir(take.id), frameFile(k, i)); writeFileSync(p, ''); truncateSync(p, DEPTH_BYTES) }
    }
    const yunet = path.join(pub, 'yunet.onnx')
    writeFileSync(yunet, 'model')
    const svc = service({
      hasFfmpeg: () => true, python: () => process.execPath, yunet,
      runner: { alive: () => false, spawn: (cmd) => { spawnedCmds.push(cmd); return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 1 }) } },
    })
    const cameras: ClayCamera[] = Array.from({ length: FRAMES }, (_, i) => ({ i, t: i / 24, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35, vfovDeg: 30 }))
    expect(svc.finish({ takeId: take.id }).code).toBe(400) // cameras are still required on the panorama path
    expect(svc.finish({ takeId: take.id, cameras }).code).toBe(202)
    expect(spawnedCmds).toEqual([process.execPath])
    expect(readClay(take.id).method).toBeUndefined()
  })
})
