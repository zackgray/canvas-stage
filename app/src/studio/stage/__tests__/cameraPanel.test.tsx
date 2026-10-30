// @vitest-environment jsdom
// The Camera panel's new controls (tracks D, 2026-10-28): "Set start here" keeps the camera's pose as the scene's start and
// "Back to start" returns to it; the optional automatic return puts the camera on the start as a recording begins; Fly it
// yourself keeps its state across a tab switch (it lives in the Stage memory now); the aim lock's picker offers the subject,
// the pieces and a clicked point; Play take sits on the panel. W1-F1 (owner 10-29): one "Take locked · New take" line — the New
// take press films again at once, asking nothing; the locked take stays saved until the new one is locked (said on its title).
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { CameraSample } from '../../../labs/controller/take/types'
import type { TakeRecord } from '../../../shared/shotContract'
import { currentTakeId, resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { CameraPanel } from '../panels/CameraPanel'
import { useShotPlan } from '../useShotPlan'
import { resetStageMemo, setStageMemo, stageMemo } from '../stageMemory'
import { returnTo } from '../useSavedCamera'

vi.mock('../../../library/currentScene', async (orig) => ({ ...(await orig<typeof import('../../../library/currentScene')>()), currentSceneId: () => 'sc-cp' }))
vi.mock('../panels/blocking', () => ({ BlockingPanel: () => <section data-testid="blocking-stub" /> }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetStageMemo(); resetCurrentTake(); resetLockedTakes() })

const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))
const lockedTake: TakeRecord = { id: 'take-9', worldId: 'synthetic', packId: null, fps: 24, frames: 49, samples: flight, focal: 35, viewAspect: 16 / 9,
  perfStart: 0, startKey: 'k9', lockedAt: '2026-10-28T01:00:00.000Z', createdAt: '2026-10-28T01:00:00.000Z', timelineStart: 0 }
const lockedFetch = vi.fn(async () => new Response(JSON.stringify({ takes: [lockedTake] }), { headers: { 'content-type': 'application/json' } }))

function fakeLab() {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  engine.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: null,
    s: { source: 'synthetic' }, shot: undefined, shots: [], pickSource: vi.fn(), kit: null,
    performance: { listed: true, packs: [], selected: null, select: vi.fn(), phase: null, error: null, layer: null, plateAvailable: false, plateOn: true, setPlateOn: vi.fn() },
  } as unknown as ProjectionLabState
  return { lab, engine }
}

