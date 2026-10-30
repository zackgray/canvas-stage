// Real lens maths: a full-frame sensor 36 mm wide, focal length in mm.
// Field of view is fixed horizontally (sensor width); vertical FOV follows the frame aspect.

export const SENSOR_WIDTH_MM = 36
export const FOCAL_MIN_MM = 12
export const FOCAL_MAX_MM = 85
export const DEFAULT_FOCAL_MM = 35

const RAD2DEG = 180 / Math.PI

/** Horizontal field of view (radians) for a focal length on a sensor of the given width. */
export function hfovFromFocal(focalMm: number, sensorWidthMm = SENSOR_WIDTH_MM): number {
  return 2 * Math.atan(sensorWidthMm / (2 * focalMm))
}

/** Inverse of hfovFromFocal. */
export function focalFromHfov(hfov: number, sensorWidthMm = SENSOR_WIDTH_MM): number {
  return sensorWidthMm / (2 * Math.tan(hfov / 2))
}

/** Vertical FOV (radians) for a horizontal FOV and a frame aspect (width / height). */
export function vfovFromHfov(hfov: number, aspect: number): number {
  return 2 * Math.atan(Math.tan(hfov / 2) / aspect)
}

/** three.js PerspectiveCamera.fov is vertical and in degrees. */
export function threeFovDeg(focalMm: number, aspect: number): number {
  return vfovFromHfov(hfovFromFocal(focalMm), aspect) * RAD2DEG
}

export function clampFocal(focalMm: number): number {
  return Math.min(FOCAL_MAX_MM, Math.max(FOCAL_MIN_MM, focalMm))
}

/** Multiplicative zoom: equal stick deflection feels the same at 12 mm and at 85 mm. */
export function zoomFocal(focalMm: number, rate: number, dt: number): number {
  return clampFocal(focalMm * Math.exp(rate * dt))
}
