// The stride fit's switch (strideFitStamp.ts): a walk saved new or changed takes the fit; a performance saved before it (no
// strideFit) keeps playing exactly as it did as long as its walk is left alone, so a take locked on it keeps its frames.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { parsePerformancePlan } from '../perf.ts'
import { FILES, KitStore } from '../store.ts'
import { NEW_WALK, stampStrideFit } from '../strideFitStamp.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-stride-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const A: [number, number][] = [[0, -20], [0, -14.5]], B: [number, number][] = [[0, -20], [0, -16]]

describe('the stride fit on a saved performance', () => {
  it('stamps a new or changed walk, keeps an unchanged one as the file had it, and ignores what the page sends', () => {
    expect(stampStrideFit({ path: A }, null)).toEqual({ path: A, ...NEW_WALK })
    expect(stampStrideFit({ path: B }, { path: A })).toEqual({ path: B, ...NEW_WALK })
    expect(stampStrideFit({ path: A, pace: 0.6 }, { path: A, pace: 0.8 })).toEqual({ path: A, pace: 0.6, ...NEW_WALK })
    expect(stampStrideFit({ path: A, shotSeconds: 6 }, { path: A, shotSeconds: 8 })).toEqual({ path: A, shotSeconds: 6 })
    expect(stampStrideFit({ path: A, strideFit: true }, { path: A })).toEqual({ path: A })
    // a walk saved between two fixes keeps the marks it had and takes no later one until it changes
    expect(stampStrideFit({ path: A }, { path: A, strideFit: true })).toEqual({ path: A, strideFit: true })
    expect(stampStrideFit({ path: A, softSettle: true }, { path: A, strideFit: true })).toEqual({ path: A, strideFit: true })
    expect(stampStrideFit({ path: A }, { path: A, strideFit: true, softSettle: true })).toEqual({ path: A, strideFit: true, softSettle: true })
    expect(stampStrideFit({ path: B }, { path: A, strideFit: true })).toEqual({ path: B, ...NEW_WALK })
    expect(stampStrideFit({ path: A, stand: true, softSettle: true }, null)).toEqual({ path: A, stand: true })
  })

  it('is read back and refused when not true or false', () => {
    expect(parsePerformancePlan({ path: A, strideFit: true })).toEqual({ ok: true, perf: { path: A, strideFit: true } })
    expect(parsePerformancePlan({ path: A, strideFit: 'yes' })).toEqual({ ok: false, errors: ['strideFit must be true or false'] })
    expect(parsePerformancePlan({ path: A, softSettle: true })).toEqual({ ok: true, perf: { path: A, softSettle: true } })
    expect(parsePerformancePlan({ path: A, softSettle: 1 })).toEqual({ ok: false, errors: ['softSettle must be true or false'] })
    // the stop warp's mark (it belonged to the old stop clip, retired with it) is dropped from a file that still carries it
    expect(parsePerformancePlan({ path: A, stopWarp: true })).toEqual({ ok: true, perf: { path: A } })
  })

  it('an old performance on disk saved again with the same walk stays unfitted; a new spot is fitted', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: A } })
    expect(w.perf.strideFit).toBe(true)
    const file = path.join(s.dir(w.id), FILES.perf), old = { ...w.perf }
    delete old.strideFit
    writeFileSync(file, JSON.stringify(old)) // as a performance saved before the fit is on disk
    const again = s.savePerformance(w.id, { ...old, shotSeconds: 6 })
    expect(again.perf.strideFit).toBeUndefined()
    expect(JSON.parse(readFileSync(file, 'utf8')).strideFit).toBeUndefined()
    const moved = s.savePerformance(w.id, { ...old, path: [old.path[0], [0, -16]] })
    expect(moved.perf.strideFit).toBe(true)
  })
})
