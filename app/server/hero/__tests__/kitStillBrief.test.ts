// The still, master and redraw prompts written from the scene brief v2 (prompt wave, 2026-10-25; docs/plan-prompt-wave.md §4): the
// action at this frame (beat -> take.action -> motion word), the place whole, the brief's one light (a rim only when it is behind the
// subject), the atmosphere placed, pieces by label with relief never named, the lens feel never a millimetre, no stock, no age the
// brief does not give. The Klein finish: at most 4 images, duplicates once, the master dropped first. Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import { faceRedrawWords, facePrompt } from '../faceRedraw.ts'
import { buildDrawPrompt, type StillPromptParts } from '../kitStillPrompt.ts'
import { buildCardPrompt, kleinRefs } from '../kleinCard.ts'
import { cardMaterial } from '../kleinInputs.ts'
import { beatAt, heroAction, lightOf, participle } from '../stillBrief.ts'

const el = (tag: string, type: 'person' | 'prop', o: Partial<SceneBriefV2['elements'][number]> = {}) =>
  ({ name: tag.replace(/_/g, ' '), tag, type, look: '', supported: true, materials: '', condition: '', face: '', ...o })

/** shaped like run 1's idea (an old keeper lifting a frame from a hive in an orchard, a low sun behind her, bees) */
const RUSTIC: SceneBriefV2 = {
  logline: '@keeper lifts a frame from @hive',
  place: { setting: 'an old apple orchard', period: '', season: 'autumn', time: 'late afternoon', weather: 'clear' },
  light: { key: 'low late-afternoon sun', direction: 'behind her, towards camera', height: 'low', quality: 'hard', colour: 'warm gold', others: '', effect: 'it glows through the comb' },
  atmosphere: [{ what: 'bees', where: 'drifting around her hands and the hive' }],
  elements: [el('keeper', 'person', { name: 'the keeper', face: 'deeply lined, kind, grey-white hair' }), el('hive', 'prop', { materials: 'white-painted pine boxes, a tin roof' })],
  beats: [{ who: '@keeper', does: 'lifts a honeycomb frame out of the hive', seconds: 3, visible: 'squinting into the sun' }, { who: '@keeper', does: 'holds it up to the light', seconds: 3, visible: 'smiling' }],
  camera: { size: '', angle: '', move: '', lensFeel: '' }, style: '', background: '', exclude: ['no other people'], warnings: [], developed: [],
}
/** a new thing in a clean place: nothing in it is old */
const SLEEK: SceneBriefV2 = {
  ...RUSTIC,
  logline: '@driver walks around @car',
  place: { setting: 'a glass-walled car showroom', period: 'present day', season: '', time: 'night', weather: '' },
  light: { key: 'cool overhead panel lights', direction: 'from above', height: 'overhead', quality: 'soft', colour: 'cool white', others: '', effect: 'long reflections along the bodywork' },
  atmosphere: [],
  elements: [el('driver', 'person', { name: 'the driver' }), el('car', 'prop', { name: 'the sports car', materials: 'gloss red paint, carbon-fibre splitter, chrome badges', condition: 'brand new' })],
  beats: [{ who: '@driver', does: 'walks slowly around the car', seconds: 4, visible: '' }],
}
// (stage-only) no scene words by default: these cases test the structured path (scene words lead otherwise: kitStillWords.test.ts)
const bible = (brief: SceneBriefV2 | null, o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: 'loc-x', version: 4, prompt: '',
  master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
  elements: [{ tag: 'keeper', kind: 'cast', cardId: 'kp', refs: [], line: '' }, { tag: 'driver', kind: 'cast', cardId: 'dr', refs: [], line: '' }],
  ...(brief ? { brief } : {}), ...o } as BibleRecord)
const KIT = [{ kind: 'deadTree', at: [3, -9], label: 'apple trees heavy with fruit' }, { kind: 'mound', at: [0, -60] }, { kind: 'rock', at: [5, -30] },
  { kind: 'crates', at: [-2, -6], label: 'a white-painted hive', pieceTag: 'prop:hive' }] as StillPromptParts['plan']['kit']
const parts = (b: BibleRecord, o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: b, plan: { sentence: 'An orchard.', kit: KIT },
  cast: { cardId: 'kp', name: 'Keeper', description: 'An old woman in her seventies, a wide straw hat, an off-white cotton smock' },
  view: null, figures: [{ tag: 'hero', cx: 0.5, top: 0.3, bottom: 0.8, x0: 0.45, x1: 0.55 }], action: 'walking towards us', focal: 24, ...o })
const HOUSE = /kodak|vision3|\d\s?mm\b|weathered|earth bank|cinematic|golden hour|film grain|calm/i
const AGE = /\b(old|aged|weathered|worn|rust\w*|patina|dirty|mud\w*|cracked|peeling|faded|dusty|grimy|scuffed)\b/i

