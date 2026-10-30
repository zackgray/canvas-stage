// Prompt-fix pass (2026-10-30), the words alone: the finish card's person line for a face card and a closed-helmet card, nobody in the
// frame, figures not known; the piece lines by label vs raw tag; the draw's frame tail with no raw tag and the ID-pass edge rule; the
// "Added by the app" switches. Evidence: tonight's helmet close-up (a face grown behind a closed visor, night turned to day), the
// burnout close-up (a driver added to an empty cockpit, "In the frame: car2"), the aerial (grandstands said to run out at the top).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { KitItem } from '../../../src/stage3d/contract.ts'
import { buildCardPrompt, NO_PERSON_LINE } from '../kleinCard.ts'
import { cardMaterial } from '../kleinInputs.ts'
import { buildDrawPrompt, drawAdditions, type StillPromptParts } from '../kitStillPrompt.ts'
import { heroOutOfFrame } from '../nobody.ts'
import { MIN_TOP_ROW, pieceCoverAt, topRowSolid, wordsView } from '../pieceCover.ts'
import { shortName } from '../shortName.ts'
import { parseDrawAdds } from '../drawAdds.ts'

const CAR_LINE = 'An open-wheel single-seater race car with wide slick tyres, a tall rear wing and an open cockpit with a protective bar, matte black and red colored with carbon fiber details.'
const STAND_LINE = 'A straight on photo of a race track grand stand stadium.'
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

describe('the finish card (kleinCard.ts)', () => {
  it('hero in the frame, a face card: the person looks like image 2 as they appear there; no face is ever added; time of day and weather kept', () => {
    const c = buildCardPrompt({ gear: false, master: false, materials: [] })
    expect(c).toContain('with the person in it looking like the person in image 2, exactly as they appear there: the same face or helmet, hair, clothes and colours.')
    expect(c).toContain('Never add or reveal a face that image 2 does not show.')
    expect(c).toContain('the time of day, the weather, the light and the colours')
    expect(c).not.toMatch(/exact face/)
  })
  it('hero in the frame, a helmeted (faceless) card: the same generic words, so a closed visor stays closed; image numbers right with gear', () => {
    const c = buildCardPrompt({ gear: true, master: true, materials: [{ object: 'grandstand', detail: 'a straight on photo' }] })
    expect(c).toContain('looking like the person in images 2 and 3')
    expect(c).toContain('the same face or helmet and hair as image 2, the same clothes and colours as image 3')
    expect(c).toContain('Never add or reveal a face that image 2 does not show.')
    expect(c).toContain("Image 4 is the scene's master shot")
    expect(c).toContain('The grandstand in image 1 has the surface of image 5: only its material texture, not its shape, place, light, weather or time of day.')
    expect(c).not.toMatch(/straight on photo|exact face/)
  })
  it('hero out of the frame: no person line, it says nobody is there, and the materials take the numbers the face left', () => {
    const c = buildCardPrompt({ face: false, gear: true, master: false, materials: [{ object: 'race car', detail: '' }, { object: 'grandstand', detail: '' }] })
    expect(c).toContain(NO_PERSON_LINE)
    expect(c).not.toMatch(/looking like|face or helmet|clothes/)
    expect(c).toContain('The race car in image 1 has the surface of image 2')
    expect(c).toContain('The grandstand in image 1 has the surface of image 3')
    expect(c).toContain('the time of day, the weather, the light and the colours')
  })
  it('figures not known: the hero is not taken as out of frame, so the person line stays (new words)', () => {
    expect(heroOutOfFrame(null)).toBe(false)
    expect(heroOutOfFrame([])).toBe(true)
    expect(heroOutOfFrame([{ tag: 'hero', cx: 0.5, top: 0.1, bottom: 0.9, x0: 0.4, x1: 0.6 }])).toBe(false)
    expect(buildCardPrompt({ gear: false, master: false, materials: [] })).toContain('looking like the person in image 2')
  })
  it('stays short (BFL cites 50-80 words for Klein): one person and one material is no longer than before the pass (the helmet card sent on 10-30: 101 words)', () => {
    expect(words(buildCardPrompt({ gear: false, master: false, materials: [{ object: 'grandstand', detail: '' }] }))).toBeLessThanOrEqual(101)
  })
})

