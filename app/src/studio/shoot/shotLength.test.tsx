// @vitest-environment jsdom
// Wave A (S7): the shot's one length. A Shot length row at the top of the Camera panel, saved with the performance on a kit world
// (so a remount and a later performance save keep it), the preset's length, and Record waiting for the performer rebuilt to it. A
// refused save shows the server's own sentence.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHOT_LENGTH_REFUSED } from '../../../server/stage3d/perf'
import { KitStore } from '../../../server/stage3d/store'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../labs/projection/operator/stageEngine'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { PerformancePlan } from '../../stage3d/contract'
import type { KitPerformance } from '../../../server/stage3d/types'
import { BATTLEFIELD } from '../../stage3d/presets'
import { CameraPanel as ShootScreen } from '../stage/panels/CameraPanel'
import { draftFrom, planOf } from '../stage/panels/blocking/blockingPlan'
import { useShotLength } from './useShotLength'

vi.mock('../stage/panels/blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))

const PERF: KitPerformance = { path: [[0, -20], [0, 4]], pace: 0.8, castId: 'card-k' }
type Layer = { plan: PerformancePlan; duration: number; pack: { id: string; fps: number; frames: number } }
const layerOf = (plan: PerformancePlan, duration: number): Layer => ({ plan, duration, pack: { id: 'mocap-x', fps: 24, frames: Math.ceil(duration * 24) } })

function fakeLab(kit: { perf: PerformancePlan; layer: Layer | null } | null) {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  engine.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  return {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null,
    s: { source: kit ? 'loc-k' : 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(),
    kit: kit ? { id: 'loc-k', perf: kit.perf, world: null, layer: null, error: null } : null,
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: kit?.layer ?? null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
}

let posts: { url: string; body: unknown }[] = []
let refuse = false
beforeEach(() => {
  posts = []; refuse = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/__lab/stage3d/performance')) {
      const body = JSON.parse(String(init?.body))
      posts.push({ url, body })
      return refuse
        ? new Response(JSON.stringify({ error: 'the performance is not valid', errors: [SHOT_LENGTH_REFUSED] }), { status: 422 })
        : new Response(JSON.stringify({ id: 'loc-k', perf: body }))
    }
    return new Response('{}', { status: 404 })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const pressed = (id: string) => screen.getByTestId(id).getAttribute('aria-pressed')

describe('the Shot length row', () => {
  it('sits above the camera moves; with no length saved Record waits for a pick, and no "pick a length" line is said', () => {
    render(<ShootScreen lab={fakeLab({ perf: PERF, layer: layerOf(PERF, 4.7) })} />)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('2 s4 s6 s8 s')).toBeGreaterThanOrEqual(0)
    expect(screen.getByTestId('shot-length-row').compareDocumentPosition(screen.getByTestId('presets')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('shot-line')).toBeNull()
    for (const s of [2, 4, 6, 8]) expect(pressed(`shot-length-${s}`)).toBe('false')
    expect((screen.getByTestId('preset-record') as HTMLButtonElement).disabled).toBe(true)
  })

  it('picking 8 saves it with the performance (the rest unchanged); Record waits for the performer rebuilt to 8 s', async () => {
    const lab = fakeLab({ perf: PERF, layer: layerOf(PERF, 4.7) })
    const { rerender } = render(<ShootScreen lab={lab} />)
    fireEvent.click(screen.getByTestId('shot-length-8'))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].url).toBe('/__lab/stage3d/performance?id=loc-k')
    expect(posts[0].body).toEqual({ ...PERF, shotSeconds: 8 })
    expect(pressed('shot-length-8')).toBe('true')
    expect(screen.getByTestId('preset-wait').textContent).toBe('Updating the action to 8 s…')
    expect((screen.getByTestId('preset-record') as HTMLButtonElement).disabled).toBe(true)
    // the world is re-read: saved, but the old 4.7 s performer is still on the set
    const saved = { ...PERF, shotSeconds: 8 }
    ;(lab as { kit: unknown }).kit = { id: 'loc-k', perf: saved }
    rerender(<ShootScreen lab={{ ...lab }} />)
    expect(screen.getByTestId('preset-wait').textContent).toBe('Updating the action to 8 s…')
    // the performer rebuilt and padded: Record goes live, the preset films 8 s
    ;(lab.performance as { layer: unknown }).layer = layerOf(saved, 8.05)
    rerender(<ShootScreen lab={{ ...lab }} />)
    expect(screen.queryByTestId('preset-wait')).toBeNull()
    expect((screen.getByTestId('preset-record') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('preset-record').textContent).toMatch(/^Record · 8 s/)
  })

  it('R (the hand-flown Record) also waits: nothing is filmed at the old length; once the performer carries 8 s, R records', async () => {
    const lab = fakeLab({ perf: PERF, layer: layerOf(PERF, 4.7) })
    const engine = lab.op.engine as StageOperatorEngine
    const { rerender } = render(<ShootScreen lab={lab} />)
    fireEvent.click(screen.getByTestId('shot-length-8'))
    await waitFor(() => expect(posts).toHaveLength(1))
    fireEvent.keyDown(window, { code: 'KeyR', key: 'r' })
    expect(engine.deck.recording).toBe(false)
    expect(screen.getByTestId('record-note').textContent).toBe('Updating the action to 8 s… Record starts once it is ready.')
    // saved and re-read, the old performer still on the set: still waiting
    const saved = { ...PERF, shotSeconds: 8 }
    ;(lab as { kit: unknown }).kit = { id: 'loc-k', perf: saved }
    rerender(<ShootScreen lab={{ ...lab }} />)
    fireEvent.keyDown(window, { code: 'KeyR', key: 'r' })
    expect(engine.deck.recording).toBe(false)
    // the performer carries the saved length: the note goes, Record is live, R records
    ;(lab.performance as { layer: unknown }).layer = layerOf(saved, 8.05)
    rerender(<ShootScreen lab={{ ...lab }} />)
    expect(screen.queryByTestId('record-note')).toBeNull()
    fireEvent.keyDown(window, { code: 'KeyR', key: 'r' })
    expect(engine.deck.recording).toBe(true)
  })

  it('the wait holds from the pick itself, before the next render (R pressed in the same frame as the click)', async () => {
    const lab = fakeLab({ perf: PERF, layer: layerOf(PERF, 4.7) })
    const { result } = renderHook(() => useShotLength(lab))
    expect(result.current.waitNow()).toBeNull()
    let seen: string | null = null
    await act(async () => { const old = result.current; void old.pick(8); seen = old.waitNow() }) // the render before the pick's
    expect(seen).toBe('Updating the action to 8 s…')
  })

  it('a saved length is the one shown (kit world); off a kit world it is a local pick', async () => {
    const saved = { ...PERF, shotSeconds: 8 }
    render(<ShootScreen lab={fakeLab({ perf: saved, layer: layerOf(saved, 8.05) })} />)
    expect(pressed('shot-length-8')).toBe('true')
    expect(posts).toHaveLength(0)
    cleanup()
    render(<ShootScreen lab={fakeLab(null)} />)
    expect(pressed('shot-length-2')).toBe('true') // the old default off a kit world
    fireEvent.click(screen.getByTestId('shot-length-6'))
    expect(pressed('shot-length-6')).toBe('true')
    expect(posts).toHaveLength(0) // nothing to save it with
  })

  it('a refused save shows the server\'s own sentence, not just its headline', async () => {
    refuse = true
    render(<ShootScreen lab={fakeLab({ perf: PERF, layer: layerOf(PERF, 4.7) })} />)
    fireEvent.click(screen.getByTestId('shot-length-8'))
    await waitFor(() => expect(screen.getByTestId('shot-refused').textContent).toBe(SHOT_LENGTH_REFUSED))
    expect(screen.getByTestId('shot-refused').textContent).not.toContain('not valid')
    expect(pressed('shot-length-8')).toBe('false')
  })

  it('an action longer than the shot is said before Record, in shot terms', () => {
    const saved = { ...PERF, shotSeconds: 8 }
    render(<ShootScreen lab={fakeLab({ perf: saved, layer: layerOf(saved, 9.1) })} />)
    expect(screen.getByTestId('shot-over').textContent).toBe('The action takes 9.1 s and the shot is 8 s: pick a longer shot or a shorter action. A take keeps the first 8 s.')
    expect((screen.getByTestId('preset-record') as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    render(<ShootScreen lab={fakeLab({ perf: saved, layer: layerOf(saved, 8.05) })} />)
    expect(screen.queryByTestId('shot-over')).toBeNull()
  })
})

describe('a shot length saved in Operator survives a later Blocking save (the same server path)', () => {
  const pub = mkdtempSync(path.join(tmpdir(), 'kit-shotlen-'))
  afterAll(() => rmSync(pub, { recursive: true, force: true }))
  it('Blocking builds its save on the latest performance, so shotSeconds rides through', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: PERF })
    const before = s.read(w.id).perf
    s.savePerformance(w.id, { ...before, shotSeconds: 8 }) // the Shot length row
    const latest = s.read(w.id).perf
    const draft = { ...draftFrom(latest), pace: 1.1 } // a Blocking edit made on the set as it is now
    s.savePerformance(w.id, planOf(latest, draft))
    expect(s.read(w.id).perf).toMatchObject({ shotSeconds: 8, pace: 1.1 })
  })
})
