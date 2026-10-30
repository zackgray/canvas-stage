// Warn-only prompt checks (prompt wave, Track E): eight checks, pasted text never rewritten, an app-filled prompt from a clean brief is clean.
import { describe, expect, it } from 'vitest'
import type { SceneBriefV2 } from '../../../src/shared/briefContract.ts'
import { briefFromBible, warnPrompt, type WarnOpts, type WarnStep } from '../warn.ts'

const codes = (t: string, step: WarnStep, o: Partial<WarnOpts> = {}) => warnPrompt(t, { step, ...o }).map((w) => w.code)
const BRIEF = {
  logline: 'x', style: '', background: '', exclude: [], warnings: [], developed: [],
  atmosphere: [{ what: 'steam', where: 'drifting between the rails' }],
  beats: [{ who: '@hero', does: 'walks along the platform', seconds: 4, visible: 'yes' }],
} as unknown as SceneBriefV2

describe('warnPrompt', () => {
  it('a clean brief-shaped prompt gets no warnings at any step it applies to', () => {
    const still = 'Photo of a conductor walking along a platform, steam drifting between the rails. Brushed-steel carriages with panel seams, a soft overcast light from the left.'
    expect(warnPrompt(still, { step: 'still', brief: BRIEF, take: { action: 'walks along the platform' }, pasted: false })).toEqual([])
    expect(warnPrompt(still, { step: 'master', brief: BRIEF })).toEqual([])
    expect(warnPrompt('The conductor walks along the platform as steam drifts past. The camera pans left.', { step: 'render', brief: BRIEF, take: { action: 'walks along the platform' } })).toEqual([])
    expect(warnPrompt('A real photograph: image 1 exactly as it is, with the person in it made the person shown in image 2.', { step: 'klein' })).toEqual([])
  })
  it('pasting "Kodak, 24mm, golden hour, no people" yields four warnings: negation, look words, grain and the missing action', () => {
    expect(codes('Kodak, 24mm, golden hour, no people', 'still', { brief: { ...BRIEF, atmosphere: [] }, take: { action: 'walks along the platform' }, pasted: true }).sort())
      .toEqual(['action', 'fire-grain', 'negation', 'style'])
  })
  it('length ceilings per step', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'brick').join(' ')
    expect(codes(words(221), 'still')).toContain('length'); expect(codes(words(220), 'still')).not.toContain('length')
    expect(codes(words(101), 'klein')).toContain('length'); expect(codes(words(100), 'klein')).not.toContain('length')
    expect(codes(words(121), 'render')).toContain('length'); expect(codes(words(120), 'render')).not.toContain('length')
    // F4: the card's own lines (Match, Keep, Photoreal) are not sentences of what happens; two of those are the ceiling
    expect(codes('One. Two. Match the first frame: dusk. Keep the same set and camera as the driver. Photoreal.', 'render')).not.toContain('length')
    expect(codes('One. Two. Three. Match the first frame: dusk.', 'render')).not.toContain('length') // two of action and a look sentence
    expect(codes('One. Two. Three. Four. Match the first frame: dusk.', 'render')).toContain('length')
    const pasted = Array.from({ length: 11 }, (_, i) => `Sentence ${i} has a woman walking slowly along a lane under a grey sky with hedges and puddles.`).join(' ')
    expect(codes(pasted, 'render')).toContain('length') // a pasted paragraph of about 200 words still warns
    expect(codes('One. Two. Three.', 'window')).toContain('length'); expect(codes('One. Two.', 'window')).not.toContain('length')
  })
  it('negations and quality tags', () => {
    expect(codes('A street without cars.', 'master')).toContain('negation')
    expect(codes('A street, 8K, masterpiece, octane render.', 'master')).toContain('quality')
    expect(codes('A street, nothing odd', 'klein')).toContain('negation')
    expect(codes('A knotted rope on a bench.', 'klein')).toEqual([]) // whole words only
  })
  it('look words are fine when the brief names them; fire / grain only for pasted text', () => {
    expect(codes('Shot on Kodak Vision3, 35mm', 'still')).toContain('style')
    expect(codes('Shot on Kodak Vision3', 'still', { brief: { style: 'Kodak Vision3' } })).not.toContain('style')
    expect(codes('A campfire with film grain', 'master')).not.toContain('fire-grain')
    expect(codes('A campfire with film grain', 'master', { pasted: true })).toContain('fire-grain')
    expect(warnPrompt('A campfire', { step: 'master', pasted: true }).find((w) => w.code === 'fire-grain')!.message).toMatch(/Fire words/)
  })
  it("the take's action and the brief's atmosphere, only at the steps that use them", () => {
    expect(codes('Photo of a quiet yard.', 'still', { brief: BRIEF })).toEqual(['action', 'atmosphere'])
    expect(codes('Photo of a quiet yard.', 'master', { brief: BRIEF })).toEqual(['atmosphere'])
    expect(codes('Photo of a quiet yard.', 'klein', { brief: BRIEF })).toEqual([])
    expect(codes('A quiet yard.', 'window', { brief: BRIEF })).toEqual(['action'])
    expect(codes('A quiet yard.', 'render', { take: { action: 'looking up' } })).toEqual(['action'])
    expect(codes('The performer looks up at the sky.', 'render', { take: { action: 'looking up' } })).toEqual([])
  })
  it('pipeline words only at render and window', () => {
    expect(codes('Match the clay render of the 3D scene.', 'render')).toContain('pipeline-words')
    expect(codes('Like the still, in Unreal.', 'window')).toContain('pipeline-words')
    expect(codes('Match the clay render of the 3D scene.', 'still')).not.toContain('pipeline-words')
  })
  it('is safe on empty text and a non-object brief', () => {
    expect(warnPrompt('   ', { step: 'still', brief: 'a string brief' })).toEqual([])
    expect(codes('Photo of a platform.', 'still', { brief: 'a string brief' })).toEqual([])
    expect(briefFromBible({ brief: 'text' })).toBeUndefined()
    expect(briefFromBible({ brief: BRIEF })).toBe(BRIEF)
    expect(briefFromBible({ briefV2: BRIEF })).toBeUndefined() // one field: BibleRecord.brief
  })
})
