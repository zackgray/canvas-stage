// B4: a done clay drops its raw capture passes (~20 MB a frame), keeping frame 0's colour (the opening reference), clay.mp4
// and clay.json; a failed one keeps them for a retry; CLAY_KEEP_FRAMES=1 keeps them for debugging. The child is a fake.
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { shotPaths, type ClayExport } from '../../../src/shared/shotContract.ts'
import { ClayRunner } from '../runner.ts'
import { frameFile } from '../upload.ts'

const TAKE = 'take-2026-10-22T20-00-00-000'
const FRAMES = 9
const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function setup(o: { keep?: boolean } = {}) {
  const pub = mkdtempSync(path.join(tmpdir(), 'clay-clean-'))
  roots.push(pub)
  const dir = path.join(pub, shotPaths(TAKE).clay)
  mkdirSync(dir, { recursive: true })
  for (let i = 0; i < FRAMES; i++) for (const k of ['colour', 'depth', 'bg'] as const) writeFileSync(path.join(dir, frameFile(k, i)), 'x')
  writeFileSync(path.join(dir, 'cameras.json'), '{}')
  writeFileSync(path.join(dir, 'depth_004.f32.part'), 'half an upload')
  let child!: EventEmitter & { stdout: PassThrough; stderr: PassThrough; pid: number }
  const runner = new ClayRunner({
    publicDir: pub, appDir: pub, flushMs: 0, alive: () => false, kill: () => {}, keepFrames: () => !!o.keep,
    spawn: () => (child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), pid: 4242 })),
  })
  const base: ClayExport = { takeId: TAKE, startKey: 'k', mp4: null, frames: FRAMES, width: 1920, height: 1088, status: 'running' }
  runner.start(TAKE, base, { mp4: `/${shotPaths(TAKE).clay}/clay.mp4`, still: `/${shotPaths(TAKE).clay}/clay-f0.png` }, 'python', [])
  /** the script's end: on success it has written clay.mp4 (and its stills) first, as clay.py does */
  const close = (code: number) => {
    if (code === 0) { writeFileSync(path.join(dir, 'clay.mp4'), 'mp4'); writeFileSync(path.join(dir, 'clay-f0.png'), 'png') }
    child.emit('close', code)
  }
  return { dir, close, files: () => readdirSync(dir).sort() }
}

describe('clay raw passes after the export (B4)', () => {
  it('a done clay keeps clay.mp4, clay.json, frame 0 colour, the cameras and stills; every other pass and .part goes', () => {
    const t = setup()
    t.close(0)
    expect(t.files()).toEqual(['cameras.json', 'clay-f0.png', 'clay.json', 'clay.mp4', 'colour_000.png'])
  })

  it('a failed clay keeps every pass for a retry', () => {
    const t = setup()
    const before = t.files()
    t.close(1)
    expect(t.files()).toEqual(before)
    expect(t.files().filter((f) => /^(colour|depth|bg)_/.test(f))).toHaveLength(FRAMES * 3 + 1)
  })

  it('CLAY_KEEP_FRAMES=1 keeps them after a done clay', () => {
    const t = setup({ keep: true })
    t.close(0)
    expect(t.files().filter((f) => /^(colour|depth|bg)_/.test(f))).toHaveLength(FRAMES * 3 + 1)
  })
})
