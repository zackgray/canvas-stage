// Kit clay with metric depth: the page's zdepth_NNN.png (16-bit grey, 1920x1088) are recorded in clay.json and kept after the
// encode (the render's depth of field reads them); cameras.json carries no focus. A partial or missing set is no depth,
// not a failure. Real ffmpeg, as kit.test.ts.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodePng } from '../../../src/labs/projection/math/png.ts'
import { shotPaths, type ClayCamera, type ClayExport } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { KitStore } from '../../stage3d/store.ts'
import { lockTake } from '../../takes/store.ts'
import { ClayService } from '../service.ts'
import { frameFile } from '../upload.ts'

const FRAMES = 9
let pub = ''
let kitId = ''
let locks = 0
const sample = { t: 0, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 24, focus: 3 }
const lock = () => lockTake(pub, { worldId: kitId, packId: 'mocap-0000beef', fps: 24, frames: FRAMES, focal: 24, viewAspect: 16 / 9, perfStart: locks++, samples: [sample] },
  new Date(Date.parse('2026-10-23T05:00:00.000Z') + locks * 1000)).take
const clayDir = (take: string) => path.join(pub, shotPaths(take).clay)
const readClay = (take: string) => JSON.parse(readFileSync(path.join(clayDir(take), 'clay.json'), 'utf8')) as ClayExport
const until = async (ok: () => boolean, ms = 60_000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 50)) } }
const cams = (focus: (i: number) => number): ClayCamera[] => Array.from({ length: FRAMES }, (_, i) => ({ i, t: i / 24, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 24, vfovDeg: 41, focus: focus(i) }))

async function upload(take: string, depthFrames: number) {
  mkdirSync(clayDir(take), { recursive: true })
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1920x1088:r=24', '-frames:v', String(FRAMES), '-start_number', '0', path.join(clayDir(take), 'final_%03d.png')], { windowsHide: true })
  const z = await encodePng({ width: 1920, height: 1088, channels: 1, bitDepth: 16, data: new Uint16Array(1920 * 1088).fill(1000) })
  for (let i = 0; i < depthFrames; i++) writeFileSync(path.join(clayDir(take), frameFile('zdepth', i)), z)
}
const service = () => new ClayService({ publicDir: pub, appDir: pub, python: () => undefined, hasFfmpeg: () => true, runner: { flushMs: 0, keepFrames: () => false } })

beforeAll(() => {
  pub = mkdtempSync(path.join(tmpdir(), 'kit-depth-'))
  kitId = new KitStore(pub).create({ plan: BATTLEFIELD, description: 'kit depth test' }, new Date('2026-10-23T04:00:00.000Z')).id
})
afterAll(() => rmSync(pub, { recursive: true, force: true }))

describe('kit clay metric depth', () => {
  it('a full depth set is recorded (planar, 1 cm units), kept after the encode, and the cameras are written without a focus', async () => {
    const take = lock()
    await upload(take.id, FRAMES)
    expect(frameFile('zdepth', 7)).toBe('zdepth_007.png')
    const r = service().finish({ takeId: take.id, cameras: cams((i) => (i < 4 ? 10 : 30)) })
    expect(r.code).toBe(202)
    await until(() => readClay(take.id).status !== 'running')
    const clay = readClay(take.id)
    expect(clay.status).toBe('done')
    expect(clay.depth).toEqual({ kind: 'planar', unitM: 0.01, frames: FRAMES, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' })
    const files = readdirSync(clayDir(take.id))
    expect(files.filter((f) => /^zdepth_\d{3}\.png$/.test(f))).toHaveLength(FRAMES) // kept: the render needs them
    expect(files.filter((f) => /^final_\d{3}\.png$/.test(f))).toEqual([]) // every raw frame goes after the encode, frame 0 too (clay-f0.png is its copy)
    expect(files).toContain('clay-f0.png')
    const written = JSON.parse(readFileSync(path.join(clayDir(take.id), 'cameras.json'), 'utf8')).frames as ClayCamera[]
    expect(written.map((c) => c.focus)).toEqual(Array(FRAMES).fill(undefined)) // there is no focus to write
  })

  it('a partial depth set (or none, or no cameras) is no depth: the clay is made as before', async () => {
    const take = lock()
    await upload(take.id, FRAMES - 1)
    expect(service().finish({ takeId: take.id }).code).toBe(202)
    await until(() => readClay(take.id).status !== 'running')
    expect(readClay(take.id)).toMatchObject({ status: 'done', depth: null })
    expect(existsSync(path.join(clayDir(take.id), 'cameras.json'))).toBe(false)
  })
})
