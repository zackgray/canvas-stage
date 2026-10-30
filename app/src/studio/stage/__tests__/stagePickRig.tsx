// The pick-and-drag rig (split out of stagePickDrag.test.tsx so the path-drawing tests share it): a real kit world on a fake
// canvas (no WebGL; raycasting runs in jsdom) with a real Panes, and the pointer helpers that press, drag and click through it.
import { fireEvent, screen } from '@testing-library/react'
import { BoxHelper, PerspectiveCamera, Raycaster, Vector2, Vector3, type Object3D, type WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { expect, vi } from 'vitest'
import type { Stage } from '../../../labs/projection/engine/Stage'
import { Panes } from '../../../labs/projection/engine/panes'
import type { ViewDraw } from '../../../labs/projection/engine/viewDraw'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { buildWorld } from '../../../stage3d/world'
import { KitLayer } from '../../../labs/projection/stage3d/KitLayer'
import type { PlaceApi } from '../../scene/setPlaceApi'
import { useStagePick } from '../useStagePick'
import { CH, CW, ID, plan, world0 } from './liveFakes'

/** every rig's kit layers (a test that builds a second layer pushes it here so disposeRig frees it) */
export const layers: KitLayer[] = []
const hosts: HTMLElement[] = []
const gears: { panes: Panes; controls: OrbitControls }[] = []
/** each test's cleanup: the layers, hosts and orbit gear the rigs made */
export function disposeRig() {
  while (layers.length) layers.pop()!.dispose()
  while (hosts.length) hosts.pop()!.remove()
  while (gears.length) { const g = gears.pop()!; g.panes.dispose(); g.controls.dispose() }
  vi.restoreAllMocks()
}

export type Pt = { clientX: number; clientY: number }

/** the lab slice around one real kit layer and a bare camera standing in for the stage, its real panes on the fake canvas */
export function stageLab(mode: 'orbit' | 'operator' = 'orbit') {
  const canvas = document.createElement('canvas')
  canvas.setPointerCapture = vi.fn() // jsdom has none; OrbitControls calls it unconditionally
  canvas.releasePointerCapture = vi.fn()
  Object.defineProperty(canvas, 'clientWidth', { value: CW, configurable: true }) // OrbitControls divides a drag by it
  Object.defineProperty(canvas, 'clientHeight', { value: CH, configurable: true })
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: CW, height: CH, right: CW, bottom: CH, x: 0, y: 0 } as DOMRect)
  const host = document.createElement('div')
  host.appendChild(canvas)
  document.body.appendChild(host)
  hosts.push(host)
  const view = new PerspectiveCamera(45, CW / CH, 0.05, 3000)
  view.position.set(8.6, 8, -1.5)
  view.lookAt(0.6, 0, -12.5)
  view.updateMatrixWorld()
  const controls = new OrbitControls(view, canvas)
  controls.target.set(0.6, 0, -12.5) // where the fake view looks: a fresh OrbitControls aims the camera at the origin
  controls.update()
  const panes = new Panes({ domElement: canvas } as unknown as WebGLRenderer, view, controls, new Vector3(0.6, 0, -12.5),
    { draw: vi.fn() } as unknown as ViewDraw)
  gears.push({ panes, controls })
  const stage = { renderer: { domElement: canvas }, view, panes } as unknown as Stage
  const layer = new KitLayer(buildWorld(plan), ID, plan, world0.perf)
  layers.push(layer)
  const lab = { stage, kit: { id: ID, world: world0, layer, perf: world0.perf, error: null }, op: { mode } } as unknown as ProjectionLabState
  return { lab, host, canvas, view, layer, panes }
}
export const api = (): PlaceApi => ({ edit: vi.fn(async () => {}), add: vi.fn(async () => {}), mark: vi.fn(async () => {}), move: vi.fn(async () => {}), swap: vi.fn(async () => {}) })

export function Host({ lab, api }: { lab: ProjectionLabState; api: PlaceApi }) {
  useStagePick(lab, api)
  return null
}

