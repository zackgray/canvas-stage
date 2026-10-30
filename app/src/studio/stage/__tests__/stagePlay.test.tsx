// @vitest-environment jsdom
// Owner 2026-10-28, the Stage's transport: Play ran the action alone, and a camera move played only through the Camera panel's
// Preview; a flown, locked take never replayed (Return to the saved camera put the camera on its first sample, and Play left it
// there). Play now plays the shot (useShotPlan + the engine's playPause): the picked move, or the take's own recorded camera.
// Also W1-F1: the camera keys land here (Set start here / Back to start / Play take / Stop take / clear the aim, hosted by
// useShotPlan), and Play after a recording replays the take instead of pausing the looping clock it left running.
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { WorldClock } from '../../../labs/projection/world/clock'
import type { World } from '../../../labs/projection/world/World'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { CameraSample } from '../../../labs/controller/take/types'
import type { TakeRecord } from '../../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { DrawTransport } from '../DrawTransport'
import { resetStageMemo, setStageMemo, stageMemo } from '../stageMemory'
import { shotPlanOf, useShotPlan } from '../useShotPlan'
import { resetSavedCamera, returnTo, useSavedCamera } from '../useSavedCamera'

const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))
const take = (over: Partial<TakeRecord> = {}): TakeRecord => ({ id: 'take-9', worldId: 'loc-1', packId: null, fps: 24, frames: 49, samples: flight, focal: 35, viewAspect: 16 / 9,
  perfStart: 0, startKey: 'k9', lockedAt: '2026-10-28T01:00:00.000Z', createdAt: '2026-10-28T01:00:00.000Z', timelineStart: 0, ...over })

function fakeLab() {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  const clock = new WorldClock()
  clock.setDuration(6)
  const world = { clock, performance: null, sources: () => [], trackHash: '' } as unknown as World
  engine.bind(world, () => 16 / 9)
  engine.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  const lab = { op: { mode: 'operator', engine }, stage: { world }, s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), kit: null, performance: { selected: null, layer: null } } as unknown as ProjectionLabState
  return { lab, engine, clock }
}
const tick = (e: StageOperatorEngine, secs: number) => act(() => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) e.tick(1 / 60, 16 / 9) })
const x = (e: StageOperatorEngine) => Math.round(e.out.position.x * 100) / 100

function Return({ lab }: { lab: ProjectionLabState }) {
  const cam = useSavedCamera(lab)
  return <button type="button" data-testid="camera-return" onClick={cam.restore}>Return</button>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: [take()] }), { headers: { 'content-type': 'application/json' } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetStageMemo(); resetCurrentTake(); resetLockedTakes(); resetSavedCamera() })

describe('Play on the Stage plays the shot', () => {
  it('a flown, locked take: Return to the saved camera, then Play flies its recorded path with the action; Stop brings it back', async () => {
    const { lab, engine, clock } = fakeLab()
    setCurrentTake('take-9')
    render(<><DrawTransport lab={lab} /><Return lab={lab} /></>)
    setStageMemo({ cue: 'move', secs: 2 }) // a move was picked earlier: Return puts the take back on cue
    await waitFor(() => expect(screen.getByTestId('world-play')).toBeTruthy())
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) // the takes list lands
    fireEvent.click(screen.getByTestId('camera-return'))
    expect(x(engine)).toBe(-3) // the first sample
    expect(stageMemo().cue).toBe('take')
    fireEvent.click(screen.getByTestId('world-play'))
    tick(engine, 1)
    expect(x(engine)).toBe(-2) // a second along the recorded flight: the camera moves with the action
    expect(clock.playing).toBe(true)
    await waitFor(() => expect(screen.getByTestId('world-play').textContent).toBe('■ Stop'))
    fireEvent.click(screen.getByTestId('world-play'))
    expect(x(engine)).toBe(-3)
    expect(clock.playing).toBe(false)
  })

  it('a picked move: Play runs it with the action (Preview folded into Play); the clock and the move start together from 0', async () => {
    const { lab, engine, clock } = fakeLab()
    setStageMemo({ move: 'orbit-right', hold: false, cue: 'move', secs: 4 })
    clock.time = 2.5
    ;(lab.performance as { layer: unknown }).layer = {} // a performance is loaded: the transport shows
    render(<DrawTransport lab={lab} />)
    await waitFor(() => expect(screen.getByTestId('world-play')).toBeTruthy())
    fireEvent.click(screen.getByTestId('world-play'))
    expect(engine.move?.id).toBe('orbit-right')
    expect(engine.move?.seconds).toBe(4)
    expect(engine.move?.record).toBe(false)
    expect(clock.time).toBe(0)
    expect(clock.playing).toBe(true)
  })

  it('with nothing to play on the camera (no take, no shot length), Play is the action alone', async () => {
    const { lab, engine, clock } = fakeLab()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: [] }), { headers: { 'content-type': 'application/json' } })))
    ;(lab.performance as { layer: unknown }).layer = {} // a performance is loaded: the transport shows
    render(<DrawTransport lab={lab} />)
    fireEvent.click(screen.getByTestId('world-play'))
    expect(engine.move).toBeNull()
    expect(engine.deck.playback).toBeNull()
    expect(clock.playing).toBe(true)
  })
})

