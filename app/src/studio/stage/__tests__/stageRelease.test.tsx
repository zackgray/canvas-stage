// @vitest-environment jsdom
// Owner 2026-10-28: no controller button or key let go of a held camera, and the owner flies with both thumbs on the sticks. Create
// (the pad) and Esc (the keyboard) now release it on the Stage: a move or a shot replay stops where the camera is (no jump back to
// the shot's start), Hold on is unticked, and the sticks fly it freely from there; the viewfinder flashes it. Esc stays the
// dialog's, the draw's and the overlay's while one of those is up.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALREADY_FREE_TEXT, RELEASED_TEXT } from '../../../labs/controller/engine/actions'
import type { CameraSample } from '../../../labs/controller/take/types'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { WorldClock } from '../../../labs/projection/world/clock'
import type { World } from '../../../labs/projection/world/World'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { TakeRecord } from '../../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from '../../shoot/currentTake'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { DrawTransport } from '../DrawTransport'
import { setGroundDrawing } from '../groundDrawing'
import { resetStageMemo, setStageMemo, stageMemo } from '../stageMemory'

const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))
const take: TakeRecord = { id: 'take-9', worldId: 'loc-1', packId: null, fps: 24, frames: 49, samples: flight, focal: 35, viewAspect: 16 / 9,
  perfStart: 0, startKey: 'k9', lockedAt: '2026-10-28T01:00:00.000Z', createdAt: '2026-10-28T01:00:00.000Z', timelineStart: 0 }

function staged() {
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'orbit', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  const clock = new WorldClock()
  clock.setDuration(6)
  const world = { clock, performance: null, sources: () => [], trackHash: '' } as unknown as World
  engine.bind(world, () => 16 / 9)
  engine.takeOver(new Vector3(0, 1.6, 6), new Quaternion(), 35)
  const lab = { op: { mode: 'operator', engine }, stage: { world }, s: { source: 'loc-1', look: 'textured' }, set: vi.fn(), kit: null,
    performance: { selected: null, layer: {} } } as unknown as ProjectionLabState
  const detach = engine.hub.keyboard.attach(document.createElement('canvas'))
  render(<DrawTransport lab={lab} />)
  return { engine, clock, detach }
}
const frames = (e: StageOperatorEngine, n: number) => act(() => { for (let k = 0; k < n; k++) e.tick(1 / 60, 16 / 9) })
/** the pad's Create, read with the next frame */
const create = (e: StageOperatorEngine) => {
  const poll = e.hub.dualsense.poll.bind(e.hub.dualsense)
  e.hub.dualsense.poll = () => { e.hub.dualsense.poll = poll; return { frame: { actions: ['release'] }, active: true } }
  frames(e, 1)
}
const esc = (e: StageOperatorEngine) => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }))
  frames(e, 1)
}
const pose = (e: StageOperatorEngine) => e.out.position.toArray().map((n) => Math.round(n * 1000) / 1000)

let detachKeys = () => {}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ takes: [take] }), { headers: { 'content-type': 'application/json' } })))
})
afterEach(() => { detachKeys(); cleanup(); vi.unstubAllGlobals(); resetStageMemo(); resetCurrentTake(); resetLockedTakes(); setGroundDrawing(false); document.body.innerHTML = '' })

describe('Create and Esc release the held camera on the Stage', () => {
  it('Create mid-move (held on the subject): the move stops where the camera is, Hold on unticks, the sticks fly it from there', async () => {
    const { engine, detach } = staged()
    detachKeys = detach
    act(() => { setStageMemo({ move: 'orbit-right', hold: true, cue: 'move', secs: 4 }) })
    fireEvent.click(screen.getByTestId('world-play'))
    expect(engine.move?.record).toBe(false)
    const home = engine.move!.home.position.toArray().map((n) => Math.round(n * 1000) / 1000)
    frames(engine, 60)
    const there = pose(engine)
    expect(there).not.toEqual(home) // a second into the orbit
    create(engine)
    expect(engine.move).toBeNull()
    expect(stageMemo().hold).toBe(false)
    expect(engine.rigId).toBe('free')
    expect(engine.message).toBe(RELEASED_TEXT)
    expect(pose(engine)).toEqual(there) // no jump back to the move's start
    frames(engine, 30)
    expect(pose(engine)).toEqual(there) // and it stays put with the sticks at rest
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    frames(engine, 30)
    expect(pose(engine)).not.toEqual(there) // flying free
  })

  it('Esc mid-replay of a locked take: the replay stops where the camera is, the clock pauses', async () => {
    const { engine, clock, detach } = staged()
    detachKeys = detach
    setCurrentTake('take-9')
    act(() => { setStageMemo({ cue: 'take' }) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) // the takes list lands
    fireEvent.click(screen.getByTestId('world-play'))
    frames(engine, 60)
    expect(Math.round(engine.out.position.x * 100) / 100).toBe(-2)
    esc(engine)
    expect(engine.deck.playback).toBeNull()
    expect(clock.playing).toBe(false)
    expect(Math.round(engine.out.position.x * 100) / 100).toBe(-2) // not back on -3, the take's first sample
    expect(engine.message).toBe(RELEASED_TEXT)
    await waitFor(() => expect(screen.getByTestId('world-play').textContent).not.toBe('■ Stop'))
  })

  it('Create mid-filming of a move: the take keeps what was filmed, the camera stays where it is', () => {
    const { engine, detach } = staged()
    detachKeys = detach
    engine.startPreset('push', 4, true)
    frames(engine, 60)
    const there = pose(engine)
    create(engine)
    expect(engine.move).toBeNull()
    expect(engine.deck.recording).toBe(false)
    expect(engine.deck.take).toBeTruthy()
    expect(pose(engine)).toEqual(there)
  })

  it('with nothing held it is quietly already free', () => {
    const { engine, detach } = staged()
    detachKeys = detach
    create(engine) // the orbit rig is a hold: let go
    expect(engine.message).toBe(RELEASED_TEXT)
    create(engine)
    expect(engine.message).toBe(ALREADY_FREE_TEXT)
  })

  it('Esc is the dialog\'s, the draw\'s or the overlay\'s while one is up: nothing is released', () => {
    const { engine, detach } = staged()
    detachKeys = detach
    setStageMemo({ hold: true })
    const owners: (() => () => void)[] = [
      () => { const d = document.body.appendChild(document.createElement('div')); d.setAttribute('role', 'dialog'); return () => d.remove() },
      () => { setGroundDrawing(true); return () => setGroundDrawing(false) },
      () => { const d = document.body.appendChild(document.createElement('section')); d.className = 'st-hero-overlay'; return () => d.remove() },
      () => { const d = document.body.appendChild(document.createElement('div')); d.className = 'st-addmenu'; return () => d.remove() },
    ]
    for (const own of owners) {
      const off = own()
      esc(engine)
      expect(stageMemo().hold).toBe(true)
      expect(engine.rigId).toBe('orbit')
      off()
    }
    esc(engine)
    expect(stageMemo().hold).toBe(false)
    expect(engine.rigId).toBe('free')
  })

  it('the registration lasts the Stage\'s life', () => {
    const { engine, detach } = staged()
    detachKeys = detach
    expect(engine.hub.keyboard.escapeGate).not.toBeNull()
    cleanup()
    setStageMemo({ hold: true })
    expect(engine.onRelease()).toBe(false)
    expect(stageMemo().hold).toBe(true)
    expect(engine.hub.keyboard.escapeGate).toBeNull()
  })
})
