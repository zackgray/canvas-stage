// The kit capture (openKitCapture, the kit clay frames, the hero opening's kit path, the ID pass) renders the one lab
// scene, which since the Stage merge holds the pick overlays: the grey stand-in at the mark and the pick's box
// (stage3d/kitPick.ts). No overlay may reach a frame; each comes back visible after the grab. Three's WebGLRenderer is
// faked (no GL anywhere in the tests; the recorder pattern the engine tests use): every render records the overlays'
// visibility. The encode pool finds no Worker here and encodes on the main thread (encodePool.ts' own fallback), so the
// file runs in Node's environment (its Blob streams, jsdom's does not) with just the one DOM call openKitCapture makes
// stubbed.
import { Group, PerspectiveCamera, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { markFigure } from '../stage3d/markFigure'
import { KIT_PICK_BOX_NAME } from '../stage3d/kitPick'
import { openKitCapture } from './kitCapture'
import type { Stage } from '../engine/Stage'
import type { WarpFrame } from '../performance/warpPlan'

vi.stubGlobal('document', { createElement: (tag: string) => ({ tag }) })

const hoisted = vi.hoisted(() => ({
  renders: [] as { fig: boolean | null; box: boolean | null }[],
  figure: null as { visible: boolean } | null,
  box: null as { visible: boolean } | null,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  /** the slice of WebGLRenderer the capture drives: records each draw's overlay visibility, zero-fills the read-backs */
  class FakeRenderer {
    autoClear = true
    shadowMap = { enabled: false, type: 0 as number }
    toneMapping = 0 as number
    toneMappingExposure = 1
    outputColorSpace = '' as string
    private target: unknown = null
    setPixelRatio() {}
    setSize() {}
    getContext() {
      return { RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, readPixels: (_x: number, _y: number, _w: number, _h: number, _f: unknown, _t: unknown, px: Uint8Array) => px.fill(0) }
    }
    getRenderTarget() { return this.target }
    setRenderTarget(t: unknown) { this.target = t }
    clear() {}
    render() {
      hoisted.renders.push({ fig: hoisted.figure?.visible ?? null, box: hoisted.box?.visible ?? null })
    }
    readRenderTargetPixels(_rt: unknown, _x: number, _y: number, _w: number, _h: number, px: Uint8Array) { px.fill(0) }
    readRenderTargetPixelsAsync(_rt: unknown, _x: number, _y: number, _w: number, _h: number, px: Uint8Array) { return Promise.resolve(px) }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer as unknown as typeof actual.WebGLRenderer }
})

const frame: WarpFrame = { i: 0, t: 0, takeT: 0, position: [0, 1, 6], quaternion: [0, 0, 0, 1], focal: 30, vfovDeg: 40 }

/** the lab scene with the pick overlays in it, on the fake-stage slice grab and idFrame read */
function rig() {
  const scene = new Scene()
  const figure = markFigure({ flat: [-3, -16, 3, 8], mark: { at: [0, 0], yawDeg: 0 } }, () => 0, { front: true })
  const box = new Group(); box.name = KIT_PICK_BOX_NAME
  scene.add(figure, box)
  hoisted.figure = figure; hoisted.box = box
  const view = new PerspectiveCamera(40, 8 / 6, 0.1, 100)
  const stage = { view, scene, offscreenAt: (_t: number, fn: () => unknown) => fn() } as unknown as Stage
  return { stage, figure, box }
}

describe('openKitCapture: the pick overlays never reach a frame', () => {
  it('grab draws the colour and the depth with the overlays hidden and puts them back', async () => {
    const { stage, figure, box } = rig()
    const cap = openKitCapture(8, 6)
    try {
      const g = cap.grab!(stage, frame, undefined)
      const png = await g.png
      const z = await g.z!
      expect(png.length).toBeGreaterThan(0)
      expect(z.length).toBeGreaterThan(0)
      expect(hoisted.renders.length).toBeGreaterThan(0) // the colour draw, the depth draw, the packing quad
      expect(hoisted.renders.every((r) => r.fig === false && r.box === false)).toBe(true)
      expect(figure.visible).toBe(true)
      expect(box.visible).toBe(true)
    } finally {
      cap.dispose()
    }
  })

  it('idFrame draws the ID pass with the overlays hidden and puts them back', async () => {
    const { stage, figure, box } = rig()
    const cap = openKitCapture(8, 6)
    try {
      const id = await cap.idFrame!(stage, frame, undefined)
      expect(id.png.length).toBeGreaterThan(0)
      expect(hoisted.renders.length).toBeGreaterThan(0)
      expect(hoisted.renders.every((r) => r.fig === false && r.box === false)).toBe(true)
      expect(figure.visible).toBe(true)
      expect(box.visible).toBe(true)
    } finally {
      cap.dispose()
    }
  })
})