describe('the camera keys (W1-F1): the Stage hosts them through useShotPlan', () => {
  it('Set start here keeps the pose, Back to start returns to it, Play take / Stop take replay and stop, U clears the aim', () => {
    const { lab, engine } = fakeLab()
    renderHook(() => useShotPlan(lab))
    engine.doAction('setStart')
    expect(stageMemo().start?.position).toEqual([0, 1.6, 6])
    act(() => returnTo(engine, { position: [4, 2, 9], quaternion: [0, 0, 0, 1], focal: 50, focus: 7 }))
    engine.doAction('backToStart')
    expect(engine.out.position.toArray()).toEqual([0, 1.6, 6])
    expect(engine.focus).toBe(10)
    // a take to play
    act(() => { engine.toggleRecording() })
    tick(engine, 1)
    act(() => { engine.stopRecording() })
    engine.doAction('playTake')
    expect(engine.deck.playback).not.toBeNull()
    engine.doAction('playTake') // the pad's one button toggles, as the transport's does
    expect(engine.deck.playback).toBeNull()
    engine.doAction('playTake')
    engine.doAction('stopTake')
    expect(engine.deck.playback).toBeNull()
    setStageMemo({ aim: { kind: 'subject' } })
    engine.doAction('aimClear')
    expect(stageMemo().aim).toBeNull()
  })

  it('the camera keys hold off while a take records', () => {
    const { lab, engine } = fakeLab()
    renderHook(() => useShotPlan(lab))
    act(() => returnTo(engine, { position: [6, 2, 6], quaternion: [0, 0, 0, 1], focal: 40, focus: 5 })) // flown somewhere
    act(() => { engine.toggleRecording() })
    engine.doAction('setStart')
    expect(stageMemo().start).toBeNull() // the recording's start is not the scene's
    engine.doAction('backToStart')
    expect(engine.out.position.toArray()).toEqual([6, 2, 6]) // the camera does not jump mid-take
    engine.doAction('playTake')
    expect(engine.deck.playback).toBeNull()
    act(() => { engine.stopRecording() })
  })

  it('Play after a recording replays the take; it does not pause the looping clock the recording left running', () => {
    const { lab, engine, clock } = fakeLab()
    clock.loop = true
    renderHook(() => useShotPlan(lab))
    act(() => { engine.toggleRecording() })
    tick(engine, 1)
    act(() => { engine.stopRecording() })
    expect(engine.deck.take).not.toBeNull()
    expect(clock.playing).toBe(true) // the loop picked the clock back up
    act(() => { engine.playPause() }) // Space, the pad's play button, the transport's press
    expect(engine.deck.playback).not.toBeNull() // the take replays
    expect(clock.playing).toBe(true)
  })

  it('owner 10-29 "record a take, hit Play, it does not stick": a filmed move cues its take, so Play replays it and Play take is live', () => {
    const { lab, engine, clock } = fakeLab()
    clock.loop = true
    renderHook(() => useShotPlan(lab))
    act(() => setStageMemo({ cue: 'move', move: 'push', secs: 2 })) // Record with Push in picked (PresetMoves cues the move)
    act(() => { engine.startPreset('push', 2, true) })
    tick(engine, 2.2) // the move ends: its recording becomes the take
    expect(engine.move).toBeNull()
    expect(engine.deck.take).not.toBeNull()
    expect(clock.playing).toBe(true) // the loop picked the clock back up
    expect(stageMemo().cue).toBe('take')
    expect(engine.shotPlan()?.kind).toBe('memory') // the Camera panel's Play take reads this: not greyed out
    act(() => { engine.playPause() }) // the transport's Play
    expect(engine.deck.playback).not.toBeNull() // the take replays; it used to pause the loop and then preview the move live
    expect(engine.move).toBeNull()
  })

  it('the replay rule is for takes: a move picked after the recording, Play still pauses the running clock', () => {
    const { lab, engine, clock } = fakeLab()
    clock.loop = true
    renderHook(() => useShotPlan(lab))
    act(() => { engine.toggleRecording() })
    tick(engine, 1)
    act(() => { engine.stopRecording() })
    act(() => setStageMemo({ cue: 'move', move: 'push', secs: 2 }))
    expect(clock.playing).toBe(true)
    act(() => { engine.playPause() })
    expect(engine.move).toBeNull() // no move started
    expect(engine.deck.playback).toBeNull()
    expect(clock.playing).toBe(false) // the clock paused, as Play always did here
  })
})

describe('shotPlanOf: what Play plays', () => {
  const m = (o: object = {}) => ({ ...stageMemo(), ...o })
  const f = (o: object = {}) => ({ take: null, memory: false, memoryLocked: false, secs: 4, ...o })
  it('nothing chosen: the take when there is one, else the picked move', () => {
    expect(shotPlanOf(m(), f({ take: take() }))).toEqual({ kind: 'take', samples: flight, start: 0 })
    expect(shotPlanOf(m({ move: 'crane', hold: true }), f())).toEqual({ kind: 'move', id: 'crane', seconds: 4, hold: true })
  })
  it('a take filmed since and not locked is the newer work; a picked move wins over a take; no length, no move', () => {
    expect(shotPlanOf(m(), f({ take: take(), memory: true }))).toEqual({ kind: 'memory' })
    expect(shotPlanOf(m(), f({ take: take(), memory: true, memoryLocked: true }))).toEqual({ kind: 'take', samples: flight, start: 0 })
    expect(shotPlanOf(m({ cue: 'move' }), f({ take: take() }))?.kind).toBe('move')
    expect(shotPlanOf(m({ cue: 'move' }), f({ secs: null }))).toBeNull()
    expect(shotPlanOf(m({ cue: 'take' }), f())).toBeNull()
  })
})
