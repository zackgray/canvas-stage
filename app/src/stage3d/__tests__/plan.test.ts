import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../contract.ts'
import { parsePlan, repairPlan } from '../plan.ts'
import { BATTLEFIELD, PLANS } from '../presets.ts'

const base = (): Record<string, unknown> => JSON.parse(JSON.stringify(BATTLEFIELD))
const errorsOf = (raw: unknown): string => { const r = parsePlan(raw); return r.ok ? '' : r.errors.join('\n') }
const withKit = (...kit: unknown[]) => ({ ...base(), kit })

describe('every preset parses', () => {
  for (const [name, plan] of Object.entries(PLANS)) it(name, () => { const r = parsePlan(plan); expect(r.ok ? [] : r.errors).toEqual([]) })
  it('there are four named plans', () => expect(Object.keys(PLANS)).toHaveLength(4))
})

describe('bad input is refused with a message naming the field', () => {
  const cases: [string, unknown, RegExp][] = [
    ['not an object', 'hello', /plan:/],
    ['a list', [], /plan:/],
    ['missing seed', { ...base(), seed: undefined }, /seed: required/],
    ['float seed', { ...base(), seed: 1.5 }, /seed: must be an integer/],
    ['fog density too high', { ...base(), fog: { density: 0.5 } }, /fog\.density: 0\.5 is outside 0\.\.0\.1/],
    ['fog colour not hex', { ...base(), fog: { color: 'grey' } }, /fog\.color/],
    ['key light too bright', { ...base(), light: { key: 9 } }, /light\.key: 9 is outside/],
    ['keyDir elevation', { ...base(), light: { keyDir: [90, 95] } }, /light\.keyDir\[1\]/],
    ['keyDir yaw', { ...base(), light: { keyDir: [-200, 10] } }, /light\.keyDir\[0\]/],
    ['keyDir shape', { ...base(), light: { keyDir: [90] } }, /light\.keyDir: must be a list of 2/],
    ['sky url off-prefix', { ...base(), sky: { url: 'https://evil.example/x.png' } }, /sky\.url: must be a path under \/lab-assets\//],
    ['sky url traversal', { ...base(), sky: { url: '/lab-assets/../secret.png' } }, /sky\.url/],
    ['sky missing', { ...base(), sky: undefined }, /sky:/],
    ['sky band order', { ...base(), sky: { url: '/lab-assets/a.png', band: [0.8, 0.2] } }, /sky\.band/],
    ['unknown top-level field', { ...base(), weather: 'rain' }, /plan: unknown field "weather"/],
    ['kit not a list', { ...base(), kit: 'fence' }, /kit: required list/],
    ['too many items', withKit(...Array.from({ length: 201 }, () => ({ kind: 'rock', at: [10, -40] }))), /kit: 201 items, at most 200/],
    ['unknown kind', withKit({ kind: 'dragon', at: [10, -40] }), /kit\[0\]\.kind: unknown kind "dragon"/],
    ['too many args', withKit({ kind: 'rock', args: [1, 1, 1], at: [10, -40] }), /kit\[0\]\.args: rock takes at most 2/],
    ['arg out of range', withKit({ kind: 'fence', args: [99, 1, 0.3], at: [10, -40] }), /kit\[0\]\.args\[0\] \(length\): 99 is outside 1\.\.40/],
    ['arg not integer', withKit({ kind: 'barrels', args: [1, 2.5], at: [10, -40] }), /args\[1\] \(count\): must be an integer/],
    ['arg not a number', withKit({ kind: 'rock', args: ['big'], at: [10, -40] }), /args\[0\] \(seed\): must be a number/],
    ['at too far', withKit({ kind: 'rock', at: [10, -400] }), /kit\[0\]\.at\[1\]: -400 is outside -150\.\.150/],
    ['at missing', withKit({ kind: 'rock' }), /kit\[0\]\.at/],
    ['yaw out of range', withKit({ kind: 'rock', at: [10, -40], yawDeg: 900 }), /kit\[0\]\.yawDeg/],
    ['scale out of range', withKit({ kind: 'rock', at: [10, -40], scale: 200 }), /kit\[0\]\.scale/],
  ]
  for (const [name, raw, re] of cases) it(name, () => { expect(parsePlan(raw).ok).toBe(false); expect(errorsOf(raw)).toMatch(re) })

  const lane = [
    ['item in the walk corridor', withKit({ kind: 'hut', at: [0.5, -10] }), /kit\[0\]: hut at \[0\.5, -10\] stands in the walk corridor/],
    ['long fence crossing the corridor', withKit({ kind: 'fence', args: [10], at: [-5, -10], yawDeg: 0 }), /kit\[0\]: fence .* walk corridor/],
  ] as const
  for (const [name, raw, re] of lane) {
    it(`${name}: the planner's check (corridor: true) refuses it`, () => {
      const r = parsePlan(raw, { corridor: true })
      expect(r.ok).toBe(false)
      expect(r.ok ? '' : r.errors.join(' ')).toMatch(re)
    })
    it(`${name}: a plain parse (user edits, the world's read-back) accepts it`, () => { expect(parsePlan(raw).ok).toBe(true) })
  }

  it('a walk-through item may stand in the corridor; a comment field is ignored', () => {
    expect(parsePlan(withKit({ kind: 'debris', at: [0.5, -10], walkThrough: true })).ok).toBe(true)
    expect(parsePlan({ ...base(), _note: 'hi' }).ok).toBe(true)
  })
  it('reports every problem at once', () => {
    const r = parsePlan({ ...base(), seed: 'x', fog: { density: 3 }, kit: [{ kind: 'dragon', at: [0, 0] }] })
    expect(r.ok ? 0 : r.errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('repairPlan', () => {
  it('clamps numbers, drops unknown kinds, trims args, and the result parses', () => {
    const { plan, notes } = repairPlan({
      seed: 7.6, fog: { color: 'blue', density: 0.9 }, light: { fill: 50, keyDir: [90, 200] }, sky: { url: 'http://x/y.png', gain: 99 },
      kit: [
        { kind: 'dragon', at: [10, -40] }, { kind: 'rock', args: [1, 99, 5], at: [900, -40], scale: 500 },
        { kind: 'fence', args: [-5, 'x', 2], at: [0, -10] }, 'junk', { kind: 'hut', at: [0, -12] }, { kind: 'rock' },
      ],
    })
    expect(parsePlan(plan).ok).toBe(true)
    expect(plan.seed).toBe(8)
    expect(plan.fog).toEqual({ density: 0.1 })
    expect(plan.light).toEqual({ fill: 5, keyDir: [90, 80] })
    expect(plan.sky.url).toMatch(/^\/lab-assets\//); expect(plan.sky.gain).toBe(4)
    expect(plan.kit.map((k) => k.kind)).toEqual(['rock', 'fence', 'hut'])
    expect(plan.kit[0]).toMatchObject({ args: [1, 4], at: [150, -40], scale: 100 })
    expect(plan.kit[1].args).toEqual([1, 1, 1])
    expect(plan.kit[2].at[0]).not.toBe(0)
    expect(notes.join('\n')).toMatch(/unknown kind "dragon", dropped/)
    expect(notes.join('\n')).toMatch(/not an object, dropped/)
    expect(notes.join('\n')).toMatch(/walk corridor, moved/)
  })
  it('turns garbage into an empty but valid plan, and leaves a good plan alone', () => {
    for (const junk of [null, 'x', 42, [], {}]) { const r = repairPlan(junk); expect(parsePlan(r.plan).ok).toBe(true) }
    const ok = repairPlan(PLANS['country-road-dusk']); expect(ok.notes).toEqual([]); expect(ok.plan).toEqual(PLANS['country-road-dusk'])
  })
  it('caps the kit at 200 items', () => {
    const { plan } = repairPlan({ ...base(), kit: Array.from({ length: 260 }, (_, i) => ({ kind: 'rock', at: [10 + (i % 50), -40] })) })
    expect(plan.kit).toHaveLength(200); expect(parsePlan(plan as ScenePlan).ok).toBe(true)
  })
})

describe('inherited object keys are not kit kinds', () => {
  for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    it(`"${kind}" is an unknown kind, not a crash`, () => {
      expect(errorsOf(withKit({ kind, at: [10, -40] }))).toMatch(/kit\[0\]\.kind: unknown kind/)
      expect(() => repairPlan(withKit({ kind, at: [10, -40], args: [1] }))).not.toThrow()
    })
  }
})
