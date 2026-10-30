import { describe, expect, it } from 'vitest'
import { asPhoto, CG_WORDS, charactersInstruction, hasQuotedSign, holesInstruction, lockPrompt, positiveOnly, renderInstruction, stripCgWords } from '../prompts.ts'

/** E18's tuned bank prompt (photographic, subject first, lens and film last). */
const BANK = 'Photo of a Renaissance-style Portland stone bank on an empty London street at sunset, seen from the opposite ' +
  'pavement at a slight angle. Black iron railings, worn stone steps. Eye level, 24mm lens at f/8, Kodak Portra 400.'
/** E18's alley prompt: the one sign it wants is named by its words. */
const ALLEY = 'Photo of a narrow back alley at night after rain. A few small, dim neon signs glow through thin fog; ' +
  'one reads "BAR". One weak sodium lamp, deep shadows. 28mm lens wide open, Cinestill 800T.'
/** An older location prompt in the CG style the 2026-10-18 decision moved away from. */
const OLD = 'wide establishing shot, a stone bank, photorealistic, 8k, masterpiece, highly detailed, HDR, 35mm'

const BANNED = ['photorealistic', 'photo-realistic', 'hyperrealistic', '8k', '4k', 'masterpiece', 'highly detailed', 'hdr',
  'ultra hd', 'octane render', 'unreal engine', 'trending on artstation', 'best quality', 'cinematic composition']
const hits = (s: string) => BANNED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(s))

const wrappers: [string, (scene: string) => string][] = [
  ['render', renderInstruction], ['holes', holesInstruction], ['lock', lockPrompt],
  ['characters', (scene) => charactersInstruction(`a masked figure; ${scene}`)],
]

describe('photographic still prompts (no CG quality tags)', () => {
  it('the banned list and CG_WORDS agree', () => {
    for (const w of BANNED) expect(`a ${w} b`.match(CG_WORDS), w).not.toBeNull()
    expect('a photograph of a street at 35mm, f/8'.match(CG_WORDS)).toBeNull()
  })
  for (const [name, wrap] of wrappers) {
    it(`${name}: adds no banned words, with an empty, a photographic and an old CG-style scene`, () => {
      for (const scene of ['', BANK]) expect(hits(wrap(scene)), scene).toEqual([])
      if (name !== 'characters') expect(hits(wrap(OLD))).toEqual([]) // directions are the user's words, sent as typed
    })
  }
  it('stripping keeps the content of each clause', () => {
    expect(stripCgWords(OLD)).toBe('wide establishing shot, a stone bank, 35mm')
    expect(stripCgWords('a photorealistic photo of a bank')).toBe('a photo of a bank')
  })
})

describe('Z-Image locked prompt reads as a photograph, subject first', () => {
  it('a photographic shot prompt goes first, verbatim, then light and the positive-only safety line', () => {
    expect(lockPrompt(BANK)).toBe(`${BANK.replace(/\.$/, '')}. Natural light, true-to-life colour. ` +
      'Plain unmarked walls and doors; the place is empty and quiet.')
  })
  it('a bare subject becomes "Photo of ..."; an empty scene still reads as a photo', () => {
    expect(asPhoto('A bank at dusk')).toBe('Photo of a bank at dusk')
    expect(asPhoto('London bank')).toBe('Photo of London bank')
    expect(asPhoto('photograph of a bank')).toBe('photograph of a bank')
    expect(lockPrompt('a bank, no people').startsWith('Photo of a bank. ')).toBe(true)
    expect(lockPrompt('')).toMatch(/^Photo of a real place\./)
  })
  it('no negations (Turbo is distilled: a "no X" primes X)', () => {
    expect(lockPrompt(`${OLD}, no text, without cars`)).not.toMatch(/\b(no|not|without)\b/i)
  })
  it('a "No X." sentence goes too, and the sentences around it stay as written', () => {
    expect(positiveOnly('A bank at dusk. No people. Wet cobbles, no cars, 24mm.')).toBe('A bank at dusk. Wet cobbles, 24mm')
    expect(lockPrompt(`${BANK} No text or signage anywhere.`)).not.toMatch(/\b(no|not|without)\b/i)
    expect(positiveOnly('Shot at f/2.8. Kodak Portra 400')).toBe('Shot at f/2.8. Kodak Portra 400')
  })
  it('a shot that names a sign\'s words keeps it: no "plain unmarked walls" against it', () => {
    expect(hasQuotedSign(ALLEY)).toBe(true)
    expect(hasQuotedSign('a sign reads “BAR”')).toBe(true)
    expect(hasQuotedSign(BANK)).toBe(false)
    const p = lockPrompt(ALLEY)
    expect(p).toMatch(/one reads "BAR"\. One weak sodium lamp/)
    expect(p).not.toMatch(/unmarked/)
    expect(p).toMatch(/The place is empty and quiet\.$/)
    expect(lockPrompt(BANK)).toMatch(/Plain unmarked walls and doors/)
  })
})

describe('Qwen holes fill instruction stays narrow', () => {
  it('fills only the empty areas, continues the surfaces, keeps everything else', () => {
    const p = holesInstruction(BANK)
    expect(p).toMatch(/^Fill only the empty areas of this photograph: the black regions and any soft, blurred patches/)
    expect(p).toMatch(/Continue the surrounding surfaces into them/)
    expect(p).toMatch(/Keep everything else unchanged\./)
    expect(p).toMatch(/The photograph: Photo of a Renaissance-style/)
    expect(holesInstruction('')).not.toMatch(/The photograph:/)
  })
  it('pre-filled (structure-locked quality): names no black, says the blur is missing picture to extend to the frame edge', () => {
    const p = holesInstruction(BANK, true)
    expect(p.split('The photograph:')[0]).not.toMatch(/black/i) // the scene itself may ("black iron railings")
    expect(p).toMatch(/^Fill only the soft, blurred patches with no detail: they are missing parts of this photograph/)
    expect(p).toMatch(/fills the whole frame edge to edge\./)
    expect(p).toMatch(/Keep everything else unchanged\. The photograph: Photo of a Renaissance-style/)
  })
})
