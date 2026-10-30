/**
 * Timeline segments. Each is a pure function of performance time t on its own span [t0, t1] (and a little past either end, for
 * crossfades): an anchor (path point, intent yaw) and a world pose (root xz absolute, root y above the ground, q[0] world rotation).
 *
 * The body is placed at base(t) + shift(t): base is the path anchor (moving segments) or the stop point (stationary ones); shift is
 * the gap to where the previous segment left the body, carried whole by stationary segments (feet stay planted) and eased out over
 * moving ones.
 */
import * as THREE from 'three'
import type { Clip } from './clip.ts'
import type { SmoothPath } from './path.ts'
import { makePose, type Pose, type Skeleton } from './skeleton.ts'

export type Anchor = { x: number; z: number; yaw: number }
export type Seg = {
  kind: string
  t0: number
  t1: number
  anchor(t: number): Anchor
  /** body yaw (rad) the aligned clip pose is turned to */
  bodyYaw(t: number): number
  /** the clip pose in its aligned frame */
  local(t: number, out: Pose): Pose
  shift: { x: number; z: number }
  /** seconds over which `shift` eases to zero (Infinity: carried whole) */
  decay: number
  /** pinned one-shots: the clip played and its file time at t (a still's pose words and a carried prop read these; motion/phase.ts) */
  clip?: Clip
  tau?(t: number): number
  /** travel: path metres the anchor is at by time t, unclamped (motion/gaitChain.ts eases it where two gaits of different speed meet) */
  dist?(t: number): number
}

const Y = new THREE.Vector3(0, 1, 0), qy = new THREE.Quaternion()
export const smooth = (k: number) => { const c = Math.min(Math.max(k, 0), 1); return c * c * (3 - 2 * c) }

/** world pose of a segment at t */
export function segPose(seg: Seg, t: number, out: Pose): Pose {
  seg.local(t, out)
  const a = seg.anchor(t), base = seg.decay === Infinity ? 1 : 1 - smooth((t - seg.t0) / seg.decay)
  qy.setFromAxisAngle(Y, seg.bodyYaw(t))
  const y = out.root.y
  out.root.setY(0).applyQuaternion(qy)
  out.root.set(out.root.x + a.x + seg.shift.x * base, y, out.root.z + a.z + seg.shift.z * base)
  out.q[0].premultiply(qy)
  return out
}

const noShift = () => ({ x: 0, z: 0 })

/** travelling gait: the loop clip in place, the anchor walking the path at stride speed × pace */
export function travelSeg(clip: Clip, path: SmoothPath, sA: number, phase0: number, pace: number, t0: number, dur: number, sMin = -Infinity, sMax = Infinity): Seg {
  const v = (clip.stride / clip.cycle) * pace
  const seg: Seg = {
    kind: 'travel', t0, t1: t0 + dur, dist: (t) => sA + v * (t - t0), anchor: (t) => path.at(Math.min(Math.max(seg.dist!(t), sMin), sMax)),
    bodyYaw: (t) => seg.anchor(t).yaw, local: (t, out) => clip.loop(phase0 + (t - t0) * pace, out), shift: noShift(), decay: 1,
  }
  return seg
}

/**
 * a progress clip (start or stop) from clip time τ0, at pace; the anchor is at path metres sRef when the clip is at τRef.
 * `scale` shrinks the clip's travel to fit a short leg; [sMin, sMax] keeps the anchor (and its heading) on this segment's side of a
 * sharp corner, also when a crossfade samples the segment before it starts or after it ends.
 */
export function progressSeg(kind: string, clip: Clip, path: SmoothPath, τ0: number, τ1: number, sRef: number, τRef: number, pace: number, t0: number, scale = 1, sMin = -Infinity, sMax = Infinity): Seg {
  const τ = (t: number) => τ0 + (t - t0) * pace
  const anchor = (t: number) => path.at(Math.min(Math.max(sRef + (clip.prog(τ(t)) - clip.prog(τRef)) * scale, sMin), sMax))
  return { kind, t0, t1: t0 + (τ1 - τ0) / pace, anchor, bodyYaw: (t) => anchor(t).yaw, local: (t, out) => clip.once(τ(t), out), shift: noShift(), decay: 1 }
}

