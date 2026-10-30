import { describe, expect, it } from 'vitest'
import { BANNED, buildHeroPrompt, scrub } from '../prompt.ts'

const cast = { name: 'Ana', description: 'a battle-worn woman in her thirties with short dark hair and a dented steel helmet' }
const WORDS = ['fire', 'fires', 'firelight', 'campfire', 'flame', 'flames', 'flaming', 'burning', 'burnt', 'burn', 'blaze', 'ablaze', 'embers', 'torch', 'inferno', 'grain', 'grainy', 'film grain']

describe('hero prompt: no fire, no grain, ever', () => {
  it('the built prompt carries no banned word and keeps the background as in the opening frame', () => {
    const p = buildHeroPrompt({ world: 'A muddy battlefield at dusk, smoke drifting.', lighting: 'dusk, a warm orange light from the right of the picture', cast, focal: 35 })
    expect(p).not.toMatch(BANNED)
    expect(p).toMatch(/image 1/); expect(p).toMatch(/image 2/)
    expect(p).toMatch(/background stays exactly as in image 1/)
    expect(p).toMatch(/no new structures, no figures/)
    expect(p).toContain('muddy battlefield at dusk')
    expect(p).toContain('warm orange light from the right of the picture')
    expect(p).toContain('35 mm')
  })

  it('a world description that names fire still produces no fire word (the clause is dropped, the rest stays)', () => {
    const p = buildHeroPrompt({ world: 'A muddy battlefield at dusk, a burning wooden palisade with fire and flames, smoke drifting. Photo, 38mm lens, deep focus.', cast })
    expect(p).not.toMatch(BANNED)
    expect(p.toLowerCase()).not.toMatch(/fire|flame|burn|grain/)
    expect(p).toContain('muddy battlefield at dusk')
    expect(p).toContain('smoke drifting')
    expect(p).not.toContain('38mm') // camera boilerplate is the world still's, not this frame's
  })

  it.each(WORDS)('"%s" is dropped from the world, the light line, the card and the owner override', (w) => {
    const text = `a quiet road, with ${w} behind the hill, under a pale sky`
    for (const p of [buildHeroPrompt({ world: text, cast }), buildHeroPrompt({ lighting: text, cast }), buildHeroPrompt({ cast: { name: 'Ana', description: text } }), buildHeroPrompt({ cast, override: `Re-render image 1. ${text}` })]) {
      expect(p).not.toMatch(BANNED)
      expect(p.toLowerCase()).not.toContain(w.split(' ')[0] === 'film' ? 'grain' : w)
    }
  })

  it('an override replaces the built prompt but is still scrubbed; an all-banned override falls back to the built one', () => {
    const p = buildHeroPrompt({ cast, override: 'Same man, camera low, warm orange light from the right of the picture. Flames at the right.' })
    expect(p).toContain('warm orange light from the right of the picture'); expect(p).not.toMatch(/flame/i)
    const fallback = buildHeroPrompt({ cast, override: 'film grain, fire' })
    expect(fallback).toMatch(/background stays exactly as in image 1/); expect(fallback).not.toMatch(BANNED)
  })

  it('words that merely contain the letters are kept (December, sideburns, flamingo-free)', () => {
    expect(scrub('a member in December with sideburns')).toBe('a member in December with sideburns')
  })
})
