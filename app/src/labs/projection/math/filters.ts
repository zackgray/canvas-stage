// Clean-up passes for AI depth before meshing.
//
// dequantize: 8-bit depth is terraced (one grey level ~ 1 % depth), which shows as ridges off-angle. A separable
//   bilateral blur in raw-value space smooths steps of a few levels and leaves real edges alone.
// sharpenEdges: depth models blur object boundaries over a few pixels, so a per-step jump test sees a gentle ramp
//   and keeps it, giving a rubber sheet. Where a short ramp sits between two flat-ish plateaus, snap each ramp pixel
//   to the nearer plateau so the jump lands in one pixel and the cut is clean. Long ramps (floors, walls seen at an
//   angle) have outer slopes as steep as the inner one and are left alone.

const ok = (d: number) => d > 0 && Number.isFinite(d)

/** Separable bilateral filter on [0, 1] values. sigma is in value units (e.g. 2.5 / 255). */
export function dequantize(values: Float32Array, width: number, height: number, radius: number, sigma: number): Float32Array {
  if (radius < 1) return values
  const spatial = Array.from({ length: radius * 2 + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * (radius / 2) ** 2)))
  const inv2s2 = 1 / (2 * sigma * sigma)
  const pass = (src: Float32Array, dx: number, dy: number) => {
    const out = new Float32Array(src.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = src[y * width + x]
        let sum = 0, wsum = 0
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k * dx, yy = y + k * dy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          const v = src[yy * width + xx]
          const w = spatial[k + radius] * Math.exp(-(v - c) * (v - c) * inv2s2)
          sum += v * w
          wsum += w
        }
        out[y * width + x] = sum / wsum
      }
    }
    return out
  }
  return pass(pass(values, 1, 0), 0, 1)
}

/**
 * Snap soft depth edges to steps. `radius` is the ramp half-width to look across (px); `threshold` the relative
 * depth jump that counts as an edge (same meaning as the mesh edge cut).
 */
export function sharpenEdges(depth: Float32Array, width: number, height: number, radius: number, threshold: number): Float32Array {
  if (radius < 1) return depth
  const pass = (src: Float32Array, dx: number, dy: number) => {
    const out = src.slice()
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= width || y >= height ? NaN : 1 / src[y * width + x]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (!ok(src[i])) continue
        const a = at(x - radius * dx, y - radius * dy)
        const b = at(x + radius * dx, y + radius * dy)
        if (!ok(a) || !ok(b)) continue
        // relative depth jump across the window, in inverse-depth terms: |1/a' - 1/b'| / min depth
        if (Math.abs(a - b) / Math.min(a, b) <= threshold) continue
        const a2 = at(x - 2 * radius * dx, y - 2 * radius * dy)
        const b2 = at(x + 2 * radius * dx, y + 2 * radius * dy)
        if (!ok(a2) || !ok(b2)) continue
        const outer = Math.abs(a - a2) + Math.abs(b2 - b)
        if (Math.abs(b - a) <= 2 * outer) continue // a long ramp, not a blurred step
        const c = 1 / src[i]
        out[i] = Math.abs(c - a) < Math.abs(c - b) ? 1 / a : 1 / b
      }
    }
    return out
  }
  return pass(pass(depth, 1, 0), 0, 1)
}
