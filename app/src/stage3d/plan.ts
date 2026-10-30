/**
 * ScenePlan validator: the gate every plan passes (hand-authored or written by the in-app LLM). Errors are short sentences that
 * name the field, so a retry prompt can quote them verbatim. LLM path: parsePlan -> (on failure) repairPlan -> parsePlan.
 * Keys starting with "_" are comments and ignored.
 */
import type { ScenePlan } from './contract.ts'
import { KIT_PIECES, pieceOf } from './kit.ts'
import { LABEL_MAX } from './planLight.ts'
import { FOG_COLOR, GROUND_KINDS, LIMITS, SKY_LOOKS, SKY_PREFIX, glbErrors, inCorridor, inRange, isNum, moveErrors, pieceTagOk } from './planRules.ts'

export { repairPlan } from './planRepair.ts'
export type PlanResult = { ok: true; plan: ScenePlan } | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function unknownKeys(o: Record<string, unknown>, allowed: string[], where: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!k.startsWith('_') && !allowed.includes(k)) errors.push(`${where}: unknown field "${k}" (allowed: ${allowed.join(', ')})`)
}

/** check `o[key]` is a finite number within the range when present; returns the value or undefined */
function num(o: Record<string, unknown>, key: string, where: string, range: readonly number[], errors: string[], int = false): void {
  const v = o[key]
  if (v === undefined) return
  const w = `${where}${key}`
  if (!isNum(v)) errors.push(`${w}: must be a number, got ${JSON.stringify(v)}`)
  else if (int && !Number.isInteger(v)) errors.push(`${w}: must be an integer, got ${v}`)
  else if (!inRange(v, range)) errors.push(`${w}: ${v} is outside ${range[0]}..${range[1]}`)
}

function pair(v: unknown, w: string, errors: string[], ranges: readonly (readonly number[])[]): void {
  if (!Array.isArray(v) || v.length !== ranges.length) { errors.push(`${w}: must be a list of ${ranges.length} numbers`); return }
  v.forEach((n, i) => { if (!isNum(n)) errors.push(`${w}[${i}]: must be a number`); else if (!inRange(n, ranges[i])) errors.push(`${w}[${i}]: ${n} is outside ${ranges[i][0]}..${ranges[i][1]}`) })
}

function checkSky(sky: unknown, errors: string[]): void {
  if (!isObj(sky)) { errors.push('sky: required object with a url'); return }
  unknownKeys(sky, ['url', 'look', 'yawDeg', 'horizonLiftDeg', 'gain', 'band', 'cutDeg'], 'sky', errors)
  if (sky.look !== undefined && !(SKY_LOOKS as readonly unknown[]).includes(sky.look)) errors.push(`sky.look: must be one of ${SKY_LOOKS.join(', ')}, got ${JSON.stringify(sky.look)}`)
  const url = sky.url
  if (typeof url !== 'string' || !url) errors.push('sky.url: required string path')
  else if (!url.startsWith(SKY_PREFIX) || url.includes('..') || /^[a-z]+:/i.test(url)) errors.push(`sky.url: must be a path under ${SKY_PREFIX}, got "${url}"`)
  num(sky, 'yawDeg', 'sky.', LIMITS.skyYaw, errors); num(sky, 'horizonLiftDeg', 'sky.', LIMITS.skyLift, errors)
  num(sky, 'gain', 'sky.', LIMITS.skyGain, errors); num(sky, 'cutDeg', 'sky.', LIMITS.skyCut, errors)
  if (sky.band !== undefined) {
    pair(sky.band, 'sky.band', errors, [[0, 1], [0, 1]])
    if (Array.isArray(sky.band) && isNum(sky.band[0]) && isNum(sky.band[1]) && sky.band[0] >= sky.band[1]) errors.push('sky.band: first value must be smaller than the second')
  }
}

