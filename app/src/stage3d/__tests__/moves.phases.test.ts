// Phase words (plan section 8 "Phase words"): per class, in the library clips' ClipPhase shape; a still at t = 0 never names
// the object in hand (the still and render draw what the words name over the hands anyway); times scale with the window.
import { describe, expect, it } from 'vitest'
import { movePhases, type MoveClass } from '../moves/index.ts'

const names = { piece: 'hive', object: 'frame' }

describe('phase words per class', () => {
  it('the lift, matching the shipped lift clip\'s shape', () => {
    expect(movePhases('takeOut', names, 8)).toEqual([
      { from: 0, words: 'standing at the hive, both hands empty' },
      { from: 1.3, words: 'bending over the hive, reaching into it with both hands, the hands still empty' },
      { from: 2.5, words: 'lifting a frame out of the hive with both hands' },
      { from: 4.3, words: 'holding a frame up at head height in both hands, looking at it' },
    ])
  })
  it('pick up and put down have their own', () => {
    expect(movePhases('pickUp', names, 8).map((p) => p.words)).toEqual([
      'standing at the hive, both hands empty',
      'bending down to the hive, reaching for it with both hands, the hands still empty',
      'lifting a frame from the hive with both hands',
      'holding a frame at chest height in both hands',
    ])
    expect(movePhases('putDown', names, 8).map((p) => p.words)).toEqual([
      'standing with both hands held at chest height',
      'lowering a frame toward the hive with both hands',
      'placing a frame on the hive, letting go with both hands',
      'straightening up from the hive, both hands empty',
    ])
  })
  it('hold up starts from the held chest pose', () => {
    expect(movePhases('holdUp', names, 8).map((p) => p.words)).toEqual([
      'standing still, both hands held at chest height',
      'raising a frame with both hands',
      'holding a frame up at head height in both hands, looking at it',
    ])
  })
  it('gestures name the move', () => {
    expect(movePhases('gesture', { verb: 'wave' }, 8)).toEqual([
      { from: 0, words: 'standing still, both hands empty' },
      { from: 0.8, words: 'waves one hand' },
    ])
  })
})

describe('the t = 0 still', () => {
  it('never mentions the object in hand', () => {
    for (const cls of ['takeOut', 'pickUp', 'putDown', 'holdUp', 'gesture'] as MoveClass[]) {
      const first = movePhases(cls, names, 8)[0]
      expect(first.from).toBe(0)
      expect(first.words).not.toContain('frame')
    }
  })
  it('moves that start with empty hands say so', () => {
    for (const cls of ['takeOut', 'pickUp', 'gesture'] as MoveClass[]) {
      expect(movePhases(cls, names, 8)[0].words).toContain('both hands empty')
    }
  })
  it('times scale with the asked window', () => {
    const half = movePhases('takeOut', names, 4)
    expect(half.map((p) => p.from)).toEqual([0, 0.65, 1.25, 2.15])
  })
})
