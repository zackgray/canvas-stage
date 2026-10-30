// The free pieces of the kit still: the clay's 16-bit metric depth as the depth patch's near-bright inverse depth (the spike
// page's mapping), the layout score on a matching and a drifted still, and the colour-match's tolerance of a missing script.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorMatch } from '../colorMatch.ts'
import { inverseDepth, metres, nearFor, readChannel0, readLuma, writeDepthControl } from '../depthImage.ts'
import { frameFor, kitStillCredits, LAYOUT_MIN_SCORE } from '../kitSpec.ts'
import { checkLayout, layoutScore, verdict } from '../layoutCheck.ts'
import { BOX, stillPng, zdepthPng } from './kitRig.ts'

const tmp = () => mkdtempSync(path.join(tmpdir(), 'kitstill-'))

describe('depth control image', () => {
  it('reads 16-bit zdepth as metres (sky NaN) and maps it near-bright: 6 m box bright, 40 m ground dim, sky black', () => {
    const z = readChannel0(zdepthPng())
    expect([z.width, z.height, z.max]).toEqual([192, 108, 65535])
    const m = metres(z)
    expect(Number.isNaN(m[0])).toBe(true)
    const inv = inverseDepth(m, 4, 250)
    const at = (x: number, y: number) => inv[y * 192 + x]
    expect(at(0, 0)).toBe(0)
    expect(at(80, 60)).toBeCloseTo((1 / 6 - 1 / 250) / (1 / 4 - 1 / 250), 5)
    expect(at(150, 80)).toBeCloseTo((1 / 40 - 1 / 250) / (1 / 4 - 1 / 250), 5)
    const f = path.join(tmp(), 'd.png')
    writeDepthControl(path.join(writeTmp(zdepthPng())), f)
    expect(readLuma(readFileSync(f)).data[0]).toBe(0)
  })
  it('near stays 4 m unless over a fifth of the frame is nearer (a close shot), then its 2nd percentile', () => {
    expect(nearFor(Float32Array.from([5, 6, 7, 8, 9, 3]))).toBe(4)
    expect(nearFor(Float32Array.from(Array.from({ length: 100 }, (_, i) => (i < 50 ? 1.5 : 10))))).toBe(1.5)
  })
})

function writeTmp(buf: Buffer): string { const f = path.join(tmp(), 'z.png'); writeFileSync(f, buf); return f }

describe('layout check', () => {
  const depth = () => { const z = readChannel0(zdepthPng()); return { width: z.width, height: z.height, data: inverseDepth(metres(z)) } }
  it('a still with the clay\'s box and horizon scores high; one with a tall wall drawn elsewhere, or the box moved, scores under the line', () => {
    const ok = layoutScore(depth(), readLuma(stillPng()))
    expect(ok.score).toBeGreaterThan(0.8)
    const wall = layoutScore(depth(), readLuma(stillPng({ x0: 0, x1: 50, y0: 8, y1: 100 })))
    const moved = layoutScore(depth(), readLuma(stillPng({ ...BOX, x0: BOX.x0 + 60, x1: BOX.x1 + 60 })))
    for (const s of [wall, moved]) expect(s.score).toBeLessThan(LAYOUT_MIN_SCORE)
  })
  it('verdict: a plain message under the line, none above; checkLayout reads files and is null on an unreadable one', () => {
    expect(verdict(0.2)).toMatchObject({ ok: false, message: expect.stringMatching(/may be missing the hero or have moved part of the set.*compare with the set frame before approving.*\(layout 0\.20, under 0\.38\)/) })
    expect(verdict(0.5)).toEqual({ score: 0.5, ok: true, message: null })
    const s = writeTmp(stillPng())
    expect(checkLayout(writeTmp(zdepthPng()), s)?.ok).toBe(true)
    const junk = path.join(tmp(), 'junk.png'); writeFileSync(junk, 'not a png')
    expect(checkLayout(writeTmp(zdepthPng()), junk)).toBeNull()
  })
})

describe('kit still spec', () => {
  it('frames by role: opening 0, end last, mid the middle unless a frame inside the take is picked', () => {
    expect([frameFor('opening', 97), frameFor('mid', 97), frameFor('end', 97), frameFor('mid', 97, 32), frameFor('mid', 97, 96)]).toEqual([0, 48, 96, 32, 48])
    // M2: an off-grid pick is never drawn on; the default mid is on the 8-grid for every 8k+1 length, so Render can send it
    expect(frameFor('mid', 97, 30)).toBe(48)
    for (let k = 2; k <= 24; k++) {
      const frames = 8 * k + 1, mid = frameFor('mid', frames)
      expect(mid % 8, `mid of ${frames}`).toBe(0)
      expect(mid >= 8 && mid < frames - 1, `mid of ${frames}`).toBe(true)
    }
    expect(frameFor('mid', 105)).toBe(48) // was 52: off the grid, refused by Render for ever
  })
  it('priced at the depth-locked draw (18 cr) + the Klein finish (3 cr) per still', () => {
    expect([kitStillCredits(1), kitStillCredits(2)]).toEqual([21, 42])
  })
})

describe('colour-match', () => {
  it('skips (never throws) without a target, without the script, without Python', async () => {
    const dir = tmp(), f = writeTmp(stillPng()), t = { file: f, url: '/x.png' }
    const run = async () => { throw new Error('should not run') }
    expect(await colorMatch({ appDir: dir, python: () => 'py', run }, f, null)).toMatchObject({ target: null, skipped: expect.any(String) })
    expect(await colorMatch({ appDir: dir, python: () => 'py', run }, f, t)).toMatchObject({ target: '/x.png', skipped: expect.stringMatching(/not installed/) })
  })
})
