// Pure builders for the Surround far layer (no three.js objects, so the suite runs them without WebGL): the panorama +
// its distance as a mesh around the still's camera, and the sky-only dome texture. Port of experiments/e46_layer.py
// (pano_mesh, dome_world). Frame and equirect conventions: server/surround/equirect.ts.
import { levelBasis, toCam, uvToDir } from '../../../../server/surround/equirect.ts'
import type { Vec3 } from '../../../../server/surround/types.ts'

export interface FarGeometry { position: Float32Array; uv: Float32Array; index: Uint32Array; cols: number; rows: number }
export interface FarOptions {
  /** texels per grid cell (default 4: 513 x 257 vertices for 2048 x 1024) */
  step?: number
  /** cut a quad only at a distance jump bigger than this ratio or at the sky edge; smaller jumps stretch (default 3) */
  edge?: number
  /** no sky to draw: never cut, so the mesh covers everything and no dome is needed */
  interior?: boolean
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 5 }

/**
 * Far mesh in the still's camera space. `dist` = metres along each ray (row-major, top row first, 0 = sky). The grid has
 * w/step + 1 columns (u = 0 and u = 1 share positions) so the texture wraps without a seam.
 */
export function buildFarGeometry(dist: Float32Array, w: number, h: number, up: Vec3, o: FarOptions = {}): FarGeometry {
  const step = o.step ?? 4
  const edge = o.interior ? Infinity : o.edge ?? 3
  const cols = Math.floor(w / step) + 1
  const rows = Math.floor(h / step) + 1
  const R = levelBasis(up)
  const fill = o.interior ? median(Array.from({ length: Math.ceil(dist.length / 97) }, (_, i) => dist[i * 97]).filter((d) => d > 0)) : 0
  const d = new Float32Array(rows * cols)
  const solid = new Uint8Array(rows * cols)
  const position = new Float32Array(rows * cols * 3)
  const uv = new Float32Array(rows * cols * 2)
  const at = (x: number, y: number) => dist[Math.min(h - 1, Math.max(0, y)) * w + (((x % w) + w) % w)]
  for (let r = 0; r < rows; r++) {
    const v = Math.min(r * step, h) / h
    const yi = Math.min(h - 1, Math.floor(v * h))
    for (let c = 0; c < cols; c++) {
      const u = Math.min(c * step, w) / w
      const xi = Math.min(w - 1, Math.floor(u * w))
      const i = r * cols + c
      let dv = at(xi, yi)
      // a vertex next to the sky edge is not solid (the dome shows there, not a stretched sliver)
      const ok = dv > 0 && at(xi - 1, yi) > 0 && at(xi + 1, yi) > 0 && at(xi, yi - 1) > 0 && at(xi, yi + 1) > 0
      if (o.interior && !(dv > 0)) dv = fill
      d[i] = dv
      solid[i] = o.interior || ok ? 1 : 0
      const p = toCam(R, uvToDir(u, v).map((x) => x * dv) as Vec3)
      position.set(p, i * 3)
      uv[i * 2] = u
      uv[i * 2 + 1] = v
    }
  }
  const tris: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, cc = a + cols, e = cc + 1
      if (!(solid[a] && solid[b] && solid[cc] && solid[e])) continue
      const mx = Math.max(d[a], d[b], d[cc], d[e])
      const mn = Math.min(d[a], d[b], d[cc], d[e])
      if (mx / Math.max(mn, 1e-6) > edge) continue
      tris.push(a, cc, b, b, cc, e)
    }
  }
  return { position, uv, index: Uint32Array.from(tris), cols, rows }
}

/** RGB or RGBA samples -> opaque RGBA. */
export function rgbaOf(rgb: Uint8Array, channels: 3 | 4, texels: number): Uint8Array {
  const out = new Uint8Array(texels * 4)
  for (let i = 0; i < texels; i++) {
    out[i * 4] = rgb[i * channels]; out[i * 4 + 1] = rgb[i * channels + 1]; out[i * 4 + 2] = rgb[i * channels + 2]; out[i * 4 + 3] = 255
  }
  return out
}

/**
 * The sky-only dome texture (RGBA, w x h, level-frame equirect): objects above the horizon are replaced by the sky colour
 * just above them, so a gap in the far mesh round a tree shows sky, not a second copy of the tree at infinity; below the
 * horizon the pano colour stays. `rgb` is 3 or 4 channels per texel.
 */
export function buildDomeTexture(rgb: Uint8Array, channels: 3 | 4, dist: Float32Array, w: number, h: number): Uint8Array {
  const out = rgbaOf(rgb, channels, w * h)
  const h0 = h >> 1
  for (let x = 0; x < w; x++) {
    let lastSky = -1
    for (let y = 0; y < h0; y++) {
      if (dist[y * w + x] === 0) { lastSky = y; continue }
      if (lastSky < 0) continue
      const s = (lastSky * w + x) * 4, t = (y * w + x) * 4
      out[t] = out[s]; out[t + 1] = out[s + 1]; out[t + 2] = out[s + 2]
    }
  }
  return out
}

/** 16-bit PNG samples -> metres along the ray (0 stays 0 = sky). */
export function distanceMetres(values: Uint8Array | Uint16Array, metersPerUnit: number): Float32Array {
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = values[i] * metersPerUnit
  return out
}
