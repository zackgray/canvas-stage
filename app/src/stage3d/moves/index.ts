/**
 * The one entry point the panel calls (plan section 2 end to end): words + the picked piece measured on the Set → a MoveSpec,
 * or the chips / refusal / unknown result the panel shows instead. Order per plan 2.1: refusals first ("checked before anything
 * is sent"), then traits are stripped (the note is shown once), then the verb table picks the class, then the piece is measured
 * (out of reach is refused with its distance) and the keys, sentence and phases are built. Pure.
 */
import { classify, gestureVerb } from './classify.ts'
import { measurePiece, type BoxLike, type PieceMeasure } from './measure.ts'
import { durationSeconds, NOT_AVAILABLE_YET, outOfReach, REACH_M, refuseWords } from './refuse.ts'
import { extractObject, moveSentence } from './sentence.ts'
import { keysFor } from './keys.ts'
import { movePhases } from './phases.ts'
import { stripTraits } from './traits.ts'
import type { MoveClass, MoveSpec, PropKind, Vec3 } from './types.ts'

export type MoveInput = {
  /** what the user wrote, e.g. "takes a frame out of the hive and holds it up to the light" */
  words: string
  /** the picked Set piece: its id and short name (for "the hive"), its world bounds at the action point */
  piece?: { id: string; name: string; box: BoxLike }
  /** the action point on the path (the performer's spot), world; defaults to the origin */
  at?: Vec3
  /** the performer's facing there, radians (0 = +Z); defaults to facing the piece (plan 2.5's auto-turn) */
  facingYaw?: number
  /** the handled object's grip width when it is a known prop (the frame is 0.42 m) */
  knownGrip?: number
  /** the kind of move the owner picked when the words fit two ("Do you mean"): planned as that kind, the words kept as written */
  cls?: MoveClass
}

export type MovePlan =
  | { kind: 'spec'; spec: MoveSpec; note?: string }
  | { kind: 'chips'; chips: MoveClass[] }
  | { kind: 'refused'; message: string }
  | { kind: 'unknown' }

const DEFAULT_SECONDS = 8
/** pick-up/put-down without a picked piece work on the floor this far ahead */
const FLOOR: BoxLike = { min: [-0.25, 0, 0.3], max: [0.25, 0.001, 0.8] }

export function planMove(input: MoveInput): MovePlan {
  const words = input.words.trim()
  if (!words) return { kind: 'unknown' }
  const refusal = refuseWords(words)
  if (refusal) return { kind: 'refused', message: refusal.message }

  const traits = stripTraits(words)
  const result = input.cls ? { class: input.cls } : classify(traits.words)
  if ('ambiguous' in result) return { kind: 'chips', chips: result.ambiguous }
  if ('unknown' in result) return { kind: 'unknown' }
  const cls = result.class
  // (live finding) put down is not available yet, and neither is a pick up off the floor: refused in plain words before
  // anything is sent. A pick up needs its measure to tell a floor from a surface (0.05 m), so its check comes after measuring.
  if (cls === 'putDown') return { kind: 'refused', message: NOT_AVAILABLE_YET }

  const seconds = durationSeconds(words) ?? DEFAULT_SECONDS
  const measured = measure(input, cls)
  if ('message' in measured) return { kind: 'refused', message: measured.message }
  const { measure: m, pieceId, pieceName, propKind } = measured
  if (cls === 'pickUp' && propKind === 'floor') return { kind: 'refused', message: NOT_AVAILABLE_YET }

  const object = extractObject(traits.words, cls)
  const verb = cls === 'gesture' ? gestureVerb(traits.words) : undefined
  const keyTimes = keysFor(cls, m, seconds)
  const spec: MoveSpec = {
    class: cls,
    sentence: moveSentence(cls, { object, manner: traits.manner, verb }),
    seconds,
    keys: keyTimes.keys,
    grab: keyTimes.grab,
    release: keyTimes.release,
    hold: keyTimes.hold,
    phases: movePhases(cls, { piece: pieceName, object, verb }, seconds),
    prop: propKind ? { pieceId, kind: propKind, width: m.width, rimOrTop: m.rimOrTop, front: m.front, side: m.side } : undefined,
  }
  return { kind: 'spec', spec, note: traits.note }
}

type Measured = { measure: PieceMeasure; pieceId?: string; pieceName?: string; propKind?: PropKind }

/** the piece in the performer's frame, or the refusal when it cannot be reached; gestures measure nothing */
function measure(input: MoveInput, cls: MoveClass): Measured | { message: string } {
  const at = input.at ?? [0, 0, 0]
  if (!input.piece) {
    if (cls === 'gesture') return { measure: measurePiece({ box: FLOOR, at, facingYaw: 0 }) }
    if (cls === 'takeOut') return { message: 'Pick the piece she takes it out of.' }
    if (cls === 'holdUp') return { measure: measurePiece({ box: FLOOR, at, facingYaw: 0 }) }
    const m = measurePiece({ box: FLOOR, at, facingYaw: input.facingYaw ?? 0 })
    return { measure: m, propKind: 'floor' }
  }
  const { id, name, box } = input.piece
  const c = [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2]
  const facingYaw = input.facingYaw ?? Math.atan2(c[0] - at[0], c[1] - at[2])
  const m = measurePiece({ box, at, facingYaw }, input.knownGrip)
  if (m.distance > REACH_M) return { message: outOfReach(name, m.distance).message }
  const propKind: PropKind | undefined = cls === 'takeOut' ? 'container' : cls === 'holdUp' ? undefined : m.rimOrTop < 0.05 ? 'floor' : 'surface'
  return { measure: m, pieceId: id, pieceName: name, propKind }
}

export * from './types.ts'
export { classify, matchingClasses, CLASS_LABELS, gestureVerb } from './classify.ts'
export { refuseWords, outOfReach, durationSeconds, durationOver, MAX_SECONDS, REACH_M, NOT_AVAILABLE_YET } from './refuse.ts'
export { stripTraits } from './traits.ts'
export { moveSentence, extractObject, gesturePhrase, withArticle } from './sentence.ts'
export { keysFor, clampGrip, FPS, BASE_SECONDS, GRIP_MIN, GRIP_MAX, WORK_RIM_MAX, WORK_FRONT_MAX } from './keys.ts'
export { movePhases } from './phases.ts'
export { measurePiece, UNKNOWN_GRIP_MAX } from './measure.ts'
