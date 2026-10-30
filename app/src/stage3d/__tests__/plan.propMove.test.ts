// prop-movement wave: the plan validator carries a piece's base tilt (pitchDeg/rollDeg) and its travel (`move`) — added fields
// only, round-tripped whole, clamped to a sane range; a travelling piece may cross the walk lane (it does not stand in it).
import { describe, expect, it } from 'vitest'
import { parsePlan } from '../plan.ts'
import { repairPlan } from '../planRepair.ts'
import { BATTLEFIELD } from '../presets.ts'

const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(BATTLEFIELD))
const withKit = (...kit: unknown[]) => ({ ...base(), kit })
const errorsOf = (raw: unknown): string => { const r = parsePlan(raw); return r.ok ? '' : r.errors.join('\n') }
const MOVING = { kind: 'crates', at: [10, -40], move: { path: [[10, -40], [24, -40]], speed: 3 } }

describe('a piece\'s base tilt and travel pass the plan gate', () => {
  it('pitch, roll and move round trip through a save and a reload', () => {
    const raw = withKit({ ...MOVING, pitchDeg: 12.5, rollDeg: -4 })
    const r = parsePlan(raw)
    expect(r.ok ? [] : r.errors).toEqual([])
    const again = parsePlan(JSON.parse(JSON.stringify(r.ok ? r.plan : null)))
    expect(again.ok && again.plan.kit.at(-1)).toEqual(r.ok ? r.plan.kit.at(-1) : null)
  })

  it('faceTravel false is kept; unset means the default (face the way it travels)', () => {
    const r = parsePlan(withKit({ ...MOVING, move: { ...MOVING.move, faceTravel: false } }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.plan.kit[0].move?.faceTravel).toBe(false)
  })

  it('a travelling piece may stand in the walk corridor (it crosses the lane, it does not block it)', () => {
    const r = parsePlan(withKit({ kind: 'hut', at: [0.5, -10], move: { path: [[0.5, -10], [7, -10]], speed: 2 } }), { corridor: true })
    expect(r.ok ? [] : r.errors).toEqual([])
    // a standing piece in the lane is still refused (the AI planner's own gate)
    const standing = parsePlan(withKit({ kind: 'hut', at: [0.5, -10] }), { corridor: true })
    expect(standing.ok).toBe(false)
  })

  it('the repairer keeps a readable move and drops an unreadable one, saying so', () => {
    const kept = repairPlan(withKit(MOVING))
    expect(kept.plan.kit[0].move).toEqual(MOVING.move)
    expect(kept.notes).toEqual([])
    const dropped = repairPlan(withKit({ ...MOVING, move: { path: [[1, 2]], speed: 3 } }))
    expect(dropped.plan.kit[0].move).toBeUndefined()
    expect(dropped.notes.join()).toMatch(/move.*removed/)
  })
})

describe('bad tilt and travel shapes are refused, naming the field', () => {
  const cases: [string, unknown, RegExp][] = [
    ['pitch above the range', { ...MOVING, pitchDeg: 120 }, /kit\[0\]\.pitchDeg: 120 is outside -90\.\.90/],
    ['roll below the range', { ...MOVING, rollDeg: -100 }, /kit\[0\]\.rollDeg: -100 is outside -90\.\.90/],
    ['pitch not a number', { ...MOVING, pitchDeg: 'tilt' }, /kit\[0\]\.pitchDeg: must be a number/],
    ['move not an object', { ...MOVING, move: [1, 2] }, /kit\[0\]\.move: must be an object/],
    ['move unknown field', { ...MOVING, move: { ...MOVING.move, spin: true } }, /kit\[0\]\.move: unknown field "spin"/],
    ['move one point', { ...MOVING, move: { path: [[1, 2]], speed: 3 } }, /kit\[0\]\.move\.path: must be a list of at least 2/],
    ['move point off the set', { ...MOVING, move: { path: [[1, 2], [999, 0]], speed: 3 } }, /kit\[0\]\.move\.path\[1\]/],
    ['move point not numbers', { ...MOVING, move: { path: [[1, 2], ['x', 0]], speed: 3 } }, /kit\[0\]\.move\.path\[1\]: must be \[x, z\] numbers/],
    ['speed too slow', { ...MOVING, move: { ...MOVING.move, speed: 0 } }, /kit\[0\]\.move\.speed: must be a number in 0\.1\.\.20/],
    ['speed too fast', { ...MOVING, move: { ...MOVING.move, speed: 60 } }, /kit\[0\]\.move\.speed: must be a number in 0\.1\.\.20/],
    ['faceTravel not a flag', { ...MOVING, move: { ...MOVING.move, faceTravel: 'yes' } }, /kit\[0\]\.move\.faceTravel: must be true or false/],
    ['tilt fields are not unknown fields', { ...MOVING, pitchDeg: 5, rollDeg: 5, move: MOVING.move }, /^(?!.*unknown field).*$/s],
  ]
  for (const [name, raw, re] of cases) it(name, () => {
    const errors = errorsOf(withKit(raw))
    expect(parsePlan(withKit(raw)).ok).toBe(name === 'tilt fields are not unknown fields')
    expect(errors).toMatch(re)
  })
})
