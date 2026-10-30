import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FRONT_SIZE } from '../graphs.ts'
import { frontPrompt } from '../prompts.ts'

// QA 2026-10-24: four of five runs drew neck-down coats and gowns, so the face reference was useless.
describe('cast front framing', () => {
  const clothesFirst = 'A long weathered grey wool coat over a high-collared gown, heavy boots, a satchel, a woman of fifty with short silver hair'
  it('names the head and face first and again in the tail, however the description leads', () => {
    const p = frontPrompt(clothesFirst)
    expect(p.split(clothesFirst)[0]).toMatch(/head to toe.*face is clearly visible/)
    expect(p).toMatch(/full head, hair and face are in frame and sharp/)
    expect(p).toMatch(/clear space above the head/)
    expect(p).toMatch(/never cropped at the neck or shoulders/)
  })
  it('keeps the owner rules and stays a tall figure, not a landscape frame', () => {
    expect(frontPrompt(clothesFirst, 'my rules')).toContain('my rules')
    expect(FRONT_SIZE.height).toBeGreaterThan(FRONT_SIZE.width)
  })
  it('crops cast images from the top, so a tall figure in a wide tile keeps its head', () => {
    const css = readFileSync(new URL('../../../src/studio/scene/design.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.sd-img:not\(\.wh\)\s*\{[^}]*object-position:\s*50%\s*\d{1,2}%/)
  })
})
