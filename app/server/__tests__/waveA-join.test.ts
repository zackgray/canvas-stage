// Wave A join: the seams between the tracks, proved through the real server store, the real Blocking edit code (blockingOps,
// blockingPlan), the hero's one motion entry (heroTimeline) and the real set-approval gate (setRefusalFor / currentSetKey).
// The mark is the walk's start (S4) and a stand is the mark plus its stub (S3); a Blocking save never moves the set key; the shot
// length (S7) rides through a Blocking save and pads the stand-and-lift to 193 locked frames; old performances are untouched.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CLAY_MAX } from '../../src/labs/projection/clay/plan.ts'
import { fit8n1 } from '../../src/labs/projection/performance/warpPlan.ts'
import { mocapPack, planHash } from '../../src/labs/projection/stage3d/MocapLayer.ts'
import type { KitWorld } from '../../src/labs/projection/stage3d/kitApi.ts'
import { SET_CHANGED } from '../../src/shared/setApproval.ts'
import type { KitItem, PerformancePlan } from '../../src/stage3d/contract.ts'
import { markOf } from '../../src/stage3d/mark.ts'
import { compile } from '../../src/stage3d/motion/compile.ts'
import { heroTimeline } from '../../src/stage3d/motion/heroPlan.ts'
import type { Library } from '../../src/stage3d/motion/library.ts'
import { STAND_DEFAULT_S, standPath } from '../../src/stage3d/motion/standPlan.ts'
import { performerFrom } from '../../src/stage3d/performer.ts'
import { BATTLEFIELD } from '../../src/stage3d/presets.ts'
import { liftSpots, standBy } from '../../src/stage3d/props/liftSpots.ts'
import * as F from '../../src/stage3d/__tests__/motion.fixture.ts'
import { actionOps, heroOps, reachLine, type OpsCtx } from '../../src/studio/stage/panels/blocking/blockingOps.ts'
import { draftFrom, planOf, type BlockingDraft } from '../../src/studio/stage/panels/blocking/blockingPlan.ts'
import { approveSetOnDisk } from '../bible/__tests__/approveFixture.ts'
import { currentSetKey, setRefusalFor } from '../bible/setGate.ts'
import { startOf } from '../hero/kitInputs.ts'
import { motionAt } from '../hero/stillAction.ts'
import { FILES, KitStore } from '../stage3d/store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-wave-a-join-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
let lib: Library
beforeAll(async () => { lib = await F.diskLibrary() }, 60_000)

const HIVE: KitItem = { kind: 'crates', args: [7, 1], at: [2.6, -12.5], label: 'a hive', pieceTag: 'prop:hive', scale: 1.4 }
const kinds = (tl: { segs: { kind: string }[] }) => tl.segs.map((s) => s.kind)
const lockFrames = (packFrames: number) => fit8n1(Math.min(193, packFrames), CLAY_MAX)
const planFile = (s: KitStore, id: string) => readFileSync(path.join(s.dir(id), FILES.plan), 'utf8')

/** Blocking as the panel drives it: the real ops over a draft read from the stored world, then Save's body (planOf) */
function blocking(world: KitWorld) {
  let d: BlockingDraft = draftFrom(world.perf)
  const ctx = {
    world, get draft() { return d }, point: null, variants: 1, bible: null,
    edit: (f: (x: BlockingDraft) => BlockingDraft) => { d = f(d) }, setPath: (f: (p: [number, number][]) => [number, number][]) => { d = { ...d, path: f(d.path) } },
    setExtra: () => {}, setPoint: () => {}, setTarget: () => {}, setNote: () => {},
  } as unknown as OpsCtx
  return { hero: heroOps(ctx), actions: actionOps(ctx), draft: () => d, body: (saved = world.perf) => planOf(saved, d, markOf(world.plan)) }
}

describe('join 1: mark -> path start -> clay start -> still words; the set key does not move', () => {
  it('a mark move stales the approval (as on main); a stand save and an off-mark walking save do not', () => {
    const s = new KitStore(pub), w = s.create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] } })
    approveSetOnDisk(pub, w.id)
    expect(setRefusalFor(pub, w.id)).toBeNull()
    s.setMark(w.id, { at: [1.2, -10], yawDeg: 90 })
    expect(setRefusalFor(pub, w.id)).toBe(SET_CHANGED)
    approveSetOnDisk(pub, w.id)
    const key = currentSetKey(pub, w.id), planBytes = planFile(s, w.id)

    const b = blocking(s.read(w.id))
    b.hero.stand()
    const stood = s.savePerformance(w.id, b.body())
    const mark = markOf(stood.plan)
    expect(stood.perf.stand).toBe(true)
    expect(stood.perf.path).toEqual(standPath(mark))
    expect(startOf(stood)).toEqual(mark.at)
    const p = performerFrom(stood.perf, () => 0, lib)
    for (const t of [0, p.duration / 2, p.duration]) {
      const a = p.anchorAt(t)
      expect(Math.hypot(a.x - mark.at[0], a.z - mark.at[1])).toBeLessThan(0.02)
    }
    const h = p.headingAt(0), yaw = (Math.atan2(h.x, h.z) * 180) / Math.PI
    expect(Math.abs(yaw - mark.yawDeg)).toBeLessThan(2)
    expect(motionAt(stood.perf, 0, null, lib).words).toBe('standing')

    const walked = s.savePerformance(w.id, { path: [[5, 5], [1.2, -6]], pace: 0.8 })
    expect(walked.perf.path).toEqual([mark.at, [1.2, -6]])
    expect(walked.perf.stand).toBeUndefined()
    s.savePerformance(w.id, { ...walked.perf, shotSeconds: 6 })
    expect([currentSetKey(pub, w.id), planFile(s, w.id), setRefusalFor(pub, w.id)]).toEqual([key, planBytes, null])
  })
})

