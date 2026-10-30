import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { composeOrThrow, composePrompt, UnknownTagError, unknownTagMessage } from '../prompt.ts'

const bible = (over: Partial<BibleRecord> = {}): BibleRecord => ({
  worldId: 'loc-2026-10-23T00-00-00-000', version: 3, prompt: '', master: null, candidates: [], lighting: 'Low golden dusk light',
  materials: 'Matte mud, weathered wood, dull steel.', elements: [
    { tag: 'dragon', kind: 'creature', cardId: 'dragon', refs: [], line: 'A black dragon with torn wings circles overhead' },
    { tag: 'hero', kind: 'cast', cardId: 'rider', refs: [], line: 'A rider in a green coat' },
  ], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...over,
})

describe('composePrompt', () => {
  it('a @dragon tag composes the creature line, after lighting, materials and the scene prompt, before the action', () => {
    const out = composePrompt({ bible: bible({ prompt: 'A muddy field. The @dragon watches.' }), target: 'video', action: 'He stops.' })
    expect(out.tags).toEqual(['dragon'])
    expect(out.unknown).toEqual([])
    expect(out.text).toBe('Low golden dusk light. Matte mud, weathered wood, dull steel. A muddy field. The dragon watches. A black dragon with torn wings circles overhead. He stops.')
  })

  it('an unknown tag is reported, never sent (text empty) and refused with a clear message', () => {
    const input = { bible: bible({ prompt: 'The @griffin lands near @dragon.' }), target: 'still' as const }
    const out = composePrompt(input)
    expect(out.unknown).toEqual(['griffin'])
    expect(out.text).toBe('')
    expect(() => composeOrThrow(input)).toThrow(UnknownTagError)
    expect(unknownTagMessage(['griffin'])).toBe('@griffin matches no reference tile in the scene sheet. Pick the tag from the reference list or remove it.')
    expect(composePrompt({ bible: bible(), target: 'video', action: 'He nods at @nobody' }).unknown).toEqual(['nobody'])
  })

  it('a cast tag is "the person from image N" in a still and the card description in a video', () => {
    const b = bible({ prompt: '@hero walks.' })
    const still = composePrompt({ bible: b, target: 'still', imageSlots: { hero: 2 } })
    expect(still.text).toContain('the person from image 2 walks.')
    expect(still.text).not.toContain('green coat')
    const video = composePrompt({ bible: b, target: 'video', castDescriptions: { rider: 'A tall rider in a green coat.' } })
    expect(video.text).toContain('A tall rider in a green coat walks.')
    // no slot / description: the person, plus the element line
    expect(composePrompt({ bible: b, target: 'still' }).text).toContain('the person walks. A rider in a green coat.')
  })

  it('uses the kit plan sentence while the Bible has no prompt, and works with no Bible at all', () => {
    expect(composePrompt({ bible: bible(), target: 'still', fallback: ' A field at dusk ' }).text).toBe('Low golden dusk light. Matte mud, weathered wood, dull steel. A field at dusk.')
    expect(composePrompt({ bible: null, target: 'video', fallback: 'A field.', action: 'He stops.' }).text).toBe('A field. He stops.')
    expect(composePrompt({ bible: null, target: 'still' }).text).toBe('')
  })

  it('the scene prompt supersedes the plan sentence; an element line appears once', () => {
    const out = composePrompt({ bible: bible({ prompt: 'The @dragon and the @dragon.' }), target: 'still', fallback: 'PLAN SENTENCE' })
    expect(out.text).not.toContain('PLAN SENTENCE')
    expect(out.text.match(/torn wings/g)).toHaveLength(1)
    expect(out.tags).toEqual(['dragon'])
  })

  it('tags inside a word are not tags (e-mail address)', () => {
    expect(composePrompt({ bible: bible({ prompt: 'mail a@dragon.com' }), target: 'still' }).unknown).toEqual([])
  })
})

