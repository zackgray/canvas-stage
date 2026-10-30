// What the Set's top view can do to a plan (Track C, pure): move, turn, scale or remove one kit piece, add one, and set the
// subject's mark. Each returns the plan's new kit (or mark) for KitStore.changePlan, which validates the whole plan, stamps the set
// changed and so changes the set key. Errors are KitError with the status a route sends.
import type { KitItem, MarkPlan, PieceMove, ScenePlan } from '../../src/stage3d/contract.ts'
import { pieceOf } from '../../src/stage3d/kit.ts'
import { pieceKindOf } from '../../src/stage3d/pieceKinds.ts'
import { LABEL_MAX } from '../../src/stage3d/planLight.ts'
import { GROUND_KINDS, LIMITS, SKY_LOOKS, moveErrors } from '../../src/stage3d/planRules.ts'
import { faceCamera, freeSpot } from '../pieces/place.ts'
import { KitError } from './errors.ts'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pt = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(num)
const r2 = (v: number) => Math.round(v * 100) / 100
const yawOf = (v: number) => Math.round(((((v + 180) % 360) + 360) % 360 - 180) * 10) / 10
const BODY = 'body must be { index, kind, at?: [x, z], yawDeg?, pitchDeg?, rollDeg?, scale?, lift?, move?: { path, speed, faceTravel? } | null, frontDeg?, remove? } or { add: { kind, … } }'

/** the tilt (pitch/roll) a body asks for: like the turn's own normalize (±180, 0.1° steps), inside the plan's tilt range */
function tiltOf(v: unknown, name: string): number {
  if (!num(v)) throw new KitError(400, `${name} must be a number`)
  if (v < LIMITS.pitch[0] || v > LIMITS.pitch[1]) throw new KitError(400, `${name} must be a number from ${LIMITS.pitch[0]} to ${LIMITS.pitch[1]}`)
  return yawOf(v)
}

/** the move a body asks for: null clears the travel; points rounded to cm like `at`, the flag kept only when false (unset = on) */
function moveOf(v: unknown): PieceMove | null {
  if (v === null) return null
  const errs = moveErrors(v, 'move')
  if (errs.length) throw new KitError(400, errs[0])
  const o = v as { path: [number, number][]; speed: number; faceTravel?: unknown }
  return { path: o.path.map(([x, z]) => [r2(x), r2(z)] as [number, number]), speed: Math.round(o.speed * 100) / 100, ...(o.faceTravel === false ? { faceTravel: false } : {}) }
}

/** one piece moved, turned, tilted, scaled, lifted, sent along a path or cleared, relabelled, swapped for another kind or removed, or one added (`add`: a kit kind, its args, a place (a free spot when unset), a turn, a size) */
export function editKit(plan: ScenePlan, raw: unknown): KitItem[] {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (b.add !== undefined) return addPiece(plan, b.add)
  if (!Number.isInteger(b.index) || typeof b.kind !== 'string') throw new KitError(400, BODY)
  const { at, yawDeg: yaw, pitchDeg: pitch, rollDeg: roll, scale, lift, move, remove, label, swapTo, frontDeg: front } = b
  if (at !== undefined && !pt(at)) throw new KitError(400, 'at must be [x, z] in metres')
  if (at === undefined && remove !== true && scale === undefined && yaw === undefined && pitch === undefined && roll === undefined && lift === undefined && move === undefined && label === undefined && swapTo === undefined && front === undefined) throw new KitError(400, 'at must be [x, z] in metres')
  if (yaw !== undefined && !num(yaw)) throw new KitError(400, 'yawDeg must be a number')
  if (pitch !== undefined) tiltOf(pitch, 'pitchDeg')
  if (roll !== undefined) tiltOf(roll, 'rollDeg')
  if (move !== undefined && move !== null) moveOf(move)
  // (front-faces) where a built mesh's front is: its own turn offset (glb.yawOffsetDeg), 0..360
  if (front !== undefined && !num(front)) throw new KitError(400, 'frontDeg must be a number')
  if (scale !== undefined && !(num(scale) && scale >= LIMITS.scale[0] && scale <= LIMITS.scale[1])) throw new KitError(400, `scale must be a number from ${LIMITS.scale[0]} to ${LIMITS.scale[1]}`)
  if (lift !== undefined && !(num(lift) && lift >= LIMITS.lift[0] && lift <= LIMITS.lift[1])) throw new KitError(400, `lift must be a number from ${LIMITS.lift[0]} to ${LIMITS.lift[1]}`)
  const text = label !== undefined ? labelOf(label) : undefined
  const swap = swapTo !== undefined ? swapKindOf(swapTo) : undefined
  const it = plan.kit[b.index as number]
  if (!it || it.kind !== b.kind) throw new KitError(409, 'the set changed since this view was drawn: reload it and move the piece again')
  if (remove === true) return plan.kit.filter((_, i) => i !== b.index)
  if (swap !== undefined && swap !== it.kind) {
    if (it.glb) throw new KitError(422, 'a built piece keeps its own kind: remove it and add the new piece instead')
    if (!pieceOf(swap)) throw new KitError(422, `the set has no piece called "${swap}"`)
  }
  const item = swap !== undefined && swap !== it.kind ? { ...it, kind: swap, ...(it.args !== undefined ? { args: undefined } : {}) } : it
  const kit = [...plan.kit]
  kit[b.index as number] = { ...item, ...(at ? { at: [r2(at[0]), r2(at[1])] as [number, number] } : {}), ...(yaw !== undefined ? { yawDeg: yawOf(yaw as number) } : {}), ...(pitch !== undefined ? { pitchDeg: tiltOf(pitch, 'pitchDeg') } : {}), ...(roll !== undefined ? { rollDeg: tiltOf(roll, 'rollDeg') } : {}), ...(scale !== undefined ? { scale: r2(scale as number) } : {}), ...(lift !== undefined ? { lift: r2(lift as number) } : {}), ...(move !== undefined && move !== null ? { move: moveOf(move)! } : {}), ...(text !== undefined ? { label: text || undefined } : {}) }
  if (move === null) delete kit[b.index as number].move // clear the travel
  if (front !== undefined) {
    const g = kit[b.index as number].glb
    if (!g) throw new KitError(422, 'only a piece built in 3D has a front to set')
    kit[b.index as number] = { ...kit[b.index as number], glb: { ...g, yawOffsetDeg: Math.round(((((front as number) % 360) + 360) % 360) * 10) / 10 } }
  }
  return kit
}

