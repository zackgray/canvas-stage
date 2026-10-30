// Move linter (DEMO.md: one camera move per shot, no spins, no sudden direction changes).
// Decomposes a take into move types, merges the ones that are really a single compound move
// (orbit = truck + pan; boom arc = pedestal + dolly; tilt that just follows a pan), then warns.
import { Euler, Quaternion } from 'three'
import type { CameraSample } from './types'
import { qAngle } from './types'

export type MoveType = 'dolly' | 'truck' | 'pedestal' | 'pan' | 'tilt' | 'roll' | 'zoom' | 'orbit' | 'boom arc'

export interface MoveAmount {
  type: MoveType
  /** Comparable units: radians of rotation; translation weighted at TRANSLATION_WEIGHT per metre. */
  amount: number
  share: number
}

export interface LintReport {
  moves: MoveAmount[]
  dominant: MoveType[]
  maxAngularSpeedDeg: number
  warnings: string[]
}

export interface LintOptions {
  /** Warn above this rotation speed (deg/s), measured over a short window. */
  maxAngularSpeedDeg: number
  /** A move counts as dominant at this share of all motion. */
  dominantShare: number
  /** Below this much total motion the take is "locked off". */
  stillThreshold: number
}

export const DEFAULT_LINT: LintOptions = { maxAngularSpeedDeg: 45, dominantShare: 0.25, stillThreshold: 0.05 }
/** 1 m of travel weighs about as much as 8.6° of rotation. */
export const TRANSLATION_WEIGHT = 0.15
// Doubling the focal length weighs about as much as 40° of rotation.
const ZOOM_WEIGHT = 1.0

const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'YXZ')
function angles(s: CameraSample) {
  _e.setFromQuaternion(_q.fromArray(s.quaternion), 'YXZ')
  return { yaw: _e.y, pitch: _e.x, roll: _e.z }
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function lintTake(samples: CameraSample[], fps: number, opts: LintOptions = DEFAULT_LINT): LintReport {
  const abs: Record<string, number> = { dolly: 0, truck: 0, pedestal: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
  const net: Record<string, number> = { ...abs }
  const pos: Record<string, number> = { ...abs }
  const neg: Record<string, number> = { ...abs }
  const add = (k: string, v: number) => {
    abs[k] += Math.abs(v)
    net[k] += v
    if (v > 0) pos[k] += v
    else neg[k] -= v
  }
  const speeds: number[] = []
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    const ea = angles(a)
    const eb = angles(b)
    const dx = b.position[0] - a.position[0]
    const dy = b.position[1] - a.position[1]
    const dz = b.position[2] - a.position[2]
    add('dolly', (-Math.sin(ea.yaw) * dx - Math.cos(ea.yaw) * dz) * TRANSLATION_WEIGHT)
    add('truck', (Math.cos(ea.yaw) * dx - Math.sin(ea.yaw) * dz) * TRANSLATION_WEIGHT)
    add('pedestal', dy * TRANSLATION_WEIGHT)
    add('pan', wrap(eb.yaw - ea.yaw))
    add('tilt', wrap(eb.pitch - ea.pitch))
    add('roll', wrap(eb.roll - ea.roll))
    add('zoom', Math.log(b.focal / a.focal) * ZOOM_WEIGHT)
    speeds.push((qAngle(a.quaternion, b.quaternion) * 180) / Math.PI)
  }

  // Merge compound moves.
  const amounts = new Map<MoveType, number>(Object.entries(abs) as [MoveType, number][])
  const merged = (x: MoveType, y: MoveType, into: MoveType) => {
    amounts.set(into, (amounts.get(x) ?? 0) + (amounts.get(y) ?? 0))
    amounts.delete(x)
    amounts.delete(y)
  }
  const both = (x: string, y: string, ratio: number) => Math.min(abs[x], abs[y]) >= ratio * Math.max(abs[x], abs[y])
  // Orbiting a subject ahead: moving right turns the camera left (yaw up), so truck and pan share a sign.
  if (both('truck', 'pan', 0.25) && Math.sign(net.truck) === Math.sign(net.pan)) merged('truck', 'pan', 'orbit')
  if (both('pedestal', 'dolly', 0.3)) merged('pedestal', 'dolly', 'boom arc')
  if (amounts.has('pan') && abs.tilt < 0.5 * abs.pan) {
    amounts.set('pan', abs.pan + abs.tilt)
    amounts.delete('tilt')
  }

  const total = [...amounts.values()].reduce((s, v) => s + v, 0)
  const moves: MoveAmount[] = [...amounts.entries()]
    .map(([type, amount]) => ({ type, amount, share: total > 0 ? amount / total : 0 }))
    .sort((p, q) => q.amount - p.amount)
  const dominant =
    total < opts.stillThreshold
      ? []
      : moves.filter((m) => m.share >= opts.dominantShare && m.amount >= opts.stillThreshold / 2).map((m) => m.type)

  // Rotation speed over a ~0.2 s window, so a single jittery frame doesn't trip it.
  const win = Math.max(1, Math.round(fps * 0.2))
  let maxSpeed = 0
  for (let i = 0; i + win <= speeds.length; i++) {
    let s = 0
    for (let k = i; k < i + win; k++) s += speeds[k]
    maxSpeed = Math.max(maxSpeed, (s / win) * fps)
  }

  const warnings: string[] = []
  if (dominant.length > 1) warnings.push(`More than one move in this take: ${dominant.join(' + ')}. One move per shot.`)
  if (maxSpeed > opts.maxAngularSpeedDeg)
    warnings.push(`Rotation peaks at ${maxSpeed.toFixed(0)}°/s (limit ${opts.maxAngularSpeedDeg}°/s): reads as a whip/spin.`)
  for (const k of dominant) {
    if (!(k in pos)) continue
    const lo = Math.min(pos[k], neg[k])
    const hi = Math.max(pos[k], neg[k])
    if (hi > 0 && lo > 0.3 * hi && lo > opts.stillThreshold / 2)
      warnings.push(`The ${k} changes direction mid-take. Keep one direction per shot.`)
  }
  return { moves, dominant, maxAngularSpeedDeg: maxSpeed, warnings }
}
