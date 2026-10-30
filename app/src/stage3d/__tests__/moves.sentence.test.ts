// The sentence builder (plan section 8 "Sentence builder"): the snapshot sentences per class; the lift case equals the spike's
// winning c15 prompt verbatim (chosen/c15.job.json), with only the manner adverb and the object noun varying; no default
// adverb appears when the words carry no manner.
import { describe, expect, it } from 'vitest'
import { extractObject, moveSentence } from '../moves/index.ts'

// the spike's winning prompt, chosen/c15.job.json
const C15 = 'A person stands still, then bends at the waist and reaches into a box in front of them with both hands, slowly lifts out a flat frame, and holds it up in front of their face to look at it against the light.'

describe('the sentence the generator reads', () => {
  it('the lift with the c15 manner and object equals the c15 prompt verbatim', () => {
    expect(moveSentence('takeOut', { object: 'flat frame', manner: 'slowly' })).toBe(C15)
  })
  it('only the manner and the object vary on the lift template', () => {
    expect(moveSentence('takeOut', { object: 'crate' })).toBe(
      'A person stands still, then bends at the waist and reaches into a box in front of them with both hands, lifts out a crate, and holds it up in front of their face to look at it against the light.')
    expect(moveSentence('takeOut', { object: 'flat frame', manner: 'carefully' })).toBe(
      'A person stands still, then bends at the waist and reaches into a box in front of them with both hands, carefully lifts out a flat frame, and holds it up in front of their face to look at it against the light.')
  })
  it('every class opens with a standing start and names no set piece', () => {
    for (const cls of ['pickUp', 'putDown', 'holdUp', 'gesture'] as const) {
      const s = moveSentence(cls, { object: 'crate', manner: 'gently', verb: 'wave' })
      expect(s.startsWith('A person stands still, then ')).toBe(true)
      expect(s).not.toMatch(/hive|bench|table/i)
    }
  })
  it('the per-class snapshots', () => {
    expect(moveSentence('pickUp', { object: 'crate' })).toBe('A person stands still, then bends down and picks up a crate with both hands, lifts it to chest height, and holds it.')
    expect(moveSentence('putDown', { object: 'crate', manner: 'gently' })).toBe('A person stands still, then gently lowers a crate with both hands, places it down, and stands up straight.')
    expect(moveSentence('holdUp', { object: 'crate' })).toBe('A person stands still, then raises a crate with both hands and holds it up at head height.')
    expect(moveSentence('gesture', { verb: 'wave' })).toBe('A person stands still, then waves one hand.')
    expect(moveSentence('gesture', { verb: 'look around' })).toBe('A person stands still, then looks around.')
  })
  it('no manner in the words: no adverb is added', () => {
    expect(moveSentence('takeOut', { object: 'flat frame' })).not.toContain(' slowly ')
    expect(moveSentence('takeOut', { object: 'flat frame' })).toContain('hands, lifts out')
  })
})

describe('the handled object from the words', () => {
  it('the noun between the verb and the destination', () => {
    expect(extractObject('takes a frame out of the hive', 'takeOut')).toBe('frame')
    expect(extractObject('slowly lifts a heavy crate out of the box', 'takeOut')).toBe('heavy crate')
    expect(extractObject('picks up a crate', 'pickUp')).toBe('crate')
    expect(extractObject('puts the crate down on the table', 'putDown')).toBe('crate')
    expect(extractObject('holds the frame up to the light', 'holdUp')).toBe('frame')
  })
  it('falls back per class when the words name no object', () => {
    expect(extractObject('takes it out of the hive', 'takeOut')).toBeUndefined()
    expect(moveSentence('takeOut', {})).toContain('lifts out an object')
    expect(extractObject('slides a tray of loaves out of the oven and holds it up', 'takeOut')).toBe('tray of loaves')
    expect(extractObject('the baker slides a tray out of the oven', 'takeOut')).toBe('tray')
  })
})