function checkItem(it: unknown, i: number, flat: ScenePlan['flat'], errors: string[], corridor: boolean): void {
  const w = `kit[${i}]`
  if (!isObj(it)) { errors.push(`${w}: must be an object like {"kind":"fence","args":[6,1,0.3],"at":[x,z]}`); return }
  unknownKeys(it, ['kind', 'args', 'at', 'yawDeg', 'pitchDeg', 'rollDeg', 'scale', 'lift', 'move', 'walkThrough', 'glb', 'pieceTag', 'label'], w, errors)
  if (it.label !== undefined && (typeof it.label !== 'string' || it.label.length > LABEL_MAX)) errors.push(`${w}.label: must be a string up to ${LABEL_MAX} characters, the brief's own words for the piece`)
  if (it.pieceTag !== undefined && !pieceTagOk(it.pieceTag)) errors.push(`${w}.pieceTag: must be "prop:<tag>" (a lower-case tag), got ${JSON.stringify(it.pieceTag)}`)
  // a generated piece: its mesh is the glb, its kind a plain noun for the prompts; no KIT builder, no footprint to check
  const glb = it.glb !== undefined
  const piece = !glb && typeof it.kind === 'string' ? pieceOf(it.kind) : undefined
  if (glb) errors.push(...glbErrors(it, w))
  else if (!piece) errors.push(`${w}.kind: unknown kind ${JSON.stringify(it.kind)} (known: ${Object.keys(KIT_PIECES).join(', ')})`)
  else if (it.args !== undefined) {
    if (!Array.isArray(it.args)) errors.push(`${w}.args: must be a list of numbers`)
    else if (it.args.length > piece.args.length) errors.push(`${w}.args: ${it.kind} takes at most ${piece.args.length} args (${piece.args.map((s) => s.name).join(', ')}), got ${it.args.length}`)
    else it.args.forEach((a, k) => {
      const s = piece.args[k], n = `${w}.args[${k}] (${s.name})`
      if (!isNum(a)) errors.push(`${n}: must be a number, got ${JSON.stringify(a)}`)
      else if (s.int && !Number.isInteger(a)) errors.push(`${n}: must be an integer, got ${a}`)
      else if (a < s.min || a > s.max) errors.push(`${n}: ${a} is outside ${s.min}..${s.max} for ${it.kind}`)
    })
  }
  pair(it.at, `${w}.at`, errors, [[-LIMITS.at, LIMITS.at], [-LIMITS.at, LIMITS.at]])
  num(it, 'yawDeg', `${w}.`, LIMITS.yaw, errors); num(it, 'scale', `${w}.`, LIMITS.scale, errors); num(it, 'lift', `${w}.`, LIMITS.lift, errors)
  num(it, 'pitchDeg', `${w}.`, LIMITS.pitch, errors); num(it, 'rollDeg', `${w}.`, LIMITS.roll, errors)
  if (it.move !== undefined) errors.push(...moveErrors(it.move, w))
  if (it.walkThrough !== undefined && typeof it.walkThrough !== 'boolean') errors.push(`${w}.walkThrough: must be true or false`)
  // a travelling piece crosses the walk lane by design; only a standing piece blocks it
  if (corridor && piece && !it.move && !errors.some((e) => e.startsWith(w)) && !it.walkThrough && inCorridor(it as never, flat))
    errors.push(`${w}: ${it.kind} at [${(it.at as number[]).join(', ')}] stands in the walk corridor [${(flat ?? [-4, -30, 4, 8]).join(', ')}]; move it out of the corridor`)
}

export interface ParseOptions {
  /** also refuse a piece standing in the walk corridor. Off by default: only the AI planner opts in (its own output must leave the lane clear); a user's edit, the world's read-back and every other parse accept a piece in the lane (the Set warns instead). */
  corridor?: boolean
}