describe('the Camera panel', () => {
  it('"Set start here" keeps the pose now; "Back to start" returns the camera to it', () => {
    const { lab, engine } = fakeLab()
    render(<CameraPanel lab={lab} />)
    fireEvent.click(screen.getByTestId('camera-set-start'))
    expect(stageMemo().start).toEqual({ position: [0, 1.6, 6], quaternion: [0, 0, 0, 1], focal: 35, focus: 10 })
    act(() => returnTo(engine, { position: [4, 2, 9], quaternion: [0, 0.3826834, 0, 0.9238795], focal: 50, focus: 7 })) // flown since
    fireEvent.click(screen.getByTestId('camera-return'))
    expect(engine.out.position.toArray()).toEqual([0, 1.6, 6])
    expect(engine.out.focal).toBe(35)
    expect(engine.focus).toBe(10)
  })

  it('the automatic return puts the camera on the start as a recording begins (the engine\'s beforeRecord)', () => {
    const { lab, engine } = fakeLab()
    renderHook(() => useShotPlan(lab)) // wires beforeRecord, as the Stage does
    setStageMemo({ start: { position: [2, 1.8, 5], quaternion: [0, 0, 0, 1], focal: 40, focus: 6 }, autoStart: true })
    act(() => returnTo(engine, { position: [8, 2, 12], quaternion: [0, 0, 0, 1], focal: 24, focus: 3 }))
    act(() => { engine.toggleRecording() })
    expect(engine.deck.recording).toBe(true)
    expect(engine.out.position.toArray()).toEqual([2, 1.8, 5]) // on the start as it began
    expect(engine.out.focal).toBe(40)
    act(() => { engine.stopRecording() })
  })

  it('the automatic return stays off until ticked', () => {
    const { lab, engine } = fakeLab()
    renderHook(() => useShotPlan(lab))
    setStageMemo({ start: { position: [2, 1.8, 5], quaternion: [0, 0, 0, 1], focal: 40, focus: 6 } })
    act(() => { engine.toggleRecording() })
    expect(engine.out.position.toArray()).not.toEqual([2, 1.8, 5])
    act(() => { engine.stopRecording() })
  })

  it('Fly it yourself keeps its state across a tab switch', () => {
    const { lab } = fakeLab()
    const ui = () => render(<CameraPanel lab={lab} />)
    ui()
    fireEvent.click(screen.getByTestId('preset-fly'))
    expect(stageMemo().fly).toBe(true)
    expect(screen.getByTestId('preset-fly').getAttribute('aria-pressed')).toBe('true')
    cleanup() // Board, and back
    ui()
    expect(screen.getByTestId('preset-fly').getAttribute('aria-pressed')).toBe('true')
  })

  it('the aim lock\'s picker: the subject, a piece, a clicked point, and off', () => {
    const { lab } = fakeLab()
    ;(lab as { kit: unknown }).kit = { id: null, perf: null, world: { plan: { kit: [{ kind: 'tree', at: [1, 1] }, { kind: 'table', at: [2, 2], label: 'oak' }] }, perf: { castId: null } } }
    render(<CameraPanel lab={lab} />)
    expect(screen.queryByTestId('aim-lock')).toBeNull() // hidden until Fly it yourself is on
    fireEvent.click(screen.getByTestId('preset-fly'))
    const pick = screen.getByTestId('aim-lock-pick') as HTMLSelectElement
    expect(screen.getByTestId('aim-lock').textContent).toContain('While you fly, keep aimed at:')
    expect(screen.getByTestId('hand-fly').nextElementSibling).toBe(screen.getByTestId('aim-lock')) // directly under the row
    expect(pick.value).toBe('off')
    fireEvent.change(pick, { target: { value: 'subject' } })
    expect(stageMemo().aim).toEqual({ kind: 'subject' })
    fireEvent.change(pick, { target: { value: 'piece:1' } })
    expect(stageMemo().aim).toEqual({ kind: 'piece', index: 1 })
    fireEvent.change(pick, { target: { value: 'off' } })
    expect(stageMemo().aim).toBeNull()
  })

  it('the aim choice is kept when hidden, but a hidden aim never acts: the engine has no lock on a preset move', () => {
    const { lab, engine } = fakeLab()
    render(<CameraPanel lab={lab} />)
    fireEvent.click(screen.getByTestId('preset-fly'))
    fireEvent.change(screen.getByTestId('aim-lock-pick'), { target: { value: 'subject' } })
    expect(engine.aimLock).not.toBeNull()
    fireEvent.click(screen.getByTestId('preset-push')) // a move pick turns Fly it yourself off
    expect(screen.queryByTestId('aim-lock')).toBeNull()
    expect(engine.aimLock).toBeNull()
    expect(stageMemo().aim).toEqual({ kind: 'subject' }) // remembered for the next flight
    fireEvent.click(screen.getByTestId('preset-fly'))
    expect((screen.getByTestId('aim-lock-pick') as HTMLSelectElement).value).toBe('subject')
    expect(engine.aimLock).not.toBeNull()
  })

  it('one "Take locked · New take" line: New take records nothing and sets the locked take aside; no long paragraph', async () => {
    const { lab, engine } = fakeLab()
    vi.stubGlobal('fetch', lockedFetch)
    setCurrentTake('take-9')
    render(<CameraPanel lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('camera-new-take')).toBeTruthy())
    await waitFor(() => expect(screen.getByTestId('take-locked').textContent).toBe('Take locked · New take')) // one line, the press in it
    expect(screen.getByTestId('take-locked').contains(screen.getByTestId('camera-new-take-btn'))).toBe(true)
    expect(screen.getAllByTestId('take-locked')).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Record starts a new take over the locked one')
    expect(screen.getByTestId('camera-new-take-btn').title).toBe("Starts a new take from what's on screen; nothing is recorded until you press Record. Your saved takes stay as they are.")
    await act(async () => { fireEvent.click(screen.getByTestId('camera-new-take-btn')) })
    expect(engine.deck.recording).toBe(false) // nothing is recorded until Record
    expect(screen.queryByTestId('record-ask')).toBeNull()
    expect(screen.queryByTestId('camera-new-take-ask')).toBeNull() // nothing unlocked to drop: no ask
    await waitFor(() => expect(currentTakeId()).toBeNull()) // the open take is current; the locked one stays on disk
    expect(screen.queryByTestId('camera-new-take')).toBeNull()
  })
})
