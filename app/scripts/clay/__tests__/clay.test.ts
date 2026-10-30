// The clay script end to end on a tiny synthetic take (a lit sphere in front of a flat wall), with the Python the app runs it
// with (LIFT_PYTHON; skipped without it or without ffmpeg). The full-size proof against E102 is scripts/clay/e96_check.py.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'clay.py')
const PY = process.env.LIFT_PYTHON
const ffmpeg = (() => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
const ready = !!PY && existsSync(PY) && ffmpeg
const dir = mkdtempSync(path.join(tmpdir(), 'clay-py-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const MAKE = `
import json, sys, numpy as np, cv2
d = sys.argv[1]; W, H, N = 64, 48, 9
v, u = np.mgrid[0:H, 0:W].astype(np.float32)
for k in range(N):
    wall = np.full((H, W), 10.0, np.float32)
    r2 = (u - 20 - k) ** 2 + (v - 24) ** 2; s = r2 < 144
    D = wall.copy(); D[s] = 5 - np.sqrt(np.maximum(0, 144 - r2[s])) / 12
    cv2.imwrite(f"{d}/colour_{k:03d}.png", (np.random.default_rng(k).random((H, W, 3)) * 255).astype(np.uint8))
    D.astype(np.float32).tofile(f"{d}/depth_{k:03d}.f32"); wall.tofile(f"{d}/bg_{k:03d}.f32")
json.dump({"width": W, "height": H, "frames": [{"i": k, "vfovDeg": 40} for k in range(N)]}, open(f"{d}/cameras.json", "w"))
json.dump({"frames": [[20 + k, 22, 6, 8] for k in range(N)]}, open(f"{d}/faces.json", "w"))
`

function probe(mp4: string) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_read_frames', '-of', 'json', mp4]).toString()
  return JSON.parse(out).streams[0]
}

describe.skipIf(!ready)('scripts/clay/clay.py', () => {
  it('writes an H.264 yuv420p mp4 at 24 fps, one clay frame per input frame, with progress lines', () => {
    execFileSync(PY!, ['-c', MAKE, dir])
    const out = path.join(dir, 'out', 'clay.mp4')
    const log = execFileSync(PY!, [SCRIPT, '--in', dir, '--out', out, '--faces', path.join(dir, 'faces.json'), '--stills', '--key', '1,0.2,0.6']).toString()
    expect(log).toMatch(/^frame 1\/9/m)
    expect(log).toMatch(/^frame 9\/9/m)
    expect(log).toMatch(/^done /m)
    expect(probe(out)).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', width: 64, height: 48, r_frame_rate: '24/1', nb_read_frames: '9' })
    expect(existsSync(path.join(dir, 'out', 'clay-f0.png'))).toBe(true)
    expect(existsSync(`${out}.part`)).toBe(false)
  })

  it('fails with one readable line and leaves no video when a pass is missing or the wrong size', () => {
    writeFileSync(path.join(dir, 'bg_004.f32'), Buffer.alloc(10))
    const out = path.join(dir, 'bad.mp4')
    let err = ''
    try { execFileSync(PY!, [SCRIPT, '--in', dir, '--out', out, '--no-face'], { stdio: 'pipe' }) } catch (e) { err = String((e as { stderr: Buffer }).stderr) }
    expect(err).toMatch(/error: frame 4: depth is not 64x48 Float32/)
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.part`)).toBe(false)
    expect(readFileSync(path.join(dir, 'cameras.json'), 'utf8')).toContain('vfovDeg')
  })
})
