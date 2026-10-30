// Stage-only plan, section 5 (track DRAW): the first-frame draw reads the owner's words. The drawer's text (the Bible's scene prompt)
// leads as written, the card goes once as written, the Stage adds only its own layout; nothing the user, the card or the brief wrote
// is scrubbed; a stated medium drops the photo lead and the finish's photograph words. Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import { CLIPS } from '../../../src/stage3d/clips.ts'
import { buildEditPrompt } from '../editPrompt.ts'
import { buildDrawPrompt, drawStyled, type StillPromptParts } from '../kitStillPrompt.ts'
import { buildCardPrompt } from '../kleinCard.ts'

const CARD = 'A detailed character concept sheet for a woman in a dark green rain jacket with a deep hood, short grey hair, a canvas bag over one shoulder. Calm, tired face.'
const BRIEF = {
  logline: 'a macro close up shot of @ana with rain slowly dripping down her hood',
  place: { setting: 'a bus shelter on a wet street', period: '', season: '', time: 'night', weather: 'rain' },
  light: { key: 'a sodium street lamp', direction: 'from the left', height: '', quality: 'hard', colour: 'orange', others: '', effect: '' },
  atmosphere: [{ what: 'mist', where: 'over the road' }],
  elements: [{ name: 'Ana', tag: 'ana', type: 'person', look: CARD, supported: true, materials: '', condition: '', face: '' }],
  beats: [{ who: '@ana', does: 'waits for the bus, checking her watch', seconds: 4, visible: '' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: [], warnings: [], developed: [],
} as unknown as SceneBriefV2
const bible = (prompt: string, o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: 'loc-x', version: 5, prompt, master: null, candidates: [],
  lighting: 'Flat grey light.', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', brief: BRIEF,
  elements: [{ tag: 'ana', kind: 'cast', cardId: 'ana', refs: [], line: '' }, { tag: 'ben', kind: 'cast', cardId: 'ben', refs: [], line: '' },
    { tag: 'lamp', kind: 'prop', refs: [], line: 'A tall iron street lamp.' }], ...o } as BibleRecord)
const hero = { tag: 'hero', cx: 0.5, top: 0.05, bottom: 1.2, x0: 0.2, x1: 0.8 }
const parts = (b: BibleRecord | null, o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: b, plan: { sentence: '', kit: [{ kind: 'lamp', at: [1, -3], pieceTag: 'prop:lamp' }] as StillPromptParts['plan']['kit'] },
  cast: { cardId: 'ana', name: 'Ana', description: CARD }, view: { kinds: ['lamp'], camera: '', angle: 'Seen at eye height.', pieces: [{ kind: 'lamp', pieceTag: 'prop:lamp' }] },
  figures: [hero], action: 'standing', perfT: 0, focal: 100, ...o })
const OWNER = 'a macro close up shot of @ana with rain slowly dripping down her hood'