describe('the still draw from a v2 brief', () => {
  it('run-1-shaped: the beat\'s action, the low sun behind her with a rim, the bees placed; no stock, no mm, no age, no earth bank', () => {
    const t = buildDrawPrompt(parts(bible(RUSTIC)))
    expect(t).toMatch(/^An old woman in her seventies, [^.]* in an old apple orchard, autumn, late afternoon, clear\./)
    expect(t).toContain('The keeper lifts a honeycomb frame out of the hive, squinting into the sun.')
    expect(t).toMatch(/Hard low late-afternoon sun, behind her, towards camera, warm gold light: faces in shade with a rim/)
    expect(t).toMatch(/long shadows falling towards us\. It glows through the comb\./)
    expect(t).toContain('Bees drifting around her hands and the hive.')
    expect(t).toMatch(/Around them: apple trees heavy with fruit; a white-painted hive, white-painted pine boxes, a tin roof\./)
    expect(t).toContain('A wide-angle view with deep space around them.') // 24 mm said as a feel
    for (const w of ['lifts', 'behind her', 'bees']) expect(t.toLowerCase()).toContain(w)
    expect(t).not.toMatch(HOUSE)
    expect(t).not.toMatch(/mound|rock|dead tree|Set in|Cast:/i) // relief never named; the Guided labels never sent
  })
  it('a later frame takes the beat running then; the take\'s written action stands in when the brief has no beat for the hero', () => {
    expect(buildDrawPrompt(parts(bible(RUSTIC), { perfT: 4 }))).toContain('The keeper holds it up to the light, smiling.')
    const noBeats = bible({ ...RUSTIC, beats: [] })
    expect(buildDrawPrompt(parts(noBeats, { takeAction: 'She lifts a honeycomb frame and holds it to the sun.' }))).toContain('She lifts a honeycomb frame and holds it to the sun.')
    expect(buildDrawPrompt(parts(noBeats))).toMatch(/smock, walking towards us, in an old apple orchard/) // the motion word, last
  })
  it('a sleek brief draws no age: the materials and newness it gives, the light from above with no rim', () => {
    const t = buildDrawPrompt(parts(bible(SLEEK), { cast: { cardId: 'dr', name: 'Driver', description: 'A woman in a tailored black suit' },
      plan: { sentence: '', kit: [{ kind: 'wagon', at: [0, -6], label: 'a red sports car', pieceTag: 'prop:car' }] as StillPromptParts['plan']['kit'] }, focal: 85 }))
    expect(t).toMatch(/^A woman in a tailored black suit in a glass-walled car showroom, present day, night\./)
    expect(t).toContain('The driver walks slowly around the car.')
    expect(t).toMatch(/a red sports car, gloss red paint, carbon-fibre splitter, chrome badges, brand new/)
    expect(t).toContain('A long-lens view, the background compressed close behind them.')
    expect(t).toMatch(/Soft cool overhead panel lights, from above, cool white light\. Long reflections along the bodywork\./)
    expect(t).not.toMatch(AGE); expect(t).not.toMatch(HOUSE); expect(t).not.toMatch(/rim/)
  })
  it('no v2 brief and no scene words (frame 0): today\'s words minus stock, lens mm, aged pieces and canned light; the flat lighting line if any', () => {
    // stage-only: the card as written (no "with … and …" rewrite) and no loose-cloth line; the place is the plan sentence's first clause
    const old = bible(null, { lighting: 'Flat grey light from a low cloud.' })
    const t = buildDrawPrompt(parts(old, { plan: { sentence: 'A muddy field at dusk: broken fences.', kit: [{ kind: 'deadTree', at: [3, -9] }, { kind: 'mound', at: [0, -60] }] as StillPromptParts['plan']['kit'] } }))
    expect(t).toBe('An old woman in her seventies, a wide straw hat, an off-white cotton smock, walking towards us, a muddy field at dusk. ' +
      'In the middle of the frame, one close figure seen whole, about half of the frame tall. A wide-angle view with deep space around them. Around them: dead tree. Flat grey light from a low cloud.')
    expect(buildDrawPrompt(parts(bible(null), { plan: { sentence: 'A field.', kit: [] }, takeAction: 'She kneels by the gate.' }))).toContain('She kneels by the gate.')
  })
  it('no v2 brief but scene words: the words as written, the untagged hero once by the card, then the layout; no alone line, no lead; no flat light line, no written action', () => {
    const old = bible(null, { prompt: 'A muddy field at dusk: broken fences.', lighting: 'Flat grey light from a low cloud.' })
    const t = buildDrawPrompt(parts(old, { takeAction: 'She kneels by the gate.', plan: { sentence: '', kit: [{ kind: 'deadTree', at: [3, -9] }, { kind: 'mound', at: [0, -60] }] as StillPromptParts['plan']['kit'] } }))
    expect(t).toBe('A muddy field at dusk: broken fences. An old woman in her seventies, a wide straw hat, an off-white cotton smock. ' +
      'In the middle of the frame, one close figure seen whole, about half of the frame tall. A wide-angle view with deep space around them. Around them: dead tree.')
  })
  it('the brief\'s style is the only style; an owner\'s pasted prompt goes verbatim (decision 1, warned elsewhere)', () => {
    expect(buildDrawPrompt(parts(bible({ ...RUSTIC, style: 'a faded 1970s snapshot' })))).toMatch(/A faded 1970s snapshot\.$/)
    expect(buildDrawPrompt(parts(bible(RUSTIC), { override: 'Kodak, 24mm, golden hour, flames' }))).toBe('Kodak, 24mm, golden hour, flames')
  })
  it('the master: the place with nobody in it, its camera words, the light with no faces, the atmosphere without her', () => {
    const m = buildDrawPrompt(parts(bible(RUSTIC), { mode: 'master', figures: null, masterCamera: 'Seen at eye height, 1.6 metres up.' }))
    expect(m).toMatch(/^Photo of an old apple orchard, autumn, late afternoon, clear. The place stands empty and quiet. Seen at eye height, 1\.6 metres up\. A wide-angle view with deep space\. In the frame: /)
    expect(m).toContain('every edge rimmed with light'); expect(m).toContain('Bees.')
    expect(m).not.toMatch(/faces?\b|\bher\b|keeper|lifts|glows/i); expect(m).not.toMatch(HOUSE)
  })
})

