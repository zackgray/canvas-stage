// Preset camera moves (QA 2026-10-25: no controller, no moving shot). Each is a path of the camera from where the operator
// framed it, eased in and out over the chosen length; the engine plays it on the world clock and records it through the same
// take recorder a hand-flown take uses (scriptedMove.ts), so Lock, the frames and Render take it unchanged. Pure apart from
// three's vector maths.
import { Matrix4, Quaternion, Vector3 } from 'three'
import { clampFocal, hfovFromFocal, vfovFromHfov } from '../../controller/math/lens'
import type { CameraSample, QuatT, Vec3T } from '../../controller/take/types'

export type PresetId = 'push' | 'pull' | 'pan-left' | 'pan-right' | 'orbit-left' | 'orbit-right' | 'crane' | 'hold'
export const PRESETS: { id: PresetId; label: string; title: string }[] = [
  { id: 'push', label: 'Push in', title: 'The camera moves straight in toward what it looks at' },
  { id: 'pull', label: 'Pull out', title: 'The camera backs straight away' },
  { id: 'pan-left', label: 'Pan left', title: 'The camera stays put and turns left' },
  { id: 'pan-right', label: 'Pan right', title: 'The camera stays put and turns right' },
  { id: 'orbit-left', label: 'Orbit left', title: 'The camera circles to its left around the hero (the orbit pivot), keeping the hero framed' },
  { id: 'orbit-right', label: 'Orbit right', title: 'The camera circles to its right around the hero (the orbit pivot), keeping the hero framed' },
  { id: 'crane', label: 'Crane up', title: 'The camera rises and tilts down to keep the hero framed' },
  { id: 'hold', label: 'Static hold', title: 'The camera holds still while the action plays' },
]
/** take lengths on offer (s), the shot lengths (studio Shot length row); 2 s is the cheapest to render, 6 s fits a stand-and-lift */
export const PRESET_SECONDS = [2, 4, 6, 8] as const
export const PRESET_FPS = 24

const PAN = (30 * Math.PI) / 180
const ORBIT = (35 * Math.PI) / 180
const CRANE_M = 1.5
const UP = new Vector3(0, 1, 0)
const RIGHT = new Vector3(1, 0, 0)
/** elevation of `d` above the horizon (rad) */
const pitchOf = (d: Vector3) => Math.atan2(d.y, Math.hypot(d.x, d.z))

/** Where the move starts: the operator's camera now, and what it looks at (the orbit pivot / hero; null = the focus point ahead). */
export interface PresetStart { position: Vec3T; quaternion: QuatT; focal: number; focus: number; target: Vec3T | null
  /** the performer's chest (world) at take time t, from the performance's own positions; null/absent = nobody to hold on */
  subject?: ((t: number) => Vec3T | null) | null }
export type PresetPose = Omit<CameraSample, 't'>

/** smoothstep: the move eases in and out, so a take never starts or ends on a jolt */
export const ease = (u: number) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x) }

const yaw = (a: number) => new Quaternion().setFromAxisAngle(UP, a)

/** `pose` turned to look at `at` (upright, no roll), aimed at that distance */
export function aimed(pose: PresetPose, at: Vec3T): PresetPose {
  const eye = new Vector3(...pose.position), to = new Vector3(...at)
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(eye, to, UP))
  return { ...pose, quaternion: [q.x, q.y, q.z, q.w], focus: Math.min(200, Math.max(0.3, eye.distanceTo(to))) }
}

