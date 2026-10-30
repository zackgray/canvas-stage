// The path's live-view handles: a line from start to end and a marker on each end (start green, end amber). Build
// shows them; every capture hides them (World.capture).
import { BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'
import type { V3 } from './geom'

const LIFT = 0.03

export class PathHandles {
  readonly group = new Group()
  private line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xf2b84b, depthTest: false, transparent: true }))
  readonly start = marker(0x4bd28f)
  readonly end = marker(0xf2b84b)

  constructor() {
    this.group.name = 'world-handles'
    this.line.renderOrder = 998
    this.group.add(this.line, this.start, this.end)
    this.group.visible = false
  }

  set(start: V3, end: V3, up: V3) {
    const lift = (p: V3) => new Vector3(...p).addScaledVector(new Vector3(...up), LIFT)
    this.line.geometry.setFromPoints([lift(start), lift(end)])
    this.start.position.copy(lift(start))
    this.end.position.copy(lift(end))
  }

  dispose() {
    this.line.geometry.dispose()
    ;(this.line.material as LineBasicMaterial).dispose()
    for (const m of [this.start, this.end]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose() }
  }
}

function marker(color: number) {
  const m = new Mesh(new SphereGeometry(0.25, 16, 12), new MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }))
  m.renderOrder = 999
  return m
}
