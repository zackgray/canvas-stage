// Wave 2: the stored PerformancePlan carries who plays the 3D performer (castId, a cast card id), add-only; and a take's world id,
// prefixed or not, resolves to its kit world.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { planHash } from '../../../src/labs/projection/stage3d/MocapLayer.ts'
import { parsePerformancePlan } from '../perf.ts'
import { KitStore } from '../store.ts'
import { isKitWorld, takeKitWorld } from '../takeWorld.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-cast-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const PATH: [number, number][] = [[0, -20], [0, 4]]

describe('castId on the kit performance', () => {
  it('is kept when it is a cast card id, refused otherwise, absent when not sent', () => {
    expect(parsePerformancePlan({ path: PATH, castId: 'brann' })).toEqual({ ok: true, perf: { path: PATH, castId: 'brann' } })
    expect(parsePerformancePlan({ path: PATH })).toEqual({ ok: true, perf: { path: PATH } })
    for (const bad of ['../x', '', 'Brann', 7]) expect(parsePerformancePlan({ path: PATH, castId: bad }).ok).toBe(false)
  })
  it('round-trips through performance.json and does not change the mocap pack id (a take stays its take)', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: [[0.6, -12.5], [0, 4]] } }) // begins on the mark (a save snaps the start there)
    const saved = s.savePerformance(w.id, { ...w.perf, castId: 'brann' })
    expect(saved.perf.castId).toBe('brann')
    expect(planHash(saved.perf)).toBe(planHash(w.perf))
    expect(takeKitWorld(pub, `locations/${w.id}`)?.perf.castId).toBe('brann')
    expect(isKitWorld(pub, w.id)).toBe(true)
    expect(isKitWorld(pub, 'loc-2026-01-01T00-00-00-000')).toBe(false)
    expect(isKitWorld(pub, '../../etc')).toBe(false)
  })
})