/** The camera at fraction `u` (0..1) of the move. */
export function presetPose(id: PresetId, s: PresetStart, u: number): PresetPose {
  const e = ease(u)
  const p0 = new Vector3(...s.position)
  const q0 = new Quaternion(...s.quaternion)
  const fwd = new Vector3(0, 0, -1).applyQuaternion(q0)
  const target = s.target ? new Vector3(...s.target) : p0.clone().addScaledVector(fwd, Math.max(1, s.focus))
  const dist = Math.max(0.5, p0.distanceTo(target))
  // every pose's lens stays inside the operator's zoom (12-85 mm), so no preset ends on an out-of-range lens
  const out = (p: Vector3, q: Quaternion, focus = s.focus): PresetPose =>
    ({ position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], focal: clampFocal(s.focal), focus: Math.min(200, Math.max(0.3, focus)) })
  switch (id) {
    case 'push': case 'pull': {
      const d = Math.min(3, Math.max(0.5, dist * 0.35)) * e * (id === 'push' ? 1 : -1)
      return out(p0.clone().addScaledVector(fwd, d), q0, s.focus - d)
    }
    case 'pan-left': case 'pan-right':
      return out(p0, yaw((id === 'pan-left' ? PAN : -PAN) * e).multiply(q0))
    case 'orbit-left': case 'orbit-right': {
      // +yaw carries the camera to its right around the pivot; the view turns with it, so the pivot stays where it was framed
      const r = yaw((id === 'orbit-left' ? -ORBIT : ORBIT) * e)
      return out(target.clone().add(p0.clone().sub(target).applyQuaternion(r)), r.multiply(q0))
    }
    case 'crane': {
      // straight up, tilting down about the camera's own right axis by exactly the change in the target's elevation: no roll and
      // no yaw creep, whether or not the target sits in the middle of the frame
      const p = p0.clone().addScaledVector(UP, CRANE_M * e)
      const tilt = pitchOf(target.clone().sub(p)) - pitchOf(target.clone().sub(p0))
      return out(p, q0.clone().multiply(new Quaternion().setFromAxisAngle(RIGHT, tilt)), p.distanceTo(target) * (s.focus / dist))
    }
    case 'hold': return out(p0, q0)
  }
}

/**
 * The move as a function of take time (s), held at its end pose past `seconds`. `hold` (Hold on the subject, any move: owner
 * 2026-10-28, a crane or a push-in held on a walking subject lost her) turns every sample to her chest; the move's travel is its own.
 */
export const presetPath = (id: PresetId, s: PresetStart, seconds: number, hold = false) => (t: number): PresetPose => {
  const pose = presetPose(id, s, seconds > 0 ? t / seconds : 1)
  const chest = hold ? s.subject?.(t) : null
  return chest ? aimed(pose, chest) : pose // every sample aims at the chest where the performance has it at this take time
}

/** The move sampled at the take rate, frame 0 to the last (what the recorder writes when it plays it in real time). */
export function presetSamples(id: PresetId, s: PresetStart, seconds: number, fps = PRESET_FPS, hold = false): CameraSample[] {
  const at = presetPath(id, s, seconds, hold)
  return Array.from({ length: Math.round(seconds * fps) + 1 }, (_, k) => ({ t: k / fps, ...at(k / fps) }))
}

/** Where `chest` falls in `pose`'s frame, -1..1 from the centre (x right, y up); null behind the camera. */
export function framePosition(pose: PresetPose, chest: Vec3T, aspect: number): { x: number; y: number } | null {
  const c = new Vector3(...chest).sub(new Vector3(...pose.position)).applyQuaternion(new Quaternion(...pose.quaternion).invert())
  if (c.z >= -1e-6) return null
  const th = Math.tan(hfovFromFocal(pose.focal) / 2), tv = Math.tan(vfovFromHfov(hfovFromFocal(pose.focal), aspect) / 2)
  return { x: c.x / -c.z / th, y: c.y / -c.z / tv }
}

/** The first take time (s) the performer's chest is out of frame on this move, or null when it stays in (or there is no performer). */
export function leavesFrameAt(id: PresetId, s: PresetStart, seconds: number, hold: boolean, aspect = 16 / 9): number | null {
  if (!s.subject) return null
  for (const sm of presetSamples(id, s, seconds, PRESET_FPS, hold)) {
    const chest = s.subject(sm.t), f = chest && framePosition(sm, chest, aspect)
    if (chest && (!f || Math.abs(f.x) > 1 || Math.abs(f.y) > 1)) return sm.t
  }
  return null
}
