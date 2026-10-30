/**
 * A kit world's PerformancePlan (src/stage3d/contract.ts) as the server accepts it: a ground path of at least two points inside the
 * world, optional actions, pace, gait, turn radius (track M) and cast card (wave 2), and (wave A) stand at the mark and the shot length. Rebuilt field by field, so nothing the page did not mean lands in performance.json.
 */
import { SHOT_SECONDS_MAX, SHOT_SECONDS_MIN, type ActionKind, type CreaturePlan, type ExtraPlan, type PathAction, type PerformancePlan } from '../../src/stage3d/contract.ts'
import { GEN_ID_RE } from '../../src/stage3d/motion/userClips.ts'
import { TAG_RE } from '../../src/shared/bibleContract.ts'
import type { KitPerformance } from './types.ts'

/** the kit's ground is 600 m square about the origin; a path stays well inside it */
export const PATH_LIMIT_M = 200
export const MAX_PATH_POINTS = 64
/** metres: the walking turn's radius at corners without a stop (motion/compile.ts shrinks it to fit short legs) */
export const TURN_RADIUS_MAX = 10
/** (E1) background figures per performance; the spike ran 30 in the browser clay, each costs capture time */
export const MAX_EXTRAS = 24
/** seconds an extra may wait before it starts walking */
export const EXTRA_DELAY_MAX = 60
/** extras-sheet variants an extra may index (bibleContract BibleExtrasSheet is 6-8 figures) */
export const EXTRA_VARIANTS = 16
/** a Bible element tag without the '@' (bibleContract BIBLE_TAG_RE) */
export const EXTRA_TAG_RE = TAG_RE
const ACTIONS: readonly ActionKind[] = ['stop', 'turn', 'look', 'idle', 'kneel', 'lift', 'move']
/** (track D) a made move's id is GEN_ID_RE (motion/userClips.ts), as the keep route hands it back: gen:<motion-id> */
/** a cast card id, as server/cast/routes.ts CARD_ID_RE makes them */
export const CAST_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/
/** the hero's costumes older performance files hold (contract PerformancePlan.costume; extras take 'modern', 'plain' and 'soldier'):
 *  still accepted and kept as read so old files load and their keys hold; no figure is built from them, and new code writes none */
const HERO_COSTUMES: readonly NonNullable<PerformancePlan['costume']>[] = ['modern', 'coat', 'gown', 'plain', 'soldier']

/** (wave A) the refusal for a shot length outside 2..8 s, in the owner's words (the 8 s, 193-frame ceiling is CLAY_MAX) */
export const SHOT_LENGTH_REFUSED = `The shot length must be ${SHOT_SECONDS_MIN} to ${SHOT_SECONDS_MAX} seconds (a render keeps at most 8 s, 193 frames).`

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export type PerfResult = { ok: true; perf: KitPerformance } | { ok: false; errors: string[] }

/** a ground polyline of 2..MAX_PATH_POINTS points within PATH_LIMIT_M with some length, or the errors (named by `what`) */
function groundPath(raw: unknown, what: string, errors: string[], stand = false): [number, number][] {
  const path: [number, number][] = []
  // a standing extra is one spot (it never walks), so one point with no length is fine
  if (!Array.isArray(raw) || raw.length < (stand ? 1 : 2) || raw.length > MAX_PATH_POINTS) { errors.push(`${what} must hold ${stand ? 1 : 2} to ${MAX_PATH_POINTS} ground points [x, z]`); return path }
  raw.forEach((pt, i) => {
    if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(finite)) errors.push(`${what}[${i}] must be [x, z] in metres`)
    else if (Math.abs(pt[0]) > PATH_LIMIT_M || Math.abs(pt[1]) > PATH_LIMIT_M) errors.push(`${what}[${i}] is more than ${PATH_LIMIT_M} m from the centre`)
    else path.push([pt[0], pt[1]])
  })
  if (!stand && path.length === raw.length && path.every((q, i) => i === 0 || Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) < 1e-6)) errors.push(`the ${what} has no length`)
  return path
}

/** a list of path actions rebuilt field by field (the hero's and an extra's alike). `motions`: the kept moves' ids (track D); when
 *  given, a made move whose id is not kept is refused in plain words; when omitted, the id is only checked for its shape. */
