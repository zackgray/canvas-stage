import { describe, expect, it } from 'vitest'
import { againAside, type L2RFacts } from '../render/l2rModel'
import { nextAction } from './renderSteps'

const l = (p: Partial<L2RFacts>): L2RFacts => ({ take: true, clay: true, still: true, prompt: true, rendered: false, finished: false, running: false, again: false, ...p })

describe('render: what is next', () => {
  it('a locked take with clay walks still, Render, Finish, Export', () => {
    expect(nextAction(l({ still: false }))).toBe('needs-still')
    expect(nextAction(l({}))).toBe('l2r')
    expect(nextAction(l({ rendered: true }))).toBe('l2r-finish')
    expect(nextAction(l({ rendered: true, finished: true }))).toBe('export')
  })

  it('without clay (or without a locked take) there is nothing to render yet', () => {
    expect(nextAction(l({ clay: false }))).toBe('needs-take')
    expect(nextAction(l({ take: false }))).toBe('needs-take')
  })

  it('a take can be rendered again: exactly one paid button at any time (B2)', () => {
    // after a done render the primary is free (Finish / Export) and "Render again" sits beside it; a change makes it the primary
    expect(nextAction(l({ rendered: true, finished: true }))).toBe('export')
    expect(againAside(l({ rendered: true, finished: true }))).toBe(true)
    expect(nextAction(l({ rendered: true, finished: true, again: true }))).toBe('l2r')
    expect(againAside(l({ rendered: true, finished: true, again: true }))).toBe(false)
    // every combination: never the paid primary and the aside together, and once rendered always one of them
    const B = [false, true]
    for (const take of B) for (const clay of B) for (const still of B) for (const rendered of B) for (const finished of B) for (const again of B) {
      const facts = l({ take, clay, still, rendered, finished, again })
      const paidPrimary = nextAction(facts) === 'l2r'
      const aside = againAside(facts)
      expect(paidPrimary && aside, JSON.stringify(facts)).toBe(false)
      if (take && clay && still && rendered) expect(paidPrimary || aside).toBe(true)
    }
  })
})
