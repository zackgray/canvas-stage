// planHash moved to its own pure module (no three.js) so the server checks a take's copy with the same function: its output is
// pinned on real performance.json files copied from the owner's scenes on 2026-10-29 (fixtures, never read live). Each hash is the
// packId of takes locked on that walk today, e.g. take-2026-10-29T20-01-28-148 = mocap-f44be163.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mocapPackId, planHash } from '../planHash.ts'
import { planHash as fromLayer } from '../../labs/projection/stage3d/MocapLayer'
import { parsePerformancePlan } from '../../../server/stage3d/perf.ts'
import type { PerformancePlan } from '../contract.ts'

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server/takes/__tests__/fixtures')
const fixture = (hash: string) => JSON.parse(readFileSync(path.join(FIX, `perf-${hash}.json`), 'utf8')) as PerformancePlan

// a walk with stride fit and soft settle; extras + run gait; a made move standing with a shot length and costume; a creature
const REAL = ['f44be163', 'cef93887', 'd693707f', 'fa49b4b6']

describe('planHash (pure module)', () => {
  it.each(REAL)('hashes the real performance %s to the pack id its takes were locked with', (hash) => {
    expect(planHash(fixture(hash))).toBe(hash)
    expect(mocapPackId(fixture(hash))).toBe(`mocap-${hash}`)
  })

  it.each(REAL)('%s hashes the same after the server parses it (the copy a take stores is the parsed one)', (hash) => {
    const p = parsePerformancePlan(fixture(hash))
    expect(p.ok && planHash(p.perf)).toBe(hash)
  })

  it('MocapLayer re-exports the very same function, so every existing import keeps its ids', () => {
    expect(fromLayer).toBe(planHash)
  })

  it('castId is not motion: a recast keeps the hash; a pace change does not', () => {
    const f = fixture('f44be163')
    expect(planHash({ ...f, castId: 'someone-else' } as PerformancePlan)).toBe('f44be163')
    expect(planHash({ ...f, pace: 0.9 })).not.toBe('f44be163')
  })
})
