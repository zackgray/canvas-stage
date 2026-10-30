// Per-take performance (WP3): Play replays a take with its own performer, so it waits until she is on the stage; Record films the
// next take from the scene's walk, so a take on show with another walk is set aside first and Record starts once the scene's
// performer is on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stage } from '../../../labs/projection/engine/Stage'
import type { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import { resetTakeOnShow, setTakeOnShow, takeOnShow } from '../../../labs/projection/stage3d/takeOnShow'
import type { PerformancePlan } from '../../../stage3d/contract'
import { mocapPackId } from '../../../stage3d/planHash'
import { resetTakeShow } from '../../shoot/takeShow'
import { playTakeWhenReady, recordOnSceneWalk } from '../takePerformer'

const W = 'loc-1'
const TAKE: PerformancePlan = { path: [[0, 0], [0, -6]] }
const SCENE: PerformancePlan = { path: [[0, 0], [0, -0.5]], stand: true }
const later = (f: () => void, ms = 40) => setTimeout(f, ms)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fakeEngine() {
  const e = { deck: { recording: false, playback: null, take: null }, move: null, flash: vi.fn(), toggleRecording: vi.fn(),
    shotPlan: () => ({ kind: 'take', samples: [{}, {}], start: 0 }) }
  return e as unknown as StageOperatorEngine & { toggleRecording: ReturnType<typeof vi.fn> }
}
const stageOn = (id: string | null) => {
  const world = { performance: id ? { pack: { id } } : null }
  return { stage: { world } as unknown as Stage, world }
}
beforeEach(() => { resetTakeOnShow(); resetTakeShow() })
afterEach(() => { resetTakeOnShow(); resetTakeShow() })

describe('Play waits for the take\'s own performer', () => {
  it('plays only once the take on show\'s walk is on the stage', async () => {
    setTakeOnShow({ takeId: 'take-1', worldId: W, perf: TAKE, plan: null, setKey: null })
    const { stage, world } = stageOn(mocapPackId(SCENE))
    const play = vi.spyOn(await import('../takePlay'), 'playTakeNow').mockReturnValue(true)
    const e = fakeEngine()
    const p = playTakeWhenReady(e, stage, W, 2000)
    await wait(60)
    expect(play).not.toHaveBeenCalled()
    world.performance = { pack: { id: mocapPackId(TAKE) } }
    expect(await p).toBe(true)
    expect(play).toHaveBeenCalledTimes(1)
    play.mockRestore()
  })
})

describe('Record films from the scene\'s walk', () => {
  it('sets a take with another walk aside and starts once the scene\'s performer is on', async () => {
    setTakeOnShow({ takeId: 'take-1', worldId: W, perf: TAKE, plan: null, setKey: null })
    const { stage, world } = stageOn(mocapPackId(TAKE))
    const e = fakeEngine()
    const inner = e.toggleRecording
    const un = recordOnSceneWalk(e, { stage: () => stage, worldId: () => W, scenePerf: () => SCENE, timeoutMs: 2000 })
    e.toggleRecording()
    expect(takeOnShow()).toBeNull()
    expect(inner).not.toHaveBeenCalled()
    later(() => { world.performance = { pack: { id: mocapPackId(SCENE) } } })
    await wait(150)
    expect(inner).toHaveBeenCalledTimes(1)
    un()
  })

  it('records at once when the take on show is the scene\'s walk', () => {
    setTakeOnShow({ takeId: 'take-1', worldId: W, perf: SCENE, plan: null, setKey: null })
    const e = fakeEngine()
    const inner = e.toggleRecording
    recordOnSceneWalk(e, { stage: () => null, worldId: () => W, scenePerf: () => ({ ...SCENE, castId: 'bo' }) as PerformancePlan })
    e.toggleRecording()
    expect(inner).toHaveBeenCalledTimes(1)
    expect(takeOnShow()?.takeId).toBe('take-1')
  })
})
