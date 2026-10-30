// @vitest-environment jsdom
// The Stage's picking on the lab kit layer (merge step 4): a ray against KitLayer.meshes() resolves to a plan piece by
// its KIT_INDEX root even when it met a child mesh (a tree's crown), to the mark figure by its name, and to nothing on
// the ground or the sky. Live poses are drawn on the kit group's roots; the pick's box follows the live pose.
import { Box3, BoxGeometry, BoxHelper, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { buildWorld } from '../../../stage3d/world'
import { KitLayer } from '../../../labs/projection/stage3d/KitLayer'
import { KitPick, KIT_PICK_BOX_NAME, MARK_RING_NAME, withPickOverlaysHidden, type StagePick } from '../../../labs/projection/stage3d/kitPick'
import { ID, plan, world0 } from './liveFakes'

const layer = new KitLayer(buildWorld(plan), ID, plan, world0.perf)
const pick = new KitPick(layer)
afterAll(() => { pick.dispose(); layer.dispose() })

// the camera the tests aim with: over the mark's shoulder, the whole small set in view
const cam = new PerspectiveCamera(45, 400 / 250, 0.05, 3000)
cam.position.set(8.6, 8, -1.5)
cam.lookAt(0.6, 0, -12.5)
cam.updateMatrixWorld()

/** a ray through a world point, as a press right on it would cast */
function rayOn(p: Vector3): Raycaster {
  const ndc = p.clone().project(cam)
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2(ndc.x, ndc.y), cam)
  return ray
}
const CRATES: StagePick = { t: 'piece', index: 0 }
const TREE: StagePick = { t: 'piece', index: 1 }
const at = (p: StagePick) => pick.objectOf(p)!.position

describe('kitPick: a ray on the kit layer', () => {
  it('resolves a piece by its plan index, through a child mesh of it', () => {
    const root = pick.objectOf(CRATES)!
    const box = new Box3().setFromObject(root)
    const hit = pick.hit(rayOn(box.getCenter(new Vector3())))
    expect(hit?.pick).toEqual(CRATES)
    const crown = new Box3().setFromObject(pick.objectOf(TREE)!)
    const crownHit = pick.hit(rayOn(new Vector3((crown.min.x + crown.max.x) / 2, crown.max.y - 0.4, (crown.min.z + crown.max.z) / 2)))
    expect(crownHit?.pick).toEqual(TREE) // met the foliage, still the piece's index
  })

  it('resolves the mark figure to the mark, and the bare ground to nothing', () => {
    const f = pick.objectOf({ t: 'mark' })!
    expect(pick.hit(rayOn(f.position.clone().add(new Vector3(0, 1.2, 0))))?.pick).toEqual({ t: 'mark' })
    const ground = new Vector3(1, layer.groundAt(1, 6), 6)
    expect(pick.hit(rayOn(ground))).toBeNull()
  })

  it('draws live poses on the kit group: the root moves and rides the ground, the plan pose is still the fallback', () => {
    const y0 = at(CRATES).y
    pick.setPoses({ 0: { at: [4.5, -9], yaw: 30 }, mark: { at: [1.6, -12.5], yaw: 90 } })
    expect([at(CRATES).x, at(CRATES).z]).toEqual([4.5, -9])
    expect(pick.objectOf(CRATES)!.rotation.y).toBeCloseTo((30 * Math.PI) / 180, 5)
    expect(at(CRATES).y - y0).toBeCloseTo(layer.groundAt(4.5, -9) - layer.groundAt(3, -9), 5)
    expect(at(TREE).x).toBeCloseTo(-6, 5) // every other root stays at the plan's place
    expect(at({ t: 'mark' }).x).toBeCloseTo(1.6, 5)
    expect(pick.poseOf(CRATES)).toEqual({ at: [4.5, -9], yaw: 30 })
    expect(pick.poseOf(TREE)).toEqual({ at: [-6, -16], yaw: 0 })
    pick.setPoses({})
    expect(at(CRATES).x).toBeCloseTo(3, 5) // back at the plan's place
  })

  it('boxes the pick and names a point over it; the box follows a live pose', () => {
    pick.select(CRATES)
    expect(layer.group.children.some((c) => c instanceof BoxHelper)).toBe(true)
    const center = (i: number) => new Box3().setFromObject(pick.objectOf({ t: 'piece', index: i })!).getCenter(new Vector3())
    const point = pick.labelPoint()!
    expect(point.x).toBeCloseTo(center(0).x, 5)
    expect(point.y).toBeGreaterThan(new Box3().setFromObject(pick.objectOf(CRATES)!).max.y)
    pick.setPoses({ 0: { at: [4.5, -9], yaw: 0 } })
    expect(pick.labelPoint()!.x).toBeCloseTo(center(0).x, 5) // the box rode the drag
    pick.select(null)
    expect(layer.group.children.some((c) => c instanceof BoxHelper)).toBe(false)
    expect(pick.labelPoint()).toBeNull()
  })

  it('one person: with the 3D performer on the mark, a click on her picks the mark, the stand-in hides but its wedge, and her box is the pick', () => {
    const f = pick.objectOf({ t: 'mark' })!
    const her = new Group(), body = new Mesh(new BoxGeometry(0.5, 1.7, 0.4), new MeshBasicMaterial())
    body.position.set(f.position.x + 2, f.position.y + 0.85, f.position.z) // off the stand-in, so only she is under the ray
    her.add(body); layer.group.add(her); her.updateMatrixWorld(true)
    pick.setPerformer(her)
    expect(pick.hit(rayOn(body.position.clone()))?.pick).toEqual({ t: 'mark' })
    expect(f.children.filter((c) => c.visible)).toHaveLength(1) // the ground wedge: her facing, under her feet
    pick.select({ t: 'mark' })
    expect((layer.group.children.find((c) => c instanceof BoxHelper) as BoxHelper).object).toBe(her)
    pick.select(null)
    pick.setPerformer(null)
    expect(f.children.every((c) => c.visible)).toBe(true)
    her.removeFromParent()
  })

  it('while her figure loads no grey capsule stands in: only the wedge shows, and it still picks the mark', () => {
    const f = pick.figure
    pick.setPerformer(null, true)
    const shown = f.children.filter((c) => c.visible)
    expect(shown).toHaveLength(1)
    expect(shown[0].userData.markWedge).toBe(true)
    f.updateMatrixWorld(true)
    const wedge = shown[0].getWorldPosition(new Vector3())
    expect(pick.hit(rayOn(wedge))?.pick).toEqual({ t: 'mark' })
    pick.select({ t: 'mark' }) // the mark is still selectable (its box and the Find list read the stand-in)
    expect(pick.objectOf({ t: 'mark' })).toBe(f)
    pick.select(null)
    pick.setPerformer(null) // no performer is coming (mocap off or failed): the whole stand-in again
    expect(f.children.every((c) => c.visible)).toBe(true)
  })

  it('hands its roots back by pick and lets go of the scene on dispose', () => {
    expect(pick.objectOf(CRATES)).toBeTruthy()
    expect(pick.objectOf({ t: 'mark' })?.name).toBe('mark-figure')
    pick.dispose()
    expect(layer.group.children.some((c) => c.name === 'mark-figure')).toBe(false)
  })
})

