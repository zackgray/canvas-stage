// @vitest-environment jsdom
// The Stage's "Options each time" default: two when drawing from the approved frame (pick the cleanest), one from words and the set;
// the owner's own choice in this scene always wins. The cue line says when two are drawn. No routes, nothing billed.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStageStillPress } from './stageStillPress'
import { drawModeCue } from './useDrawMode'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Stage options-each-time default', () => {
  it('is 2 when drawing from the approved frame', () => {
    expect(renderHook(() => useStageStillPress('s1', 'edit')).result.current.count).toBe(2)
  })
  it('is 1 when drawing from words and the set', () => {
    expect(renderHook(() => useStageStillPress('s1', 'depth')).result.current.count).toBe(1)
  })
  it('keeps the owner\'s choice in this scene, in either mode', () => {
    const a = renderHook(() => useStageStillPress('s1', 'edit'))
    act(() => a.result.current.setCount(1))
    expect(renderHook(() => useStageStillPress('s1', 'edit')).result.current.count).toBe(1)
    const b = renderHook(() => useStageStillPress('s2', 'depth'))
    act(() => b.result.current.setCount(2))
    expect(renderHook(() => useStageStillPress('s2', 'depth')).result.current.count).toBe(2)
  })
  it('follows the mode while nothing is remembered, and does not leak across scenes', () => {
    const h = renderHook(({ m }: { m: 'edit' | 'depth' }) => useStageStillPress('s3', m), { initialProps: { m: 'depth' as 'edit' | 'depth' } })
    expect(h.result.current.count).toBe(1)
    h.rerender({ m: 'edit' })
    expect(h.result.current.count).toBe(2)
    expect(renderHook(() => useStageStillPress('s4', 'depth')).result.current.count).toBe(1)
  })
  it('the cue says two options are drawn each time only when the count is 2', () => {
    expect(drawModeCue(11, true, 2)).toContain('Two options are drawn each time')
    expect(drawModeCue(11, true, 1)).not.toContain('Two options')
    expect(drawModeCue(11, false, 2)).not.toMatch(/Qwen|Edit|Klein|plate|latent|ControlNet|seed/i)
  })
})
