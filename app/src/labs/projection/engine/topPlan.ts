// The Top View pane's camera (split out of panes.ts): an orthographic camera straight down on a target, framing `half` metres
// vertically. A drag pans it so the ground rides the pointer exactly; the wheel zooms within a set range. Panes owns the events
// and the pane rectangles; this owns only the plan's framing.
import { OrthographicCamera, Vector3 } from 'three'

const TOP_HALF = 14 // the top view's initial half-height, metres: a set's pieces are a few metres across
const TOP_HALF_RANGE = [2, 80] as const
const TOP_HEIGHT = 80 // the ortho camera's height over the ground: hills stay in its near/far reach
const clampHalf = (h: number) => Math.min(TOP_HALF_RANGE[1], Math.max(TOP_HALF_RANGE[0], h))

export class TopPlan {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, TOP_HEIGHT * 2)
  private half = TOP_HALF
  private readonly target = new Vector3()

  constructor(home: Vector3) {
    this.target.set(home.x, 0, home.z)
    this.frame(1)
  }

  /** centre the plan on (cx, cz) with `radius` metres of set in view */
  centre(cx: number, cz: number, radius: number, aspect: number): void {
    this.target.set(cx, 0, cz)
    this.half = clampHalf(radius * 1.25 + 2)
    this.frame(aspect)
  }

  /** a drag of (dx, dy) css px over a pane `paneH` px tall: the plan's screen axes are the world's x (right) and z (down) */
  pan(dx: number, dy: number, paneH: number, aspect: number): void {
    const wpp = (2 * this.half) / (paneH || 1)
    this.target.x -= dx * wpp
    this.target.z -= dy * wpp
    this.frame(aspect)
  }

  /** a wheel turn: down pulls back, up closes in */
  zoom(deltaY: number, aspect: number): void {
    this.half = clampHalf(this.half * (deltaY > 0 ? 1.15 : 1 / 1.15))
    this.frame(aspect)
  }

  /** aim straight down at the target, framing `half` metres vertically (aspect = its pane's w/h) */
  frame(aspect: number): void {
    const c = this.camera
    c.left = -this.half * aspect
    c.right = this.half * aspect
    c.top = this.half
    c.bottom = -this.half
    c.position.set(this.target.x, TOP_HEIGHT, this.target.z)
    c.up.set(0, 0, -1) // the plan's reading north: -z at the top of the pane, as the SVG top views
    c.lookAt(this.target.x, 0, this.target.z)
    c.updateProjectionMatrix()
  }
}
