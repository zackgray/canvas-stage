/**
 * PerformancePlan → a deterministic list of timeline segments.
 *
 * Actions are grouped into stations (actions within GROUP metres of each other), snapped onto a nearby path corner. Between stations
 * the performer travels: start clip (from rest), gait loop, stop clip (into a station); the gait phase and the stop's entry frame are
 * picked so the poses either side of each crossfade match. A run eases through a walking cycle out of a start and into a stop
 * (motion/gaitChain.ts). At a station the actions play in order (stop, idle, look, turn, kneel, lift),
 * then, if the path turns away from where he faces, an automatic turn in place. Corners without a station are rounded (turn radius).
 */
import * as THREE from 'three'
import type { PathAction, PerformancePlan } from '../contract.ts'
import { GAIT } from '../clips.ts'
import { poseDistance, type Clip } from './clip.ts'
import type { Library } from './library.ts'
import { argmin, easeSpeeds, endPhase, phaseMatcher, stretches } from './gaitChain.ts'
import { addMoveAction } from './moveAction.ts'
import { smoothPath, wrapAngle, type SmoothPath } from './path.ts'
import { fittedPhase0, stopFit } from './strideFit.ts'
import { settleFrom } from './settle.ts'
import { idleSeg, pinnedSeg, progressSeg, segPose, travelSeg, turnSeg, type Seg } from './segments.ts'
import { facingYaw, makePose } from './skeleton.ts'

export const XF = 0.4 // crossfade (s) into and out of stationary clips
export const XF_GAIT = 0.3 // crossfade between start / gait / stop (phase-matched)
export const XF_EASE = 0.6 // crossfade between a faster gait and the walk it eases through (motion/gaitChain.ts)
const GROUP = 0.3, SNAP = 0.6, SLIDE = 0.1, AUTO_TURN = THREE.MathUtils.degToRad(25), RADIUS = 1.2

export type Timeline = { segs: Seg[]; xf: number[]; duration: number; path: SmoothPath; lib: Library
  /** (track D) plain-words playback warnings (a made move whose clip is missing plays as standing still; motion/moveAction.ts) */
  warnings: string[] }
type Station = { o: number; s: number; actions: PathAction[] }

