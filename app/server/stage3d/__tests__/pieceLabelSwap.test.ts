// Track C: a piece's label (the brief's own words, '' clears it) and swapTo (the piece becomes another kind, its place kept) ride the
// same POST /piece as a move: a real change rewrites plan.json, so the set key moves and the master depth is dropped; a no-op (a swap
// to the same kind) writes nothing, so neither Shoot's key nor Render's stamp moves.
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { LABEL_MAX } from '../../../src/stage3d/planLight.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { FILES, KitStore } from '../store.ts'

const URL = '/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb'
function world() {
  const s = new KitStore(mkdtempSync(path.join(tmpdir(), 'label-swap-')))
  const plan: ScenePlan = { ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit: [
    { kind: 'barrels', at: [8, -10] },
    { kind: 'crates', at: [-8, -12], yawDeg: 5, scale: 1.3, label: 'a white hive' },
    { kind: 'steam locomotive', at: [-9, -14], yawDeg: 10, glb: { url: URL, yawOffsetDeg: 90, unitScale: 5 } },
  ] }
  const w = s.create({ plan, description: 'label-swap' })
  writeFileSync(path.join(s.dir(w.id), FILES.masterDepth), 'x')
  return { s, id: w.id, key: () => setKeyOf(s.read(w.id).plan) }
}

describe('labelling a set piece', () => {
  it('sets a label trimmed, and clears it with an empty one', () => {
    const { s, id } = world()
    const w = s.movePiece(id, { index: 0, kind: 'barrels', label: '  the tar barrels  ' })
    expect(w.plan.kit[0]).toEqual({ kind: 'barrels', at: [8, -10], label: 'the tar barrels' })
    const cleared = s.movePiece(id, { index: 0, kind: 'barrels', label: '   ' })
    expect(cleared.plan.kit[0].label).toBeUndefined()
  })

  it('refuses a non-string or over-long label (400), writing nothing', () => {
    const { s, id, key } = world()
    const k0 = key()
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels', label: 5 })).toThrow(/label must be a string/)
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels', label: 'x'.repeat(LABEL_MAX + 1) })).toThrow(/label must be at most/)
    expect(key()).toBe(k0)
    expect(s.setChangedAt(id)).toBeNull()
  })

  it('a real label edit moves the set key, stamps the set changed and drops the master depth, like a move', () => {
    const { s, id, key } = world()
    const k0 = key(), at = new Date('2026-10-25T10:00:00Z')
    s.movePiece(id, { index: 1, kind: 'crates', label: 'the old cart' }, at)
    expect(key()).not.toBe(k0)
    expect(s.setChangedAt(id)).toBe(at.toISOString())
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(false)
  })
})

describe('swapping a piece for another kind', () => {
  it('keeps the place, turn, size and label; only the kind changes', () => {
    const { s, id } = world()
    const w = s.movePiece(id, { index: 1, kind: 'crates', swapTo: '  wagon  ' })
    expect(w.plan.kit[1]).toEqual({ kind: 'wagon', at: [-8, -12], yawDeg: 5, scale: 1.3, label: 'a white hive' })
    expect(w.plan.kit[0]).toEqual({ kind: 'barrels', at: [8, -10] })
  })

  it('a stale kind is the same 409 as a stale move, and a body changing nothing must still say at', () => {
    const { s, id } = world()
    expect(() => s.movePiece(id, { index: 1, kind: 'barrels', swapTo: 'wagon' })).toThrow(/the set changed/)
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels' })).toThrow(/at must be/)
  })

  it('a swap to the same kind is a no-op: nothing written, no stamp, the master depth kept, the key still', () => {
    const { s, id, key } = world()
    const k0 = key()
    const w = s.movePiece(id, { index: 0, kind: 'barrels', swapTo: 'barrels' })
    expect(w.plan.kit[0]).toEqual({ kind: 'barrels', at: [8, -10] })
    expect(s.setChangedAt(id)).toBeNull()
    expect(existsSync(path.join(s.dir(id), FILES.masterDepth))).toBe(true)
    expect(key()).toBe(k0)
  })

  it('refuses a swap of a built piece and a swap to a kind the set does not know (422), writing nothing', () => {
    const { s, id, key } = world()
    const k0 = key()
    expect(() => s.movePiece(id, { index: 2, kind: 'steam locomotive', swapTo: 'wagon' })).toThrow(/keeps its own kind/)
    expect(() => s.movePiece(id, { index: 0, kind: 'barrels', swapTo: 'spaceship' })).toThrow(/has no piece called/)
    try { s.movePiece(id, { index: 0, kind: 'barrels', swapTo: 'spaceship' }); expect.unreachable() } catch (e) {
      expect((e as { status: number }).status).toBe(422)
    }
    expect(key()).toBe(k0)
    expect(s.setChangedAt(id)).toBeNull()
  })

  it('combines with at, yawDeg, scale and label in one body', () => {
    const { s, id } = world()
    const w = s.movePiece(id, { index: 0, kind: 'barrels', at: [4.234, -6], yawDeg: 90, scale: 2, label: 'the store barrels', swapTo: 'cart' })
    expect(w.plan.kit[0]).toEqual({ kind: 'cart', at: [4.23, -6], yawDeg: 90, scale: 2, label: 'the store barrels' })
  })

  it('a real swap moves the set key', () => {
    const { s, id, key } = world()
    const k0 = key()
    s.movePiece(id, { index: 1, kind: 'crates', swapTo: 'wagon' })
    expect(key()).not.toBe(k0)
  })
})