describe('the scene words lead the draw', () => {
  it('the owner\'s case: the framing and the weather as written, the tag replaced by the card, no beat and no place sentence', () => {
    const t = buildDrawPrompt(parts(bible(OWNER)))
    expect(t.startsWith('A macro close up shot of a woman in a dark green rain jacket')).toBe(true)
    expect(t).toContain('macro close up shot of')
    expect(t).toContain('rain slowly dripping down her hood')
    expect(t.match(/dark green rain jacket/g)).toHaveLength(1) // the card once, at the tag; no second "Ana: <card>" block
    expect(t).toContain('a woman in a dark green rain jacket with a deep hood, short grey hair, a canvas bag over one shoulder with rain slowly dripping down her hood. Calm, tired face.')
    expect(t).not.toMatch(/concept sheet/i)
    expect(t).not.toMatch(/waits for the bus|checking her watch/) // the beat: the words already say what happens
    expect(t).not.toMatch(/bus shelter|sodium|mist over|Flat grey light/) // the place, light and air lines: in the words
    expect(t).toContain('Seen at eye height.') // the Stage's own layout stays
    expect(t).toContain('Around them: a tall iron street lamp.')
    expect(t).not.toMatch(/alone in the picture|A photograph\.|Ana:/)
  })
  it('a fire word and a grain word survive whole, in the words, the brief\'s style and the card', () => {
    const t = buildDrawPrompt(parts(bible('a firefighter by a campfire, grainy film look')))
    expect(t).toContain('A firefighter by a campfire, grainy film look.')
    const s = buildDrawPrompt(parts(bible('', { brief: { ...BRIEF, style: 'grainy film look, a campfire glow' } }), { cast: { cardId: 'ana', name: 'Ana', description: 'A firefighter in a smoke-stained coat' } }))
    expect(s).toMatch(/^A firefighter in a smoke-stained coat/)
    expect(s).toMatch(/Grainy film look, a campfire glow\.$/)
  })
  it('a stated medium: no photo lead, in the words path and the structured one; the finish says "A picture"', () => {
    const w = parts(bible('an oil painting of @ana in a wheat field'))
    const t = buildDrawPrompt(w)
    expect(t).toMatch(/^An oil painting of a woman in a dark green rain jacket[^.]* in a wheat field\./)
    expect(t).not.toMatch(/Photo|A photograph/)
    expect(drawStyled(w)).toBe(true)
    const st = parts(bible('', { brief: { ...BRIEF, style: 'a watercolour' } }))
    expect(buildDrawPrompt(st)).not.toMatch(/Photo/)
    expect(drawStyled(st)).toBe(true)
    expect(drawStyled(parts(bible(OWNER)))).toBe(false)
    expect(drawStyled(parts(bible(OWNER), { override: 'An anime still of a girl' }))).toBe(true)
  })
  it('no alone line ever; a cast member nobody on the set plays is left out', () => {
    expect(buildDrawPrompt(parts(bible('@ana in a crowd of people at a bus stop')))).toContain('in a crowd of people at a bus stop')
    const t = buildDrawPrompt(parts(bible('@ana waits. @ben sits on a bench.')))
    expect(t).not.toMatch(/\bben\b|bench/i)
    expect(t).not.toMatch(/alone in the picture/)
  })
  it('the hero out of the frame: no card, no alone line, the pieces "In the frame"', () => {
    const t = buildDrawPrompt(parts(bible(OWNER), { figures: [] }))
    expect(t).not.toMatch(/Ana:|alone in the picture|dark green rain jacket/)
    expect(t).toContain('In the frame: a tall iron street lamp.')
  })
})

describe('no test concept and no loose-cloth line in any draw text', () => {
  const BAD = /\bhive|\bhats?\b|trees, gates|gates or walls|loose cloth|netting/i
  it('the draw (both paths), the edit and the lift clip\'s pose words', () => {
    for (const t of [buildDrawPrompt(parts(bible(OWNER))), buildDrawPrompt(parts(bible(''))), buildDrawPrompt(parts(bible(''), { mode: 'master', figures: null }))]) expect(t).not.toMatch(BAD)
    expect(buildEditPrompt({ place: 'a kitchen', pieces: ['a stool'], prop: 'stool', figure: '', doing: '', description: 'A cook in a white apron' })).not.toMatch(BAD)
    for (const c of [CLIPS.lift, CLIPS.liftDown]) {
      expect(c.note).not.toMatch(/hive|frame/i)
      for (const ph of c.phases ?? []) expect(ph.words).not.toMatch(/hive|frame/i)
    }
  })
})

describe('the finish prompt (kleinCard.ts)', () => {
  // (prompt-fix pass, 2026-10-30) the person line for any card (a face or a closed helmet), the time of day and weather kept
  const TODAY = 'A real photograph: image 1 exactly as it is, with the person in it looking like the person in images 2 and 3, exactly as they appear there: the same face or helmet and hair as image 2, the same clothes and colours as image 3. ' +
    'Never add or reveal a face that image 2 does not show. ' +
    'Keep everything else from image 1: camera, framing, their pose, size and place, background, the time of day, the weather, the light and the colours. ' +
    'Image 4 is the scene\'s master shot: the same place and light; take nothing else from it. Real photographic detail.'
  it('unstyled is byte for byte today\'s; styled says "A picture" and has no photograph words', () => {
    expect(buildCardPrompt({ gear: true, master: true, materials: [] })).toBe(TODAY)
    expect(buildCardPrompt({ gear: true, master: true, materials: [], styled: false })).toBe(TODAY)
    const s = buildCardPrompt({ gear: true, master: true, materials: [], styled: true })
    expect(s).toMatch(/^A picture: image 1 exactly as it is/)
    expect(s).not.toMatch(/real photograph|photographic/i)
  })
})
