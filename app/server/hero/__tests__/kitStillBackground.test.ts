// The kit still's draw prompt on a scene with no v2 brief (the fallback, prompt wave 2026-10-25): person + action + place, the figures'
// sizes, every VISIBLE piece once by its board line or plain noun (never aged), the Bible's flat lighting line when there is one, the
// lens feel; no stock, no millimetres, no realism tags, no "deep focus", none of the Bible's materials or background-action lines.
// The master is the same photograph with nobody in it. Pure.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { buildDrawPrompt, type StillPromptParts } from '../kitStillPrompt.ts'

// (stage-only) no scene words: the structured path (the place is the plan sentence's first clause); scene words lead otherwise
const bible = (o: Partial<BibleRecord> = {}): BibleRecord => ({ worldId: 'loc-x', version: 2, prompt: '', master: null, candidates: [],
  lighting: 'Low dusk light', materials: 'wet mud', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o })
const parts = (b: BibleRecord, o: Partial<StillPromptParts> = {}): StillPromptParts => ({ bible: b,
  plan: { sentence: 'A muddy field at dusk.', kit: [{ kind: 'palisade' }, { kind: 'tent' }] } as unknown as StillPromptParts['plan'],
  cast: { name: 'Ana', description: 'A battle-worn woman in mail' }, view: { kinds: ['palisade'], camera: 'Eye level.', angle: '' },
  figures: [{ tag: 'hero', cx: 0.5, top: 0.4, bottom: 0.75 }] as StillPromptParts['figures'], action: 'walking towards us', focal: 50, ...o })
const words = (t: string) => t.split(/\s+/).length
const HOUSE = /kodak|vision3|\d\s?mm\b|weathered|grey weathered|stained patched|Hard low sun|the only light/i

describe('the still prompt with no v2 brief', () => {
  it('reads who and what first, with no lead and no alone line: the figure\'s size, the visible pieces plainly, the flat light line; no stock or mm', () => {
    const t = buildDrawPrompt(parts(bible({ background: 'soldiers running far behind her' })))
    // stage-only: no loose-cloth line after the person
    expect(t).toBe('A battle-worn woman in mail walking towards us, a muddy field at dusk. In the middle of the frame, one figure seen whole, about a third of the frame tall. Around them: palisade. Low dusk light.')
    expect(t).not.toMatch(/tents/) // not in view
    expect(t).not.toMatch(/Deep focus|real photograph|Real photographic|pores|Matte/i) // E16/E18: realism tags read as a style
    expect(t).not.toMatch(/wet mud|soldiers/) // refs carry materials; no unstaged people (E140)
    expect(t).not.toMatch(HOUSE)
    expect(words(t)).toBeLessThanOrEqual(90)
  })
  it('a generated piece is named by its board tile\'s line when the Bible has one, else as its plain noun; relief is never named', () => {
    const el = { tag: 'steam_train', kind: 'prop' as const, refs: [], line: 'An old, riveted black steam train.' }
    const view = { kinds: ['steam_train', 'trunk', 'mound'], camera: '', pieces: [{ kind: 'steam_train', pieceTag: 'prop:steam_train' }, { kind: 'trunk' }, { kind: 'mound' }] }
    const t = buildDrawPrompt(parts(bible({ elements: [el] }), { view }))
    expect(t).toMatch(/Around them: an old, riveted black steam train; trunk\./)
  })
  it('a long lens is said as what the picture looks like and adds no depth-of-field sentence; a crane says its angle; the hero out of frame is not described', () => {
    const long = buildDrawPrompt(parts(bible(), { focal: 85 }))
    expect(long).toMatch(/long-lens view/)
    expect(long).not.toMatch(/out-of-focus|blur|sharp/i)
    expect(buildDrawPrompt(parts(bible(), { view: { kinds: [], camera: '', angle: 'Seen from high above, looking steeply down.' } }))).toMatch(/tall\. Seen from high above, looking steeply down\. Low dusk light/)
    const empty = buildDrawPrompt(parts(bible(), { figures: [] }))
    expect(empty).toMatch(/^A muddy field at dusk\. In the frame: palisade\./); expect(empty).not.toMatch(/battle-worn/)
  })
  it('the owner\'s pasted text goes verbatim, banned words and all (owner decision 1: warned, never rewritten)', () => {
    const mine = 'Photo of Ana by a burning cart, mud everywhere. Kodak Portra 400. 75mm lens.'
    expect(buildDrawPrompt(parts(bible(), { override: `  ${mine} ` }))).toBe(mine)
  })
  it('the master is the same photograph of the place: no person, the pieces plainly, the flat light line, its camera words', () => {
    const m = buildDrawPrompt(parts(bible({ background: 'soldiers running far behind' }), { mode: 'master', view: null, figures: null, masterCamera: 'Seen at eye height, 1.6 metres up.' }))
    expect(m).toBe('Photo of a muddy field at dusk. The place stands empty and quiet. Seen at eye height, 1.6 metres up. In the frame: palisade; tent. Low dusk light.')
    expect(m).not.toMatch(/soldiers|battle-worn|faces?\b|wet mud/i)
  })
})
