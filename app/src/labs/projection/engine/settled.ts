import { BufferAttribute, BufferGeometry, Mesh, PerspectiveCamera, Quaternion, Vector3, type Texture } from 'three'
import { toRad } from '../math/camera'
import { sharpenEdges } from '../math/filters'
import { fitFromMeta, refuseFit, type SettledAlignment } from '../math/fitGate'
import { buildGrid, type GridOptions } from '../math/grid'
import { holeOnlyDepth, maskFromGrey } from '../math/settle'
import { createProjectionMaterial } from './materials'
import { loadDepthImage, loadStill } from './sources'

// A settled view: an off-angle frame whose holes were inpainted, given its own (aligned, metric) depth, and added
// back to the set as another projector. Written by experiments/e3_process.ts into
// /lab-assets/renders/<view>/settled-<model>/{color.png, depth.png, mask.png, meta.json}.

/** Hole-mask growth (px) so a settled patch overlaps the existing set at its seam. */
export const SEAM_GROW = 3
/** How much farther (fraction of view depth) a settled patch is drawn, so the original wins where both exist. */
export const PUSH_BACK = 0.02

export interface SettledMeta {
  view: string
  /** the set's "<shot>#<depth model>" (written since the gate moved client-side; older folders: the view's meta) */
  source?: string
  inpaint: string
  width: number
  height: number
  camera: { position: number[]; quaternion: number[]; vfovDeg: number; aspect: number }
  depth: { metersPerUnit: number }
  alignment: SettledAlignment
}

export interface SettledView {
  folder: string
  meta: SettledMeta
  texture: Texture
  /** planar metres, top row first; NaN = invalid */
  depth: Float32Array
  /** 1 = was a hole in the exported view */
  holes: Uint8Array
}

/** Folder relative to /lab-assets/renders/, e.g. "view-2026-10-17T19-40-10/settled-klein". */
export const validFolder = (f: string) => /^[\w\-./]+$/.test(f) && !f.split('/').some((p) => p === '..' || p === '')

/** The set's source for the gate: the settled meta's own, else the exported view's meta one folder up. */
async function sourceOf(folder: string, meta: SettledMeta): Promise<string | undefined> {
  if (meta.source) return meta.source
  const view = folder.split('/').slice(0, -1).join('/')
  if (!view) return undefined
  try {
    const res = await fetch(`/lab-assets/renders/${view}/meta.json`, { cache: 'no-store' })
    return res.ok ? ((await res.json()) as { source?: string }).source : undefined
  } catch { return undefined }
}

/** Loads a settled folder; one whose recorded fit fails the settle server's own gate is refused (throws, naming why). */
export async function loadSettledView(folder: string): Promise<SettledView> {
  if (!validFolder(folder)) throw new Error(`bad folder "${folder}"`)
  const base = `/lab-assets/renders/${folder}`
  const res = await fetch(`${base}/meta.json`, { cache: 'no-store' })
  const text = res.ok ? await res.text() : ''
  let meta: SettledMeta
  try { meta = JSON.parse(text) as SettledMeta } catch { throw new Error(`${base}/meta.json: HTTP ${res.status}, not a JSON file`) }
  if (!meta.camera || !meta.depth?.metersPerUnit) throw new Error(`${base}/meta.json is not a settled view`)
  const refusal = refuseFit(fitFromMeta(meta.alignment), await sourceOf(folder, meta))
  if (refusal) throw new Error(`${folder} refused (its depth fit would misplace the layer): ${refusal}`)
  const [texture, depthImg, maskImg] = await Promise.all([
    loadStill(`${base}/color.png`), loadDepthImage(`${base}/depth.png`), loadDepthImage(`${base}/mask.png`),
  ])
  if (depthImg.bits !== 16) throw new Error('settled depth must be 16-bit')
  const full = meta.depth.metersPerUnit * 65535
  const depth = new Float32Array(depthImg.values.length)
  for (let i = 0; i < depth.length; i++) depth[i] = depthImg.values[i] > 0 ? depthImg.values[i] * full : NaN
  return { folder, meta, texture, depth, holes: maskFromGrey(maskImg.values) }
}

/** One extra projector in the stack: its own camera at the settled view's pose, meshed only in its holes. */
export class ProjectorLayer {
  readonly camera: PerspectiveCamera
  readonly mesh: Mesh
  readonly view: SettledView
  readonly triangles: number

  /** `sharpen`: the same soft-edge snapping radius (px) as the original projector, so MoGe's soft silhouettes cut */
  constructor(view: SettledView, grid: GridOptions, sharpen: number) {
    const { meta } = view
    this.view = view
    this.camera = new PerspectiveCamera(meta.camera.vfovDeg, meta.camera.aspect, 0.02, 2000)
    this.camera.position.copy(new Vector3().fromArray(meta.camera.position))
    this.camera.quaternion.copy(new Quaternion().fromArray(meta.camera.quaternion))
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
    const k = { width: meta.width, height: meta.height, vfov: toRad(meta.camera.vfovDeg) }
    const snapped = sharpenEdges(view.depth, meta.width, meta.height, sharpen, grid.edgeThreshold)
    const g = buildGrid(k, holeOnlyDepth(snapped, view.holes, meta.width, meta.height, SEAM_GROW), grid)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(g.positions, 3))
    geo.setAttribute('uv', new BufferAttribute(g.uvs, 2))
    geo.setIndex(new BufferAttribute(g.indices, 1))
    const material = createProjectionMaterial(this.camera.projectionMatrix, PUSH_BACK)
    material.uniforms.map.value = view.texture
    this.mesh = new Mesh(geo, material)
    this.mesh.frustumCulled = false
    this.camera.add(this.mesh)
    this.triangles = g.trianglesKept
  }

  dispose() {
    this.camera.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as { dispose(): void }).dispose()
    this.view.texture.dispose()
  }
}
