// Every renderColor/renderDepth capture (capture.ts) reads the one lab scene, which since the Stage merge holds the pick
// overlays: the grey stand-in at the mark and the pick's box (stage3d/kitPick.ts). These captures must draw with the
// overlays hidden and find them visible again afterwards — the non-kit clay frames, the non-kit hero opening, the hole
// probe and every other renderColor/renderDepth caller pass through here. The renderer is faked (no GL in the tests): it
// records the overlays' visibility at each draw, the read-backs are zero-filled.
import { Color, Group, PerspectiveCamera, Scene, type Camera, type Scene as ThreeScene, type WebGLRenderer } from 'three'
import { describe, expect, it } from 'vitest'
import { capture, renderColor, renderDepth } from './capture'
import { MARK_FIGURE_NAME } from '../stage3d/markFigure'
import { KIT_PICK_BOX_NAME } from '../stage3d/kitPick'

class FakeRenderer {
  autoClear = true
  private target: unknown = null
  private clearColor = new Color()
  private clearAlpha = 1
  readonly renders: { fig: boolean | null; box: boolean | null }[] = []
  private readonly scene: ThreeScene
  constructor(scene: ThreeScene) { this.scene = scene }
  getClearColor(t: Color) { return t.copy(this.clearColor) }
  getClearAlpha() { return this.clearAlpha }
  getRenderTarget() { return this.target }
  setRenderTarget(t: unknown) { this.target = t }
  setClearColor(c: Color, a: number) { this.clearColor.copy(c); this.clearAlpha = a }
  clear() {}
  render(_s: ThreeScene, _c: Camera) {
    this.renders.push({
      fig: this.scene.getObjectByName(MARK_FIGURE_NAME)?.visible ?? null,
      box: this.scene.getObjectByName(KIT_PICK_BOX_NAME)?.visible ?? null,
    })
  }
  readRenderTargetPixels(_rt: unknown, _x: number, _y: number, _w: number, _h: number, px: Uint8Array | Float32Array) { px.fill(0) }
}

/** the lab scene with the pick overlays in it, as the Stage screen keeps them */
function rig() {
  const scene = new Scene()
  const figure = new Group(); figure.name = MARK_FIGURE_NAME
  const box = new Group(); box.name = KIT_PICK_BOX_NAME
  scene.add(figure, box)
  const r = new FakeRenderer(scene)
  const cam = new PerspectiveCamera(45, 4 / 3, 0.1, 100)
  return { scene, figure, box, r, cam }
}

describe('renderColor/renderDepth captures', () => {
  it('draw with the pick overlays hidden, colour and depth alike, and put them back after', () => {
    const { scene, figure, box, r, cam } = rig()
    const out = capture(r as unknown as WebGLRenderer, scene, cam, 4, 3)
    expect(out.rgba).toHaveLength(4 * 3 * 4)
    expect(out.depth).toHaveLength(4 * 3)
    expect(r.renders.length).toBeGreaterThanOrEqual(2) // the colour draw and the depth draw
    expect(r.renders.every((s) => s.fig === false && s.box === false)).toBe(true)
    expect(figure.visible).toBe(true)
    expect(box.visible).toBe(true)
  })

  it('hides the overlays for a single renderColor / renderDepth call too, and restores them', () => {
    const { figure, box, r, cam, scene } = rig()
    renderColor(r as unknown as WebGLRenderer, scene, cam, 4, 3)
    renderDepth(r as unknown as WebGLRenderer, scene, cam, 4, 3)
    expect(r.renders.length).toBe(2)
    expect(r.renders.every((s) => s.fig === false && s.box === false)).toBe(true)
    expect(figure.visible).toBe(true)
    expect(box.visible).toBe(true)
  })

  it('leaves an overlay that was already hidden hidden afterwards', () => {
    const { figure, box, r, cam, scene } = rig()
    figure.visible = false
    renderColor(r as unknown as WebGLRenderer, scene, cam, 4, 3)
    expect(figure.visible).toBe(false) // the capture hid nothing it did not un-hide; the box still came back
    expect(box.visible).toBe(true)
    expect(r.renders.every((s) => s.fig === false && s.box === false)).toBe(true)
  })
})