export const toScreen = (cam: PerspectiveCamera, p: Vector3): Pt => {
  cam.updateMatrixWorld()
  const c = p.clone().project(cam)
  return { clientX: ((c.x + 1) / 2) * CW, clientY: ((1 - c.y) / 2) * CH }
}
/** where a world point shows on the canvas, and the ray through a canvas point (what a press there casts) */
export const screenOf = (view: PerspectiveCamera, p: Vector3): Pt => toScreen(view, p)
export const rayThrough = (view: PerspectiveCamera, at: Pt): Raycaster => {
  const ray = new Raycaster()
  ray.setFromCamera(new Vector2((at.clientX / CW) * 2 - 1, -(at.clientY / CH) * 2 + 1), view)
  return ray
}
export const press = (canvas: Element, at: Pt) => fireEvent.pointerDown(canvas, { ...at, button: 0, pointerId: 1 })
export const moveTo = (canvas: Element, at: Pt) => fireEvent.pointerMove(canvas, { ...at, pointerId: 1 })
export const letGo = (canvas: Element, at: Pt) => fireEvent.pointerUp(canvas, { ...at, pointerId: 1 })
export const clickAt = (canvas: Element, at: Pt) => { press(canvas, at); letGo(canvas, at); fireEvent.click(canvas, { ...at }) }

/** grab a pick's middle and drag it by (dx, dz) world metres, keeping the grabbed spot under the pointer (it rides the terrain) */
export function dragBy(view: PerspectiveCamera, layer: KitLayer, canvas: Element, root: Object3D, at: Vector3, dx: number, dz: number) {
  const from = screenOf(view, at)
  const hit = rayThrough(view, from).intersectObject(root, true)[0]
  expect(hit).toBeTruthy()
  const H = layer.groundAt
  const to = toScreen(view, hit.point.clone().add(new Vector3(dx, H(at.x + dx, at.z + dz) - H(at.x, at.z), dz)))
  press(canvas, from)
  moveTo(canvas, to)
  return to
}

export const CRATES = new Vector3(3, plan.kit[0].lift ?? 0, -9) // its middle sits on the ground there
export const piece = (layer: KitLayer, i: number) => layer.group.children.find((c) => c.userData.kitIndex === i)!
export const isBoxed = (layer: KitLayer) => layer.group.children.some((c) => c instanceof BoxHelper)

/** the hook with its pick and open menu shown, and the menu's presses driven, as the Stage shell wires them */
export function Probe({ lab, api }: { lab: ProjectionLabState; api: PlaceApi }) {
  const s = useStagePick(lab, api)
  return (
    <div>
      <div data-testid="probe-pick">{JSON.stringify(s.pick)}</div>
      <div data-testid="probe-menu">{JSON.stringify(s.menu)}</div>
      <div data-testid="probe-tool">{JSON.stringify(s.tool)}</div>
      {([{ do: 'duplicate' }, { do: 'delete' }, { do: 'add', kind: 'piece' }, { do: 'swap', kind: 'table' }, { do: 'close' }] as const).map((k, i) => (
        <button key={i} type="button" data-testid={`probe-${k.do === 'add' ? 'piece' : k.do}`} onClick={() => s.choose(k)}>{k.do}</button>
      ))}
    </div>
  )
}
export const pickOf = () => JSON.parse(screen.getByTestId('probe-pick').textContent || 'null') as { t: string; index?: number } | null
export const menuOf = () => JSON.parse(screen.getByTestId('probe-menu').textContent || 'null') as { at: [number, number]; kind: string | null; person?: boolean; piece?: { index: number; swap: boolean } } | null
/** where a ground point shows on the canvas, for a right-click or an armed press */
export const groundPt = (lab: ProjectionLabState, layer: KitLayer, x: number, z: number) =>
  screenOf(lab.stage!.view as PerspectiveCamera, new Vector3(x, layer.groundAt(x, z), z))
