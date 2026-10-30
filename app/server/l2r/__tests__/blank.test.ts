// The black-render guard (blank.ts): the brightest pixel of a few sampled frames decides, so a dark night scene with a lamp in
// it passes and a solid black clip (QA run 5: every pixel at the video black level) does not. Real ffmpeg on generated clips.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { blankLine, blankVideo, isBlank, sampledMaxLuma } from '../blank.ts'

const dir = mkdtempSync(path.join(os.tmpdir(), 'blank-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

/** a 17-frame clip from an ffmpeg lavfi source */
const clip = (name: string, src: string): string => {
  const f = path.join(dir, name)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '17', '-pix_fmt', 'yuv420p', f])
  return f
}

describe('the black-render guard', () => {
  it('reads black only when every sampled frame stays near black', () => {
    expect(isBlank([16, 16, 16])).toBe(true)
    expect(isBlank([16, 16, 120])).toBe(false)
    expect(isBlank([])).toBe(false) // unreadable: never blocks a render
  })
  it('says what happened and what it cost, once', () => {
    expect(blankLine(20.2)).toBe('The render came back black. Nothing usable was saved. You were billed 20.2 cr.')
  })
  it.runIf(hasFfmpeg)('a solid black clip is blank; a dark clip with one bright spot is not', async () => {
    expect(await blankVideo(clip('black.mp4', 'color=c=black:s=320x180:r=24'), 17)).toBe(true)
    const dark = clip('dark.mp4', 'color=c=0x101010:s=320x180:r=24,drawbox=x=150:y=80:w=20:h=20:color=white:t=fill')
    expect(await blankVideo(dark, 17)).toBe(false)
    expect((await sampledMaxLuma(dark, 17)).length).toBeGreaterThan(1)
  })
  it('a file ffmpeg cannot read is not called blank', async () => {
    expect(await blankVideo(path.join(dir, 'missing.mp4'), 17)).toBe(false)
  })
})
