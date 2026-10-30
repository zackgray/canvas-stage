// The front door's mapping: one Develop answer onto the five Guided steps. The place, the light and the story become the word stages'
// text; each person and prop becomes a DRAFT card (named, its look line as its words, nothing drawn); the story names the cast so the
// picks tag it later; a stage the answer leaves empty keeps what was typed; drawn cards are never thrown away; missing parts are fine.
import { describe, expect, it } from 'vitest'
import type { SceneBrief } from '../../../shared/bibleContract'
import { developedGuided, guidedHasWords, lightWords, placeWords } from '../design/developGuided'
import { castCard, freshGuided, guidedLogline, propCard } from '../design/guided'
import { developBlock } from '../design/useDevelop'
import { DEVELOPED, V2 } from './developFixture'

describe('developedGuided', () => {
  it('fills the word stages, makes a draft card per person and prop, and lands on the first step', () => {
    const g0 = { ...freshGuided(), step: 3, idea: { text: 'my words' } }
    const g = developedGuided(g0, DEVELOPED)
    expect(g.step).toBe(0)
    expect(g.st.loc.text).toBe('A small farmhouse kitchen, dawn.')
    expect(g.st.mood.text).toBe('Cold morning light through the window, from behind her, towards the camera, pale blue, soft light. Rims her hair and lights the steam. Steam rising from the kettle spout.')
    expect(g.st.story.text).toBe('Mara lifts the copper kettle off the stove. Mara pours into a cup. Mara looks out of the window at the yard.')
    expect(g.cast.map((c) => [c.name, c.type, c.desc, c.cands.length, c.pick, !!c.fixed])).toEqual([
      ['Mara', 'person', 'A cook in her fifties in a faded blue apron over a wool dress. Lined, calm, grey hair tied back.', 0, null, false]])
    expect(g.props!.map((p) => [p.name, p.desc, p.cands.length, p.pick])).toEqual([
      ['Copper kettle', 'A dented copper kettle with a black handle. Hammered copper, a bakelite handle. Dented with use.', 0, null],
      ['Wooden stool', 'A three-legged wooden stool. Pale pine.', 0, null]])
    expect(g.idea).toEqual({ text: 'my words', notes: ['Steam: steam cannot move in 3D (instead: drawn in the still only).'] })
    // nothing is picked yet, so the brief has no chips: it is the words until each card gets a look
    expect(guidedLogline(g)).not.toContain('@')
  })

  it('once the drafts are drawn and picked, the story tags them where it names them', () => {
    const g = developedGuided(freshGuided(), DEVELOPED)
    const drawn = { ...g, cast: g.cast.map((c) => ({ ...c, cands: ['/a.png'], pick: 0 })), props: g.props!.map((p) => ({ ...p, cands: ['/k.png'], pick: 0 })) }
    const brief = guidedLogline(drawn)
    expect(brief).toContain('@mara lifts @copper-kettle off the stove.')
    expect(brief).toContain('@wooden-stool is in the scene.') // a prop the story does not name is still in the brief
  })

  it('keeps a card that already has drawn options or a pick, adds no second card of that name, drops blank ones', () => {
    const drawn = { ...castCard('mara', 'person', 'my own words'), cands: ['/x.png'], pick: 0 }
    const typedOnly = castCard('Someone', 'person', 'typed, not drawn')
    const prop = { ...propCard('Wooden stool', 'mine'), cands: ['/s.png'] }
    const g = developedGuided({ ...freshGuided([drawn, typedOnly]), props: [prop] }, DEVELOPED)
    expect(g.cast).toHaveLength(1)
    expect(g.cast[0]).toBe(drawn)
    expect(g.props!.map((p) => p.name)).toEqual(['Wooden stool', 'Copper kettle'])
    expect(g.props![0]).toBe(prop)
  })

  it('robust to missing parts: a flat answer (no v2), no beats, no elements; an empty stage keeps the typed words', () => {
    const g0 = freshGuided()
    g0.st.loc.text = 'my place'
    const flat: SceneBrief = { brief: 'A quiet @lane at night.', elements: [], lighting: 'one street lamp', materials: '', background: '', beats: [], warnings: [] }
    const g = developedGuided(g0, flat)
    expect(g.st.loc.text).toBe('my place') // the answer has no place: what was typed stays
    expect(g.st.mood.text).toBe('One street lamp.')
    expect(g.st.story.text).toBe('A quiet lane at night.') // no beats: the paragraph, untagged
    expect(g.cast).toHaveLength(1) // one blank card to fill by hand
    expect(g.cast[0].name).toBe('')
    expect(g.props).toEqual([])
    expect(() => developedGuided(g0, { ...flat, v2: { ...V2, place: undefined, light: undefined, atmosphere: undefined, elements: undefined, beats: undefined, warnings: undefined } as never })).not.toThrow()
  })

  it('a dropped detail is said as a note to add back by hand', () => {
    const g = developedGuided(freshGuided(), { ...DEVELOPED, v2: { ...V2, warnings: [{ element: 'the yard gate', issue: 'your idea has this, but the brief left it out: add it back, or press Develop again', swap: '' }] } })
    expect(g.idea?.notes).toEqual(['The yard gate is in your text but not in the steps: add it where it belongs.'])
  })

  it('the parts read plainly', () => {
    expect(placeWords({ setting: 'a rooftop', period: '1920s', season: '', time: 'night', weather: 'light rain' })).toBe('A rooftop, 1920s, night, light rain.')
    expect(lightWords({ key: 'a single desk lamp' }, [])).toBe('A single desk lamp.')
    expect(placeWords(undefined)).toBe('')
  })
})

describe('guidedHasWords and developBlock', () => {
  it('asks before replacing only when the steps hold something', () => {
    expect(guidedHasWords(freshGuided())).toBe(false)
    const g = freshGuided(); g.st.story.text = 'x'
    expect(guidedHasWords(g)).toBe(true)
    expect(guidedHasWords(freshGuided([castCard('A name')]))).toBe(true)
  })
  it('says why the press cannot run, before anything is sent', () => {
    const st = (budget?: { cap: number | null; remaining: number | null }) => ({ prices: { single: 4, cold: 3, perItem: 1, retry: '' }, running: null, unrecovered: [], budget })
    expect(developBlock('  ', 4, st())).toMatch(/Describe your scene/)
    expect(developBlock('x'.repeat(2001), 4, st())).toMatch(/under 2000 characters/)
    expect(developBlock('a scene', null, null)).toMatch(/price/)
    expect(developBlock('a scene', 4, st({ cap: null, remaining: null }))).toMatch(/spending limit isn't set/)
    expect(developBlock('a scene', 4, st({ cap: 500, remaining: 2.5 }))).toBe("Today's budget has 2.5 cr left and this needs about 4. Raise the daily limit (see SETUP) to continue.")
    expect(developBlock('a scene', 4, st({ cap: 500, remaining: 4 }))).toBeNull()
    expect(developBlock('a scene', 4, st())).toBeNull() // a server that does not say its budget: the press goes and the server decides
  })
})
