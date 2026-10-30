// The move gizmo keeps one size on screen (owner 2026-10-29: on a grandstand grown to tens of metres the arrows outgrew the scene):
// each pane's draw sizes it for that pane's camera, a press is tested against it as the pane it came from draws it, and the size
// of the thing it stands on never enters it.
import { Group, Mesh, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3, type WebGLRenderer, type Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { GIZMO_SCREEN, gizmoSizeFor, MoveGizmo } from '../moveGizmo'

const cam = (z: number) => { const c = new PerspectiveCamera(50, 1.6, 0.05, 3000); c.position.set(0, 2, z); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c }
/** the arrows' length on screen, as a share of the pane's height */
const onScreen = (c: PerspectiveCamera, at: Vector3, len: number) => Math.abs(at.clone().add(new Vector3(0, len, 0)).project(c).y - at.clone().project(c).y) / 2

describe('the move gizmo size', () => {
  it('shows the same share of the pane wherever the camera stands, whatever size the piece was given', () => {
    const at = new Vector3(0, 0, 0), g = new MoveGizmo()
    for (const [z, piece] of [[6, 1], [40, 1], [120, 80]] as const) {
      g.show(at, piece, ['x', 'y', 'z'])
      g.fit(cam(z))
      expect(onScreen(cam(z), at, g.group.scale.x)).toBeCloseTo(GIZMO_SCREEN, 1)
    }
    g.dispose()
  })

  it('in the Top View it follows the plan camera zoom, not the piece', () => {
    const top = new OrthographicCamera(-20, 20, 12, -12, 0.1, 500)
    expect(gizmoSizeFor(top, new Vector3())).toBeCloseTo(24 * GIZMO_SCREEN, 6)
    top.zoom = 4
    expect(gizmoSizeFor(top, new Vector3())).toBeCloseTo(6 * GIZMO_SCREEN, 6)
  })

  it('before any draw a huge piece still gets arrows of a few metres, not its own size', () => {
    const g = new MoveGizmo()
    g.show(new Vector3(), 75, ['x', 'y', 'z'])
    expect(g.group.scale.x).toBeLessThanOrEqual(3)
    g.dispose()
  })

  it('each pane draw sizes it for that camera (onBeforeRender), and a press is tested as the casting pane draws it', () => {
    const g = new MoveGizmo(), near = cam(5), far = cam(200)
    g.show(new Vector3(), 1, ['x', 'y', 'z'])
    const meshes: Mesh[] = []
    g.group.traverse((o) => { if (o instanceof Mesh) meshes.push(o) })
    expect(meshes.every((m) => !m.frustumCulled)).toBe(true)
    meshes[0].onBeforeRender({} as WebGLRenderer, {} as Scene, far, meshes[0].geometry, meshes[0].material as never, null as never)
    expect(g.group.scale.x).toBeCloseTo(gizmoSizeFor(far, g.group.position), 6)
    // the X arrow's tip as the near camera draws it: a press there hits X, because the hit is sized for the near camera first
    const tip = new Vector3(gizmoSizeFor(near, new Vector3()) * 0.85, 0, 0).project(near)
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(tip.x, tip.y), near)
    ray.layers.enableAll()
    expect(g.hit(ray)).toBe('x')
    expect(g.group.scale.x).toBeCloseTo(gizmoSizeFor(near, g.group.position), 6)
    g.dispose()
  })

  it('a hidden gizmo is never hit', () => {
    const g = new MoveGizmo()
    expect(g.hit({ camera: cam(5), intersectObject: () => [{ object: { userData: { axis: 'x' } } }] } as never)).toBeNull()
    void Group
    g.dispose()
  })
})
