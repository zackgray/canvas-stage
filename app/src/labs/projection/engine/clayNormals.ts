// Smoothed vertex normals for the performer in clay. The lift's per-pixel relief is noisy; shaded raw it would show every
// bump (the export bilateral-smooths the depth inside the person first). Here the area-weighted normals are relaxed over
// the mesh's own edges a few passes, which smooths the face into a sculpted form (never blanked: a blank face sends
// the render's focus to the far eye, E102) without losing the body's large shapes.

/** Vertex normals (xyz per vertex) from triangles, relaxed `passes` times over shared edges. */
export function smoothedNormals(positions: ArrayLike<number>, indices: ArrayLike<number>, passes = 5): Float32Array {
  const n = positions.length / 3
  let cur = new Float32Array(n * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2]
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2]
    const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx // length = 2 x area: area-weighted
    for (const v of [a, b, c]) { cur[v * 3] += nx; cur[v * 3 + 1] += ny; cur[v * 3 + 2] += nz }
  }
  normalise(cur)
  for (let p = 0; p < passes; p++) {
    const next = Float32Array.from(cur)
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3
      for (let k = 0; k < 3; k++) {
        next[a + k] += cur[b + k] + cur[c + k]
        next[b + k] += cur[a + k] + cur[c + k]
        next[c + k] += cur[a + k] + cur[b + k]
      }
    }
    normalise(next)
    cur = next
  }
  return cur
}

function normalise(a: Float32Array) {
  for (let i = 0; i < a.length; i += 3) {
    const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1
    a[i] /= l; a[i + 1] /= l; a[i + 2] /= l
  }
}
