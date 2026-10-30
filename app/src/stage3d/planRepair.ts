// repairPlan: best-effort fix of an LLM plan before the second parse. Clamps what can be clamped, drops what cannot (unknown kinds,
// unreadable items), pushes pieces out of the walk corridor, and says what it did in `notes`. Never throws.
import type { KitItem, ScenePlan } from './contract.ts'
import { pieceOf } from './kit.ts'
import { LABEL_MAX } from './planLight.ts'
import { DEFAULT_FLAT, DEFAULT_SKY, FOG_COLOR, LIMITS, SKY_LOOKS, SKY_PREFIX, clamp, glbErrors, inCorridor, isNum, moveErrors, pieceTagOk } from './planRules.ts'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const fix = (v: unknown, r: readonly number[], def: number | undefined, w: string, notes: string[], int = false): number | undefined => {
  if (v === undefined) return def
  if (!isNum(v)) { notes.push(`${w}: not a number, ${def === undefined ? 'removed' : `set to ${def}`}`); return def }
  const c = clamp(int ? Math.round(v) : v, r[0], r[1])
  if (c !== v) notes.push(`${w}: ${v} became ${c}`)
  return c
}
const put = (o: Obj, k: string, v: unknown) => { if (v !== undefined) o[k] = v }

function repairSky(raw: unknown, notes: string[]): ScenePlan['sky'] {
  const s = isObj(raw) ? raw : {}, out: Obj = {}
  const ok = typeof s.url === 'string' && s.url.startsWith(SKY_PREFIX) && !s.url.includes('..') && !/^[a-z]+:/i.test(s.url)
  if (!ok) notes.push(`sky.url: missing or not under ${SKY_PREFIX}, using a sky drawn from the plan`)
  out.url = ok ? s.url : DEFAULT_SKY
  if ((SKY_LOOKS as readonly unknown[]).includes(s.look)) out.look = s.look
  else if (s.look !== undefined) notes.push('sky.look: unknown look, removed')
  put(out, 'yawDeg', fix(s.yawDeg, LIMITS.skyYaw, undefined, 'sky.yawDeg', notes)); put(out, 'horizonLiftDeg', fix(s.horizonLiftDeg, LIMITS.skyLift, undefined, 'sky.horizonLiftDeg', notes))
  put(out, 'gain', fix(s.gain, LIMITS.skyGain, undefined, 'sky.gain', notes)); put(out, 'cutDeg', fix(s.cutDeg, LIMITS.skyCut, undefined, 'sky.cutDeg', notes))
  if (Array.isArray(s.band) && s.band.length === 2 && isNum(s.band[0]) && isNum(s.band[1])) {
    const a = clamp(Math.min(s.band[0], s.band[1]), 0, 0.95), b = clamp(Math.max(s.band[0], s.band[1]), a + 0.05, 1)
    if (a !== s.band[0] || b !== s.band[1]) notes.push(`sky.band: became [${a}, ${b}]`)
    out.band = [a, b]
  } else if (s.band !== undefined) notes.push('sky.band: unreadable, removed')
  return out as ScenePlan['sky']
}

function repairItem(raw: unknown, i: number, notes: string[]): KitItem | null {
  const w = `kit[${i}]`
  if (!isObj(raw)) { notes.push(`${w}: not an object, dropped`); return null }
  // a generated piece is kept whole or not at all: its mesh and size come from the build, not from anything a repair could guess
  if (raw.glb !== undefined && glbErrors(raw, w).length) { notes.push(`${w}: generated piece ${JSON.stringify(raw.kind)} is not readable, dropped`); return null }
  const piece = raw.glb === undefined && typeof raw.kind === 'string' ? pieceOf(raw.kind) : undefined
  if (!piece && raw.glb === undefined) { notes.push(`${w}: unknown kind ${JSON.stringify(raw.kind)}, dropped`); return null }
  if (!Array.isArray(raw.at) || raw.at.length !== 2 || !isNum(raw.at[0]) || !isNum(raw.at[1])) { notes.push(`${w}: ${raw.kind} has no usable at [x, z], dropped`); return null }
  const A = LIMITS.at, at: [number, number] = [clamp(raw.at[0], -A, A), clamp(raw.at[1], -A, A)]
  if (at[0] !== raw.at[0] || at[1] !== raw.at[1]) notes.push(`${w}.at: clamped to [${at.join(', ')}]`)
  const it: KitItem = { kind: raw.kind as string, at }
  if (raw.glb !== undefined) {
    const g = raw.glb as Obj, glb: Obj = {}
    for (const k of ['url', 'massingUrl', 'yawOffsetDeg', 'unitScale', 'sink']) put(glb, k, g[k])
    it.glb = glb as unknown as KitItem['glb']
  }
  if (raw.pieceTag !== undefined) { if (pieceTagOk(raw.pieceTag)) it.pieceTag = raw.pieceTag as string; else notes.push(`${w}.pieceTag: not a prop tag, removed`) }
  if (piece && Array.isArray(raw.args)) {
    if (raw.args.length > piece.args.length) notes.push(`${w}.args: extra args dropped`)
    it.args = raw.args.slice(0, piece.args.length).map((a, k) => fix(a, [piece.args[k].min, piece.args[k].max], piece.args[k].def, `${w}.args[${k}] (${piece.args[k].name})`, notes, piece.args[k].int) as number)
  } else if (raw.args !== undefined) notes.push(`${w}.args: not a list, removed`)
  put(it, 'yawDeg', fix(raw.yawDeg, LIMITS.yaw, undefined, `${w}.yawDeg`, notes)); put(it, 'scale', fix(raw.scale, LIMITS.scale, undefined, `${w}.scale`, notes)); put(it, 'lift', fix(raw.lift, LIMITS.lift, undefined, `${w}.lift`, notes))
  put(it, 'pitchDeg', fix(raw.pitchDeg, LIMITS.pitch, undefined, `${w}.pitchDeg`, notes)); put(it, 'rollDeg', fix(raw.rollDeg, LIMITS.roll, undefined, `${w}.rollDeg`, notes))
  if (raw.move !== undefined) {
    if (!moveErrors(raw.move, w).length) it.move = raw.move as KitItem['move']
    else notes.push(`${w}.move: not readable, removed`)
  }
  if (raw.walkThrough === true) it.walkThrough = true
  if (typeof raw.label === 'string' && raw.label.trim()) it.label = raw.label.trim().slice(0, LABEL_MAX)
  else if (raw.label !== undefined) notes.push(`${w}.label: not text, removed`)
  return it
}

