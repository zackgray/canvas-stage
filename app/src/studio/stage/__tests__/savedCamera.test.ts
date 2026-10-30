// @vitest-environment jsdom
// Pass 3 + camera-start-point: the camera's start is the owner's ("Set start here": any moment, also while flying free), else
// the saved take's first pose, kept on disk with the scene; it is put back on load and on request ("Back to start"), and the
// optional automatic return puts it back as a recording begins.
import { act, renderHook } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../../labs/controller/engine/engine'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import type { CameraSample } from '../../../labs/controller/take/types'
import type { TakeRecord } from '../../../shared/shotContract'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { poseOf, returnTo, savedStart, useSavedCamera } from '../useSavedCamera'
import { resetStageMemo } from '../stageMemory'

vi.mock('../../../library/currentScene', async (orig) => ({ ...(await orig<typeof import('../../../library/currentScene')>()), currentSceneId: () => 'sc-saved' }))

const sample = (x: number): CameraSample => ({ t: 0, position: [x, 1.6, 4], quaternion: [0, 0.3826834, 0, 0.9238795], focal: 50, focus: 3.5 })
const take = (id: string, x: number): TakeRecord => ({ id, worldId: 'loc-1', packId: null, fps: 24, frames: 97, samples: [sample(x), sample(x + 1)], focal: 50, viewAspect: 1.77,
  perfStart: 0, startKey: 'k', lockedAt: id, createdAt: id })

const engine = () => new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
const labOf = (e: OperatorEngine): ProjectionLabState => ({ s: { source: null }, op: { engine: e } } as unknown as ProjectionLabState)

describe("the saved camera", () => {
  it('is the current take\'s first pose, else the newest locked take\'s; none without a take', () => {
    const takes = [take('b', 2), take('a', 1)] // newest lock first
    expect(savedStart(takes, 'a')?.position).toEqual([1, 1.6, 4])
    expect(savedStart(takes, null)?.position).toEqual([2, 1.6, 4])
    expect(savedStart([], null)).toBeNull()
  })
  it('Return puts the camera there: place, turn and lens', () => {
    const e = engine()
    returnTo(e, sample(5))
    expect(e.out.position.toArray()).toEqual([5, 1.6, 4])
    expect(e.out.quaternion.y).toBeCloseTo(0.3826834, 6)
    expect(e.out.focal).toBe(50)
    expect(e.focus).toBe(3.5)
  })
  it('"Set start here" keeps the camera\'s pose now (its place, turn and lens) and it becomes the saved start', () => {
    const e = engine()
    const { result } = renderHook(() => useSavedCamera(labOf(e)))
    expect(result.current.saved).toBeNull() // no take, no start yet
    e.takeOver(new Vector3(1, 2.2, 3), new Quaternion(0, 0.3826834, 0, 0.9238795), 50)
    e.focus = 7
    const pose = poseOf(e)
    expect(pose).toEqual({ position: [1, 2.2, 3], quaternion: [0, 0.3826834, 0, 0.9238795], focal: 50, focus: 7 })
    act(() => result.current.saveStart())
    expect(result.current.saved).toEqual(pose)
    // "Back to start" puts the camera there, wherever it was flown since
    e.takeOver(new Vector3(9, 1.6, 9), new Quaternion(), 24)
    act(() => result.current.restore())
    expect(e.out.position.toArray()).toEqual([1, 2.2, 3])
    expect(e.out.quaternion.y).toBeCloseTo(0.3826834, 6)
    expect(e.out.focal).toBe(50)
    expect(e.focus).toBe(7)
    resetStageMemo()
  })
})
