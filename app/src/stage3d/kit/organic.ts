// Organic massing for the kit: irregular blobs and leaning trunks that read as foliage and straw, never as cones or spheres.
// The image model copies proxy geometry literally, so the silhouettes themselves have to be uneven.
import * as THREE from 'three'

/**
 * a lumpy mass: an icosphere (detail 1, 80 faces) stretched by (sx, sy, sz) and pushed in and out by a smooth function of position
 * (so coincident vertices move together and the surface stays closed). The base is flattened a little so it sits on what it grows from.
 */
export function blob(r: () => number, radius: number, sx = 1, sy = 1, sz = 1, amp = 0.28): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, 1), p = geo.attributes.position
  const ph = Array.from({ length: 6 }, () => r() * 6.283), f = 1.6 + r() * 1.4 // phases and lump frequency, per blob
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius, y = p.getY(i) / radius, z = p.getZ(i) / radius
    const n = Math.sin(x * f * 2 + ph[0]) * Math.cos(z * f * 2 + ph[1]) * 0.5 + Math.sin(y * f * 3 + ph[2] + x * 2) * 0.3 + Math.sin((x + z) * f * 4 + ph[3]) * 0.2
    const k = 1 + amp * n, yy = y < -0.35 ? -0.35 + (y + 0.35) * 0.4 : y
    p.setXYZ(i, x * radius * sx * k, yy * radius * sy * k, z * radius * sz * k)
  }
  geo.deleteAttribute('uv'); geo.computeVertexNormals()
  return geo
}

/** a slightly tapered, leaning trunk of `sides` facets from the origin to (lx, h, lz), with a flare at the foot */
export function trunk(r: () => number, h: number, rad: number, lx: number, lz: number, sides = 5): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rad * 0.55, rad * (1.1 + r() * 0.3), h, sides, 2, false), p = geo.attributes.position
  for (let i = 0; i < p.count; i++) { const k = (p.getY(i) + h / 2) / h; p.setX(i, p.getX(i) + lx * k * k); p.setZ(i, p.getZ(i) + lz * k * k); p.setY(i, p.getY(i) + h / 2) }
  geo.deleteAttribute('uv'); geo.computeVertexNormals()
  return geo.toNonIndexed()
}

/** place a geometry: scale, rotate about y, move */
export function put(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  geo.rotateY(yaw); geo.translate(x, y, z)
  return geo.index ? geo.toNonIndexed() : geo
}

/**
 * one tree of a distant band: a short leaning trunk under a crown of four to seven small lumpy lobes, scattered unevenly through a
 * lopsided envelope (a ragged top, lobes poking out at the sides, one sometimes reaching up past the rest). Read from 60 m and more,
 * its outline is a broken cauliflower edge, never a ball on a stick or a cone. `w` widens or narrows the envelope.
 */
export function bandTree(r: () => number, x: number, z: number, h: number, w = 1): THREE.BufferGeometry[] {
  const lean = (r() - 0.5) * h * 0.14, base = h * (0.25 + r() * 0.15), width = h * (0.22 + r() * 0.22) * w
  const parts: THREE.BufferGeometry[] = [put(trunk(r, base + h * 0.2, h * 0.028, lean * 0.5, 0), x, -0.3, z)]
  const lobes = 4 + Math.floor(r() * 4), skew = (r() - 0.5) * 0.6
  for (let k = 0; k < lobes; k++) {
    const t = r(), up = k === 0 && r() < 0.35 ? 1.12 : 1 // now and then one lobe stands proud of the crown
    const y = base + (h - base) * (0.25 + 0.7 * t) * up, spread = width * (1.15 - t * 0.7)
    const a = r() * 6.283, d = spread * (0.35 + r() * 0.65)
    const rad = h * (0.07 + r() * 0.1) * (1.2 - t * 0.5)
    parts.push(put(blob(r, rad, 0.8 + r() * 0.6, 0.7 + r() * 0.7, 0.8 + r() * 0.5, 0.4), x + lean * t + Math.cos(a) * d + skew * spread * t, y, z + Math.sin(a) * d * 0.6, r() * 6.283))
  }
  return parts
}
