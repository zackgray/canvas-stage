// @vitest-environment jsdom
// Play take on the Camera panel (camera-take-playback): replays the take the Stage's plan points at in the viewport, with
// nothing rendered; Stop puts the camera back where the user was before the replay, else on the scene's start; the scrub bar
// seeks the running replay. The panel: disabled without a take, the bar and Stop while one plays.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Quaternion, Vector3 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorldClock } from '../../../labs/projection/world/clock'
import { STAGE_RIGS } from '../../../labs/projection/operator/link'
import { playShot } from '../../../labs/projection/operator/shotPlay'
import { StageOperatorEngine } from '../../../labs/projection/operator/stageEngine'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { World } from '../../../labs/projection/world/World'
import type { CameraSample } from '../../../labs/controller/take/types'
import { TakePlay } from '../panels/TakePlay'
import { playTakeNow, resetTakePlay, scrubTake, stopTakeNow, takePlace, takePlaying } from '../takePlay'
import { resetStageMemo, setStageMemo } from '../stageMemory'

vi.mock('../../../library/currentScene', async (orig) => ({ ...(await orig<typeof import('../../../library/currentScene')>()), currentSceneId: () => 'sc-tp' }))

afterEach(() => { cleanup(); resetStageMemo(); resetTakePlay() })

/** a flown take: 2 m to the right over 2 s, a little up */
const flight: CameraSample[] = Array.from({ length: 49 }, (_, k) => ({ t: k / 24, position: [-3 + k / 24, 1.5 + k / 240, 4], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }))

function hosted() {
  const e = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false, orbitTarget: () => new Vector3(0, 1.6, 0) })
  const clock = new WorldClock()
  clock.setDuration(6)
  clock.loop = false
  e.bind({ clock, performance: null, sources: () => [], trackHash: '' } as unknown as World, () => 16 / 9)
  e.takeOver(new Vector3(1, 2, 8), new Quaternion(), 50) // the user flew somewhere off the take's path
  return { e, clock }
}
const tick = (e: StageOperatorEngine, secs: number) => { for (let t = 0; t < secs - 1e-9; t += 1 / 60) e.tick(1 / 60, 16 / 9) }
const at = (e: StageOperatorEngine) => e.out.position.toArray().map((n) => Math.round(n * 100) / 100)

describe('Play take', () => {
  it('plays the take the plan points at; Stop ends it and puts the camera back where the user was', () => {
    const { e } = hosted()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    expect(playTakeNow(e)).toBe(true)
    expect(takePlaying(e)).toBe(true)
    tick(e, 0.5)
    stopTakeNow(e)
    expect(takePlaying(e)).toBe(false)
    expect(at(e)).toEqual([1, 2, 8]) // back where the user flew it, not the take's start
    expect(e.focal).toBe(50) // the lens it had, not the take's
  })

  it('with no pose of ours kept (the transport played), Stop falls back to the scene\'s start', () => {
    const { e } = hosted()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    playShot(e, e.shotPlan()!) // the transport's path: nothing kept for Stop
    setStageMemo({ start: { position: [9, 1.6, 9], quaternion: [0, 0, 0, 1], focal: 40, focus: 8 } })
    tick(e, 0.5)
    stopTakeNow(e)
    expect(at(e)).toEqual([9, 1.6, 9])
    expect(e.focal).toBe(40)
  })

  it('the scrub seek moves the running replay', () => {
    const { e } = hosted()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    playTakeNow(e)
    tick(e, 0.5)
    scrubTake(e, 1.75)
    expect(e.deck.playback!.t).toBeCloseTo(1.75, 6)
    expect(takePlace(e)?.t).toBeCloseTo(1.75, 6)
  })

  it('nothing to play: no plan, a move plan, a replay already running, or a recording', () => {
    const { e } = hosted()
    e.shotPlan = () => null
    expect(playTakeNow(e)).toBe(false)
    e.shotPlan = () => ({ kind: 'move', id: 'push', seconds: 2, hold: false })
    expect(playTakeNow(e)).toBe(false)
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    expect(playTakeNow(e)).toBe(true)
    expect(playTakeNow(e)).toBe(false) // already playing
    stopTakeNow(e)
    e.deck.start({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], focal: 35, focus: 5 }, { timelineStart: 0, rig: 'free', smoothingAmount: 0 })
    expect(playTakeNow(e)).toBe(false) // a take records
  })

  it('the panel: Play take disabled without a take; the scrub bar and Stop while one plays', () => {
    const { e } = hosted()
    const lab = { op: { engine: e } } as unknown as ProjectionLabState
    const ui = render(<TakePlay lab={lab} />)
    expect((screen.getByTestId('play-take') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('take-scrub')).toBeNull()
    e.shotPlan = () => ({ kind: 'take', samples: flight, start: 0 })
    ui.rerender(<TakePlay lab={lab} />)
    fireEvent.click(screen.getByTestId('play-take'))
    expect(takePlaying(e)).toBe(true)
    ui.rerender(<TakePlay lab={lab} />)
    expect(screen.getByTestId('take-scrub')).not.toBeNull()
    const scrub = screen.getByTestId('take-scrub') as HTMLInputElement
    expect(Number(scrub.max)).toBeCloseTo(2, 6) // the take's length
    fireEvent.change(scrub, { target: { value: '1.5' } })
    expect(e.deck.playback!.t).toBeCloseTo(1.5, 6)
    fireEvent.click(screen.getByTestId('stop-take'))
    expect(takePlaying(e)).toBe(false)
  })
})