describe('the pick overlays never reach a capture', () => {
  // the stand-in and the box live in the one scene every capture renders (withPickOverlaysHidden gates each draw:
  // engine/capture.ts, clay/kitCapture.ts); the gate hides them for the draw and puts back exactly what it hid
  function rigged() {
    const l = new KitLayer(buildWorld(plan), ID, plan, world0.perf)
    const p = new KitPick(l)
    p.select(CRATES)
    const figure = l.group.getObjectByName('mark-figure')!
    const box = l.group.getObjectByName(KIT_PICK_BOX_NAME)!
    return { l, p, figure, box }
  }

  it('hides the stand-in and the pick box for the capture draw and restores them after', () => {
    const { l, p, figure, box } = rigged()
    const seen = withPickOverlaysHidden(l.group, () => [figure.visible, box.visible])
    expect(seen).toEqual([false, false])
    expect(figure.visible).toBe(true)
    expect(box.visible).toBe(true)
    p.dispose(); l.dispose()
  })

  it('restores the overlays even when the capture throws, and never un-hides what was already hidden', () => {
    const { l, p, figure, box } = rigged()
    figure.visible = false // hidden before the capture: it must stay hidden after
    expect(() => withPickOverlaysHidden(l.group, () => { throw new Error('boom') })).toThrow('boom')
    expect(figure.visible).toBe(false)
    expect(box.visible).toBe(true)
    p.dispose(); l.dispose()
  })

  it('L3: the Add mark\'s dashed ring rides at the spot and a capture never sees it', () => {
    const l = new KitLayer(buildWorld(plan), ID, plan, world0.perf)
    const p = new KitPick(l)
    const ring = l.group.getObjectByName(MARK_RING_NAME)!
    expect(ring.visible).toBe(false) // no mark: no ring
    p.setMark([1, 6])
    expect(ring.visible).toBe(true)
    expect(ring.position.x).toBeCloseTo(1, 5)
    expect(ring.position.z).toBeCloseTo(6, 5)
    expect(ring.position.y).toBeCloseTo(l.groundAt(1, 6) + 0.03, 5)
    const seen = withPickOverlaysHidden(l.group, () => ring.visible)
    expect(seen).toBe(false)
    expect(ring.visible).toBe(true) // back after the capture
    p.setMark(null)
    expect(ring.visible).toBe(false)
    p.dispose(); l.dispose()
  })
})
