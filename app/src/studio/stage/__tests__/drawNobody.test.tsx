// @vitest-environment jsdom
// No-person shots (owner 2026-10-29, a tyre close-up): when no one plays the person and none is in view, the free preview says
// `nobody`, the draw press (the take card's) shows the soft note (never the amber refusal), and Draw the first frame stays live at its price; one
// press is one paid POST that names no person. Faked routes only: nothing is sent anywhere and nothing spends.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { NOBODY_IN_SHOT } from '../../../shared/stillPressContract'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { DrawPress } from '../DrawPress'
import { HeroStillBlock } from '../../shoot/HeroStillBlock'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { base, clayDone, serve } from '../../shoot/__tests__/heroStillHarness'

beforeEach(() => { vi.useRealTimers(); resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetL2RStore(); localStorage.clear() })

const fakeLab = () => ({
  op: { mode: 'orbit', setMode: vi.fn(), note: null, engine: new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false }) },
  stage: null, s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), shot: undefined, shots: [], pickSource: vi.fn(),
  performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
}) as unknown as ProjectionLabState

/** the harness's server, with each paid POST's body kept */
function serveWith(preview: object) {
  const s = base({ clay: clayDone(), preview }); serve(s)
  const served = fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn((u: string, i?: RequestInit) => {
    if (u === '/__lab/hero' && i?.method === 'POST') bodies.push(JSON.parse(String(i.body)))
    return served(u, i)
  }))
  return { s, bodies }
}
const mountBlock = (lab = fakeLab()) => render(<><HeroStillBlock lab={lab} kit capture={async () => new Blob(['x'])} prepare={async () => clayDone() as never} pressInBar bare /><DrawPress verb="Draw the first frame" primary building={false} worldId={null} /></>)

describe('Draw the first frame with no one cast and nobody in view', () => {
  it('shows the soft note, not a warning; the press is live at its price and one press is one POST naming no person', async () => {
    const { s, bodies } = serveWith({ nobody: true, prompt: 'A photograph. A wet racing tyre on the kerb.', price: 21, count: 1 })
    mountBlock()
    const note = await screen.findByTestId('hero-nobody')
    expect(note.textContent).toBe(NOBODY_IN_SHOT)
    expect(note.className).toBe('st-muted')
    expect(screen.queryByTestId('hero-press-error')).toBeNull()
    const btn = screen.getByTestId('hero-render') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    expect(btn.parentElement?.textContent).toMatch(/21 cr/)
    fireEvent.click(btn)
    await waitFor(() => expect(s.calls.filter((c) => c === 'POST /__lab/hero')).toHaveLength(1))
    expect(JSON.stringify(bodies[0])).not.toMatch(/person|cast|face|sid/i)
  })

  it('a cast take shows no such note', async () => {
    serveWith({ nobody: false })
    mountBlock()
    await screen.findByTestId('hero-render')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByTestId('hero-nobody')).toBeNull()
  })
})
