// @vitest-environment jsdom
// Review F1 (wave 3): a take picked on Render's shots list is the Stage's current take, and a take recorded on the Stage afterwards
// must supersede it. Before the fix the pick survived the new recording, so the Stage's Render press stayed live for the OLD take
// while the viewport held the new, unlocked one. The real path: the Render store's pick, the Stage's restore (and in Camera view the
// lock block), a recording through the operator engine's own deck, then a lock; the press read through the Stage's own gate.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { startKey, type TakeLockRequest, type TakeRecord } from '../../../shared/shotContract'
import { pick, resetL2RStore, useL2RState } from '../../render/l2rStore'
import { KIT_NEEDS_TAKE, type Primary } from '../../screens/primaryAction'
import { currentTakeId, resetCurrentTake, useCurrentTakeId } from '../../shoot/currentTake'
import { resetClayStore } from '../../shoot/takeClay'
import { TakeLockBlock } from '../../shoot/TakeLockBlock'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { stageGate } from '../shotStep'
import { StageTakeRestore } from '../StageTakeRestore'

const rec = (id: string, lockedAt: string): TakeRecord => ({ id, worldId: 'loc-a', packId: 'pack-a', fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 16 / 9,
  perfStart: 0, startKey: `k-${id}`, lockedAt, createdAt: lockedAt })
const OLD = rec('take-2026-10-27T05-00-00-001', '2026-10-27T05:00:00.001Z')
const NEWEST = rec('take-2026-10-28T05-00-00-001', '2026-10-28T05:00:00.001Z')
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
let disk: TakeRecord[]

function fakeLab() {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  return { op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: { view: { aspect: 16 / 9 } }, s: { source: 'loc-a' },
    performance: { layer: { pack: { id: 'pack-a', fps: 24, frames: 400 } }, listed: true, packs: [], selected: 'pack-a' } } as unknown as ProjectionLabState
}

/** a hand-flown take through the engine's own deck: Record, the camera moving for a second, Record again to stop */
function record(lab: ProjectionLabState) {
  const engine = lab.op.engine
  engine.toggleRecording()
  for (let i = 1; i <= 24; i++) engine.deck.tick(1 / 24, { position: [i / 24, 1.6, 0], quaternion: [0, 0, 0, 1], focal: 35, focus: 3 })
  engine.toggleRecording()
}

/** the Stage's Render press as the steps block gates it (ShotSteps: stageGate over Render's primary), here over a live press */
const LIVE: Primary = { action: 'l2r', verb: 'Render', price: 31, disabled: false, why: null, run: () => {} }
function StagePress() {
  const l = useL2RState('loc-a')
  const p = stageGate(LIVE, useCurrentTakeId(), l.takeId)
  return <p data-testid="press" data-render-take={l.takeId ?? ''}>{p.disabled ? `held: ${p.why}` : `live: ${l.takeId}`}</p>
}

beforeEach(() => {
  localStorage.clear(); resetL2RStore(); resetCurrentTake(); resetLockedTakes()
  disk = [NEWEST, OLD]
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/__lab/takes') return ok({ takes: disk })
    if (url === '/__lab/takes/lock') {
      const q = JSON.parse(init!.body as string) as TakeLockRequest
      const take = { ...q, id: 'take-2026-10-28T09-00-00-001', startKey: startKey(q.samples[0], q.focal, q.perfStart), lockedAt: '2026-10-28T09:00:00.001Z', createdAt: 'x' } as TakeRecord
      disk = [take, ...disk]
      return ok({ take }, 201)
    }
    if (url.startsWith('/__lab/l2r?take=')) return ok({ renders: [], take: disk.find((d) => url.endsWith(encodeURIComponent(d.id))) ?? null, missing: [] })
    return ok({})
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); resetL2RStore(); resetCurrentTake(); resetLockedTakes(); resetClayStore(); resetSceneJobs() })

const press = () => screen.getByTestId('press').textContent

describe('a take recorded after a Render pick supersedes the pick', () => {
  it('Free view (the restore alone): the press is held with "Lock a take first." instead of rendering the picked take', async () => {
    const lab = fakeLab()
    render(<><StageTakeRestore lab={lab} /><StagePress /></>)
    await waitFor(() => expect(currentTakeId()).toBe(NEWEST.id)) // a reload: the newest locked take is on show
    await act(async () => { pick(OLD.id) }) // the owner flips to the older take on Render
    await waitFor(() => expect(press()).toBe(`live: ${OLD.id}`))
    await act(async () => { record(lab) })
    await waitFor(() => expect(press()).toBe(`held: ${KIT_NEEDS_TAKE}`), { timeout: 2000 })
    expect(currentTakeId()).toBeNull()
  })

  it('Camera view: record, lock, and Render is live for the new take, never the picked one', async () => {
    const lab = fakeLab()
    render(<><StageTakeRestore lab={lab} /><TakeLockBlock lab={lab} /><StagePress /></>)
    await waitFor(() => expect(currentTakeId()).toBe(NEWEST.id))
    await act(async () => { pick(OLD.id) })
    await waitFor(() => expect(press()).toBe(`live: ${OLD.id}`))
    await act(async () => { record(lab) })
    await waitFor(() => expect(press()).toBe(`held: ${KIT_NEEDS_TAKE}`), { timeout: 2000 })
    fireEvent.click(await screen.findByTestId('take-lock-btn'))
    await waitFor(() => expect(press()).toBe('live: take-2026-10-28T09-00-00-001'))
    expect(localStorage.getItem('canvas-stage.render-take.loc-a')).toBe('take-2026-10-28T09-00-00-001')
  })

  it('a take recorded as its lock stands puts that lock back over the pick (the lock block knows it)', async () => {
    const lab = fakeLab()
    render(<><StageTakeRestore lab={lab} /><TakeLockBlock lab={lab} /><StagePress /></>)
    await act(async () => { record(lab) })
    fireEvent.click(await screen.findByTestId('take-lock-btn', {}, { timeout: 2000 }))
    const LOCKED = 'take-2026-10-28T09-00-00-001'
    await waitFor(() => expect(press()).toBe(`live: ${LOCKED}`))
    await act(async () => { pick(OLD.id) })
    await waitFor(() => expect(press()).toBe(`live: ${OLD.id}`))
    await act(async () => { record(lab) }) // the same camera path again: the same start and length as the lock
    await waitFor(() => expect(currentTakeId()).toBe(LOCKED), { timeout: 2000 })
    await waitFor(() => expect(press()).toBe(`live: ${LOCKED}`))
  })
})