/** a label from a raw body value: trimmed, at most LABEL_MAX characters ('' clears the label); a bad value is a 400 */
function labelOf(v: unknown): string {
  if (typeof v !== 'string') throw new KitError(400, 'label must be a string, the brief\'s own words for the piece')
  const t = v.trim()
  if (t.length > LABEL_MAX) throw new KitError(400, `label must be at most ${LABEL_MAX} characters`)
  return t
}

/** the kind a swap asks for: trimmed, non-empty, at most 60 characters; a bad value is a 400 */
function swapKindOf(v: unknown): string {
  if (typeof v !== 'string') throw new KitError(400, 'swapTo must be a string, the new kind for the piece')
  const t = v.trim()
  if (!t) throw new KitError(400, 'swapTo must be a kind, like "wagon"')
  if (t.length > 60) throw new KitError(400, 'swapTo must be at most 60 characters')
  return t
}

function addPiece(plan: ScenePlan, raw: unknown): KitItem[] {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof a.kind !== 'string' || !a.kind) throw new KitError(400, 'add needs a kind')
  if (a.at !== undefined && !pt(a.at)) throw new KitError(400, 'at must be [x, z] in metres')
  if (plan.kit.length >= LIMITS.kit) throw new KitError(422, `the set already has ${LIMITS.kit} pieces`)
  const { at: _at, yawDeg, scale, ...rest } = a
  const at = pt(a.at) ? ([r2(a.at[0]), r2(a.at[1])] as [number, number]) : freeSpot(plan, Math.max(2, pieceKindOf(a.kind).size))
  const item = { ...rest, at, yawDeg: num(yawDeg) ? yawOf(yawDeg) : faceCamera(at), ...(num(scale) ? { scale: r2(scale) } : {}) } as unknown as KitItem
  return [...plan.kit, item]
}

/** the plan's mark from a body { at: [x, z], yawDeg? } */
export function editMark(raw: unknown): MarkPlan {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!pt(b.at)) throw new KitError(400, 'body must be { at: [x, z], yawDeg? }')
  if (b.yawDeg !== undefined && !num(b.yawDeg)) throw new KitError(400, 'yawDeg must be a number')
  return { at: [r2(b.at[0]), r2(b.at[1])], ...(b.yawDeg !== undefined ? { yawDeg: yawOf(b.yawDeg as number) } : {}) }
}

/**
 * (layout wave L5) The sky's look from a body { look } — the same field the planner writes, so the drawn sky dome follows it
 * (stage3d/sky.ts). One of the plan's own looks; anything else is a 400, in the piece route's plain-word style.
 */
export function editSky(plan: ScenePlan, raw: unknown): ScenePlan['sky'] {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const look = b.look
  if (typeof look !== 'string' || !(SKY_LOOKS as readonly string[]).includes(look)) {
    throw new KitError(400, `look must be one of ${SKY_LOOKS.join(', ')}`)
  }
  return { ...plan.sky, look: look as ScenePlan['sky']['look'] }
}

/** the ground's shape from a body { ground: 'flat' | 'rolling' } (the Set panel's Ground row); anything else is a 400 in plain words */
export function editGround(raw: unknown): NonNullable<ScenePlan['ground']> {
  const g = ((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>).ground
  if (typeof g !== 'string' || !(GROUND_KINDS as readonly string[]).includes(g)) throw new KitError(400, `ground must be one of ${GROUND_KINDS.join(', ')}`)
  return g as NonNullable<ScenePlan['ground']>
}

/**
 * The sun (the key light's direction) from a body { keyDir: [yaw, elevation] } in degrees — the field the planner writes from the
 * brief's light (planBriefLight.ts) and world.ts reads. Inside the plan's own ranges; anything else is a 400 in plain words.
 */
export function editLight(plan: ScenePlan, raw: unknown): NonNullable<ScenePlan['light']> {
  const k = ((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>).keyDir
  if (!pt(k)) throw new KitError(400, 'body must be { keyDir: [yaw, elevation] } in degrees')
  const elev = Math.round(k[1] * 10) / 10
  if (elev < LIMITS.keyElev[0] || elev > LIMITS.keyElev[1]) throw new KitError(400, `the sun's height must be ${LIMITS.keyElev[0]} to ${LIMITS.keyElev[1]} degrees`)
  const yaw = Math.round(((((k[0] % 360) + 360) % 360)) * 10) / 10
  return { ...plan.light, keyDir: [yaw, elev] }
}
