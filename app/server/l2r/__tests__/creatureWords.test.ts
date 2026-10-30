import { describe, expect, it } from 'vitest'
import { creatureWords } from '../stagedDefault.ts'

describe('creatureWords', () => {
  it('words a hand-placed dragon for the render, once', () => {
    expect(creatureWords([{ kind: 'dragon' }])).toBe('a dragon looms in the background')
    expect(creatureWords([{ kind: 'dragon' }, { kind: 'dragon' }])).toBe('dragons loom in the background')
  })
  it('says nothing when there is no creature or the story already names it', () => {
    expect(creatureWords(undefined)).toBe('')
    expect(creatureWords([{ kind: 'dragon' }], 'A dragon rears behind him.')).toBe('')
  })
})