function parseActions(raw: unknown, what: string, errors: string[], motions?: readonly string[]): PathAction[] {
  const actions: PathAction[] = []
  if (!Array.isArray(raw)) { errors.push(`${what} must be a list`); return actions }
  raw.forEach((a: PathAction | null, i) => {
    if (!a || !ACTIONS.includes(a.kind) || !finite(a.at) || a.at < 0) return void errors.push(`${what}[${i}] needs a kind (${ACTIONS.join(', ')}) and at >= 0`)
    if (a.seconds !== undefined && (!finite(a.seconds) || a.seconds < 0)) return void errors.push(`${what}[${i}].seconds must be >= 0`)
    if (a.deg !== undefined && !finite(a.deg)) return void errors.push(`${what}[${i}].deg must be a number`)
    const move: Partial<PathAction> = {}
    if (a.kind === 'move') { // (track D) a made move: its kept clip must exist (a folder with a clip.json under lab-assets/motions)
      if (typeof a.motion !== 'string' || !GEN_ID_RE.test(a.motion)) return void errors.push(`${what}[${i}] (a made move) needs the id of a kept move, like "gen:take-a-frame"`)
      if (motions !== undefined && !motions.includes(a.motion)) return void errors.push(`${what}[${i}] names a move we don't have (${a.motion}). Make the move again, or place a ready-made one.`)
      if (a.toward !== undefined && (!(Array.isArray(a.toward) && a.toward.length === 2 && a.toward.every(finite)) || a.toward.some((v) => Math.abs(v) > PATH_LIMIT_M))) {
        return void errors.push(`${what}[${i}].toward must be [x, z] within ${PATH_LIMIT_M} m of the centre`)
      }
      move.motion = a.motion
      if (a.toward !== undefined) move.toward = [a.toward[0], a.toward[1]]
    }
    actions.push({ kind: a.kind, at: a.at, ...(a.seconds !== undefined ? { seconds: a.seconds } : {}), ...(a.deg !== undefined ? { deg: a.deg } : {}), ...move })
  })
  return actions
}

/** (E1) extras rebuilt field by field; an absent list stays absent so old performances read back unchanged */
function parseExtras(raw: unknown, errors: string[], motions?: readonly string[]): ExtraPlan[] {
  const out: ExtraPlan[] = []
  if (!Array.isArray(raw) || raw.length > MAX_EXTRAS) { errors.push(`extras must be a list of at most ${MAX_EXTRAS}`); return out }
  raw.forEach((e: Partial<ExtraPlan> | null, i) => {
    if (!e || typeof e !== 'object') return void errors.push(`extras[${i}] must be an object`)
    const n = errors.length
    if (e.stand !== undefined && typeof e.stand !== 'boolean') errors.push(`extras[${i}].stand must be true or false`)
    const stand = e.stand === true, path = groundPath(e.path, `extras[${i}].path`, errors, stand)
    if (e.gait !== 'walk' && e.gait !== 'run') errors.push(`extras[${i}].gait must be 'walk' or 'run'`)
    if (!finite(e.delay) || e.delay < 0 || e.delay > EXTRA_DELAY_MAX) errors.push(`extras[${i}].delay must be 0 to ${EXTRA_DELAY_MAX} s`)
    if (e.costume !== 'soldier' && e.costume !== 'plain' && e.costume !== 'modern') errors.push(`extras[${i}].costume must be 'modern', 'plain' or 'soldier'`)
    if (!Number.isInteger(e.variant) || (e.variant as number) < 0 || (e.variant as number) >= EXTRA_VARIANTS) errors.push(`extras[${i}].variant must be a whole number 0 to ${EXTRA_VARIANTS - 1}`)
    if (e.tag !== undefined && (typeof e.tag !== 'string' || !EXTRA_TAG_RE.test(e.tag))) errors.push(`extras[${i}].tag must be a tag from the scene sheet (no '@')`)
    if (e.face !== undefined && !(Array.isArray(e.face) && e.face.length === 2 && e.face.every(finite) && e.face.every((v) => Math.abs(v) <= PATH_LIMIT_M))) errors.push(`extras[${i}].face must be [x, z] within ${PATH_LIMIT_M} m`)
    const actions = e.actions !== undefined ? parseActions(e.actions, `extras[${i}].actions`, errors, motions) : undefined
    if (errors.length > n) return
    out.push({ path, gait: e.gait!, delay: e.delay!, costume: e.costume!, variant: e.variant!, ...(e.tag !== undefined ? { tag: e.tag } : {}),
      ...(stand ? { stand: true } : {}), ...(e.face !== undefined ? { face: [e.face[0], e.face[1]] as [number, number] } : {}), ...(actions !== undefined ? { actions } : {}) })
  })
  return out
}

