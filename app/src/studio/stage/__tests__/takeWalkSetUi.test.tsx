// @vitest-environment jsdom
// Each take keeps its own walk and set: the words on screen (WP4 + S4 of the per-take plans). The one line over the subject panel and
// the set panel (walk, set, both), the take list's "Lock again" badge and its keeps tooltip, the piece panel's presses off up front
// with the read-only words as their tooltip, and Play greyed with "Loading the take's walk…".
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { KitPerformance } from '../../../../server/stage3d/types'
import { SET_READ_ONLY } from '../../../labs/projection/stage3d/setEditGate'
import { resetTakeOnShow, setTakeOnShow } from '../../../labs/projection/stage3d/takeOnShow'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { mocapPackId } from '../../../stage3d/planHash'
import { resetSceneJobs } from '../../../jobs/sceneJobs'
import { resetL2RStore } from '../../render/l2rStore'
import { resetCurrentTake } from '../../shoot/currentTake'
import { take } from '../../shoot/__tests__/heroStillHarness'
import { resetTakeBoard } from '../../shoot/takeBoard'
import { resetLockedTakes } from '../../shoot/worldTakes'
import { PiecePanel } from '../panels/PiecePanel'
import { TakePlay } from '../panels/TakePlay'
import { TakeSetBanner } from '../panels/TakeSetBanner'
import { TakeWalkBanner } from '../panels/TakeWalkBanner'
import { TakeList } from '../TakeList'
import { takeLoadingWords } from '../takeLoading'

const ID = 'take-2026-10-29T10-00-00-000'
const perf = (n: number): KitPerformance => ({ path: [[0, 0], [n, 0]], castId: 'c', shotSeconds: 6 }) as KitPerformance
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
let takes: object[] = []
let rows: object[] = []

beforeEach(() => {
  resetCurrentTake(); resetLockedTakes(); resetTakeBoard(); resetL2RStore(); resetTakeOnShow(); localStorage.clear()
  takes = [{ ...take({ id: ID }), name: 'Wide' }]
  rows = [{ id: ID, name: 'Wide', thumb: null, state: 'locked', words: 'w', own: true, sceneChanged: false }]
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = String(url).split('?')[0]
    return p === '/__lab/takes/board' ? json({ rows, scenePrompt: '' }) : p === '/__lab/takes' ? json({ takes }) : json({})
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetLockedTakes(); resetTakeBoard(); resetL2RStore(); resetTakeOnShow(); resetSceneJobs(); localStorage.clear() })

const plan = (x: number) => ({ seed: 1, sentence: 's', sky: { url: 'u', look: 'dusk' }, kit: [{ kind: 'crates', at: [x, 0] }] })
const onShow = (o: { perf?: KitPerformance | null }) => ({ takeId: ID, worldId: 'loc-1', perf: o.perf ?? null, plan: null, setKey: null })
function labOf(kit: object = {}): ProjectionLabState {
  return { s: { source: 'loc-1' }, op: { engine: { deck: { recording: false, take: null }, shotPlan: () => ({ kind: 'take' }) }, mode: 'operator' }, stage: null,
    kit: { id: 'loc-1', world: { id: 'loc-1', plan: plan(1), perf: perf(2) }, scenePlan: plan(1), ...kit } } as unknown as ProjectionLabState
}

