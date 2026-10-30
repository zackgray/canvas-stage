// Track E1: a kit performance's extras (background figures on their own paths) are parsed field by field, stored and read back,
// and covered by the plan hash, so an extras edit stales a locked take while old performances without extras keep their ids.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ExtraPlan } from '../../../src/stage3d/contract.ts'
import { BATTLEFIELD, WALK_TOWARD } from '../../../src/stage3d/presets.ts'
import { planHash } from '../../../src/labs/projection/stage3d/MocapLayer.ts'
import { MAX_EXTRAS, parsePerformancePlan } from '../perf.ts'
import { KitStore } from '../store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-extras-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const PATH: [number, number][] = [[0.6, -12.5], [0.6, -8]]
const EX: ExtraPlan = { path: [[-6, -9], [6, -8.4]], gait: 'run', delay: 0.7, costume: 'plain', variant: 2 }

describe('extras on the kit performance', () => {
  it('keeps a valid extra field by field (tag optional), drops what the page did not mean', () => {
    const r = parsePerformancePlan({ path: PATH, extras: [{ ...EX, junk: 1 }, { ...EX, tag: 'runners' }] })
    expect(r).toEqual({ ok: true, perf: { path: PATH, extras: [EX, { ...EX, tag: 'runners' }] } })
  })

  it('an old performance without extras reads back exactly as it was (no extras key appears)', () => {
    expect(parsePerformancePlan({ path: PATH, pace: 0.8 })).toEqual({ ok: true, perf: { path: PATH, pace: 0.8 } })
  })

  it('refuses bad extras with a line naming each', () => {
    const bad: [unknown, RegExp][] = [
      [{ ...EX, path: [[0, 0]] }, /extras\[0\]\.path must hold/],
      [{ ...EX, path: [[0, 0], [0, 0]] }, /extras\[0\]\.path has no length/],
      [{ ...EX, path: [[0, 0], [500, 0]] }, /more than 200 m/],
      [{ ...EX, gait: 'fly' }, /gait/],
      [{ ...EX, delay: -1 }, /delay/],
      [{ ...EX, costume: 'robe' }, /costume/],
      [{ ...EX, variant: 1.5 }, /variant/],
      [{ ...EX, tag: '@runners' }, /tag/],
      [null, /must be an object/],
    ]
    for (const [e, msg] of bad) {
      const r = parsePerformancePlan({ path: PATH, extras: [e] })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join('\n')).toMatch(msg)
    }
    expect(parsePerformancePlan({ path: PATH, extras: Array.from({ length: MAX_EXTRAS + 1 }, () => EX) }).ok).toBe(false)
    expect(parsePerformancePlan({ path: PATH, extras: 'many' }).ok).toBe(false)
  })

  it('round-trips through performance.json (the store used to drop them)', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: PATH } })
    const saved = s.savePerformance(w.id, { ...w.perf, extras: [EX] })
    expect(saved.perf.extras).toEqual([EX])
    expect(s.read(w.id).perf.extras).toEqual([EX])
  })

  it('the plan hash covers extras: an edit gives a new pack id, none or an empty list keeps the old one', () => {
    const base = planHash(WALK_TOWARD)
    expect(planHash({ ...WALK_TOWARD, extras: [] })).toBe(base)
    const one = planHash({ ...WALK_TOWARD, extras: [EX] })
    expect(one).not.toBe(base)
    expect(planHash({ ...WALK_TOWARD, extras: [{ ...EX, delay: 0.8 }] })).not.toBe(one)
    expect(planHash({ ...WALK_TOWARD, extras: [{ ...EX, variant: 3 }] })).not.toBe(one)
    expect(planHash({ ...WALK_TOWARD, actions: [{ kind: 'stop', at: 2, seconds: 1 }] })).not.toBe(base)
  })
})
