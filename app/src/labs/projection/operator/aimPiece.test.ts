// The aim lock on a travelling piece: the aim is the piece's place at the current take time (live, scrub, a recorded take and
// its replay), holds at the path's end, and survives the path being cleared. Mock-only: the world clock and a kit-layer-like hook.
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { KitItem } from '../../../stage3d/contract'
import { movePoseAt } from '../../../stage3d/propMove'
import { World } from '../world/World'
import { pieceAimAt } from './aimPiece'
import { STAGE_RIGS } from './link'
import { StageOperatorEngine } from './stageEngine'
import { ASPECT, FRAME } from './testRig'

const flat = () => 0
const car = (over: Partial<KitItem> = {}): KitItem => ({ kind: 'crates', at: [0, 0], move: { path: [[0, 0], [0, 20]], speed: 2 }, ...over })

/** a world with one travelling piece on its clock (like useKit's hook), an engine aimed at it */
function rig(item: { current: KitItem }) {
  const world = new World(async () => ({ missing: 'test' }))
  const placed = new Vector3() // where the hook put the mesh at the clock's time
  world.addClockHook({
    get duration() { return 10 },
    pose: (t) => { const p = movePoseAt(item.current, t)?.at ?? item.current.at; placed.set(p[0], 0, p[1]) },
  })
  const engine = new StageOperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  engine.bind(world, () => ASPECT)
  engine.takeOver(new Vector3(8, 1.6, 4), engine.out.quaternion, 35)
  engine.aimLock = () => pieceAimAt(item.current, flat, engine.timeline.time)
  const frame = () => { engine.tick(FRAME, ASPECT); world.frame(0) }
  const aimDot = () => {
    const fwd = new Vector3(0, 0, -1).applyQuaternion(engine.out.quaternion)
    return fwd.dot(pieceAimAt(item.current, flat, engine.timeline.time).sub(engine.out.position).normalize())
  }
  return { world, engine, frame, aimDot, placed }
}

describe('pieceAimAt', () => {
  it('a still piece is aimed at its resting place, a travelling one at its path point for the time', () => {
    expect(pieceAimAt(car({ move: undefined, at: [3, 4] }), flat, 5)).toEqual(new Vector3(3, 1, 4))
    const p = pieceAimAt(car(), flat, 2.5) // 2 m/s: 5 m along +z
    expect(p.z).toBeCloseTo(5, 6)
    expect(p.y).toBe(1)
  })

  it('holds the path end past the travel and goes back to the resting place when the path is cleared', () => {
    expect(pieceAimAt(car(), flat, 500).z).toBeCloseTo(20, 6)
    const gone = car({ move: undefined, at: [1, 2] })
    expect(pieceAimAt(gone, flat, 500)).toEqual(new Vector3(1, 1, 2))
  })
})

describe('the camera tracks a moving piece on the clock', () => {
  it('live play: the lens stays on the piece as it travels, and scrubbing re-aims at the scrubbed time', () => {
    const item = { current: car() }
    const { world, frame, aimDot, placed } = rig(item)
    world.clock.playing = true
    const seen: number[] = []
    for (const secs of [1, 3, 5]) {
      while (world.clock.time < secs) frame()
      expect(aimDot()).toBeGreaterThan(0.999)
      expect(placed.z).toBeCloseTo(pieceAimAt(item.current, flat, world.clock.time).z, 5) // aim point = where the mesh is posed
      seen.push(placed.z)
    }
    expect(seen[0]).toBeLessThan(seen[1]); expect(seen[1]).toBeLessThan(seen[2]) // it moved between the three times
    world.clock.playing = false
    world.clock.seek(0.5); frame(); frame()
    expect(aimDot()).toBeGreaterThan(0.999)
    expect(placed.z).toBeCloseTo(1, 4)
  })

  it('no jump when the piece stops at the path end or the path is cleared', () => {
    const item = { current: car() }
    const { world, engine, frame, aimDot } = rig(item)
    world.clock.playing = true
    while (world.clock.time < 9.9) frame() // 20 m at 2 m/s ends at 10 s
    frame(); frame()
    expect(aimDot()).toBeGreaterThan(0.999)
    const before = engine.out.quaternion.clone()
    item.current = car({ move: undefined, at: [0, 0] }) // path cleared: the piece is at its resting place
    expect(() => { frame(); frame() }).not.toThrow()
    expect(aimDot()).toBeGreaterThan(0.999) // aimed at the resting place, a turn not a crash
    expect(Number.isFinite(engine.out.quaternion.angleTo(before))).toBe(true)
  })

  it('a recorded take replays the same piece places it was flown at', () => {
    const item = { current: car() }
    const { world, engine, frame, placed } = rig(item)
    frame()
    engine.toggleRecording()
    const flown = new Map<number, number>()
    for (let i = 0; i < 60 * 3 && engine.deck.recording; i++) {
      frame()
      if (i % 20 === 0) flown.set(Math.round(world.clock.time * 1000), placed.z)
    }
    engine.toggleRecording()
    const take = engine.deck.take!
    expect(take.raw.samples.length).toBeGreaterThan(30)
    // replay: the world clock is driven from the take; the piece is posed at the same times, so the same places
    engine.playRecord(take.raw.samples, take.raw.timelineStart)
    const replay = new Map<number, number>()
    for (let i = 0; i < 60 * 3 && engine.deck.playback; i++) {
      frame()
      replay.set(Math.round(world.clock.time * 1000), placed.z)
    }
    let matched = 0
    for (const [ms, z] of flown) {
      const r = replay.get(ms)
      if (r === undefined) continue
      matched++
      expect(r).toBeCloseTo(z, 4)
    }
    expect(matched).toBeGreaterThan(3)
  })
})