/** move an item sideways (along x, away from the corridor centre) until it clears the corridor; a travelling piece never blocks it */
function clearCorridor(it: KitItem, flat: ScenePlan['flat'], i: number, notes: string[]): void {
  if (it.walkThrough || it.move || !inCorridor(it, flat)) return
  const f = flat ?? DEFAULT_FLAT, dir = it.at[0] >= (f[0] + f[2]) / 2 ? 1 : -1, from = it.at[0]
  for (let k = 0; k < 150 && inCorridor(it, flat); k++) it.at = [clamp(it.at[0] + dir * 0.5, -LIMITS.at, LIMITS.at), it.at[1]]
  if (inCorridor(it, flat)) { notes.push(`kit[${i}]: ${it.kind} could not be moved out of the walk corridor`); return }
  notes.push(`kit[${i}]: ${it.kind} was in the walk corridor, moved from x ${from} to ${it.at[0]}`)
}

/** clamp / drop / nudge a raw plan into something parsePlan accepts; returns the fixed plan and what changed */
export function repairPlan(raw: unknown): { plan: ScenePlan; notes: string[] } {
  const notes: string[] = [], p = isObj(raw) ? raw : {}
  if (!isObj(raw)) notes.push('plan: not an object, starting from an empty plan')
  const plan: Obj = {}
  if (typeof p.sentence === 'string') plan.sentence = p.sentence.slice(0, LIMITS.sentence)
  plan.seed = fix(p.seed, LIMITS.seed, 1, 'seed', notes, true)
  if (Array.isArray(p.flat) && p.flat.length === 4 && p.flat.every(isNum)) {
    const R = LIMITS.at, [a, b, c, d] = p.flat.map((n) => clamp(n, -R, R)) as number[]
    const x0 = Math.min(a, c), z0 = Math.min(b, d)
    plan.flat = [x0, z0, Math.max(Math.max(a, c), x0 + 1), Math.max(Math.max(b, d), z0 + 1)]
  } else if (p.flat !== undefined) notes.push('flat: unreadable, removed (default corridor used)')
  put(plan, 'groundShade', fix(p.groundShade, LIMITS.groundShade, undefined, 'groundShade', notes)); put(plan, 'puddles', fix(p.puddles, LIMITS.puddles, undefined, 'puddles', notes, true)); put(plan, 'tufts', fix(p.tufts, LIMITS.tufts, undefined, 'tufts', notes, true))
  if (isObj(p.fog)) {
    const fog: Obj = {}
    if (typeof p.fog.color === 'string' && FOG_COLOR.test(p.fog.color)) fog.color = p.fog.color; else if (p.fog.color !== undefined) notes.push('fog.color: not a #rrggbb string, removed')
    put(fog, 'density', fix(p.fog.density, LIMITS.fogDensity, undefined, 'fog.density', notes)); plan.fog = fog
  }
  if (isObj(p.light)) {
    const l: Obj = {}
    put(l, 'fill', fix(p.light.fill, LIMITS.light, undefined, 'light.fill', notes)); put(l, 'key', fix(p.light.key, LIMITS.light, undefined, 'light.key', notes))
    const k = p.light.keyDir
    if (Array.isArray(k) && k.length === 2 && isNum(k[0]) && isNum(k[1])) l.keyDir = [clamp(k[0], LIMITS.keyYaw[0], LIMITS.keyYaw[1]), clamp(k[1], LIMITS.keyElev[0], LIMITS.keyElev[1])]
    else if (k !== undefined) notes.push('light.keyDir: unreadable, removed')
    plan.light = l
  }
  plan.sky = repairSky(p.sky, notes)
  let kit = Array.isArray(p.kit) ? p.kit : []
  if (!Array.isArray(p.kit)) notes.push('kit: missing or not a list, using an empty list')
  if (kit.length > LIMITS.kit) { notes.push(`kit: ${kit.length} items, kept the first ${LIMITS.kit}`); kit = kit.slice(0, LIMITS.kit) }
  const flat = plan.flat as ScenePlan['flat'], items: KitItem[] = []
  kit.forEach((r, i) => { const it = repairItem(r, i, notes); if (it) { clearCorridor(it, flat, i, notes); items.push(it) } })
  plan.kit = items
  return { plan: plan as unknown as ScenePlan, notes }
}