export function parsePlan(raw: unknown, opts: ParseOptions = {}): PlanResult {
  const errors: string[] = []
  if (!isObj(raw)) return { ok: false, errors: ['plan: must be a JSON object'] }
  unknownKeys(raw, ['sentence', 'seed', 'flat', 'ground', 'groundShade', 'puddles', 'tufts', 'fog', 'light', 'sky', 'kit', 'mark'], 'plan', errors)
  if (raw.sentence !== undefined && (typeof raw.sentence !== 'string' || raw.sentence.length > LIMITS.sentence)) errors.push(`sentence: must be a string up to ${LIMITS.sentence} characters`)
  if (raw.seed === undefined) errors.push('seed: required integer')
  else num(raw, 'seed', '', LIMITS.seed, errors, true)
  let flat: ScenePlan['flat']
  if (raw.flat !== undefined) {
    const r = [-LIMITS.at, LIMITS.at] as const, before = errors.length
    pair(raw.flat, 'flat', errors, [r, r, r, r])
    if (errors.length === before) {
      const f = raw.flat as [number, number, number, number]
      if (f[0] >= f[2] || f[1] >= f[3]) errors.push('flat: must be [x0, z0, x1, z1] with x0 < x1 and z0 < z1')
      else flat = f
    }
  }
  if (raw.ground !== undefined && !(GROUND_KINDS as readonly unknown[]).includes(raw.ground)) errors.push(`ground: must be one of ${GROUND_KINDS.join(', ')}, got ${JSON.stringify(raw.ground)}`)
  num(raw, 'groundShade', '', LIMITS.groundShade, errors); num(raw, 'puddles', '', LIMITS.puddles, errors, true); num(raw, 'tufts', '', LIMITS.tufts, errors, true)
  if (raw.fog !== undefined) {
    if (!isObj(raw.fog)) errors.push('fog: must be an object like {"color":"#8b8f96","density":0.012}')
    else {
      unknownKeys(raw.fog, ['color', 'density'], 'fog', errors); num(raw.fog, 'density', 'fog.', LIMITS.fogDensity, errors)
      if (raw.fog.color !== undefined && (typeof raw.fog.color !== 'string' || !FOG_COLOR.test(raw.fog.color))) errors.push(`fog.color: must be a hex string like "#8b8f96", got ${JSON.stringify(raw.fog.color)}`)
    }
  }
  if (raw.light !== undefined) {
    if (!isObj(raw.light)) errors.push('light: must be an object like {"fill":1.2,"key":1,"keyDir":[140,10]}')
    else {
      unknownKeys(raw.light, ['fill', 'key', 'keyDir'], 'light', errors); num(raw.light, 'fill', 'light.', LIMITS.light, errors); num(raw.light, 'key', 'light.', LIMITS.light, errors)
      if (raw.light.keyDir !== undefined) pair(raw.light.keyDir, 'light.keyDir', errors, [LIMITS.keyYaw, LIMITS.keyElev])
    }
  }
  if (raw.mark !== undefined) {
    if (!isObj(raw.mark)) errors.push('mark: must be an object like {"at":[0.6,-12.5],"yawDeg":0}')
    else {
      unknownKeys(raw.mark, ['at', 'yawDeg'], 'mark', errors); pair(raw.mark.at, 'mark.at', errors, [[-LIMITS.at, LIMITS.at], [-LIMITS.at, LIMITS.at]]); num(raw.mark, 'yawDeg', 'mark.', LIMITS.yaw, errors)
    }
  }
  checkSky(raw.sky, errors)
  if (!Array.isArray(raw.kit)) errors.push('kit: required list of pieces')
  else if (raw.kit.length > LIMITS.kit) errors.push(`kit: ${raw.kit.length} items, at most ${LIMITS.kit} allowed`)
  else raw.kit.forEach((it, i) => checkItem(it, i, flat, errors, opts.corridor === true))
  return errors.length ? { ok: false, errors } : { ok: true, plan: raw as unknown as ScenePlan }
}
