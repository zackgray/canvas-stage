/**
 * Every board prop is in the plan (Track C, pure). The planner is told each prop by name (the sentence's Props list,
 * src/stage3d/planProps.ts) and asked for a labelled piece with pieceTag prop:<tag>; whatever it left out is added here as a stand-in
 * (the closest kit shape at the prop's described size, a free spot out of the corridor and off the other pieces), and a piece it
 * made but did not tag is adopted by label. Build in 3D later replaces a stand-in in place by its pieceTag (server/pieces/place.ts),
 * so the clay never loses a prop. General: the shape comes from the prop's own words, never from a concept.
 */
import type { KitItem, ScenePlan } from '../../src/stage3d/contract.ts'
import { DEFAULT_PIECE_KIND, pieceKindOf } from '../../src/stage3d/pieceKinds.ts'
import { LABEL_MAX } from '../../src/stage3d/planLight.ts'
import type { PlanProp } from '../../src/stage3d/planProps.ts'
import { parsePlan } from '../../src/stage3d/plan.ts'
import { pieceOf } from '../../src/stage3d/kit.ts'
import { LIMITS } from '../../src/stage3d/planRules.ts'
import { faceCamera, freeSpot } from '../pieces/place.ts'
import { sizeless } from '../prompt/sizeless.ts'

/** the kit shape that stands for a thing, by the words naming it (first match wins; crates stand in for anything boxy or unknown) */
const SHAPES: [RegExp, string][] = [
  [/\b(barrels?|kegs?|casks?|buckets?|jars?|pots?|drums?|churns?|urns?)\b/, 'barrels'],
  [/\b(wagons?|carriages?|coach(es)?|trucks?|vans?|cars?|boats?)\b/, 'wagon'],
  [/\b(carts?|barrows?|wheelbarrows?|trolleys?|sleds?|sledges?)\b/, 'cart'],
  [/\b(tents?|canop(y|ies)|awnings?|gazebos?|marquees?|stalls?|booths?|kiosks?)\b/, 'tent'],
  [/\b(huts?|sheds?|cabins?|houses?|barns?|cottages?|shacks?)\b/, 'hut'],
  [/\b(trees?|bush(es)?|shrubs?|hedges?|plants?)\b/, 'tree'],
  [/\b(fences?|gates?|rails?|railings?|walls?)\b/, 'fence'],
  [/\b(rocks?|stones?|boulders?)\b/, 'rock'],
  [/\b(campfires?|fires?|hearths?|stoves?)\b/, 'campfireRing'],
  [/\b(hay|haystacks?|straw|bales?)\b/, 'haystack'],
  [/\b(banners?|flags?|poles?|posts?|signs?|lamps?|lanterns?)\b/, 'banner'],
  [/\b(racks?|frames?|stands?|shelf|shelves|ladders?)\b/, 'weaponRack'],
]
/** its largest side in metres at its default args (a crate or barrel made with count 1): what a described size scales from */
const BASE_M: Record<string, number> = { crates: 0.7, barrels: 0.9, wagon: 3, cart: 2.2, tent: 3.4, hut: 5, tree: 6, fence: 4, rock: 1.2, campfireRing: 1.8, haystack: 1.4, banner: 3, weaponRack: 1.8 }
/** the args a stand-in is made with: a crate or barrel alone, a fence of its base length (its first arg is a length, the others' a seed) */
const ARGS: Record<string, (seed: number) => number[]> = { crates: (s) => [s, 1], barrels: (s) => [s, 1], fence: (s) => [4, s] }

export const shapeFor = (text: string): string => SHAPES.find(([re]) => re.test(text.toLowerCase()))?.[1] ?? 'crates'

const UNITS: [RegExp, number][] = [[/(?:m|metres?|meters?)/, 1], [/(?:cm|centimet(?:re|er)s?)/, 0.01], [/(?:ft|feet|foot)/, 0.3048], [/(?:in|inch(?:es)?)/, 0.0254]]
/** the largest size in metres a text states ("1.2 m tall", "40 cm", "three feet" is not read), or null */
export function describedSize(text: string): number | null {
  let best: number | null = null
  for (const m of text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*-?\s*([a-z]+)\b/g)) {
    const u = UNITS.find(([re]) => new RegExp(`^${re.source}$`).test(m[2]))
    if (u) best = Math.max(best ?? 0, Number(m[1]) * u[1])
  }
  return best
}