describe('the one line over the subject and set panels', () => {
  it('a walk of its own: the walk line, naming the take', async () => {
    render(<TakeWalkBanner lab={labOf({ onShow: onShow({ perf: perf(2) }) })} />)
    await waitFor(() => expect(screen.getByTestId('take-walk-banner').textContent).toBe('Wide is on show with its own walk. Changes here are for the next take you record; Wide keeps its walk.'))
  })
  it("a set of its own: the set line with Edit the scene's set", async () => {
    render(<TakeSetBanner lab={labOf({ ownSet: onShow({}) })} />)
    await waitFor(() => expect(screen.getByTestId('take-set-banner').textContent).toBe("Wide is on show with its own set. Changes here are for the next take. Edit the scene's set"))
  })
  it('both: the same combined line in both panels', async () => {
    const kit = { onShow: onShow({ perf: perf(2) }), ownSet: onShow({ perf: perf(2) }) }
    render(<><TakeWalkBanner lab={labOf(kit)} /><TakeSetBanner lab={labOf(kit)} /></>)
    const both = 'Wide is on show with its own walk and set. Changes here are for the next take you record; Wide keeps its walk and set.'
    await waitFor(() => expect(screen.getByTestId('take-walk-banner').textContent).toBe(both))
    expect(screen.getByTestId('take-set-banner').textContent).toBe(`${both} Edit the scene's set`)
  })
  it('nothing on show: no line', () => {
    render(<><TakeWalkBanner lab={labOf()} /><TakeSetBanner lab={labOf()} /></>)
    expect(screen.queryByTestId('take-walk-banner')).toBeNull()
    expect(screen.queryByTestId('take-set-banner')).toBeNull()
  })
})

describe('the take list', () => {
  it('a take with its own copy tells what it keeps and has no badge', async () => {
    takes = [{ ...takes[0], perf: perf(3), packId: mocapPackId(perf(3)), perfFrom: 'lock' }]
    render(<TakeList lab={labOf()} />)
    await screen.findByTestId(`take-pick-${ID}`)
    await waitFor(() => expect((screen.getByTestId(`take-pick-${ID}`) as HTMLButtonElement).title).toMatch(/Walk: walks · 6 s/))
    expect(screen.queryByTestId(`take-relock-${ID}`)).toBeNull()
  })
  it('a take with no copy whose walk the scene has left shows Lock again, and still opens', async () => {
    takes = [{ ...takes[0], packId: 'mocap-old' }]
    render(<TakeList lab={labOf()} />)
    const badge = await screen.findByTestId(`take-relock-${ID}`)
    expect(badge.getAttribute('title')).toBe('Lock again to keep its walk. Its first frame and renders still open.')
    expect((screen.getByTestId(`take-pick-${ID}`) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('the piece panel with a take of another set on show', () => {
  const place = { item: { kind: 'crates', at: [0, 0] }, sel: 0, poseOf: () => null, drop: vi.fn(), remove: vi.fn(), error: null } as never
  it('Bring and Remove are off up front, the read-only words their tooltip', () => {
    render(<PiecePanel place={place} lab={labOf({ ownSet: onShow({}) })} />)
    for (const id of ['piece-bring', 'piece-remove']) {
      const b = screen.getByTestId(id) as HTMLButtonElement
      expect(b.disabled).toBe(true)
      expect(b.title).toBe(SET_READ_ONLY)
    }
  })
  it("with the scene's own set they work", () => {
    render(<PiecePanel place={place} lab={labOf()} />)
    expect((screen.getByTestId('piece-remove') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe("Play while the take's own walk loads", () => {
  const stage = (pack: string | null) => ({ world: { performance: pack ? { pack: { id: pack } } : null } }) as never
  it('the words: the walk while it is not on the stage, nothing once it is or for another world', () => {
    setTakeOnShow({ takeId: ID, worldId: 'loc-1', perf: perf(2), plan: null, setKey: null })
    expect(takeLoadingWords(stage('mocap-other'), 'loc-1')).toBe("Loading the take's walk…")
    expect(takeLoadingWords(stage(mocapPackId(perf(2))), 'loc-1')).toBeNull()
    expect(takeLoadingWords(stage('mocap-other'), 'loc-2')).toBeNull()
  })
  it('Play take is greyed with those words', () => {
    setTakeOnShow({ takeId: ID, worldId: 'loc-1', perf: perf(2), plan: null, setKey: null })
    const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
    engine.shotPlan = () => ({ kind: 'take' }) as never
    const lab = labOf(); (lab.op as { engine: unknown }).engine = engine
    render(<TakePlay lab={{ ...lab, stage: stage('mocap-other') } as ProjectionLabState} />)
    const b = screen.getByTestId('play-take') as HTMLButtonElement
    expect(b.disabled).toBe(true)
    expect(b.title).toBe("Loading the take's walk…")
  })
})
