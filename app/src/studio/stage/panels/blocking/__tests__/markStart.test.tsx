// @vitest-environment jsdom
// Track C: Blocking's New path starts on the subject's mark (the one the Set's top view placed; the start of the flat corridor when
// none was saved), and the top view's ground window always holds the mark.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import type { ScenePlan } from '../../../../../stage3d/contract'
import { BlockingPanel } from '../index'
import { viewBox } from '../blockingMath'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const ID = 'loc-2026-10-25T11-00-00-000'
const base: ScenePlan = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, kit: [{ kind: 'tree', at: [-9, -14] }] }
function mount(plan: ScenePlan) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 501 })))
  const world: KitWorld = { id: ID, description: 'd', plan, perf: { path: [[0.6, -12.5], [0.6, -8], [3, -4]], pace: 0.8 }, still: null, createdAt: '' }
  render(<BlockingPanel lab={{ kit: { id: ID, world, layer: null, perf: world.perf, error: null } } as unknown as ProjectionLabState} />)
}
const newPath = () => { fireEvent.click(screen.getByTestId('blocking-path-new')); fireEvent.click(screen.getByTestId('blocking-path-ask-yes')) }

describe('New path starts on the mark', () => {
  it('on the saved mark', () => {
    mount({ ...base, mark: { at: [4.5, -9.25], yawDeg: 90 } })
    newPath()
    const start = screen.getByTestId('blocking-path-0')
    expect(start.getAttribute('cx')).toBe('4.5')
    expect(start.getAttribute('cy')).toBe('-9.25')
    expect(screen.getByTestId('blocking-path-line').textContent).toContain('1 point')
  })
  it('on the corridor start when no mark was saved', () => {
    mount(base)
    newPath()
    expect([screen.getByTestId('blocking-path-0').getAttribute('cx'), screen.getByTestId('blocking-path-0').getAttribute('cy')]).toEqual(['0.6', '-12.5'])
  })
  it('the ground window holds a mark placed beyond every piece', () => {
    const box = viewBox({ ...base, mark: { at: [30, -60] } }, [])
    expect(box[0]).toBeLessThanOrEqual(26); expect(box[2]).toBeGreaterThanOrEqual(34); expect(box[1]).toBeLessThanOrEqual(-64)
  })
})