export function parsePerformancePlan(raw: unknown, motions?: readonly string[]): PerfResult {
  const p = raw as Partial<KitPerformance> | null
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, errors: ['the performance must be an object'] }
  const errors: string[] = []
  const path = groundPath(p.path, 'path', errors)
  const actions = p.actions !== undefined ? parseActions(p.actions, 'actions', errors, motions) : []
  if (p.pace !== undefined && (!finite(p.pace) || p.pace < 0.2 || p.pace > 3)) errors.push('pace must be 0.2 to 3')
  if (p.gait !== undefined && p.gait !== 'walk' && p.gait !== 'run') errors.push("gait must be 'walk' or 'run'")
  if (p.turnRadius !== undefined && (!finite(p.turnRadius) || p.turnRadius < 0 || p.turnRadius > TURN_RADIUS_MAX)) errors.push(`turnRadius must be 0 to ${TURN_RADIUS_MAX} m`)
  if (p.castId !== undefined && (typeof p.castId !== 'string' || !CAST_ID_RE.test(p.castId))) errors.push('castId must be a cast card id')
  if (p.costume !== undefined && !HERO_COSTUMES.includes(p.costume)) errors.push(`costume must be one of ${HERO_COSTUMES.join(', ')}`)
  if (p.stand !== undefined && typeof p.stand !== 'boolean') errors.push('stand must be true or false')
  if (p.strideFit !== undefined && typeof p.strideFit !== 'boolean') errors.push('strideFit must be true or false')
  if (p.softSettle !== undefined && typeof p.softSettle !== 'boolean') errors.push('softSettle must be true or false')
  if (p.shotSeconds !== undefined && (!finite(p.shotSeconds) || p.shotSeconds < SHOT_SECONDS_MIN || p.shotSeconds > SHOT_SECONDS_MAX)) errors.push(SHOT_LENGTH_REFUSED)
  const creatures: CreaturePlan[] = []
  if (p.creatures !== undefined) {
    if (!Array.isArray(p.creatures) || p.creatures.length > 4) errors.push('creatures must be a list of at most 4')
    else p.creatures.forEach((c, i) => {
      if (!c || c.kind !== 'dragon' || c.action !== 'roar') return void errors.push(`creatures[${i}] must be { kind: 'dragon', action: 'roar' }`)
      if (!Array.isArray(c.at) || c.at.length !== 2 || !c.at.every(finite) || Math.abs(c.at[0]) > PATH_LIMIT_M || Math.abs(c.at[1]) > PATH_LIMIT_M) return void errors.push(`creatures[${i}].at must be [x, z] within ${PATH_LIMIT_M} m`)
      if (c.yawDeg !== undefined && !finite(c.yawDeg)) return void errors.push(`creatures[${i}].yawDeg must be a number`)
      if (c.scale !== undefined && (!finite(c.scale) || c.scale < 0.2 || c.scale > 3)) return void errors.push(`creatures[${i}].scale must be 0.2 to 3`)
      creatures.push({ kind: 'dragon', action: 'roar', at: [c.at[0], c.at[1]], ...(c.yawDeg !== undefined ? { yawDeg: c.yawDeg } : {}), ...(c.scale !== undefined ? { scale: c.scale } : {}) })
    })
  }
  const extras = p.extras !== undefined ? parseExtras(p.extras, errors, motions) : undefined
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    perf: { path, ...(p.actions !== undefined ? { actions } : {}), ...(p.pace !== undefined ? { pace: p.pace } : {}), ...(p.gait !== undefined ? { gait: p.gait } : {}),
      ...(p.turnRadius !== undefined ? { turnRadius: p.turnRadius } : {}), ...(p.castId !== undefined ? { castId: p.castId } : {}),
      ...(p.costume !== undefined ? { costume: p.costume } : {}), ...(creatures.length ? { creatures } : {}), ...(extras !== undefined ? { extras } : {}),
      ...(p.stand === true ? { stand: true } : {}), ...(p.shotSeconds !== undefined ? { shotSeconds: p.shotSeconds } : {}),
      ...(p.strideFit === true ? { strideFit: true } : {}),
      ...(p.softSettle === true ? { softSettle: true } : {}) },
  }
}
