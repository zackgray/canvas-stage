// @vitest-environment jsdom
// The Stage's panes (merge step 5): the lab viewport's first multi-camera support. The canvas splits into side-by-side
// rectangles (the Camera's left, the Top View's last) with setViewport/setScissor, every pane drawing the SAME scene
// through its own camera; one pane on (or none) is no split at all — the caller's single full-frame draw stands. A ray
// maps through the pane under the point; the gate arms the pane under the press; the top view pans with a drag and zooms
// with the wheel. The panes put nothing into the scene — the labels and the lane are DOM layers — so a capture never
// sees them (withPickOverlaysHidden's gate is untouched). three's WebGLRenderer is faked (jsdom has no GL): the calls
// are recorded, the cameras and the scene are real.
import { fireEvent } from '@testing-library/react'
import { Color, FogExp2, OrthographicCamera, PerspectiveCamera, Scene, Vector3, type Camera, type WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FREE_FOG, Panes, withFreeFog } from './panes'
import type { ViewDraw } from './viewDraw'

const W = 400, H = 250
const rigs: { panes: Panes; controls: OrbitControls; host: HTMLElement }[] = []
afterEach(() => {
  while (rigs.length) { const r = rigs.pop()!; r.panes.dispose(); r.controls.dispose(); r.host.remove() }
  vi.restoreAllMocks()
})

/** a real scene + cameras on a fake canvas and renderer; the calls the split draw makes are recorded */
function rig() {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: W, configurable: true })
  Object.defineProperty(canvas, 'clientHeight', { value: H, configurable: true })
  canvas.setPointerCapture = vi.fn() // jsdom has none; OrbitControls calls it unconditionally
  canvas.releasePointerCapture = vi.fn()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 } as DOMRect)
  const host = document.createElement('div')
  host.appendChild(canvas)
  document.body.appendChild(host)
  const calls = {
    viewports: [] as number[][], scissors: [] as number[][], scissorTests: [] as boolean[],
    draws: [] as { scene: Scene; cam: Camera }[],
    /** the scene's fog density at each draw: the Free view's thinning must not outlive its own draw */
    fogAtDraw: [] as (number | null)[],
    /** every clear: the colour it cleared to, whether the scissor was on, the viewport then, and how many draws came before */
    clears: [] as { colour: string; alpha: number; scissored: boolean; viewport: number[]; afterDraws: number }[],
  }
  const state = { clearColour: new Color(0x1c1d21), clearAlpha: 1, scissor: false }
  const r = {
    domElement: canvas, autoClear: true,
    setViewport: (...a: number[]) => calls.viewports.push(a),
    setScissor: (...a: number[]) => calls.scissors.push(a),
    setScissorTest: (b: boolean) => { state.scissor = b; calls.scissorTests.push(b) },
    render: (scene: Scene, cam: Camera) => { calls.draws.push({ scene, cam }); calls.fogAtDraw.push((scene.fog as FogExp2 | null)?.density ?? null) },
    getClearColor: (c: Color) => c.copy(state.clearColour),
    getClearAlpha: () => state.clearAlpha,
    setClearColor: (c: Color | number, a = 1) => { state.clearColour = new Color(c); state.clearAlpha = a },
    clear: () => calls.clears.push({ colour: state.clearColour.getHexString(), alpha: state.clearAlpha, scissored: state.scissor,
      viewport: calls.viewports.at(-1) ?? [], afterDraws: calls.draws.length }),
    clearDepth: () => {},
  } as unknown as WebGLRenderer
  const view = new PerspectiveCamera(40, W / H, 0.05, 100)
  view.position.set(8, 8, 6)
  view.lookAt(0, 0, -8)
  view.updateMatrixWorld()
  const controls = new OrbitControls(view, canvas)
  const drawer = { draw: (scene: Scene, cam: Camera) => { calls.draws.push({ scene, cam }); calls.fogAtDraw.push((scene.fog as FogExp2 | null)?.density ?? null) } } as unknown as ViewDraw
  const panes = new Panes(r, view, controls, new Vector3(0.6, 0, -12.5), drawer)
  rigs.push({ panes, controls, host })
  return { panes, view, controls, calls, state, scene: new Scene(), canvas }
}

