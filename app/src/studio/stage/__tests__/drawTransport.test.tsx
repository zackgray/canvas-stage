// @vitest-environment jsdom
// The draw bar's one-row transport (layout wave L1): Play, Loop, Rewind, the Clay|Look switch, the playhead track
// (the only flexing child) and the time readout, in that order, one flex row — so nothing can overlap the playhead at
// 1440 or 900 wide (the old bar wrapped its block over its neighbours). Until a take or a
// performance is loaded only the Clay|Look switch rides the bar (the bar's rule).
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { World } from '../../../labs/projection/world/World'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { DrawTransport } from '../DrawTransport'

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

const clock = { time: 0, duration: 5.2, playing: false, loop: false, toggle: vi.fn(), toggleLoop: vi.fn(), rewind: vi.fn(), seek: vi.fn() }
const world = { clock, carPose: () => null, arrive: null, performance: null } as unknown as World

/** the lab slice the transport reads: a real engine (deck), the world clock, a performance picked = loaded */
function fakeLab(loaded: boolean) {
  return {
    op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
    stage: { world },
    s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
    performance: { listed: true, packs: [], selected: loaded ? 'pack-1' : null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the one-row transport', () => {
  it('loads nothing: the row is empty, and there is no Clay|Look switch on the Stage', () => {
    render(<DrawTransport lab={fakeLab(false)} />)
    const row = screen.getByTestId('stage-transport')
    expect(row.querySelector('[data-testid="clay-toggle"]')).toBeNull()
    expect(row.querySelector('[data-testid="world-scrub"]')).toBeNull()
  })

  it('a clay view left on elsewhere is put back to the look on the Stage', () => {
    const lab = fakeLab(false)
    ;(lab.s as { look: string }).look = 'clay'
    render(<DrawTransport lab={lab} />)
    expect(lab.set).toHaveBeenCalledWith({ look: 'textured' })
  })

  it('loaded: Play, Loop, Rewind, the track, the readout — in that order, all in the one row', () => {
    render(<DrawTransport lab={fakeLab(true)} />)
    const row = screen.getByTestId('stage-transport')
    const order = ['world-play', 'world-loop', 'world-rewind', 'world-scrub', 'world-time']
      .map((id) => row.querySelector(`[data-testid="${id}"]`)!)
    for (const el of order) expect(el).toBeTruthy()
    for (let i = 0; i + 1 < order.length; i++) expect(before(order[i], order[i + 1])).toBe(true)
    // the playhead track and the readout are row children too
    expect(order[3]!.parentElement).toBe(row)
    expect(order[4]!.parentElement).toBe(row)
    expect(screen.getByTestId('world-time').textContent).toMatch(/^0\.00 \/ 5\.2 s$/)
  })

  it('cannot overlap: the stylesheet keeps one line — the track flexes, nothing wraps, nothing is absolutely positioned', () => {
    const css = readFileSync('src/studio/stage/stage.css', 'utf8')
    const row = css.match(/\.st-transport \{[^}]*\}/)?.[0] ?? ''
    expect(row).toContain('display: flex')
    expect(row).not.toContain('flex-wrap')
    const track = css.match(/\.st-transport-track \{[^}]*\}/)?.[0] ?? ''
    expect(track).toContain('flex: 1 1 auto')
    const bar = css.match(/\.st-drawbar \{[^}]*\}/)?.[0] ?? ''
    expect(bar).not.toContain('position: absolute')
    expect(bar).not.toContain('flex-wrap')
  })
})
