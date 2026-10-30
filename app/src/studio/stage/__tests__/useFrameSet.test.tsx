// @vitest-environment jsdom
// Free view / Top View open on the whole set when a piece lies beyond their default view (a stand-in 25-35 m out), once per scene.
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { resetFrameSet, useFrameSet } from '../useFrameSet'

beforeEach(resetFrameSet)

function lab(id: string, kit: { kind: string; at: [number, number] }[]) {
  const frameSet = vi.fn()
  return { frameSet, lab: { kit: { world: { id, plan: { kit, mark: { at: [0.6, -12.5], yawDeg: 0 } } } }, stage: { panes: { frameSet } } } as unknown as ProjectionLabState }
}

describe('useFrameSet', () => {
  it('a far piece frames the views on the whole set, once per scene', () => {
    const { lab: l, frameSet } = lab('w1', [{ kind: 'crates', at: [0, -45] }])
    const { rerender } = renderHook(() => useFrameSet(l))
    rerender()
    expect(frameSet).toHaveBeenCalledTimes(1)
    expect(frameSet.mock.calls[0][2]).toBeGreaterThan(10)
  })
  it('a set that fits the default views is left alone', () => {
    const { lab: l, frameSet } = lab('w2', [{ kind: 'crates', at: [3, -9] }])
    renderHook(() => useFrameSet(l))
    expect(frameSet).not.toHaveBeenCalled()
  })
})