describe('panes: the split draw', () => {
  it('two panes on: side-by-side scissor rectangles, each its own camera, one scene throughout', () => {
    const { panes, view, calls, scene } = rig()
    panes.set(['camera', 'free'])
    expect(panes.draw(scene)).toBe(true)
    // the first viewport is the whole-canvas clear; the last restores the full frame
    expect(calls.viewports.slice(1, 3)).toEqual([[0, 0, 200, 250], [200, 0, 200, 250]])
    expect(calls.scissors.slice(0, 2)).toEqual(calls.viewports.slice(1, 3))
    expect(calls.scissorTests).toEqual([false, true, false])
    expect(calls.draws.length).toBe(2)
    expect(calls.draws.every((d) => d.scene === scene)).toBe(true) // every pane renders the same scene
    expect(calls.draws[0].cam).toBe(view) // the Camera pane is the view camera itself
    expect(calls.draws[1].cam).toBe(panes.free)
  })

  it('three panes on: the camera keeps the left half; free and top stack on the right', () => {
    const { panes, calls, scene } = rig()
    panes.set(['top', 'camera', 'free']) // the set order does not matter: the panes split in their own order
    expect(panes.draw(scene)).toBe(true)
    expect(calls.viewports.slice(1, 4)).toEqual([[0, 0, 200, 250], [200, 125, 200, 125], [200, 0, 200, 125]])
    expect(calls.draws.length).toBe(3)
    expect(calls.draws[2].cam).toBe(panes.top)
    expect(calls.draws[2].cam).toBeInstanceOf(OrthographicCamera)
    expect(calls.draws[1].cam).toBeInstanceOf(PerspectiveCamera)
  })

  it('one pane on (or none): no split — the caller draws the full frame as before, no viewport is touched', () => {
    const { panes, calls, scene } = rig()
    panes.set(['camera'])
    expect(panes.draw(scene)).toBe(false)
    panes.set([])
    expect(panes.draw(scene)).toBe(false) // none on reads as the camera
    expect(calls.viewports).toEqual([])
    expect(calls.scissors).toEqual([])
    expect(calls.draws).toEqual([])
  })

  it('Free or Top alone: the viewport draws through that pane\'s own camera, full frame (what a press is cast through)', () => {
    const { panes, calls, scene } = rig()
    panes.set(['free'])
    expect(panes.draw(scene)).toBe(true)
    expect(calls.viewports[1]).toEqual([0, 0, W, H])
    expect(calls.draws.map((d) => d.cam)).toEqual([panes.free])
    panes.set(['top'])
    expect(panes.draw(scene)).toBe(true)
    expect(calls.draws[1].cam).toBe(panes.top)
  })

  it('the bars around a fitted Camera pane are black every frame: one unscissored whole-canvas clear before any pane draws', () => {
    const { panes, calls, state, scene } = rig()
    panes.frameAspect = 2 // the camera's 400x250 slot fits a 400x200 picture: 25 px bars above and below
    panes.set(['camera'])
    expect(panes.rect('camera', W, H)).toEqual({ x: 0, y: 25, w: 400, h: 200 }) // with no clear, the 25 px bands kept old frames
    for (const on of [['camera'], ['camera', 'free']] as const) {
      calls.clears.length = 0; calls.draws.length = 0
      panes.set(on)
      expect(panes.draw(scene)).toBe(true)
      expect(calls.clears[0]).toEqual({ colour: '000000', alpha: 1, scissored: false, viewport: [0, 0, W, H], afterDraws: 0 })
      expect(state.clearColour.getHexString()).toBe('1c1d21') // the renderer's own clear colour is put back
    }
  })

  it('slot and focused: each pane has its own frame on the page; the last press picks the pane whose controls answer', () => {
    const { panes, canvas } = rig()
    panes.frameAspect = 2
    panes.set(['camera', 'free'])
    expect(panes.slot('camera', W, H)).toEqual({ x: 0, y: 0, w: 200, h: 250 }) // the whole slot, bars included
    expect(panes.rect('camera', W, H)).toEqual({ x: 0, y: 75, w: 200, h: 100 }) // the picture inside it
    expect(panes.slot('top', W, H)).toBeNull()
    expect(panes.focused).toBe('camera')
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 125, button: 0 })
    expect(panes.focused).toBe('free')
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 125 }) // a hover is not a press
    expect(panes.focused).toBe('free')
    panes.set(['camera'])
    expect(panes.focused).toBe('camera') // the pressed pane is off: the first one on
  })

  it('cameraNdc: only a point in the Camera pane maps (to that pane\'s own frame); Free, Top and outside give none', () => {
    const { panes } = rig()
    panes.set(['camera', 'free'])
    expect(panes.cameraNdc(100, 125)).toMatchObject({ x: 0, y: 0 }) // the middle of the left half
    expect(panes.cameraNdc(300, 125)).toBeNull() // the Free pane
    panes.set(['free'])
    expect(panes.cameraNdc(200, 125)).toBeNull() // no Camera pane at all
    panes.set(['camera'])
    expect(panes.cameraNdc(W / 2, H / 2)).toMatchObject({ x: 0, y: 0 })
  })

  it('the Free view thins the fog for its own draw only; the scene keeps the plan\'s density for every capture', () => {
    const { panes, calls, scene } = rig()
    const fog = new FogExp2(0x8b8f96, 0.012) // the planner's density, what the clay frames (draw and render inputs) read
    scene.fog = fog
    panes.set(['camera', 'free'])
    expect(panes.draw(scene)).toBe(true)
    expect(calls.fogAtDraw).toEqual([0.012, 0.012 * FREE_FOG]) // the camera's draw keeps it; the Free view reads it thinned
    expect(fog.density).toBe(0.012) // restored: the fog object a capture renders is exactly the plan's
    panes.set(['free'])
    panes.draw(scene)
    expect(calls.fogAtDraw[2]).toBe(0.012 * FREE_FOG) // the Free view alone is thinned too
    expect(fog.density).toBe(0.012)
  })

  it('puts nothing into the scene: the panes, their draws and their steering leave it exactly as it was', () => {
    const { panes, scene, canvas, controls } = rig()
    const before = [...scene.children]
    panes.set(['camera', 'free', 'top'])
    panes.draw(scene)
    panes.rayAt(300, 125)
    panes.project('top', new Vector3())
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 125, button: 0 })
    fireEvent.pointerMove(canvas, { clientX: 310, clientY: 130 })
    expect([...scene.children]).toEqual(before)
    panes.setDriver(true) // the operator owns the camera: the steering stands down
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 125, button: 0 }) // over the camera's half
    expect(controls.enabled).toBe(false) // the gate left it with the driver
  })
})

