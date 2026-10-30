// Framing maths: aim a camera (yaw/pitch, no roll, Euler order YXZ, looking down -Z like three.js)
// so a world-space target lands at a chosen point in frame, given in NDC (-1..1, +x right, +y up).

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface Aim {
  yaw: number
  pitch: number
}

/**
 * Exact solution (not a small-angle approximation): the camera-space ray through (u, v) is rotated
 * by Rx(pitch) then Ry(yaw) onto the world direction to the target.
 */
export function solveFramingAim(
  cam: Vec3Like,
  target: Vec3Like,
  u: number,
  v: number,
  hfov: number,
  vfov: number,
): Aim {
  let dx = target.x - cam.x
  let dy = target.y - cam.y
  let dz = target.z - cam.z
  const len = Math.hypot(dx, dy, dz) || 1
  dx /= len
  dy /= len
  dz /= len

  // Camera-space ray through the framing point.
  let a = u * Math.tan(hfov / 2)
  let b = v * Math.tan(vfov / 2)
  let c = -1
  const cl = Math.hypot(a, b, c)
  a /= cl
  b /= cl
  c /= cl

  // Pitch: after Rx(θ), the ray's y is b·cosθ − c·sinθ = R·cos(θ + φ); it must equal dy.
  const R = Math.hypot(b, c)
  const phi = Math.atan2(c, b)
  const ac = Math.acos(Math.max(-1, Math.min(1, dy / R)))
  const roots = [ac - phi, -ac - phi].map(wrap)
  const pitch = Math.abs(roots[0]) <= Math.abs(roots[1]) ? roots[0] : roots[1]

  // Yaw: rotate the pitched ray's horizontal part onto the target's horizontal bearing.
  const xp = a
  const zp = b * Math.sin(pitch) + c * Math.cos(pitch)
  const yaw = wrap(Math.atan2(dx, dz) - Math.atan2(xp, zp))
  return { yaw, pitch }
}

function wrap(a: number): number {
  let r = (a + Math.PI) % (2 * Math.PI)
  if (r < 0) r += 2 * Math.PI
  return r - Math.PI
}