describe('join 3: undo to the mark, Save, the clay idles at the mark', () => {
  it('a three-point walk undone to one point saves a stand that idles 4 s on the mark', () => {
    const s = new KitStore(pub), w = s.create({ plan: { ...BATTLEFIELD, mark: { at: [0.6, -12], yawDeg: 30 } }, perf: { path: [[0.6, -12], [0.6, -9], [1.5, -6]] } })
    const b = blocking(s.read(w.id))
    b.hero.undo(); b.hero.undo(); b.hero.undo()
    expect(b.draft().path).toEqual([[0.6, -12]]) // Undo stops at the mark
    const saved = s.savePerformance(w.id, b.body())
    expect(saved.perf.path).toEqual(standPath({ at: [0.6, -12], yawDeg: 30 }))
    expect(planHash(saved.perf)).not.toBe(planHash(w.perf)) // a new pack id: the old take says changed since lock
    const tl = heroTimeline(saved.perf, lib)
    expect(kinds(tl)).toEqual(['idle'])
    expect(tl.duration).toBeCloseTo(STAND_DEFAULT_S, 3)
    const p = performerFrom(saved.perf, () => 0, lib), end = p.anchorAt(p.duration)
    expect(Math.hypot(end.x - 0.6, end.z + 12)).toBeLessThan(0.02)
  })
})

describe('join 4: the two editors of one performance', () => {
  it('a shot length saved in Operator survives a later Blocking save; a stand survives a later shot length', () => {
    const s = new KitStore(pub), w = s.create({ plan: BATTLEFIELD, perf: { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8 } })
    const b = blocking(s.read(w.id)) // the Blocking draft opened before the length was picked
    b.hero.setPace(1)
    const withLength = s.savePerformance(w.id, { ...s.read(w.id).perf, shotSeconds: 8 }) // Operator's Shot length row
    const after = s.savePerformance(w.id, b.body(withLength.perf)) // Save lays the draft over the latest read
    expect([after.perf.shotSeconds, after.perf.pace]).toEqual([8, 1])

    const b2 = blocking(after)
    b2.hero.stand()
    const stood = s.savePerformance(w.id, b2.body())
    const relength = s.savePerformance(w.id, { ...stood.perf, shotSeconds: 6 })
    expect([relength.perf.stand, relength.perf.shotSeconds]).toEqual([true, 6])
  })
})

describe('join 5: the lift demo through the stand code', () => {
  it('mark beside the set hive, stand, Lift a frame, 8 s: ends on the hold, no lowering, locks 193 frames, uses the set hive', () => {
    const s = new KitStore(pub), w = s.create({ plan: { ...BATTLEFIELD, kit: [...BATTLEFIELD.kit, HIVE] } })
    const hive = w.plan.kit.length - 1
    s.setMark(w.id, { at: standBy(HIVE, [0.6, -12.5]) }) // no facing saved: the mark faces the nearest prop, the hive
    const b = blocking(s.read(w.id))
    b.hero.stand()
    b.actions.add('lift')
    const world = s.read(w.id)
    expect(reachLine(world.plan.kit, b.draft().path, b.draft().actions)).toBeNull() // she can reach it from the mark
    expect(b.draft().path).toEqual([markOf(world.plan).at]) // the lift never moved the mark
    const stood = s.savePerformance(w.id, b.body())
    const shot = s.savePerformance(w.id, { ...stood.perf, shotSeconds: 8 }).perf
    expect(shot.stand).toBe(true)
    expect(liftSpots(shot.path, shot.actions, world.plan.kit).map((x) => x.piece)).toEqual([hive]) // no second hive
    const tl = heroTimeline(shot, lib)
    expect(kinds(tl)).toEqual(['lift', 'lift-hold'])
    expect(kinds(tl)).not.toContain('lift-down')
    expect(tl.duration).toBeGreaterThanOrEqual(8 + 1 / 24 - 1e-9)
    expect(tl.duration).toBeLessThanOrEqual(8.063)
    expect(lockFrames(mocapPack(shot, w.id, tl.duration).frames)).toBe(193)
  })
})

describe('join 6: old scenes', () => {
  it('a performance saved before the wave reads back as it was, keeps its pack id and length, so its locked take stays locked', () => {
    // lengths re-taken 2026-10-29 when the stop clip became CMU 16_34 (the stop is longer; nothing was locked then, the owner's call)
    const golden: [PerformancePlan, string, number][] = [[F.KNEEL_END, '500aa305', 270], [F.LIFT_END, '6d8133f3', 261], [F.LIFT_HERE, '4e5b2c5f', 156]]
    const s = new KitStore(pub), w = s.create({ plan: BATTLEFIELD })
    for (const [legacy, hash, frames] of golden) {
      writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(legacy))
      const perf = s.read(w.id).perf
      expect(perf).toEqual(legacy) // no snap on read, even though its start is off the mark
      const tl = heroTimeline(perf, lib)
      expect(kinds(tl)).toEqual(kinds(compile(legacy, lib)))
      expect([planHash(perf), mocapPack(perf, w.id, tl.duration).frames]).toEqual([hash, frames])
    }
  })
})