describe('panes: the operator drives the Camera pane only (L1)', () => {
  it('with the driver on, the Free pane still arms, orbits with a drag and zooms with the wheel', () => {
    const { panes, canvas } = rig()
    panes.set(['camera', 'free'])
    panes.setDriver(true) // the operator flies the Camera pane; the Free view stays the arranging owner's
    const freeRect = panes.rect('free', W, H)!
    const freePt = { clientX: freeRect.x + freeRect.w / 2, clientY: freeRect.y + freeRect.h / 2 }
    fireEvent.pointerMove(canvas, freePt) // the gate arms the pane under the pointer
    expect(panes.freeControls.enabled).toBe(true)
    const q0 = panes.free.quaternion.clone()
    const d0 = panes.free.position.distanceTo(panes.freeControls.target)
    fireEvent.pointerDown(canvas, { ...freePt, button: 0, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: freePt.clientX + 30, clientY: freePt.clientY + 8, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: freePt.clientX + 30, clientY: freePt.clientY + 8, pointerId: 1 })
    expect(panes.free.quaternion.angleTo(q0)).toBeGreaterThan(0.0001) // the drag reached the orbit
    fireEvent.wheel(canvas, { ...freePt, deltaY: -100 })
    expect(panes.free.position.distanceTo(panes.freeControls.target)).toBeLessThan(d0) // the wheel zooms in
  })

  it('with the driver on, the Top View still pans with a drag and zooms with the wheel', () => {
    const { panes, canvas } = rig()
    panes.set(['camera', 'top'])
    panes.setDriver(true)
    const topRect = panes.rect('top', W, H)!
    const topPt = { clientX: topRect.x + topRect.w / 2, clientY: topRect.y + topRect.h / 2 }
    const x0 = panes.top.position.x
    fireEvent.pointerDown(canvas, { ...topPt, button: 0, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: topPt.clientX + 10, clientY: topPt.clientY, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: topPt.clientX + 10, clientY: topPt.clientY, pointerId: 1 })
    expect(panes.top.position.x).toBeCloseTo(x0 - 10 * ((2 * 14) / H), 3) // the drag pans the plan
    const half0 = panes.top.top
    fireEvent.wheel(canvas, { ...topPt, deltaY: -100 })
    expect(panes.top.top).toBeCloseTo(half0 / 1.15, 3) // the wheel zooms the plan
    expect(panes.freeControls.enabled).toBe(false) // the camera pane's press armed nothing else
  })
})

