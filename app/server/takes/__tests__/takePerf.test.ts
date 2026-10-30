// Each take keeps its own performance (PLAN-PER-TAKE-PERFORMANCE.md §2, WP1): what a take plays (takePerfOf), adoption of the
// scene's walk into the takes locked on it (only matching takes, never over a copy, never a null or non-mocap take), and adoption
// running before every write of performance.json (/performance, /mark, /reset). Temp folders only.
import { rmSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { mocapPackId } from '../../../src/stage3d/planHash.ts'
import { withSceneCast } from '../../../src/shared/shotContract.ts'
import { resetToBuilt } from '../../stage3d/builtPlan.ts'
import { adoptPerfInto } from '../adopt.ts'
import { adoptAllTakes, adoptScenePerf, takePerfOf } from '../takePerf.ts'
import { kitWorld, onDisk, putTake, tempPub, walk } from './takePerfFixture.ts'

const pubs: string[] = []
const pub = (tag: string) => { const p = tempPub(tag); pubs.push(p); return p }
afterAll(() => pubs.forEach((p) => rmSync(p, { recursive: true, force: true })))

describe('takePerfOf', () => {
  const P = walk(0, 'card-copy'), id = mocapPackId(P)
  it('own / adopted copy that hashes to the packId, with the scene castId laid over', () => {
    const scene = { perf: walk(3, 'card-scene') }
    expect(takePerfOf({ packId: id, perf: P, perfFrom: 'lock' }, scene)).toEqual({ state: 'own', perf: { ...P, castId: 'card-scene' } })
    expect(takePerfOf({ packId: id, perf: P, perfFrom: 'adopted' }, scene).state).toBe('adopted')
    expect(takePerfOf({ packId: id, perf: P, perfFrom: 'lock' }, null).perf).toEqual(P) // no scene to read: the copy as it is
  })
  it('a copy that does not hash to its packId is unmatched, never silently matched', () => {
    expect(takePerfOf({ packId: id, perf: walk(1) }, { perf: walk(1) })).toEqual({ state: 'unmatched', perf: null })
  })
  it('no copy: the scene walk while it still hashes to the packId, else unmatched; null / non-mocap packId is none', () => {
    expect(takePerfOf({ packId: id }, { perf: P })).toEqual({ state: 'adopted', perf: P })
    expect(takePerfOf({ packId: id }, { perf: walk(2) }).state).toBe('unmatched')
    expect(takePerfOf({ packId: id }, null).state).toBe('unmatched')
    expect(takePerfOf({ packId: null }, { perf: P }).state).toBe('none')
    expect(takePerfOf({ packId: 'pack-lifted' }, { perf: P }).state).toBe('none')
  })
  it('withSceneCast drops the copy castId when the scene names none (the first card)', () => {
    expect(withSceneCast(P, {})).toEqual(walk(0))
  })
})

describe('adoption', () => {
  it('copies the scene walk only into matching takes of that world with no copy; others untouched byte for byte', () => {
    const p = pub('only')
    const a = kitWorld(p, walk(0)), b = kitWorld(p, walk(1))
    const match = putTake(p, { worldId: a.id, packId: a.packId })
    const prefixed = putTake(p, { worldId: `lab/${a.id}`, packId: a.packId }) // a merged source list prefixes the world id
    const other = putTake(p, { worldId: a.id, packId: 'mocap-00000000' })
    const otherWorld = putTake(p, { worldId: b.id, packId: a.packId })
    const nul = putTake(p, { worldId: a.id, packId: null })
    const lifted = putTake(p, { worldId: a.id, packId: 'pack-a' })
    const before = [other, otherWorld, nul, lifted].map((t) => JSON.stringify(onDisk(p, t.id)))
    expect(adoptScenePerf(p, a.id).sort()).toEqual([match.id, prefixed.id].sort())
    expect(onDisk(p, match.id)).toEqual({ ...match, perf: a.perf, perfFrom: 'adopted' })
    expect(onDisk(p, prefixed.id).perf).toEqual(a.perf)
    expect([other, otherWorld, nul, lifted].map((t) => JSON.stringify(onDisk(p, t.id)))).toEqual(before)
    expect(adoptScenePerf(p, a.id)).toEqual([]) // a second run writes nothing
  })

  it('never overwrites a copy a take already holds, even one that no longer matches', () => {
    const p = pub('keep')
    const w = kitWorld(p, walk(0))
    const own = putTake(p, { worldId: w.id, packId: w.packId, perf: { ...w.perf, castId: 'card-at-lock' }, perfFrom: 'lock' })
    const stale = putTake(p, { worldId: w.id, packId: w.packId, perf: walk(5), perfFrom: 'adopted' })
    expect(adoptPerfInto(p, w.id, w.perf)).toEqual([])
    expect(onDisk(p, own.id)).toEqual(own)
    expect(onDisk(p, stale.id)).toEqual(stale)
  })

  it('adoptAllTakes (the list GET) adopts across every world that has a take without a copy', () => {
    const p = pub('all')
    const a = kitWorld(p, walk(0)), b = kitWorld(p, walk(2))
    const ta = putTake(p, { worldId: a.id, packId: a.packId }), tb = putTake(p, { worldId: b.id, packId: b.packId })
    const gone = putTake(p, { worldId: 'loc-2026-01-01T00-00-00-000', packId: a.packId }) // its world is not on disk
    expect(adoptAllTakes(p).sort()).toEqual([ta.id, tb.id].sort())
    expect(onDisk(p, gone.id).perf).toBeUndefined()
  })
})

describe('adoption runs before every write of performance.json', () => {
  it('/performance (savePerformance): the take locked on the old walk keeps it after the walk changes', () => {
    const p = pub('save')
    const w = kitWorld(p, walk(0))
    const t = putTake(p, { worldId: w.id, packId: w.packId })
    const next = w.store.savePerformance(w.id, walk(3))
    expect(mocapPackId(next.perf)).not.toBe(w.packId)
    expect(onDisk(p, t.id).perf).toEqual(w.perf)
    expect(takePerfOf(onDisk(p, t.id), next)).toEqual({ state: 'adopted', perf: w.perf })
  })

  it('/mark (setMark): the snapToMark rewrite comes after the take adopts the walk it was locked on', () => {
    const p = pub('mark')
    const w = kitWorld(p, walk(0))
    const t = putTake(p, { worldId: w.id, packId: w.packId })
    const moved = w.store.setMark(w.id, { at: [3, -12], yawDeg: 20 })
    expect(mocapPackId(moved.perf)).not.toBe(w.packId)
    expect(onDisk(p, t.id).perf).toEqual(w.perf)
  })

  it('/reset (resetToBuilt): the stand following the mark back comes after adoption', () => {
    const p = pub('reset')
    const w = kitWorld(p)
    w.store.setMark(w.id, { at: [2, -9], yawDeg: 90 })
    const atMark = w.store.read(w.id).perf
    const t = putTake(p, { worldId: w.id, packId: mocapPackId(atMark) })
    const back = resetToBuilt(w.store, w.id)
    expect(mocapPackId(back.perf)).not.toBe(mocapPackId(atMark))
    expect(onDisk(p, t.id).perf).toEqual(atMark)
  })
})
