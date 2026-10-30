// The massing clay beside the precise clay (free): frames land under shots/<take>/clay/massing/, never over the precise frames;
// finish encodes them with the precise clay's ffmpeg args and writes massing.json last; it is current only for the take's start.
// The real massing script runs on the fixture box when CANVAS_PYTHON names a venv python that has trimesh, scipy and scikit-image (Vitest does not read app/.env: export it in the shell) (it is on the dev machines; skipped elsewhere).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { shotPaths, type TakeRecord } from '../../../src/shared/shotContract.ts'
import { finishMassingClay, massingDir, readMassingClay } from '../massingClay.ts'
import { glbExtent } from '../place.ts'
import { FIXTURE_GLB } from './rig.ts'

function take(frames = 3) {
  const pub = mkdtempSync(path.join(tmpdir(), 'mclay-'))
  const rec = { id: 'take-2026-10-24T20-00-00-000', startKey: 'k1', frames, worldId: 'loc-x' } as unknown as TakeRecord
  const f = path.join(pub, ...shotPaths(rec.id).take.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(rec))
  return { pub, rec }
}
const rgb = PNG.sync.write(new PNG({ width: 1920, height: 1088 }))

describe('the massing clay', () => {
  it('encodes the uploaded frames with the precise clay\'s args, writes massing.json last, current for this start only', async () => {
    const { pub, rec } = take()
    const dir = massingDir(pub, rec.id)
    mkdirSync(dir, { recursive: true })
    expect(await finishMassingClay(pub, rec.id, { ffmpeg: async () => {}, probe: async () => 3 })).toEqual([400, expect.stringMatching(/3 of 3 massing frames/)])
    for (let i = 0; i < 3; i++) writeFileSync(path.join(dir, `final_00${i}.png`), rgb)
    let args: string[] = []
    const m = await finishMassingClay(pub, rec.id, { ffmpeg: async (a) => { args = a }, probe: async () => 3, now: () => new Date('2026-10-24T21:00:00Z') })
    expect(Array.isArray(m)).toBe(false)
    expect(m).toMatchObject({ takeId: rec.id, startKey: 'k1', frames: 3, mp4: `/lab-assets/shots/${rec.id}/clay/massing/massing.mp4`, depth: null })
    expect(args).toContain(path.join(dir, 'final_%03d.png'))
    expect(args.at(-1)).toBe(path.join(dir, 'massing.mp4'))
    expect(readMassingClay(pub, rec.id)).toEqual(m)
    // the precise clay's own folder holds none of it
    expect(existsSync(path.join(pub, shotPaths(rec.id).clay, 'final_000.png'))).toBe(false)
    // a re-lock (a new start) makes it stale
    writeFileSync(path.join(pub, ...shotPaths(rec.id).take.split('/')), JSON.stringify({ ...rec, startKey: 'k2' }))
    expect(readMassingClay(pub, rec.id)).toBeNull()
  })

  it('a video of the wrong length is refused', async () => {
    const { pub, rec } = take(2)
    const dir = massingDir(pub, rec.id); mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 2; i++) writeFileSync(path.join(dir, `final_00${i}.png`), rgb)
    expect(await finishMassingClay(pub, rec.id, { ffmpeg: async () => {}, probe: async () => 5 })).toEqual([500, expect.stringMatching(/holds 5 frames/)])
    expect(existsSync(path.join(dir, 'massing.json'))).toBe(false)
  })
})

const LIFT = process.env.CANVAS_PYTHON ?? process.env.LIFT_PYTHON ?? ''
const hasLift = existsSync(LIFT) && spawnSync(LIFT, ['-c', 'import trimesh, scipy, skimage'], { timeout: 60_000 }).status === 0
describe.skipIf(!hasLift)('scripts/pieces/massing.py (real, free; skipped unless CANVAS_PYTHON is exported in the shell and names a venv python with trimesh, scipy and scikit-image)', () => {
  it('turns the box into a closed massing mesh of the same size', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'massing-')), 'm.glb')
    const script = path.join(path.dirname(FIXTURE_GLB), '..', '..', '..', '..', 'scripts', 'pieces', 'massing.py')
    const r = spawnSync(LIFT, [script, '--in', FIXTURE_GLB, '--out', out, '--size', '2', '--pitch', '0.1', '--dilate', '1'], { encoding: 'utf8', timeout: 120_000 })
    expect(r.status, r.stderr).toBe(0)
    const stats = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { faces: number; extent: number[] }
    expect(stats.faces).toBeGreaterThan(12)
    expect(glbExtent(readFileSync(out))).toBeCloseTo(2, 2)
  }, 120_000)
})
