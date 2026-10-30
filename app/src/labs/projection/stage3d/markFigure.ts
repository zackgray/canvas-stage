// The subject's stand-in in the Set's clay image (Track C): a plain grey figure, about 1.75 m tall, standing on the plan's mark and facing
// its turn. It is added to the master STILL only (kitStill.ts renderKitStill): never to buildWorld, so the 3D viewport, the clay
// frames and the master's depth (renderKitMasterDepth) have no person-shaped thing in them for a master draw to copy.
import { CapsuleGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import type { ScenePlan } from '../../../stage3d/contract'
import { markOf } from '../../../stage3d/mark'

export const MARK_FIGURE_NAME = 'mark-figure'

export const MARK_FRONT_NAME = 'mark-front'
/** userData flag on the ground wedge: the one part of the stand-in still shown once the 3D performer stands on the mark */
export const MARK_WEDGE = 'markWedge'

/**
 * `front`: add a visible front (a nose on the face and a flat wedge on the ground ahead of the feet), for the live views only. Off by
 * default: the master still's figure (kitStill.ts) is unchanged.
 */
export function markFigure(plan: Pick<ScenePlan, 'flat'> & Partial<Pick<ScenePlan, 'mark' | 'kit'>>, groundAt: (x: number, z: number) => number = () => 0, opts: { front?: boolean } = {}): Group {
  const m = markOf(plan), g = new Group()
  const mat = new MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9, metalness: 0 })
  const body = new Mesh(new CapsuleGeometry(0.2, 1.1, 4, 10), mat), head = new Mesh(new SphereGeometry(0.14, 12, 8), mat)
  body.position.y = 0.75; head.position.y = 1.62
  for (const x of [body, head]) { x.castShadow = x.receiveShadow = true; g.add(x) }
  if (opts.front) {
    const tint = new MeshStandardMaterial({ color: 0xffc83c, roughness: 0.7, metalness: 0 })
    const nose = new Mesh(new ConeGeometry(0.05, 0.14, 8), tint), wedge = new Mesh(new ConeGeometry(0.22, 0.5, 3), tint)
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.62, 0.2)           // +z is the facing
    wedge.rotation.x = Math.PI / 2; wedge.scale.set(1, 1, 0.12); wedge.position.set(0, 0.03, 0.55)
    for (const x of [nose, wedge]) { x.name = MARK_FRONT_NAME; g.add(x) }
    wedge.userData[MARK_WEDGE] = true
  }
  g.name = MARK_FIGURE_NAME
  g.position.set(m.at[0], groundAt(m.at[0], m.at[1]), m.at[1])
  g.rotation.y = (m.yawDeg * Math.PI) / 180
  return g
}

/** free the figure's own geometry and material (the world's dispose never saw them) */
export function disposeFigure(g: Group): void {
  g.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as MeshStandardMaterial).dispose() } })
}
