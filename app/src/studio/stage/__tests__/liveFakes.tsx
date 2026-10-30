// Fakes for the Set's live split view (set viewport): a renderer with no WebGL (three's scene, cameras and raycasting run in jsdom;
// only the draw is faked), a small plan, and where a piece shows on a pane's canvas, so a test clicks and drags it as a user would.
import { fireEvent } from '@testing-library/react'
import { Box3, Vector3, type Object3D, type PerspectiveCamera, type Scene } from 'three'
import { vi } from 'vitest'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import type { ScenePlan } from '../../../stage3d/contract'
import type { SetPick } from '../../scene/live/liveSet'

/** the part of a WebGLRenderer a pane draws with (jsdom has no WebGL) */
export interface PaneRenderer {
  readonly domElement: HTMLCanvasElement
  shadowMap: { enabled: boolean; type: number }
  setPixelRatio(r: number): void
  setSize(w: number, h: number, style?: boolean): void
  render(scene: Scene, camera: PerspectiveCamera): void
  dispose(): void
  forceContextLoss?(): void
}
/** the part of a pane view screenOf reads: its camera and the shown set's objects */
export interface LiveView { camera: PerspectiveCamera; readonly shown: { objectOf(p: SetPick): Object3D | null } | null }

export const ID = 'loc-2026-10-25T11-00-00-000'
export const CW = 400, CH = 250
export const plan: ScenePlan = { seed: 1, flat: [-3, -16, 3, 8], sky: { url: '/lab-assets/sky/procedural' }, mark: { at: [0.6, -12.5], yawDeg: 0 }, kit: [
  { kind: 'crates', args: [1, 1], at: [3, -9], label: 'white-painted hive', pieceTag: 'prop:hive' },
  { kind: 'tree', at: [-6, -16] },
] }
export const world0: KitWorld = { id: ID, description: 'd', plan, perf: { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8 }, still: null, createdAt: '' }

/** a renderer that records its draws; its canvas sits at 0,0 and is CW x CH on the page */
export function fakeRenderer(): PaneRenderer {
  const domElement = document.createElement('canvas')
  vi.spyOn(domElement, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: CW, height: CH, right: CW, bottom: CH, x: 0, y: 0 } as DOMRect)
  return { domElement, shadowMap: { enabled: false, type: 0 }, setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn<PaneRenderer['render']>(), dispose: vi.fn() }
}

/** where a pick's middle lands on a pane's canvas */
export function screenOf(v: LiveView, p: SetPick): { clientX: number; clientY: number } {
  const o = v.shown!.objectOf(p)!
  o.updateMatrixWorld(true)
  const c = new Box3().setFromObject(o).getCenter(new Vector3()).project(v.camera)
  return { clientX: ((c.x + 1) / 2) * CW, clientY: ((1 - c.y) / 2) * CH }
}

/** press, move and let go on a pane, as a pointer does */
export function dragOn(host: Element, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }, release = true) {
  fireEvent.pointerDown(host, { ...from, button: 0, pointerId: 1 })
  fireEvent.pointerMove(host, { ...to, pointerId: 1 })
  if (release) fireEvent.pointerUp(host, { ...to, pointerId: 1 })
}

export const clickOn = (host: Element, at: { clientX: number; clientY: number }) => dragOn(host, at, at)
