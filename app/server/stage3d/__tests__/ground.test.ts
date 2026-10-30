// The ground's shape (plan.ground, the Set panel's Ground row): Flat makes the one height function 0 everywhere, so the mesh, the
// pieces, the mark's ground and the server's master camera all sit on y = 0; Rolling (or no choice, every world made before it) is
// the old ground. A switch is a set change through the store like the sky's: the plan is re-written (so the set key a locked take
// holds no longer matches), the set-changed stamp moves and the master depth drops. A new scene starts flat; Reset keeps the choice.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as THREE from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { parsePlan } from '../../../src/stage3d/plan.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { buildWorld, heightFn } from '../../../src/stage3d/world.ts'
import { EMPTY_PLAN } from '../../../src/studio/scene/design/useBuildSet.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { KIT_MASTER_POSITION } from '../master.ts'
import { masterCamOf } from '../../hero/projectedView.ts'
import { resetToBuilt } from '../builtPlan.ts'
import { FILES, KitError, KitStore } from '../store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-ground-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const rolling = Object.values(PLANS)[0]
const flat: ScenePlan = { ...rolling, ground: 'flat' }
const SPOTS: [number, number][] = [[20, -40], [-30, 10], [12.5, -60], [0.6, -12.5], [45, 45]]

describe('the ground: flat or rolling', () => {
  it('flat is 0 everywhere; rolling, and a plan with no choice, keep the old rolls', () => {
    const f = heightFn(flat), r = heightFn(rolling), named = heightFn({ ...rolling, ground: 'rolling' })
    for (const [x, z] of SPOTS) { expect(f(x, z)).toBe(0); expect(named(x, z)).toBe(r(x, z)) }
    expect(SPOTS.some(([x, z]) => Math.abs(r(x, z)) > 0.05)).toBe(true)
  })

  it('the plan check takes flat and rolling and refuses anything else in plain words', () => {
    expect(parsePlan(flat).ok).toBe(true)
    expect(parsePlan({ ...rolling, ground: 'rolling' }).ok).toBe(true)
    const bad = parsePlan({ ...rolling, ground: 'hilly' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toMatch(/ground: must be one of flat, rolling/)
  })

  it('a new scene starts flat; the world built from it has a level mesh and every piece stands on y = lift', () => {
    expect(EMPTY_PLAN.ground).toBe('flat')
    const w = buildWorld({ ...flat, kit: flat.kit.map((it, i) => (i === 0 ? { ...it, lift: 0.5 } : it)) })
    for (const [x, z] of SPOTS) expect(w.groundAt(x, z)).toBe(0)
    const mesh = w.scene.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) as THREE.Mesh
    const ys = mesh.geometry.attributes.position
    let most = 0
    for (let i = 0; i < ys.count; i += 97) most = Math.max(most, Math.abs(ys.getY(i)))
    expect(most).toBe(0)
    const roots = w.scene.children.filter((c) => typeof c.userData.kitIndex === 'number')
    expect(roots.length).toBeGreaterThan(0)
    for (const o of roots) expect(o.position.y).toBe(o.userData.kitIndex === 0 ? 0.5 : 0)
    w.dispose()
  })

  it("the server's master camera follows the ground: on flat it sits at the master position itself", () => {
    expect(masterCamOf(flat).position[1]).toBe(KIT_MASTER_POSITION[1])
    expect(masterCamOf(rolling).position[1]).toBe(KIT_MASTER_POSITION[1] + heightFn(rolling)(KIT_MASTER_POSITION[0], KIT_MASTER_POSITION[2]))
  })

  it('a switch is a set change: the plan and its set key change, the stamp moves, the master depth drops; anything else is a 400', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: rolling })
    const key = setKeyOf(w.plan)
    const depth = path.join(s.dir(w.id), FILES.masterDepth)
    writeFileSync(depth, 'x')
    const out = s.saveGround(w.id, { ground: 'flat' }, new Date('2026-10-29T12:00:00Z'))
    expect(out.plan.ground).toBe('flat')
    expect(out.plan.kit).toEqual(w.plan.kit) // nothing else in the plan moves: the pieces re-seat when the world is built
    expect(setKeyOf(out.plan)).not.toBe(key)
    expect(s.setChangedAt(w.id)).toBe('2026-10-29T12:00:00.000Z')
    expect(existsSync(depth)).toBe(false)
    expect(() => s.saveGround(w.id, { ground: 'hilly' })).toThrow(KitError)
    expect(s.saveGround(w.id, { ground: 'rolling' }).plan.ground).toBe('rolling')
  })

  it('Reset the set keeps the ground chosen', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: rolling })
    s.saveGround(w.id, { ground: 'flat' })
    s.movePiece(w.id, { index: 0, kind: w.plan.kit[0].kind, remove: true })
    const back = resetToBuilt(s, w.id)
    expect(back.plan.ground).toBe('flat')
    expect(back.plan.kit).toEqual(w.plan.kit)
  })
})
