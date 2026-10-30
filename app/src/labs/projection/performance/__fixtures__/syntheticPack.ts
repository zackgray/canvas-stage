// Test-only: a synthetic performance pack — a striped "figure" (torso at ~5 m, an arm 12 % nearer, so the depth edge
// between them must cut) sliding left to right in front of the lab's default projector. Colour, 16-bit planar depth
// and mask per frame, exactly as a lifted pack carries them. writePack.ts writes it under public/ for a browser check.
import { PerspectiveCamera, Vector3 } from 'three'
import type { PngImage } from '../../math/png'
import type { PerformancePack } from '../../../../project/performance'

export const MPU = 0.0005

export function syntheticPack(over: Partial<PerformancePack> = {}): PerformancePack {
  const cam = new PerspectiveCamera(40, 16 / 9)
  cam.position.set(0, 1.6, 0)
  cam.lookAt(new Vector3(0, 1.0, -8))
  return {
    id: 'synthetic-box', label: 'Synthetic box', locationId: 'synthetic', fps: 12, frames: 12, width: 160, height: 90,
    source: { vfovDeg: 40, aspect: 16 / 9, position: [0, 1.6, 0], quaternion: cam.quaternion.toArray() as [number, number, number, number] },
    depth: { encoding: 'planar-metres-16bit', metersPerUnit: MPU },
    files: { color: 'frames/color_%03d.png', depth: 'frames/depth_%03d.png', mask: 'frames/mask_%03d.png' },
    sourceClip: 'source.mp4', background: 'background.png', prompt: 'Crossview. A striped box slides across the test set.',
    ...over,
  }
}

export type Part = 'torso' | 'arm' | null

/** What covers pixel (x, y) in frame i, with its planar depth (m) and colour. */
export function actorAt(p: PerformancePack, i: number, x: number, y: number): { part: Part; depth: number; rgb: [number, number, number] } {
  const sx = p.width / 160, sy = p.height / 90
  const ox = (20 + i * 8) * sx
  const torso = x >= ox && x < ox + 30 * sx && y >= 30 * sy && y < 75 * sy
  const arm = x >= ox + 26 * sx && x < ox + 42 * sx && y >= 40 * sy && y < 48 * sy
  if (arm) return { part: 'arm', depth: 4.4, rgb: [240, 180, 30] }
  if (torso) {
    const stripe = Math.floor((x - ox) / (3 * sx)) % 2
    return { part: 'torso', depth: 5 + 0.002 * y, rgb: stripe ? [200, 60, (40 + y) & 255] : [40, 90, (120 + 2 * x) & 255] }
  }
  return { part: null, depth: 0, rgb: [120, 130, 140] }
}

export function syntheticFrame(p: PerformancePack, i: number): { color: PngImage; depth: PngImage; mask: PngImage } {
  const { width: W, height: H } = p
  const color = new Uint8Array(W * H * 3), depth = new Uint16Array(W * H), mask = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x, a = actorAt(p, i, x, y)
    color.set(a.rgb, k * 3)
    depth[k] = a.part ? Math.round(a.depth / MPU) : 0
    mask[k] = a.part ? 255 : 0
  }
  return {
    color: { width: W, height: H, channels: 3, bitDepth: 8, data: color },
    depth: { width: W, height: H, channels: 1, bitDepth: 16, data: depth },
    mask: { width: W, height: H, channels: 1, bitDepth: 8, data: mask },
  }
}