describe('panes: a press belongs to the pane under it', () => {
  it('a ray maps through the pane under the point: the top pane’s centre ray points straight down', () => {
    const { panes, canvas } = rig()
    panes.set(['camera', 'top'])
    const ray = panes.rayAt(300, 125).ray
    expect(ray.direction.x).toBeCloseTo(0, 5)
    expect(ray.direction.y).toBeCloseTo(-1, 5)
    expect(ray.direction.z).toBeCloseTo(0, 5)
    expect(ray.origin.y).toBeCloseTo(80, 5) // the ortho camera's height over the ground
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 125, button: 0 }) // the camera pane meanwhile
    expect(panes.rayAt(50, 125).ray.direction.y).toBeGreaterThan(-0.9) // a perspective ray, not the top's
  })

  it('the gate arms the pane under the press and disarms the others', () => {
    const { panes, controls, canvas } = rig()
    panes.set(['camera', 'free', 'top'])
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 125, button: 0 }) // the camera's half
    expect(controls.enabled).toBe(true)
    expect(panes.freeControls.enabled).toBe(false)
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 60 }) // the free pane, top right
    expect(controls.enabled).toBe(false)
    expect(panes.freeControls.enabled).toBe(true)
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 200 }) // the top view, bottom right
    expect(controls.enabled).toBe(false)
    expect(panes.freeControls.enabled).toBe(false)
  })

  it('the top view pans with a drag and zooms with the wheel, only over its own rectangle', () => {
    const { panes, canvas } = rig()
    panes.set(['camera', 'top'])
    const x0 = panes.top.position.x
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 125, button: 0 })
    fireEvent.pointerMove(canvas, { clientX: 310, clientY: 125 })
    expect(panes.top.position.x).toBeCloseTo(x0 - 10 * ((2 * 14) / H), 3) // dragged right: the target rides left
    fireEvent.pointerUp(canvas, { clientX: 310, clientY: 125 })
    const half0 = panes.top.top
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 300, clientY: 125 })
    expect(panes.top.top).toBeCloseTo(half0 / 1.15, 3) // wheel up: closer in
    const afterZoom = panes.top.top
    fireEvent.wheel(canvas, { deltaY: 100, clientX: 50, clientY: 125 }) // over the camera's half: no zoom
    expect(panes.top.top).toBe(afterZoom)
  })
})


describe('withFreeFog: the Free view\'s fog thinning', () => {
  it('thins a FogExp2 for the draw and puts the plan\'s density back, even when the draw throws', () => {
    const scene = new Scene()
    scene.fog = new FogExp2(0x8b8f96, 0.02)
    let seen = 0
    withFreeFog(scene, () => { seen = (scene.fog as FogExp2).density })
    expect(seen).toBe(0.02 * FREE_FOG)
    expect((scene.fog as FogExp2).density).toBe(0.02)
    expect(() => withFreeFog(scene, () => { throw new Error('draw failed') })).toThrow('draw failed')
    expect((scene.fog as FogExp2).density).toBe(0.02) // a failed draw still leaves the plan's fog
  })

  it('leaves a fogless scene alone', () => {
    const scene = new Scene()
    let ran = false
    withFreeFog(scene, () => { ran = true })
    expect(ran).toBe(true)
    expect(scene.fog).toBeNull()
  })
})
