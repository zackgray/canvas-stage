// The world root scale on the scene (worldScale.ts computes s): one uniform scale about the projector for everything the
// world is made of. The set's meshes hang under `set` (a scaled group under the projector, so they keep living in projector
// camera space); the surround's far scene is drawn at the same scale (SurroundLayer.rootScale); a performance's object
// (under the world group, its camera at the pack's source pose = the projector) is placed x -> P + s·(x - P).
import { Group, Vector3, type Object3D } from 'three'

export class WorldRoot {
  /** the set's meshes' parent: a child of the projector, scaled by s */
  readonly set = new Group()
  private readonly projector: Object3D
  private scale = 1

  constructor(projector: Object3D) {
    this.projector = projector
    this.set.name = 'set-root'
    projector.add(this.set)
  }

  /** true metres per app unit of the set as loaded (1 = the set's own units, today's behaviour) */
  get s(): number { return this.scale }

  set s(s: number) {
    this.scale = s > 0 && Number.isFinite(s) ? s : 1
    this.set.scale.setScalar(this.scale)
    this.projector.updateMatrixWorld(true)
  }

  /** Put a world-clock object (the performance) on the root: scaled by s about the projector's position. */
  place(o: Object3D) {
    const p = this.projector.getWorldPosition(new Vector3())
    if (o.scale.x === this.scale && o.position.equals(p.clone().multiplyScalar(1 - this.scale))) return
    o.scale.setScalar(this.scale)
    o.position.copy(p).multiplyScalar(1 - this.scale)
    o.updateMatrixWorld(true)
  }
}
