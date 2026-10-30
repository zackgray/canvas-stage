// Track C: a piece is drawn from its own words (a prop tile never carries the scene's materials or light), and the mood prompt says
// its light once.
import { describe, expect, it } from 'vitest'
import { conceptPrompt } from '../conceptGraph.ts'

const SCENE = { lighting: 'Low late sun from behind.', materials: 'Woven straw hats, old timber.' }

describe('concept prompts', () => {
  it('a prop tile names its own prop only: not the scene materials, light or another prop', () => {
    const p = conceptPrompt('prop', { description: 'A white-painted beehive', ...SCENE })
    expect(p).toMatch(/^A product photograph of a white-painted beehive,/)
    expect(p).not.toMatch(/straw|hats|timber|sun/i)
  })

  it('the mood prompt says the light once when the mood text is the light', () => {
    const p = conceptPrompt('mood', { description: 'Cold dusk, one warm rim of light', lighting: 'Cold dusk, one warm rim of light' })
    expect(p.match(/warm rim of light/gi)).toHaveLength(1)
  })

  it('a mood whose light is a different line still carries it, and a location keeps both lines', () => {
    expect(conceptPrompt('mood', { description: 'A hushed morning', lighting: 'Soft low sun.' })).toMatch(/hushed morning\. Soft low sun\./)
    expect(conceptPrompt('location', { description: 'An orchard', ...SCENE })).toMatch(/Low late sun from behind\. Woven straw hats, old timber\./)
  })
})