export function compile(plan: PerformancePlan, lib: Library): Timeline {
  if (!plan.path || plan.path.length < 2) throw new Error('a performance path needs at least two points')
  const pace = Math.min(Math.max(plan.pace ?? 0.8, 0.3), 2), C = lib.clips, gait = C[GAIT[plan.gait ?? 'walk']]
  const rough = smoothPath(plan.path, RADIUS, () => false)
  const planLen = plan.path.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - plan.path[i][0], p[1] - plan.path[i][1]), 0)
  // stations: grouped actions, snapped to corners; sharp corners without actions get an empty station (stop, turn, go)
  const acts = (plan.actions ?? []).map((a, i) => ({ a, i, at: Math.min(Math.max(a.at, 0), planLen) })).sort((x, y) => x.at - y.at || x.i - y.i)
  const stations: Station[] = []
  for (const { a, at } of acts) {
    const last = stations[stations.length - 1]
    if (last && at - last.o <= GROUP) last.actions.push(a); else stations.push({ o: at, s: 0, actions: [a] })
  }
  for (const st of stations) { const c = rough.corners.find((k) => Math.abs(k.o - st.o) <= SNAP); if (c) st.o = c.o }
  const path = smoothPath(plan.path, plan.turnRadius ?? RADIUS, (o) => stations.some((st) => Math.abs(st.o - o) < 1e-6))
  for (const c of path.corners) if (c.sharp && !stations.some((st) => Math.abs(st.o - c.o) < 1e-6)) stations.push({ o: c.o, s: 0, actions: [] })
  stations.sort((a, b) => a.o - b.o)
  for (const st of stations) st.s = Math.min(path.fromPlan(st.o), path.length)

  // the kneel source (CMU 23_03) reaches out with the right hand to someone beside him: play the idle's hanging right arm instead
  const relaxArm = { clip: C.idle, joints: lib.canon.names.flatMap((n, j) => (/^(Right(Shoulder|Arm|ForeArm|Hand|FingerBase|HandIndex1)|RThumb)$/.test(n) ? [j] : [])) }
  const segs: Seg[] = [], tmpA = makePose(lib.canon.names.length), tmpB = makePose(lib.canon.names.length)
  const warnings: string[] = [] // (track D) playback warnings, surfaced by the panel (a made move whose clip is missing)
  const end = () => (segs.length ? segs[segs.length - 1].t1 : 0)
  /** append a segment, carrying the body on from where the previous one left it */
  function add(seg: Seg): Seg {
    const prev = segs[segs.length - 1]
    if (prev) {
      const a = segPose(prev, prev.t1, tmpA).root, b = segPose(seg, seg.t0, tmpB).root
      seg.shift = { x: a.x - b.x, z: a.z - b.z }
      // moving segments ease the gap out slowly enough that the planted foot creeps at most ~SLIDE m/s (the rest passes on)
      if (seg.decay !== Infinity) seg.decay = Math.max(0.5, (1.5 * Math.hypot(seg.shift.x, seg.shift.z)) / SLIDE)
    }
    segs.push(seg)
    return seg
  }
  const facingAtEnd = () => { const p = segs[segs.length - 1]; return facingYaw(segPose(p, p.t1, tmpA).q[0]) }
  const oncePose = (c: Clip, τ: number) => c.once(τ, tmpB)
  const match = phaseMatcher(lib.canon.names.length), gaitOf = new Map<Seg, Clip>() // travel segments by the gait loop they play
  const fit = plan.strideFit === true // (motion/strideFit.ts) paths saved after the fit; older plans keep the walk starting at phase 0

  /** the first stretch's phase: matched to the start clip's last pose after a start, else mid-stride from 0 (memo per clip) */
  const entered = new Map<Clip, number>()
  function leg(sA: number, sB: number, fromRest: boolean, toStop: boolean): void {
    const S = C.start, P = C.stop, legLen = sB - sA
    const Ds = fromRest ? S.prog(S.def.out) : 0
    entered.clear()
    const enter = (c: Clip) => {
      if (!fromRest && !(fit && toStop)) return 0
      let v = entered.get(c)
      if (v === undefined) {
        if (fromRest) { oncePose(S, S.def.out); v = argmin(0, c.cycle, (u) => poseDistance(c.loop(u, tmpA), tmpB)) }
        else { // (motion/strideFit.ts) mid-stride into a stop: the phase that lands the stride on the stop's best entry
          const f = stopFit(C.walk, P, lib.canon.names.length), tr = legLen - (P.prog(P.def.out) - P.prog(f.entry))
          v = tr >= 0 ? fittedPhase0(c, C.walk, tr, f, pace, lib.canon.names.length, match) : 0
        }
        entered.set(c, v)
      }
      return v
    }
    const chain = (tr: number) => stretches(gait, C.walk, tr, fromRest, toStop, enter, match)
    let e = P.def.in, travel = legLen - Ds, k = 1
    if (toStop) {
      const [e0, e1] = P.def.enter ?? [P.def.in, P.def.in], Dst = (x: number) => P.prog(P.def.out) - P.prog(x)
      let best = Infinity
      for (let x = e0; x <= e1 + 1e-9; x += 1 / 60) {
        const tr = legLen - Ds - Dst(x)
        if (tr < 0) continue
        const ch = chain(tr), last = ch[ch.length - 1] // (chain first: matching the start's pose reuses tmpB)
        oncePose(P, x)
        const d = poseDistance(last.clip.loop(endPhase(last), tmpA), tmpB)
        if (d < best) { best = d; e = x; travel = tr }
      }
      if (best === Infinity) { e = e1; travel = 0; k = legLen / (Ds + Dst(e1)) }
    } else if (travel < 0) { travel = 0; k = legLen / Ds }
    // anchors stay inside (sA, sB): at a sharp corner the heading either side differs by the corner's angle
    const lo = fromRest ? sA + 1e-4 : -Infinity, hi = toStop ? sB - 1e-4 : Infinity
    if (fromRest) add(progressSeg('start', S, path, S.def.in, S.def.out, sA, S.def.in, pace, end(), k, lo, hi))
    let s = sA + Ds * k
    if (travel > 1e-3) for (const st of chain(travel)) {
      if (st.len <= 1e-3) continue
      const prev = segs[segs.length - 1], seg = add(travelSeg(st.clip, path, s, st.phase0, pace, end(), st.len / ((st.clip.stride / st.clip.cycle) * pace), lo, hi))
      if (gaitOf.has(prev) && gaitOf.get(prev) !== st.clip) easeSpeeds(prev, seg, Math.min(XF_EASE, 0.9 * (prev.t1 - prev.t0), 0.9 * (seg.t1 - seg.t0)))
      gaitOf.set(seg, st.clip); s += st.len
    }
    if (toStop) add(progressSeg('stop', P, path, e, P.def.out, sB, P.def.out, pace, end(), k, lo, hi))
  }

  function station(st: Station, more: boolean): void {
    const pt = path.at(st.s), first = !segs.length
    let yaw = first ? pt.yaw : segs[segs.length - 1].anchor(end()).yaw
    let body = first ? pt.yaw : facingAtEnd()
    const turn = (bodyDeg: number, intentDeg: number) => {
      const parts = Math.abs(bodyDeg) > 135 ? 2 : 1
      for (let i = 0; i < parts; i++) {
        add(turnSeg(bodyDeg >= 0 ? C.turnLeft : C.turnRight, pt, yaw, intentDeg / parts, body, bodyDeg / parts, end()))
        yaw += THREE.MathUtils.degToRad(intentDeg / parts); body = facingAtEnd()
      }
    }
    /** stand still for `secs` (a stop/idle/look segment, or a made move's placeholder), crossfade-clean from the previous segment's phase */
    const standStill = (kind: string, secs: number, lookDeg = 0) => {
      const prev = segs[segs.length - 1], phase = prev ? (prev.local(prev.t1, tmpB), argmin(0, C.idle.cycle, (u) => poseDistance(C.idle.loop(u, tmpA), tmpB))) : 0
      const seg = idleSeg(kind, C.idle, lib.canon, pt, yaw, body, end(), Math.max(secs, 0.2), lookDeg, phase)
      // (motion/settle.ts) a walk arriving (the stop clip, not a pinned 'stop' action): the upper body settles from the stop's last pose
      add(plan.softSettle === true && prev?.kind === 'stop' && prev.decay !== Infinity ? settleFrom(seg, prev, lib.canon) : seg)
    }
    st.actions.forEach((a, i) => {
      const K = C.kneel, last = i === st.actions.length - 1
      if (a.kind === 'stop' || a.kind === 'idle' || a.kind === 'look') {
        standStill(a.kind, a.seconds ?? (a.kind === 'stop' ? 1 : a.kind === 'idle' ? 2 : 2.5), a.kind === 'look' ? (a.deg ?? 45) : 0)
      } else if (a.kind === 'turn') turn(a.deg ?? 90, a.deg ?? 90)
      else if (a.kind === 'kneel') {
        const [h0, h1] = K.def.hold ?? [K.def.out, K.def.out], hold = Math.max(a.seconds ?? 2, 0.3)
        add(pinnedSeg('kneel', K, pt, yaw, body, K.def.in, h0, end(), h0 - K.def.in, relaxArm))
        add(pinnedSeg('kneel-hold', K, pt, yaw, body, h0, Math.min(h1, h0 + hold), end(), hold, relaxArm))
        if (!last || more) add(pinnedSeg('kneel-up', K, pt, yaw, body, h1, K.def.out, end(), K.def.out - h1, relaxArm))
      } else if (a.kind === 'lift') { // lift a frame from the hive, hold it up; lower it back and stand only when more follows (as kneel)
        const U = C.lift, D = C.liftDown, [h0, h1] = U.def.hold ?? [U.def.out, U.def.out], hold = Math.max(a.seconds ?? 2, 0.3)
        add(pinnedSeg('lift', U, pt, yaw, body, U.def.in, h0, end()))
        add(pinnedSeg('lift-hold', U, pt, yaw, body, h0, Math.min(h1, h0 + hold), end(), hold))
        if (!last || more) add(pinnedSeg('lift-down', D, pt, yaw, body, D.def.in, D.def.out, end()))
      } else if (a.kind === 'move') { // a made move (track D): its kept clip plays like the lift; the branch lives in moveAction.ts
        addMoveAction(a, { add, turn, standStill, at: pt, yawNow: () => yaw, bodyNow: () => body, end, last, more, lookup: (id) => lib.clips[id], notes: lib.notes, warn: (w) => warnings.push(w) })
      }
      body = facingAtEnd()
    })
    if (more) { // face down the next leg before walking off
      const out = path.at(st.s + 1e-3).yaw, d = wrapAngle(out - body)
      if (Math.abs(d) > AUTO_TURN) turn(THREE.MathUtils.radToDeg(d), THREE.MathUtils.radToDeg(wrapAngle(out - yaw)))
    }
  }

  let s = 0, rest = false
  const near0 = stations.length && stations[0].s <= GROUP
  if (near0) { const st0 = stations.shift()!; station(st0, path.length - st0.s > GROUP); s = st0.s; rest = true }
  for (const st of stations) {
    if (st.s - s > 1e-3) leg(s, st.s, rest, true)
    const more = path.length - st.s > GROUP
    station(st, more); s = st.s; rest = true
  }
  if (path.length - s > GROUP) leg(s, path.length, rest, false)
  if (!segs.length) leg(0, path.length, false, false)
  const xf = segs.map((g, i) => {
    if (!i) return 0
    const p = segs[i - 1], moving = (x: Seg) => x.kind === 'travel' || x.kind === 'start' || x.kind === 'stop'
    const ease = gaitOf.has(p) && gaitOf.has(g) && gaitOf.get(p) !== gaitOf.get(g) // a run easing to or from its walk
    return Math.min(ease ? XF_EASE : moving(p) && moving(g) ? XF_GAIT : XF, 0.9 * (p.t1 - p.t0), 0.9 * (g.t1 - g.t0))
  })
  return { segs, xf, duration: end(), path, lib, warnings }
}
