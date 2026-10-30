// The Stage's one next step (the first-run flow first): Write your scene → place things yourself → Record → Lock take → Draw the
// first frame → pick a version (no Approve press; owner 10-29) → Render clip, one yellow press at a time. hide-set-build: the layout step's cue no longer offers the planner's
// lay-out (switched off) — it points at placing things by hand.
import { describe, expect, it } from 'vitest'
import { shotStep, stepCue } from '../shotStep'

/** the first-run facts settled: words written, pieces placed (so the choice is moot), no take yet */
const ready = { words: true, placed: true, chosen: true, locked: false, unlocked: false, still: 'none' as const }

describe('the one next step', () => {
  it('words come first: none -> write your scene; words on an empty world with no choice -> lay it out or place it yourself', () => {
    expect(shotStep({ ...ready, words: false, placed: false, chosen: false })).toBe('words')
    expect(shotStep({ ...ready, placed: false, chosen: false })).toBe('layout')
    expect(shotStep({ ...ready, placed: false, chosen: true })).toBe('record')
    expect(shotStep({ ...ready, chosen: false })).toBe('record') // pieces placed: no choice is needed
  })
  it('walks Record, Lock take, Draw the first frame, Approve, Render', () => {
    expect(shotStep({ ...ready, locked: false, unlocked: false, still: 'none' })).toBe('record')
    expect(shotStep({ ...ready, locked: false, unlocked: true, still: 'none' })).toBe('lock')
    expect(shotStep({ ...ready, locked: true, unlocked: false, still: 'none' })).toBe('draw')
    expect(shotStep({ ...ready, locked: true, unlocked: false, still: 'awaiting' })).toBe('approve')
    expect(shotStep({ ...ready, locked: true, unlocked: false, still: 'approved' })).toBe('render')
  })
  it('a fresh recording over a locked take asks to lock it first', () => {
    expect(shotStep({ ...ready, locked: false, unlocked: true, still: 'approved' })).toBe('lock')
  })
  it('the cue says what is next, and where when the press is in the Camera view', () => {
    expect(stepCue('words', false)).toBe('Next: write your prompt in the Prompt box under the stage.')
    expect(stepCue('layout', false)).toBe('Next: place things yourself on the Stage.')
    expect(stepCue('record', true)).toBe('Next: record the shot.')
    expect(stepCue('record', false)).toBe('Next: record the shot in the Camera view.')
    expect(stepCue('draw', false)).toBe('Next: draw the first frame, beside the Prompt box.')
    expect(stepCue('approve', true)).toBe('Next: open the first frame and pick a version.')
    expect(stepCue('render', false)).toBe('Next: open the first frame and press Render clip.')
    for (const s of ['words', 'layout', 'record', 'lock', 'draw', 'approve', 'render'] as const) expect(stepCue(s, true)).not.toMatch(/approve/i)
  })
})
