// Pinhole camera maths. Full-frame convention: the sensor is 36 mm wide and its height follows the image aspect.
// Image coordinates are pixels with (0,0) at the top-left corner; pixel centres sit at +0.5.
// Camera space is three.js convention: +x right, +y up, looking down -z. "Depth" is planar z-depth (positive).

export const SENSOR_WIDTH_MM = 36

export const toRad = (deg: number) => (deg * Math.PI) / 180
export const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Horizontal field of view (radians) for a focal length on a 36 mm-wide sensor. */
export function hfovFromFocal(focalMm: number): number {
  return 2 * Math.atan(SENSOR_WIDTH_MM / (2 * focalMm))
}

/** Vertical field of view (radians); sensor height = 36 mm / aspect (aspect = width / height). */
export function vfovFromFocal(focalMm: number, aspect: number): number {
  return 2 * Math.atan(SENSOR_WIDTH_MM / aspect / (2 * focalMm))
}

export function focalFromHfov(hfovRad: number): number {
  return SENSOR_WIDTH_MM / (2 * Math.tan(hfovRad / 2))
}

export function focalFromVfov(vfovRad: number, aspect: number): number {
  return SENSOR_WIDTH_MM / aspect / (2 * Math.tan(vfovRad / 2))
}

export interface Intrinsics {
  width: number
  height: number
  /** vertical field of view, radians */
  vfov: number
}

/** Half-extents of the image plane at unit depth. */
export function tanHalf(k: Intrinsics): { tx: number; ty: number } {
  const ty = Math.tan(k.vfov / 2)
  return { tx: ty * (k.width / k.height), ty }
}

/** Camera-space point for a continuous pixel coordinate (px, py) at planar depth d. */
export function unprojectPixel(k: Intrinsics, px: number, py: number, d: number): [number, number, number] {
  const { tx, ty } = tanHalf(k)
  const nx = (px / k.width) * 2 - 1
  const ny = 1 - (py / k.height) * 2
  return [nx * tx * d, ny * ty * d, -d]
}

/** Inverse of unprojectPixel: camera-space point -> [px, py, depth]. */
export function projectPoint(k: Intrinsics, x: number, y: number, z: number): [number, number, number] {
  const { tx, ty } = tanHalf(k)
  const d = -z
  const nx = x / (d * tx)
  const ny = y / (d * ty)
  return [((nx + 1) / 2) * k.width, ((1 - ny) / 2) * k.height, d]
}

/**
 * Unproject a whole depth image (row-major, top row first) at pixel centres.
 * Returns xyz triples; invalid depths (<= 0 or non-finite) give NaN.
 */
export function unprojectDepth(k: Intrinsics, depth: Float32Array): Float32Array {
  const out = new Float32Array(k.width * k.height * 3)
  for (let y = 0; y < k.height; y++) {
    for (let x = 0; x < k.width; x++) {
      const i = y * k.width + x
      const d = depth[i]
      if (!(d > 0) || !Number.isFinite(d)) {
        out.fill(NaN, i * 3, i * 3 + 3)
        continue
      }
      const p = unprojectPixel(k, x + 0.5, y + 0.5, d)
      out[i * 3] = p[0]
      out[i * 3 + 1] = p[1]
      out[i * 3 + 2] = p[2]
    }
  }
  return out
}
