// Wave A (W0): the performance carries two optional fields, stand (the hero stands at the mark) and shotSeconds (the shot's one
// length, 2 to 8 s), checked on every save by the server, not just the page. Absent fields stay absent, so old performances read
// back unchanged.
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { parsePerformancePlan, SHOT_LENGTH_REFUSED } from '../perf.ts'
import { DEFAULT_SHOT_S, FILES, KitError, KitStore } from '../store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-shot-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const PATH: [number, number][] = [[0, -20], [0, 4]]
const STUB: [number, number][] = [[0.6, -12.5], [0.6, -12.3]]

describe('stand and shotSeconds on the kit performance', () => {
  it('accepts and rebuilds both; absent stays absent; stand false is the walk (stored as absent)', () => {
    expect(parsePerformancePlan({ path: STUB, stand: true, shotSeconds: 8 })).toEqual({ ok: true, perf: { path: STUB, stand: true, shotSeconds: 8 } })
    expect(parsePerformancePlan({ path: PATH, shotSeconds: 2 })).toEqual({ ok: true, perf: { path: PATH, shotSeconds: 2 } })
    expect(parsePerformancePlan({ path: PATH, shotSeconds: 4.5 })).toEqual({ ok: true, perf: { path: PATH, shotSeconds: 4.5 } })
    expect(parsePerformancePlan({ path: PATH, stand: false })).toEqual({ ok: true, perf: { path: PATH } })
    expect(parsePerformancePlan({ path: PATH })).toEqual({ ok: true, perf: { path: PATH } })
  })

  it('refuses a shot length outside 2 to 8 s in plain words, and a stand that is not true or false', () => {
    expect(SHOT_LENGTH_REFUSED).toBe('The shot length must be 2 to 8 seconds (a render keeps at most 8 s, 193 frames).')
    for (const bad of [1.9, 8.1, 8.5, 0, -4, NaN, Infinity, '8', null]) {
      expect(parsePerformancePlan({ path: PATH, shotSeconds: bad })).toEqual({ ok: false, errors: [SHOT_LENGTH_REFUSED] })
    }
    for (const bad of ['yes', 1, null]) expect(parsePerformancePlan({ path: PATH, stand: bad })).toEqual({ ok: false, errors: ['stand must be true or false'] })
  })

  it('is enforced on the save itself: the store answers 422 with the plain line and writes nothing', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: PATH } })
    const before = readFileSync(path.join(s.dir(w.id), FILES.perf), 'utf8')
    let err: unknown = null
    try { s.savePerformance(w.id, { path: PATH, shotSeconds: 8.1 }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(KitError)
    expect((err as KitError).status).toBe(422)
    expect((err as KitError).errors).toEqual([SHOT_LENGTH_REFUSED])
    expect(readFileSync(path.join(s.dir(w.id), FILES.perf), 'utf8')).toBe(before)
    expect(() => s.create({ plan: BATTLEFIELD, perf: { path: PATH, shotSeconds: 1.9 } })).toThrow(KitError)
    const saved = s.savePerformance(w.id, { path: STUB, stand: true, shotSeconds: 8 })
    expect(saved.perf).toEqual({ path: STUB, stand: true, shotSeconds: 8 })
    expect(s.read(w.id).perf).toEqual({ path: STUB, stand: true, shotSeconds: 8 })
  })

  it('reads a legacy performance.json back unchanged (no stand, no shotSeconds added)', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: PATH } })
    const legacy = { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8, actions: [{ kind: 'kneel', at: 4.5, seconds: 2 }], costume: 'soldier', castId: 'brann' }
    writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(legacy))
    expect(s.read(w.id).perf).toEqual(legacy)
    expect('stand' in s.read(w.id).perf).toBe(false)
    expect('shotSeconds' in s.read(w.id).perf).toBe(false)
  })

  it('a world built with no performance stands on its mark for a 6 s shot (no walk); a missing performance.json reads the same', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD })
    expect(DEFAULT_SHOT_S).toBe(6)
    expect(w.perf).toMatchObject({ path: STUB, stand: true, shotSeconds: 6 })
    expect(w.perf.path).toHaveLength(2)
    unlinkSync(path.join(s.dir(w.id), FILES.perf))
    expect(s.read(w.id).perf).toEqual({ path: STUB, stand: true, shotSeconds: 6 })
  })
})