describe('piece names: the short name, never a raw tag', () => {
  it('a label that is a word stands; a tag-like label or tag is said by its word, with the board line\'s word before it', () => {
    expect(shortName({ label: 'grandstand', tag: 'grandstand', line: STAND_LINE })).toBe('grandstand')
    expect(shortName({ label: 'car2', tag: 'car2', line: CAR_LINE })).toBe('race car')
    expect(shortName({ tag: 'car2' })).toBe('car')
    expect(shortName({ tag: 'steam_train', line: 'A black steam train, smoking.' })).toBe('steam train')
  })
  it('the card\'s material clause names a prop by its short name, never the tag, and drops the tile\'s own description', () => {
    expect(cardMaterial(null, { tag: 'car2', kind: 'prop', line: CAR_LINE }).object).toBe('race car')
    expect(cardMaterial(null, { tag: 'grandstand', kind: 'prop', line: STAND_LINE }).object).toBe('grandstand')
    const c = buildCardPrompt({ face: false, gear: false, master: false, materials: [cardMaterial(null, { tag: 'car2', kind: 'prop', line: CAR_LINE })] })
    expect(c).not.toMatch(/car2|open-wheel/)
  })
})

const bible = (prompt: string): BibleRecord => ({ worldId: 'loc-x', version: 4, prompt, master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null,
  createdAt: '', updatedAt: '', elements: [
    { tag: 'driver', kind: 'cast', line: 'A driver.', refs: [] },
    { tag: 'car2', kind: 'prop', line: CAR_LINE, refs: [] },
    { tag: 'grandstand', kind: 'prop', line: STAND_LINE, refs: [] },
  ] } as unknown as BibleRecord)
const CAR = { kind: 'car2', at: [0, -5], pieceTag: 'prop:car2', label: 'car2' } as KitItem
const STAND = { kind: 'grandstand', at: [0, -30], pieceTag: 'prop:grandstand', label: 'grandstand' } as KitItem
const STAND_COPY = { kind: 'grandstand', at: [-20, -30], label: 'grandstand' } as KitItem
const parts = (o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: bible('Extreme close-up of the front wheel of @car2 at night, the @grandstand behind.'),
  plan: { sentence: '', kit: [CAR, STAND] }, cast: { cardId: 'driver', name: 'Driver', description: 'A race car driver in a closed helmet. He\'s dressed in a red suit.' },
  view: { kinds: ['car2', 'grandstand'], camera: '', pieces: [CAR, STAND], cutTop: [CAR, STAND] }, figures: [], ...o })

