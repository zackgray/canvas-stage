import { describe, expect, it } from 'vitest'
import { advancedChanged, advancedLabel } from './advancedChanges'
import { NO_PICKS } from './finishChoice'
import type { L2RState } from './l2rStore'

const take = { focal: 35 }
const base = { seed: 42, prompt: '', keyOff: { mid: true, end: true }, picks: NO_PICKS, status: { take, keyframes: { mid: { frame: 40 }, end: { frame: 96 } } } } as unknown as L2RState

describe('advancedChanged', () => {
  it('counts nothing on a fresh panel, so the header reads plain Advanced', () => {
    expect(advancedChanged(base, null)).toBe(0)
    expect(advancedLabel(0)).toBe('Advanced')
  })
  it('counts each paid-render input moved off its default', () => {
    expect(advancedChanged({ ...base, seed: 7 }, null)).toBe(1)
    expect(advancedChanged({ ...base, prompt: ' a run ' }, null)).toBe(1)
    expect(advancedChanged({ ...base, keyOff: { mid: false, end: false } }, null)).toBe(2)
    expect(advancedChanged({ ...base, picks: { ...NO_PICKS, hold: 'closeup' } }, null)).toBe(1)
    expect(advancedChanged({ ...base, picks: { ...NO_PICKS, hold: 'wide' } }, null)).toBe(0) // the take's own default is not a change
    expect(advancedLabel(3)).toBe('Advanced · 3 changed')
  })
  it('counts the free finish once the owner touched it', () => {
    expect(advancedChanged({ ...base, picks: { ...NO_PICKS, gradeTouched: true, grade: 0.5 } }, null)).toBe(1)
  })
})