const stem = (w: string) => w.replace(/(ss|x|ch|sh)es$/, '$1').replace(/([^s])s$/, '$1')
const wordsOf = (s: string) => s.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-z]+/).filter((w) => w.length > 1).map(stem)
const FILLER = new Set(['the', 'an', 'of', 'and', 'with', 'old', 'new', 'small', 'large', 'big', 'tall', 'wooden', 'white', 'painted'])

/** a plan item that says this prop: its pieceTag, else a label or kind sharing the prop name's head word (its last noun) */
function covering(kit: KitItem[], p: PlanProp): number {
  const tagged = kit.findIndex((it) => it.pieceTag === `prop:${p.tag}`)
  if (tagged >= 0) return tagged
  const head = wordsOf(p.name).filter((w) => !FILLER.has(w)).at(-1)
  if (!head) return -1
  // "beehive" is said by a label's "hive" and the other way round
  const says = (ws: string[]) => ws.some((w) => w === head || (w.length >= 4 && (head.endsWith(w) || w.endsWith(head))))
  return kit.findIndex((it) => !it.pieceTag && (says(wordsOf(it.label ?? '')) || (!it.label && says(wordsOf(it.kind)))))
}

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 99991; return h + 1 }
const r2 = (v: number) => Math.round(v * 100) / 100

/** a prop's label: its line (else its name) without sizes (F13: the size shaped the piece; prompts name the label) */
const labelOf = (p: PlanProp) => (sizeless(p.line.trim()) || sizeless(p.name.trim()) || p.name.trim()).replace(/\.$/, '').slice(0, LABEL_MAX)

/** the stand-in for one prop at a free spot of `plan` */
export function standIn(plan: Pick<ScenePlan, 'kit' | 'flat'>, p: PlanProp, shapeOverride?: string): KitItem {
  const words = `${p.name} ${p.line}`
  const kind = shapeOverride ?? shapeFor(p.name)
  const known = pieceKindOf(p.name) !== DEFAULT_PIECE_KIND
  const size = describedSize(words) ?? (known ? pieceKindOf(p.name).size : null)
  const scale = size ? Math.min(LIMITS.scale[1], Math.max(LIMITS.scale[0], r2(size / BASE_M[kind]))) : 1
  const args = ARGS[kind] ? ARGS[kind](hash(p.tag)) : [hash(p.tag)]
  // the spot is cleared for the piece's real footprint (its kit extent), not its nominal size: a crate's footprint is wider than the crate
  const [a, b, w] = pieceOf(kind)?.extent(pieceOf(kind)!.args.map((sp, i) => args[i] ?? sp.def)) ?? [-1, 1, 1]
  const at = freeSpot(plan, 2 * Math.max(Math.abs(a), Math.abs(b), w) * scale + 1)
  const label = labelOf(p)
  return { kind, args, at, yawDeg: faceCamera(at), ...(scale !== 1 ? { scale } : {}), pieceTag: `prop:${p.tag}`, label }
}

/** the plan with every prop in it: untagged matches adopted, missing ones added as stand-ins (a shape the plan refuses, a long fence in the corridor, gives way to a crate) */
export function ensureProps(plan: ScenePlan, props: readonly PlanProp[]): { plan: ScenePlan; added: string[] } {
  let cur = plan
  const added: string[] = []
  for (const p of props) {
    const i = covering(cur.kit, p)
    const tryKit = (kit: KitItem[]) => { const ok = parsePlan({ ...cur, kit }, { corridor: true }); if (ok.ok) cur = ok.plan; return ok.ok }
    if (i >= 0) {
      const it = cur.kit[i]
      if (!it.pieceTag && !it.glb) tryKit(cur.kit.map((x, j) => (j === i ? { ...x, pieceTag: `prop:${p.tag}`, ...(x.label ? {} : { label: labelOf(p) }) } : x)))
      continue
    }
    if (cur.kit.length >= LIMITS.kit) break
    if (tryKit([...cur.kit, standIn(cur, p)]) || tryKit([...cur.kit, standIn(cur, p, 'crates')])) added.push(p.tag)
  }
  return { plan: cur, added }
}
