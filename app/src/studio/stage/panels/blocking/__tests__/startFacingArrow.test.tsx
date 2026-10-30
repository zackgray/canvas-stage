// @vitest-environment jsdom
// Wave A fix (F1): the facing arrow in Blocking, the arrow on the Set's top view and the live figure's front all show the way the
// hero really starts: a walk along its first leg (the compiled hero's heading at t = 0, real compiler and library), a stand the
// mark's yaw. The mark here is turned east; the walk is drawn north, the other way.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PerformancePlan, ScenePlan } from '../../../../../stage3d/contract'
import { heroTimeline } from '../../../../../stage3d/motion/heroPlan'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLibrary, type Library } from '../../../../../stage3d/motion/library'
import { wrapAngle } from '../../../../../stage3d/motion/path'
import { standPath } from '../../../../../stage3d/motion/standPlan'
import { evaluator } from '../../../../../stage3d/motion/timeline'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { MarkFacing } from '../../../../scene/MarkFacing'
import { LiveSet } from '../../../../scene/live/liveSet'
import { viewBox } from '../blockingMath'
import { BlockingPanel } from '../index'

let lib: Library
// the real clip library from public/ (jsdom has no file URLs, so not motion.fixture's loader)
beforeAll(async () => { lib = await loadLibrary(async (u) => readFileSync(resolve(process.cwd(), 'public') + u, 'utf8')) }, 60_000)
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const ID = 'loc-2026-10-26T12-00-00-000'
const MARK = { at: [0.6, -12.5] as [number, number], yawDeg: 90 }
const plan: ScenePlan = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, mark: MARK, kit: [{ kind: 'tree', at: [-9, -14] }] }
const STAND: PerformancePlan = { path: standPath(MARK), pace: 0.8, stand: true }
const NORTH: PerformancePlan = { path: [[0.6, -12.5], [0.6, -15.5], [2, -17]], pace: 0.8 }
const worldOf = (perf: PerformancePlan) => ({ id: ID, description: 'd', plan, perf, still: null, createdAt: '' }) as unknown as KitWorld
const RAD = Math.PI / 180
/** the compiled hero's heading at the start of the take (radians) */
const compiledStart = (perf: PerformancePlan) => evaluator(heroTimeline(perf, lib)).heading(0)
/** the arrow's heading (radians, 0 = +z) from the mark to its tip */
function arrowYaw(at: [number, number] = MARK.at): number {
  const [x, z] = (screen.getByTestId('mark-facing').getAttribute('points') ?? '').split(' ')[0].split(',').map(Number)
  return Math.atan2(x - at[0], z - at[1])
}
const near = (a: number, b: number) => Math.abs(wrapAngle(a - b)) / RAD

describe('Blocking: the arrow follows the draft path', () => {
  it('a stand shows the mark\'s yaw; drawing a walk the other way turns the arrow along its first leg, as the compiler plays it', async () => {
    const calls: { url: string; raw?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const raw = init?.body ? String(init.body) : undefined
      calls.push({ url, raw })
      if (url.startsWith('/__lab/bible')) return new Response(JSON.stringify({ bible: null }), { status: 200 })
      return new Response(JSON.stringify({ ...worldOf(STAND), perf: raw ? JSON.parse(raw) : STAND }), { status: 200 })
    }))
    const w = worldOf(STAND)
    render(<BlockingPanel lab={{ kit: { id: ID, world: w, layer: null, perf: w.perf, error: null } } as unknown as ProjectionLabState} />)
    await waitFor(() => expect(screen.getByTestId('mark-facing')).toBeTruthy())
    expect(near(arrowYaw(), MARK.yawDeg * RAD)).toBeLessThan(0.5)
    expect(near(arrowYaw(), compiledStart(STAND))).toBeLessThan(1)

    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    const box = viewBox(plan, [STAND.path]), svg = screen.getByTestId('blocking-top-view')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: (box[2] - box[0]) * 10, height: (box[3] - box[1]) * 10 } as DOMRect)
    fireEvent.click(svg, { clientX: (0.6 - box[0]) * 10, clientY: (-15.5 - box[1]) * 10 })
    expect(near(arrowYaw(), Math.PI)).toBeLessThan(3) // live, before any save: north (the click lands within a pixel), not east
    expect(near(arrowYaw(), MARK.yawDeg * RAD)).toBeGreaterThan(80)

    fireEvent.click(screen.getByTestId('blocking-path-draw')) // Done
    await waitFor(() => expect(calls.some((c) => c.url.startsWith('/__lab/stage3d/performance'))).toBeTruthy(), { timeout: 3000 }) // the draw live-saved
    const sent = JSON.parse(calls.find((c) => c.url.startsWith('/__lab/stage3d/performance'))!.raw!) as PerformancePlan
    expect(sent.stand).toBeUndefined()
    await waitFor(() => expect(screen.getByTestId('blocking-saved')).toBeTruthy())
    expect(near(arrowYaw(), compiledStart(sent))).toBeLessThan(1)
    expect(near(arrowYaw(), MARK.yawDeg * RAD)).toBeGreaterThan(80)
  })
})

describe('the Set: the top-view arrow and the live figure', () => {
  it('a saved walk: the arrow and the figure face its first leg; a stand: the mark\'s yaw', () => {
    render(<svg><MarkFacing plan={plan} perf={NORTH} /></svg>)
    expect(near(arrowYaw(), compiledStart(NORTH))).toBeLessThan(1)
    cleanup()
    render(<svg><MarkFacing plan={plan} perf={STAND} /></svg>)
    expect(near(arrowYaw(), compiledStart(STAND))).toBeLessThan(1)

    const set = new LiveSet(plan), fig = set.figure
    expect(fig.rotation.y).toBeCloseTo(MARK.yawDeg * RAD) // no performance yet: the mark's own facing
    set.setPerf(NORTH)
    expect(near(fig.rotation.y, compiledStart(NORTH))).toBeLessThan(1)
    set.setPerf(STAND)
    expect(near(fig.rotation.y, compiledStart(STAND))).toBeLessThan(1)
    set.dispose()
  })

  it('a mark being moved carries the walk\'s start: the arrow and figure aim from the new spot at the second point', () => {
    const pose = { at: [-2.4, -15.5] as [number, number], yaw: 90 } // due west of the second point
    render(<svg><MarkFacing plan={plan} perf={NORTH} pose={pose} /></svg>)
    expect(near(arrowYaw(pose.at), 90 * RAD)).toBeLessThan(0.5)
    const set = new LiveSet(plan)
    set.setPerf(NORTH); set.setPoses({ mark: pose })
    expect(near(set.figure.rotation.y, 90 * RAD)).toBeLessThan(0.5)
    set.dispose()
  })
})
