// Guided writes the user's own step texts into the v2 brief; none of them is refused for length at ordinary sizes (the owner's
// orchard run: cast 348, location 294, mood 314 characters were refused by limits sized for Gemma's short answers). The same
// brief passes the free pre-build check and the server's Bible save, and its light reaches the lines and the still once.
import { describe, expect, it } from 'vitest'
import { checkDesign } from '../../../../server/bible/validate'
import { flatLines } from '../../../../server/bible/briefLines'
import { buildDrawPrompt, type StillPromptParts } from '../../../../server/hero/kitStillPrompt'
import { bibleWrite } from '../design/buildCheck'
import { castCard, freshGuided } from '../design/guided'
import { finishGuided } from '../design/routes'
import { freshDesign } from '../design/state'
import type { BibleRecord } from '../../../shared/bibleContract'

const LOC = 'An apple orchard in autumn: two rows of mature apple trees on either side, red apples in the branches and a few in the long green grass below, a wooden garden bench standing between the rows, the far end of the orchard opening to a pale late-afternoon sky.'
const CAST = "A woman in her seventies, slim and slightly stooped, grey-white hair pinned up loosely, a deeply lined, kind face with bright eyes. She wears a wide-brimmed straw gardener's hat with its ribbon tied and folded back off her face onto the brim, a loose off-white cotton gardener's smock over a soft wool cardigan, canvas trousers and brown leather gloves."
const MOOD = 'Late afternoon, the sun low and golden behind her, shining towards the camera through the trees: a warm rim of light around her hair and shoulders, the apple leaves glowing where the sun comes through them, long soft shadows reaching towards us across the grass, dust motes catching the light as they drift between the trees.'
const STORY = 'She lifts a woven basket of apples off the wooden bench with both gloved hands. She raises it slowly towards the low sun behind her, the apples glowing gold. She holds it still and studies it as leaves drift around her hands.'

function design() {
  const g = freshGuided([{ ...castCard('Gardener', 'person', CAST), cands: ['/lab-assets/cast/gd/draft/cand-1.png'], pick: 0 }])
  // the word stages are words only: nothing drawn, nothing picked
  g.st.loc.text = LOC
  g.st.mood.text = MOOD
  g.st.story.text = STORY
  const d = { ...freshDesign(), ...finishGuided(freshDesign(), g) }
  return { ...d, pieces: d.pieces.map((p) => (p.type === 'person' ? { ...p, cardId: 'gd' } : p)) } // the cast tile has its Cast card
}
const count = (s: string, w: string) => s.split(w).length - 1

describe('Guided keeps the user\'s own words at their real length', () => {
  const d = design()
  const v2 = d.v2!

  it('the brief holds the three texts whole', () => {
    expect(v2).not.toBeNull()
    expect(v2.elements[0].look).toBe(CAST)
    expect(v2.place.setting).toBe(LOC)
    expect(v2.light.key).toBe(MOOD)
    expect(CAST.length).toBeGreaterThan(240); expect(LOC.length).toBeGreaterThan(200); expect(MOOD.length).toBeGreaterThan(120)
  })

  it('passes the free pre-build check (the Bible write, checked as the server checks it) with nothing to refuse', () => {
    expect(checkDesign(bibleWrite(d))).toEqual([])
  })

  it('a pathological paste is still refused, with a clear message', () => {
    const big = { ...v2, place: { ...v2.place, setting: 'x'.repeat(1001) } }
    expect(checkDesign({ brief: big }).join(' ')).toMatch(/place\.setting: 1001 characters, at most 1000/)
    const huge = { ...v2, elements: v2.elements.map((e) => ({ ...e, look: 'y'.repeat(1000), materials: 'y'.repeat(1000) })), beats: Array.from({ length: 8 }, () => ({ ...v2.beats[0], does: 'z'.repeat(1000), visible: 'z'.repeat(1000) })) }
    expect(checkDesign({ brief: huge }).join(' ')).toMatch(/characters in all, at most 12000/)
  })

  it('the derived lighting line carries the light once, in the user\'s words', () => {
    const line = flatLines(v2).lighting
    expect(line).toBe(MOOD.replace(/\.$/, '') + '.')
    expect(count(line, 'rim of light')).toBe(1)
    expect(count(line, 'long soft shadows')).toBe(1)
  })

  // the draw leads with the scene words as the Bible keeps them (stage-only plan, section 5); the structured place and light are
  // not said again over them, and the card goes once, whole
  it('a still built from it leads with the long words whole, says the light once and the card once, and does not repeat the place', () => {
    const words = `@gardener stands between the rows. ${MOOD}`
    const bible = { worldId: 'w', version: 1, prompt: words, master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
      elements: [{ tag: 'gardener', kind: 'cast', cardId: 'gd', refs: [], line: '' }], brief: v2 } as unknown as BibleRecord
    const p: StillPromptParts = { bible, plan: { sentence: 'An orchard.', kit: [] as StillPromptParts['plan']['kit'] }, cast: { cardId: 'gd', name: 'Gardener', description: CAST },
      view: null, figures: [{ tag: 'hero', cx: 0.5, top: 0.3, bottom: 0.8, x0: 0.45, x1: 0.55 }], focal: 35 }
    const out = buildDrawPrompt(p)
    // the tag said by the card's first sentence; its remaining sentence follows the user's sentence; then the rest of the user's words, uncut
    const [first, ...rest] = CAST.split('. ')
    expect(out.startsWith(`${first} stands between the rows. ${rest.join('. ')} ${MOOD}`)).toBe(true)
    expect(out).not.toMatch(/A photograph\./)
    for (const w of ['a warm rim of light around her hair and shoulders', 'long soft shadows reaching towards us across the grass', 'dust motes catching the light']) expect(count(out, w)).toBe(1)
    expect(count(out, first)).toBe(1) // the card description once, as written (all 353 characters): first sentence at the tag,
    expect(count(out, rest.join('. '))).toBe(1) // the rest right after the user's sentence
    expect(out).not.toContain(LOC.slice(0, 40)) // words given: the structured place is not repeated
    expect(out).not.toContain('@')
  })
})
