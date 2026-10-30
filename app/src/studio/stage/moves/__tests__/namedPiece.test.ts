// The action box's defaults: the piece the words name is picked until a chip is pressed (the one the move goes into or out of,
// else the one piece named at all, never a guess between two), and the wait under Make it comes from the motion computer's own
// pace (seconds per try times the tries), not a fixed "about 3 minutes".
import { describe, expect, it } from 'vitest'
import { makeEstimate } from '../copy'
import { namedPiece, type ReachPiece } from '../pieces'

const piece = (id: string, name: string, reachable = true): ReachPiece => ({ id, name, box: { min: [0, 0, 0], max: [1, 1, 1] } as never, distance: 0.3, reachable })
const SET = [piece('9', 'hive'), piece('10', 'frame'), piece('2', 'gnarled apple tree', false)]

describe('the piece the words name', () => {
  it('the walkthrough sentence is about the hive (it reaches into it), not the frame it takes out', () => {
    expect(namedPiece('She reaches into the hive, takes out a frame with both hands, and holds it up to look at it', SET)).toBe('9')
  })
  it('one piece named is that piece; two named with no place word, or none, picks nothing; out of reach never', () => {
    expect(namedPiece('holds the frame up to the light', SET)).toBe('10')
    expect(namedPiece('looks at the hive and the frame', SET)).toBe('9') // "at the hive" is where the move goes
    expect(namedPiece('the hive and the frame', SET)).toBeNull()
    expect(namedPiece('waves', SET)).toBeNull()
    expect(namedPiece('leans on the gnarled apple tree', SET)).toBeNull()
  })
})

describe('the wait under Make it', () => {
  it('is the motion computer\'s seconds per try times the tries, plus a few seconds, in plain words', () => {
    expect(makeEstimate(3.73)).toBe('about 35 s')
    expect(makeEstimate(null)).toBe('about a minute')
    expect(makeEstimate(20)).toBe('about 3 minutes')
  })
})