describe('the draw\'s frame tail (kitStillPrompt.ts + pieceCover.ts)', () => {
  it('never says a raw tag: "car2" is the race car', () => {
    const p = buildDrawPrompt(parts())
    expect(p).toContain('In the frame: race car; grandstand.')
    expect(p).not.toMatch(/\bcar2\b/)
  })
  it('the edge rule: a tagged piece by its own ID pixels (a real share of the top row, never one pixel; a speck is not named); any other by the projection, only when the depth\'s top row is not sky', () => {
    const view = { kinds: [], camera: '', pieces: [CAR, STAND, STAND_COPY], cutTop: [CAR, STAND, STAND_COPY] }
    // the aerial take: both tagged pieces end below the top, and the clay depth's top row is all sky, so the untagged copy is not cut either
    const aerial = wordsView(view, new Map([['prop:car2', { share: 0.0005, topRow: 0 }], ['prop:grandstand', { share: 0.15, topRow: 0 }]]), 0)!
    expect(aerial.cutTop).toEqual([])
    expect(aerial.pieces).toEqual([CAR, STAND, STAND_COPY]) // the distant car (~1,000 px) is still named
    // the helmet close-up: the tagged grandstand is a 53 px corner (not named, not cut); its untagged copy fills the top of the frame
    const helmet = wordsView(view, new Map([['prop:grandstand', { share: 53 / (1920 * 1088), topRow: 0 }]]), 0.97)!
    expect(helmet.pieces).toEqual([CAR, STAND_COPY])
    expect(helmet.cutTop).toEqual([CAR, STAND_COPY])
    const one = wordsView(view, new Map([['prop:grandstand', { share: 0.15, topRow: 1 / 1920 }]]), 0.5)!
    expect(one.cutTop).toEqual([CAR, STAND_COPY]) // one pixel of the tagged piece on the edge row is no cut
    const burn = wordsView(view, new Map([['prop:car2', { share: 0.58, topRow: 0.0625 }], ['prop:grandstand', { share: 0.16, topRow: 0.59 }]]), 0.8)!
    expect(burn.cutTop).toEqual([CAR, STAND, STAND_COPY])
    expect(wordsView(view, null, 0.01)!.cutTop).toEqual([]) // no ID pass, a sky top row: no cut
    expect(wordsView(view, null)).toBe(view) // neither known: as before
  })
  it('reads the ID pass PNG: shares and the top row per prop colour', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cover-'))
    const w = 200, h = 100, png = new PNG({ width: w, height: h })
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, stand = y < 40 && x >= 100, car = y >= 60 && x < 4 && y < 64
      png.data[i] = stand || car ? 255 : 0; png.data[i + 1] = stand ? 200 : car ? 255 : 0; png.data[i + 2] = stand ? 120 : car ? 160 : 0; png.data[i + 3] = 255
    }
    writeFileSync(path.join(dir, 'id_000.png'), PNG.sync.write(png))
    writeFileSync(path.join(dir, 'clay.json'), JSON.stringify({ idPass: { frames: [0], pattern: 'id_%03d.png', colors: { hero: [255, 0, 0], 'prop:car2': [255, 255, 160], 'prop:grandstand': [255, 200, 120] } } }))
    const c = pieceCoverAt(dir, 0)!
    expect(c.get('prop:grandstand')).toEqual({ share: (40 * 100) / (w * h), topRow: 0.5 })
    expect(c.get('prop:car2')!.topRow).toBe(0)
    expect(c.get('prop:grandstand')!.topRow).toBeGreaterThanOrEqual(MIN_TOP_ROW)
    expect(pieceCoverAt(dir, 8)).toBeNull()
    // the clay depth's top row: 16-bit, 0 = sky
    const z = new PNG({ width: 10, height: 2, bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false })
    const zd = new Uint16Array(20); for (let x = 0; x < 3; x++) zd[x] = 2400
    z.data = Buffer.from(zd.buffer)
    writeFileSync(path.join(dir, 'zdepth_000.png'), PNG.sync.write(z, { bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false }))
    expect(topRowSolid(path.join(dir, 'zdepth_000.png'))).toBeCloseTo(0.3)
    expect(topRowSolid('')).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('"Added by the app": the switches the server honours', () => {
  const hero = [{ tag: 'hero', cx: 0.5, top: 0.2, bottom: 1.01, x0: 0.4, x1: 0.6 }]
  const tagged = (o: Partial<StillPromptParts> = {}) => parts({ bible: bible('Extreme close-up of @driver beside @car2.'), figures: hero, ...o })
  it('on by default (today\'s words); each switched off leaves exactly its words out', () => {
    const all = buildDrawPrompt(tagged())
    const adds = drawAdditions(tagged())
    expect(adds.castRest).toBe("He's dressed in a red suit.")
    expect(adds.frameTail).toMatch(/^Around them: race car; grandstand\./)
    expect(all).toContain(adds.castRest)
    expect(all).toContain('Around them: race car; grandstand.')
    const noRest = buildDrawPrompt(tagged({ adds: { castRest: false } }))
    expect(noRest).not.toContain('dressed in')
    expect(noRest).toContain('A race car driver in a closed helmet.') // the card's first sentence stays
    const noTail = buildDrawPrompt(tagged({ adds: { frameTail: false } }))
    expect(noTail).not.toMatch(/Around them|runs? out of the picture/)
    expect(noTail).toContain("He's dressed in a red suit.")
    expect(buildDrawPrompt(tagged({ adds: { castRest: true, frameTail: true } }))).toBe(all)
  })
  it('the request field is checked: known keys to booleans only', () => {
    expect(parseDrawAdds(undefined)).toBeUndefined()
    expect(parseDrawAdds({ frameTail: false })).toEqual({ frameTail: false })
    expect(parseDrawAdds({ frameTail: 'no' })).toBe('bad')
    expect(parseDrawAdds({ alone: false })).toBe('bad')
    expect(parseDrawAdds([])).toBe('bad')
  })
})
