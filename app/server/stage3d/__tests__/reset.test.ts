// Reset the set: the plan Build the set placed (plan.built.json, written at create) is put back — every piece and the mark — as a
// set change like any other; a generated piece that landed after the build stays (its mesh is placed in the built copy too); the
// hero's stand follows the mark; a set built before the copy was kept says so in plain words (409) and nothing changes.
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { markOf } from '../../../src/stage3d/mark.ts'
import { standPath } from '../../../src/stage3d/motion/standPlan.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { placePiece } from '../../pieces/place.ts'
import { BUILT_FILE, NOT_BUILT_HERE, placeInBuilt, resetToBuilt } from '../builtPlan.ts'
import { KitError, KitStore } from '../store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-reset-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const plan = Object.values(PLANS)[0]

describe('Reset the set', () => {
  it('puts every moved, turned or removed piece and the mark back where Build placed them; the stand follows the mark', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan })
    const kind = w.plan.kit[0].kind
    s.movePiece(w.id, { index: 0, kind, at: [w.plan.kit[0].at[0] + 2, w.plan.kit[0].at[1]], yawDeg: 40 })
    s.movePiece(w.id, { index: 1, kind: w.plan.kit[1].kind, remove: true })
    s.setMark(w.id, { at: [2, -9], yawDeg: 90 })
    expect(s.read(w.id).plan).not.toEqual(w.plan)
    const back = resetToBuilt(s, w.id)
    expect(back.plan).toEqual(w.plan)
    expect(back.perf.path).toEqual(standPath(markOf(back.plan)))
    expect(s.setChangedAt(w.id)).not.toBeNull() // a set change: the approval goes stale like any other
  })

  it('a generated piece that landed after the build keeps its mesh through a reset', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan })
    const item = { kind: 'beehive', at: [0, 0] as [number, number], pieceTag: 'prop:hive', glb: { url: '/lab-assets/x/mesh.glb' } }
    s.changeKit(w.id, (p) => placePiece(p, item as never).kit)
    placeInBuilt(s, w.id, (p) => placePiece(p, item as never).kit)
    const landed = s.read(w.id).plan.kit.findIndex((k) => k.glb)
    s.movePiece(w.id, { index: landed, kind: 'beehive', at: [5, -5] })
    const back = resetToBuilt(s, w.id)
    expect(back.plan.kit.filter((k) => k.glb)).toHaveLength(1)
    expect(back.plan.kit[landed].at).not.toEqual([5, -5])
  })

  it('a set built before Reset existed says so, and nothing is written', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan })
    s.movePiece(w.id, { index: 0, kind: w.plan.kit[0].kind, yawDeg: 40 })
    unlinkSync(path.join(s.dir(w.id), BUILT_FILE))
    const before = s.read(w.id).plan
    let err: unknown = null
    try { resetToBuilt(s, w.id) } catch (e) { err = e }
    expect(err).toBeInstanceOf(KitError)
    expect((err as KitError).status).toBe(409)
    expect((err as KitError).message).toBe(NOT_BUILT_HERE)
    expect(s.read(w.id).plan).toEqual(before)
  })
})
