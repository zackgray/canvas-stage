import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodePng } from '../../../src/labs/projection/math/png.ts'
import { encodeGuide, FFMPEG_MISSING, guideFrames, probeVideo } from '../ffmpeg.ts'

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

async function frames(n: number, w = 64, h = 36): Promise<string> {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'clip-ff-')), 'depth')
  mkdirSync(dir)
  for (let i = 0; i < n; i++) {
    const data = new Uint16Array(w * h).map((_, k) => (k % w < 8 ? 0 : 1000 + i * 500 + (k % w) * 100))
    writeFileSync(path.join(dir, `depth_${String(i).padStart(3, '0')}.png`), await encodePng({ width: w, height: h, channels: 1, bitDepth: 16, data }))
  }
  return dir
}

describe('guide encoding', () => {
  it('ffmpeg / ffprobe missing: a 503 that says what to install, never a crash', async () => {
    const dir = await frames(9)
    const out = path.join(dir, '..', 'guide.mp4')
    await expect(encodeGuide(dir, out, 'ffmpeg-not-installed-here')).rejects.toMatchObject({ status: 503, message: FFMPEG_MISSING })
    await expect(probeVideo(out, 'ffprobe-not-installed-here')).rejects.toMatchObject({ status: 503, message: FFMPEG_MISSING })
    expect(FFMPEG_MISSING).toMatch(/Nothing was submitted/)
  })

  it('the frames must be depth_000…, without gaps, 8n+1 of them', async () => {
    expect(await guideFrames(await frames(9))).toHaveLength(9)
    await expect(guideFrames(await frames(10))).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/8n\+1/) })
    const gap = await frames(9)
    writeFileSync(path.join(gap, 'depth_010.png'), 'x')
    await expect(guideFrames(gap)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/without gaps/) })
    await expect(guideFrames(path.join(gap, 'missing'))).rejects.toMatchObject({ status: 400 })
  })

  it.skipIf(!hasFfmpeg)('encodes 16-bit depth frames to a 24 fps mp4 with every frame (real ffmpeg)', async () => {
    const dir = await frames(9)
    const out = path.join(dir, '..', 'guide.mp4')
    await encodeGuide(dir, out)
    expect(await probeVideo(out)).toEqual({ width: 64, height: 36, frames: 9 })
  }, 30_000)
})
