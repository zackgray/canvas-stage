// E130 prompt rule: each figure's size and place in the frame, from the clay's ID pass (exact) or, at frame 0, the projected hero.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { figuresAt, figuresFromId, figureWords, heroFromCamera } from '../figures.ts'

const W = 192, H = 108
/** a flat-colour ID frame: black world, red hero box, green extra box */
function idPng(boxes: { rgb: [number, number, number]; x0: number; x1: number; y0: number; y1: number }[]): Buffer {
  const png = new PNG({ width: W, height: H })
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = boxes.find((q) => x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1), i = (y * W + x) * 4
    const [r, g, bl] = b?.rgb ?? [0, 0, 0]
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = bl; png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}
const COLORS: Record<string, [number, number, number]> = { hero: [255, 0, 0], 'extra:0:2': [0, 255, 0], 'prop:cart': [0, 0, 255] }

describe('figures', () => {
  it('reads each figure from the ID pass: hero first, props skipped, an edge-touching figure is cut', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fig-')), f = path.join(dir, 'id.png')
    writeFileSync(f, idPng([{ rgb: [255, 0, 0], x0: 90, x1: 100, y0: 40, y1: 58 }, { rgb: [0, 255, 0], x0: 180, x1: 192, y0: 45, y1: 57 }, { rgb: [0, 0, 255], x0: 10, x1: 40, y0: 60, y1: 80 }]))
    const figs = figuresFromId(f, COLORS)
    expect(figs.map((x) => x.tag)).toEqual(['hero', 'extra:0:2'])
    expect(figs[0].cx).toBeCloseTo(95 / W, 3); expect(figs[0].bottom - figs[0].top).toBeCloseTo(18 / H, 3)
    expect([figs[0].x0, figs[0].x1]).toEqual([90 / W, 100 / W]) // (recipe wave) the left-right extent the people strip crops by
    const words = figureWords(figs, 'A stocky man in an olive jacket.')
    expect(words[0]).toBe('In the middle of the frame, far away, one small distant figure seen whole, only a sixth of the frame tall: a stocky man in an olive jacket.')
    expect(words[1]).toMatch(/^At the far right edge of the frame, far away, a second small distant figure seen whole/)
  })
  it('(recipe wave) a colour a prop also wears is never read as a figure; per-piece prop colours leave figures as they were', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fig-')), f = path.join(dir, 'id.png')
    writeFileSync(f, idPng([{ rgb: [255, 0, 0], x0: 90, x1: 100, y0: 40, y1: 58 }, { rgb: [0, 255, 0], x0: 10, x1: 40, y0: 60, y1: 80 }, { rgb: [255, 160, 0], x0: 120, x1: 160, y0: 60, y1: 80 }]))
    // a table where a prop clashes with the extra's green (an old export, or a bad palette): that blob is ambiguous, not a figure
    expect(figuresFromId(f, { hero: [255, 0, 0], 'extra:0:2': [0, 255, 0], 'prop:engine': [0, 255, 0] }).map((x) => x.tag)).toEqual(['hero'])
    expect(figuresFromId(f, { hero: [255, 0, 0], 'extra:0:2': [0, 255, 0], 'prop:engine': [255, 160, 0], 'prop:lamp': [255, 255, 0] }).map((x) => x.tag)).toEqual(['hero', 'extra:0:2'])
  })
  it('a close hero cut by the bottom edge, and no millimetres or background words ever', () => {
    const w = figureWords([{ tag: 'hero', cx: 0.3, top: 0.2, bottom: 1.01 }], 'a woman')
    expect(w[0]).toBe('On the left of the frame, one close figure cut off by the bottom edge of the frame, three quarters of the frame tall: a woman.')
    expect(w.join(' ')).not.toMatch(/\bmm\b|lens/)
  })
  it('frame 0 without an ID pass: the hero projected from the start point through the opening camera', () => {
    const cam = { position: [0.6, 1.5, -7.7], quaternion: [0, 0, 0, 1], focal: 24 }
    const h = heroFromCamera([0.6, -12.5], cam)!
    expect(h.cx).toBeCloseTo(0.5, 2)
    expect(h.bottom - h.top).toBeCloseTo(24 * 1.8 / 4.8 / (36 / (1920 / 1088)), 2) // a 1.8 m figure 4.8 m away on 24 mm
    expect((h.x1 - h.x0) * 1920).toBeCloseTo((h.bottom - h.top) * 1088 * 0.25, 0) // 0.45 m wide on 1.8 m, in pixels
    expect(figureWords([h], 'a woman')).toEqual(figureWords([{ tag: 'hero', cx: h.cx, top: h.top, bottom: h.bottom } as typeof h], 'a woman')) // the words never read the extent
    expect(heroFromCamera([0.6, 5], cam)).toBeNull() // behind the camera
    const empty = mkdtempSync(path.join(tmpdir(), 'fig-'))
    expect(figuresAt(empty, 0, [0.6, -12.5], cam)).toEqual([h])
    expect(figuresAt(empty, 48, [0.6, -12.5], cam)).toBeNull() // a later frame with no ID pass: not known
  })
})