describe('brief readers', () => {
  it('participles and the beat at a time', () => {
    expect(['lifts a frame', 'runs', 'makes tea', 'watches', 'carries a box', 'ties a knot', 'sees it', 'walking'].map(participle))
      .toEqual(['lifting a frame', 'running', 'making tea', 'watching', 'carrying a box', 'tying a knot', 'seeing it', 'walking'])
    expect(beatAt(RUSTIC, 'keeper', 0)?.does).toMatch(/^lifts/); expect(beatAt(RUSTIC, 'keeper', 5)?.does).toMatch(/^holds/); expect(beatAt(RUSTIC, 'nobody', 0)).toBeNull()
    expect(heroAction({ beat: RUSTIC.beats[0], motion: 'walking' })).toEqual({ attach: 'lifting a honeycomb frame out of the hive, squinting into the sun', after: '' }) // no name: attached
  })
  it('the rim belongs to a key behind the subject only', () => {
    expect(lightOf({ ...RUSTIC.light, direction: 'from the left of frame' }, true)).not.toMatch(/rim|shade/)
    expect(lightOf(RUSTIC.light, true)).toMatch(/faces in shade with a rim/)
  })
  it('the face redraw: the brief\'s face line and the beat\'s cue, never "calm"', () => {
    const w = faceRedrawWords(bible(RUSTIC), 'keeper', 'An old woman. She keeps bees.', 0)
    expect(w).toEqual({ who: 'deeply lined, kind, grey-white hair', expression: 'squinting into the sun' })
    expect(facePrompt(w.who, w.expression)).toMatch(/: deeply lined, kind, grey-white hair\. .*Natural skin, clear eyes, squinting into the sun\.$/)
    expect(facePrompt(faceRedrawWords(null, null, 'A tall man. He waits.').who)).toMatch(/: A tall man\. .*Natural skin, clear eyes\.$/)
    expect(facePrompt('x')).not.toMatch(/calm/)
  })
})

describe('the Klein finish references (decision 6)', () => {
  const mats = ['m1.png', 'm2.png']
  it('6 images (draw, face, gear, master, 2 materials) send 4: both materials go before the master', () => {
    const r = kleinRefs({ face: 'face.png', gear: 'front.png', master: 'master.png', materials: mats, fileOf: (m) => m })
    expect(r).toMatchObject({ gear: 'front.png', master: 'master.png', materials: [] })
    expect(r.dropped).toHaveLength(2)
    expect(r.dropped.every((d) => /material image/.test(d))).toBe(true)
  })
  it('5 images (one material): the material goes, the master and gear stay', () => {
    expect(kleinRefs({ face: 'face.png', gear: 'front.png', master: 'master.png', materials: ['m1.png'], fileOf: (m) => m })).toMatchObject({ gear: 'front.png', master: 'master.png', materials: [] })
    const r = kleinRefs({ face: 'face.png', gear: 'front.png', master: 'master.png', materials: [], fileOf: (m: string) => m })
    expect(r).toMatchObject({ gear: 'front.png', master: 'master.png', dropped: [] })
  })
  it('identical files go once (run 1: the cast front sent as face and gear); then the master fits', () => {
    const r = kleinRefs({ face: 'cast/face-1.png', gear: 'cast/face-1.png', master: 'master.png', materials: ['tile.png'], fileOf: (m) => m })
    expect(r).toMatchObject({ gear: null, master: 'master.png', materials: ['tile.png'] })
    expect(buildCardPrompt({ gear: false, master: true, materials: [cardMaterial(null, { tag: 'materials', kind: 'material', line: 'One old wooden beehive: white boxes, a tin roof. Close study.' })] }))
      .toMatch(/Image 3 is the scene's master shot.*The old wooden beehive in image 1 has the surface of image 4: only its material texture/)
  })
  it('a material clause names the object it dresses, from the brief when it has the element', () => {
    const m = cardMaterial(bible(RUSTIC), { tag: 'hive', kind: 'prop', line: 'A hive.' })
    expect(m).toEqual({ object: 'hive', detail: 'white-painted pine boxes, a tin roof' })
  })
})
