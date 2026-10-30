// The take last on show (one-prompt): what a new take's words are copied from and what the drawer shows meanwhile. Pure, nothing paid.
import { afterEach, describe, expect, it } from 'vitest'
import type { TakeBoardRow } from '../../shared/takeWordsContract'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { lastTakeId, resetLastTake, seedRow } from './lastTake'

const row = (id: string, words: string): TakeBoardRow => ({ id, name: null, thumb: null, state: 'locked', words, own: true, sceneChanged: false })
afterEach(() => { resetCurrentTake(); resetLastTake() })

describe('the take last on show', () => {
  it('follows a lock or a pick, and is kept while the take on show is cleared (filming a new take)', () => {
    expect(lastTakeId()).toBeNull()
    setCurrentTake('take-a')
    setCurrentTake('take-b', true)
    setCurrentTake(null)
    expect(lastTakeId()).toBe('take-b')
  })

  it("seeds from the take last on show when it is on the world's list, else the newest; none = the words before any take", () => {
    const rows = [row('take-new', 'newest'), row('take-old', 'older')]
    expect(seedRow(rows, 'take-old')?.words).toBe('older')
    expect(seedRow(rows, 'take-elsewhere')?.words).toBe('newest')
    expect(seedRow(rows, null)?.words).toBe('newest')
    expect(seedRow([], 'take-old')).toBeNull()
  })
})