/**
 * stationary: a pinned clip played once from τ0 to τ1 (stretched to `dur` if given), body yaw fixed, intent yaw `yaw`.
 * `layer` swaps some joints' rotations for another clip's cycle (e.g. a relaxed arm over a source gesture that does not fit).
 */
export function pinnedSeg(kind: string, clip: Clip, at: { x: number; z: number }, yaw: number, bodyYaw: number, τ0: number, τ1: number, t0: number, dur = τ1 - τ0, layer?: { clip: Clip; joints: number[] }): Seg {
  const rate = (τ1 - τ0) / dur, tmp = layer ? makePose(clip.joints) : null
  return {
    kind, t0, t1: t0 + dur, anchor: () => ({ x: at.x, z: at.z, yaw }), bodyYaw: () => bodyYaw, shift: noShift(), decay: Infinity,
    clip, tau: (t) => τ0 + (t - t0) * rate,
    local(t, out) {
      clip.once(τ0 + (t - t0) * rate, out)
      if (layer && tmp) { layer.clip.loop(τ0 + (t - t0) * rate, tmp); for (const j of layer.joints) out.q[j].copy(tmp.q[j]) }
      return out
    },
  }
}

/** idle (with an optional look): the idle cycle from phase0; a look turns the spine and head by `lookDeg` (+ = left), eased in and out */
export function idleSeg(kind: string, clip: Clip, skel: Skeleton, at: { x: number; z: number }, yaw: number, bodyYaw: number, t0: number, dur: number, lookDeg = 0, phase0 = 0): Seg {
  const chain = LOOK.map(([n, w]) => [skel.index[n], w] as const).filter(([j]) => j !== undefined)
  const ramp = Math.min(0.8, dur / 2.5), q = new THREE.Quaternion()
  return {
    kind, t0, t1: t0 + dur, anchor: () => ({ x: at.x, z: at.z, yaw }), bodyYaw: () => bodyYaw, shift: noShift(), decay: Infinity,
    local(t, out) {
      clip.loop(phase0 + t - t0, out)
      if (!lookDeg) return out
      const a = THREE.MathUtils.degToRad(lookDeg) * smooth((t - t0) / ramp) * smooth((t0 + dur - t) / ramp)
      for (const [j, w] of chain) out.q[j].multiply(q.setFromAxisAngle(Y, a * w))
      return out
    },
  }
}

/** how a look spreads down the spine (sums to 1) */
const LOOK: [string, number][] = [['LowerBack', 0.08], ['Spine', 0.12], ['Spine1', 0.2], ['Neck', 0.25], ['Neck1', 0.15], ['Head', 0.2]]

/**
 * turn in place: the turn clip with its rotation scaled from the clip's own angle to `deg` (+ = left).
 * Intent yaw eases from `yaw` by `intentDeg`.
 */
export function turnSeg(clip: Clip, at: { x: number; z: number }, yaw: number, intentDeg: number, bodyYaw: number, deg: number, t0: number): Seg {
  const tmp = makePose(clip.joints)
  const clipTurn = facingOf(clip, clip.def.out, tmp), k = THREE.MathUtils.degToRad(deg) / clipTurn
  const dur = clip.def.out - clip.def.in, τ = (t: number) => clip.def.in + (t - t0)
  return {
    kind: 'turn', t0, t1: t0 + dur, shift: noShift(), decay: Infinity,
    anchor: (t) => ({ x: at.x, z: at.z, yaw: yaw + THREE.MathUtils.degToRad(intentDeg) * smooth((t - t0) / dur) }),
    bodyYaw: (t) => bodyYaw + (k - 1) * facingOf(clip, τ(t), tmp),
    local: (t, out) => clip.once(τ(t), out),
  }
}

/** the clip's own (aligned) pelvis yaw at clip time τ, relative to its start */
const fz = new THREE.Vector3()
function facingOf(clip: Clip, τ: number, tmp: Pose): number {
  clip.once(τ, tmp)
  fz.set(0, 0, 1).applyQuaternion(tmp.q[0])
  return Math.atan2(fz.x, fz.z)
}
